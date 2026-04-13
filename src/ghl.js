const axios = require('axios');

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

function ghlHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Version: GHL_API_VERSION,
  };
}

/**
 * Normaliza el número de teléfono para buscar en GHL.
 * GHL acepta formatos con o sin +1.
 */
function normalizePhone(phone) {
  if (!phone) return null;
  let normalized = phone.replace(/[^\d+]/g, '');
  if (!normalized.startsWith('+')) {
    normalized = normalized.length === 10 ? `+1${normalized}` : `+${normalized}`;
  }
  return normalized;
}

/**
 * Busca un contacto en GHL por número de teléfono dentro de una subcuenta específica.
 * Usa locationId para distinguir entre Solar (E-Minded) y Mitigación (SAF Services).
 */
async function findContactByPhone(phoneNumber, token, locationId) {
  const normalized = normalizePhone(phoneNumber);
  const attempts = [normalized, normalized?.replace('+1', '')].filter(Boolean);

  for (const phone of attempts) {
    try {
      const params = new URLSearchParams({ number: phone });
      if (locationId) params.append('locationId', locationId);

      const res = await axios.get(
        `${GHL_BASE_URL}/contacts/search/duplicates?${params.toString()}`,
        { headers: ghlHeaders(token) }
      );
      if (res.data?.contact?.id) {
        return res.data.contact.id;
      }
    } catch (err) {
      if (err.response?.status !== 404) {
        console.error(`[GHL] Error buscando contacto con phone ${phone}:`, err.message);
      }
    }
  }

  return null;
}

/**
 * Formatea el análisis QA de Claude como nota legible para GHL.
 * Adaptado para soportar tanto el formato del router (nuevo) como el legacy.
 */
function formatQANote(qa) {
  const nivel_emoji = {
    'Excelente': '🟢',
    'Bueno': '🔵',
    'Regular': '🟡',
    'Crítico': '🔴',
  }[qa.nivel] || '⚪';

  const errores = (qa.errores_criticos || qa.errores_criticos_detectados || [])
    .filter(e => e.detectado)
    .map(e => `  ❌ ${e.error} (${e.penalizacion} pts)`)
    .join('\n') || '  ✅ Ninguno detectado';

  const objecionesBien = (qa.objeciones_bien_manejadas || qa.objeciones_manejadas_bien || []).join(' | ') || 'N/A';
  const objecionesMal = (qa.objeciones_mal_manejadas || qa.objeciones_manejadas_mal || []).join(' | ') || 'N/A';
  const puntosFuertes = (qa.puntos_fuertes || []).map(p => `  ✅ ${p}`).join('\n');
  const areasMejora = (qa.areas_mejora || []).map(a => `  📌 ${a}`).join('\n');

  // Desglose de etapas — soporta diferentes formatos de JSON
  const desglose = qa.desglose_etapas || qa.desglose_fases || qa.desglose_pasos || qa.desglose || {};
  const desgloseLines = Object.entries(desglose)
    .map(([key, val]) => {
      if (val && typeof val === 'object' && 'puntaje' in val) {
        return `  ${key}: ${val.puntaje}/${val.max} — ${val.observacion || ''}`;
      }
      return null;
    })
    .filter(Boolean)
    .join('\n');

  return `📞 QA AUTOMÁTICO — ${(qa.tipo_llamada || 'LLAMADA').toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${nivel_emoji} SCORE: ${qa.puntaje_total}/100 — ${qa.nivel?.toUpperCase()}
🎯 VERTICAL: ${qa.vertical}
📞 TIPO: ${qa.tipo_llamada || 'N/A'}
👤 AGENTE: ${qa.agente}
⏱️ DURACIÓN: ${qa.duracion_estimada}

📋 RESUMEN EJECUTIVO:
${qa.resumen_ejecutivo}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 DESGLOSE POR ETAPA:
${desgloseLines || '  No disponible'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 ERRORES CRÍTICOS:
${errores}

💪 PUNTOS FUERTES:
${puntosFuertes}

📈 ÁREAS DE MEJORA:
${areasMejora}

🗣️ OBJECIONES BIEN MANEJADAS: ${objecionesBien}
⚠️ OBJECIONES MAL MANEJADAS: ${objecionesMal}

📅 CITA AGENDADA: ${qa.cita_agendada ? 'SÍ ✅' : 'NO ❌'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔔 ACCIÓN RECOMENDADA: ${qa.recomendacion_accion}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 Generado por E-Minded QA Pipeline v2.0 (Router + Prompts Especializados)`;
}

/**
 * Guarda la nota QA en el contacto de GHL de la subcuenta correcta.
 */
async function saveNoteInGHL(phoneNumber, qa, token, userId, locationId) {
  if (!phoneNumber) {
    console.warn('[GHL] No hay número de teléfono, no se puede guardar la nota.');
    return;
  }

  if (!token) {
    console.error('[GHL] No hay token configurado para esta subcuenta.');
    return;
  }

  const contactId = await findContactByPhone(phoneNumber, token, locationId);
  if (!contactId) {
    console.warn(`[GHL] Contacto no encontrado para el teléfono: ${phoneNumber}`);
    return;
  }

  const nota = formatQANote(qa);

  await axios.post(
    `${GHL_BASE_URL}/contacts/${contactId}/notes`,
    { body: nota, ...(userId ? { userId } : {}) },
    { headers: ghlHeaders(token) }
  );

  console.log(`[GHL] ✅ Nota guardada en contacto ${contactId}`);
}

module.exports = { saveNoteInGHL, normalizePhone, formatQANote, findContactByPhone };
