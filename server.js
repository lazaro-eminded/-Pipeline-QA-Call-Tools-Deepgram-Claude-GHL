require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { createClient } = require('@deepgram/sdk');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json());

// ── Clientes ──
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Prompt QA completo (basado en entrenamiento E-Minded) ──
const QA_PROMPT = `Eres el sistema de QA de E-Minded Solutions, una empresa de telemarketing en Florida que agenda citas con homeowners hispanos para 3 verticales: Solar (Net Metering), Mitigacion de Danos (techo/seguro), y Agua (purificacion).

Tu tarea es analizar la siguiente transcripcion de una llamada donde se agendo una cita, y evaluarla con base en el sistema de entrenamiento interno de E-Minded.

TRANSCRIPCION:
{{TRANSCRIPCION}}

VERTICAL DETECTADO O INDICADO: {{VERTICAL}} (Solar / Mitigacion / Agua)

CRITERIOS DE EVALUACION POR VERTICAL

-- SOLAR (Net Metering / Intercambio de Factura) --

ETAPA 1 - INTRO (0-10 pts)
- Uso SOLO el primer nombre del prospecto (no apellido)
- Tono ligeramente dudoso, no de vendedor
- Menciono E-Minded Solutions (obligatorio por ley en cold calls)
- Pregunto "Me escucha?" para tomar control
- No hizo pausa enfatizando el nombre de la compania

ETAPA 2 - INFORMACION ENTREGADA / HOOK (0-10 pts)
- Uso el gancho de la "informacion de Net Metering / Ley de Medicion Neta"
- Verifico direccion/codigo postal para dar credibilidad
- Pregunta de control al final ("tuvo oportunidad de recibirla?")
- Si el cliente dijo que si la recibio, manejo correctamente

ETAPA 3 - CALIFICACION / ESTA AFECTADO? (0-10 pts)
- Pregunto si ha notado que su bill ha aumentado
- Verifico que paga mas de $100 en electricidad
- Pregunto cuanto paga exactamente (para ejemplificar)
- Mostro sorpresa/empatia ante el monto (no fue indiferente)

ETAPA 4 - AGITACION DEL DOLOR (0-10 pts)
- Profundizo en el dolor (piscina, personas en casa, verano)
- Hizo consciente al prospecto de la inestabilidad futura de costos
- Si el prospecto dijo que paga poco, uso comparacion con meses anteriores o verano
- No resolvio el dolor antes de crear urgencia

ETAPA 5 - PRESENTACION (ENERGIA RENOVABLE) (0-15 pts)
- Explico el programa como "intercambio de factura" (no como venta de paneles)
- NUNCA menciono precio, costo, deuda, ni que "no es gratis"
- Menciono el incentivo gubernamental (ITC hasta 2026) solo DESPUES de manejar objeciones
- Pregunto "tiene alguna referencia de paneles solares?" para manejar la conversacion
- Uso frase de cierre: "Tendria sentido recibir al asesor para validar si califica?"
- Si hubo objeciones, las manejo ANTES de pasar al cierre

ETAPA 6 - CIERRE (0-15 pts)
- Uso DOBLE ALTERNATIVA siempre (nunca pregunto "cuando puede?")
- Verifico si esta trabajando o retirado para ofrecer horario correcto
- Creo urgencia real: "el asesor estara en su zona hoy y manana"
- Ofrecio sameday primero cuando fue posible
- No mostro desesperacion ni apresuramiento

ETAPA 7 - VERIFICACION DE ASISTENCIA (0-10 pts)
- Confirmo que TODAS las personas del titulo/responsables estaran presentes
- Pregunto por esposo/a, hijos u otros que toman decisiones
- Uso el argumento: "el programa requiere que esten todos para explicar correctamente"
- No acepto "yo decido solo" sin indagar mas cuando habia mencionado familia

ETAPA 8 - CONFIRMACION FINAL DE CITA (0-10 pts)
- Confirmo FECHA + HORA + DIRECCION completa
- Menciono los nombres de los asesores (ej: "Marcello y Brayan, bilingues")
- Hizo recap final de la cita
- Registro informacion del techo y AC (menciono que lo haria)

-- MITIGACION (Techo / Seguro de Propiedad) --

FASE 1 - GANCHO (0-10 pts)
- Duracion maxima 4-7 segundos
- Uso variacion correcta: "El Vecino" (prueba social) o "La Alerta" (evento climatico)
- NO pregunto "como esta?" (trigger de rechazo en frio)
- Presento su nombre PRIMERO, empresa solo si preguntaron
- Termino con pregunta que invita a seguir: "estaba al tanto?"

FASE 2 - CALIFICACION (0-15 pts)
- Verifico: Es propietario? (NO inquilino)
- Verifico: Tiene seguro activo?
- Pregunto tipo de techo (shingle/teja) y anos
- Pregunto si ha notado manchas, humedad, liqueos
- Si es townhouse: verifico que el propietario es responsable del techo
- Descalifico correctamente si no cumplia requisitos

FASE 3 - MANEJO DE "NO TENGO DANOS" (0-15 pts)
- Uso pregunta clave: "Algun profesional inspecciono o es solo por vista?"
- Si dijo que si un profesional: indago cuando, si uso camara termica, si reviso el atico
- Explico por que no se ven los danos (textura popcorn, pintura de aceite, garaje)
- Uso analogia del "chequeo medico" o camara termica correctamente
- Presento las DOS ALTERNATIVAS: si tiene algo=arreglamos gratis / si no tiene=queda tranquilo

FASE 4 - PRESENTACION CERO RIESGO (0-10 pts)
- Explico modelo "no recovery, no fee"
- NUNCA dijo "contrato" (debe decir "papeleria")
- Clarifico que la inspeccion es gratuita y sin compromiso
- Menciono camaras termicas como diferenciador

FASE 5 - CIERRE (0-15 pts)
- Uso doble alternativa con horarios impares (ej: 2:45, 10:15)
- Confirmo que el titular de la poliza estara presente
- "Mato el zombie" - pregunto por el conyuge si aplica
- Aplico teoria del silencio despues de pedir la cita
- Confirmo: nombre + direccion + dia + hora

REGLAS DE ORO MITIGACION (penalizacion si las violo):
- Dijo "contrato" en lugar de "papeleria" -> -10 pts
- Pregunto "como esta?" al inicio -> -5 pts
- No verifico si es propietario -> -15 pts
- No uso doble alternativa en el cierre -> -10 pts
- Presento demasiadas preguntas seguidas sin dar valor -> -10 pts

-- AGUA (Purificacion de Agua) --
Misma estructura de etapas que Solar pero adaptada a agua.
Diferencia clave: el "dolor" es la calidad del agua, contaminantes, salud familiar.

ERRORES CRITICOS - APLICAN A LOS 3 VERTICALES

| Error | Penalizacion |
|-------|-------------|
| Revelo precio, costo o deuda antes de la cita | -20 pts |
| No verifico si es propietario (dueno de la vivienda) | -20 pts |
| No confirmo fecha + hora + direccion de la cita | -15 pts |
| Se rindio ante la primera objecion sin contraargumentar | -15 pts |
| Hablo mas del 60% de la llamada (no escucho) | -10 pts |
| Uso muletillas excesivas ("eh", "este", repitio el nombre 5+ veces) | -5 pts |
| Sono a guion robotizado (no hubo naturalidad) | -5 pts |
| No registro informacion del techo/AC/producto al final | -5 pts |
| Asumio respuestas en lugar de preguntar | -5 pts |
| No confirmo que todos los responsables estaran en la cita | -10 pts |

HABILIDADES BLANDAS (30 pts)

TONO Y CONFIANZA (0-10 pts)
- Voz segura, no nerviosa
- No sono a lectura de guion
- Enfasis en palabras clave para generar interes
- Tonalidad variada (no monotona)

ESCUCHA ACTIVA (0-10 pts)
- Respondio a lo que dijo el prospecto (no ignoro sus comentarios)
- Uso las palabras y terminos del prospecto
- No repitio preguntas ya respondidas
- Detecto pistas del nucleo familiar y las uso

RAPPORT Y CONEXION (0-10 pts)
- Hubo momento de conexion humana antes del pitch
- Mostro empatia genuina ante el dolor del prospecto
- Interactuo con el prospecto (no fue una sola via)
- Creo sensacion de que el setter conocia al prospecto

FORMATO DE RESPUESTA REQUERIDO (JSON)

Responde UNICAMENTE con este JSON valido, sin texto adicional:

{
  "agente": "nombre si se menciona en la llamada, si no: 'No identificado'",
  "vertical": "Solar | Mitigacion | Agua",
  "duracion_estimada": "X minutos",
  "puntaje_total": 85,
  "nivel": "Excelente | Bueno | Regular | Critico",
  "desglose_etapas": {
    "intro": {"puntaje": 8, "max": 10, "observacion": "texto breve"},
    "hook_informacion": {"puntaje": 8, "max": 10, "observacion": "texto breve"},
    "calificacion": {"puntaje": 12, "max": 15, "observacion": "texto breve"},
    "dolor": {"puntaje": 8, "max": 10, "observacion": "texto breve"},
    "presentacion": {"puntaje": 12, "max": 15, "observacion": "texto breve"},
    "cierre": {"puntaje": 12, "max": 15, "observacion": "texto breve"},
    "verificacion_asistencia": {"puntaje": 8, "max": 10, "observacion": "texto breve"},
    "confirmacion_cita": {"puntaje": 8, "max": 10, "observacion": "texto breve"},
    "habilidades_blandas": {"puntaje": 24, "max": 30, "observacion": "texto breve"}
  },
  "errores_criticos_detectados": [
    {"error": "descripcion del error", "penalizacion": -10, "detectado": true}
  ],
  "objeciones_encontradas": ["objecion 1", "objecion 2"],
  "objeciones_manejadas_bien": ["objecion que si manejo bien"],
  "objeciones_manejadas_mal": ["objecion que no manejo o abandono"],
  "puntos_fuertes": ["punto fuerte 1", "punto fuerte 2"],
  "areas_mejora": ["area 1 con recomendacion especifica", "area 2"],
  "cita_bien_confirmada": true,
  "resumen_ejecutivo": "2-3 oraciones describiendo la llamada y su calidad general",
  "recomendacion_accion": "Compartir como ejemplo | Feedback puntual | Sesion de coaching | Revision inmediata con Julieth"
}

ESCALA DE NIVEL FINAL
90-100: Excelente -> Compartir como ejemplo con el equipo
75-89:  Bueno -> Feedback puntual en 1-2 areas
60-74:  Regular -> Sesion de coaching esta semana
< 60:   Critico -> Revision inmediata con Julieth`;

// ── Funciones del pipeline ──

/**
 * Transcribe una grabacion de llamada usando Deepgram (espanol latinoamericano).
 */
async function transcribeCall(recordingUrl) {
  const { result } = await deepgram.listen.prerecorded.transcribeUrl(
    { url: recordingUrl },
    {
      model: 'nova-2',
      language: 'es-419',
      diarize: true,
      punctuate: true,
      smart_format: true,
    }
  );

  const transcript = result.results.channels[0].alternatives[0].transcript;
  return transcript;
}

/**
 * Analiza la transcripcion con Claude API usando el prompt QA de E-Minded.
 */
async function analyzeCall(transcript, vertical) {
  const prompt = QA_PROMPT
    .replace('{{TRANSCRIPCION}}', transcript)
    .replace('{{VERTICAL}}', vertical || 'Auto-detectar');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  return JSON.parse(response.content[0].text);
}

/**
 * Busca un contacto en GHL por telefono y guarda la nota QA.
 */
async function saveNoteInGHL(phoneNumber, qa) {
  // Normalizar telefono (quitar espacios, guiones)
  const normalizedPhone = phoneNumber.replace(/[\s\-()]/g, '');

  // 1. Buscar contacto por telefono
  const searchRes = await axios.get(
    'https://services.leadconnectorhq.com/contacts/search',
    {
      params: { query: normalizedPhone },
      headers: {
        Authorization: `Bearer ${process.env.GHL_TOKEN}`,
        Version: '2021-07-28',
      },
    }
  );

  const contactId = searchRes.data.contacts?.[0]?.id;
  if (!contactId) {
    console.log('Contacto no encontrado en GHL para:', normalizedPhone);
    return;
  }

  // 2. Construir nota con el analisis QA
  const etapas = qa.desglose_etapas;
  const nota = [
    'QA AUTOMATICO - CITA AGENDADA',
    '================================',
    `AGENTE: ${qa.agente}`,
    `VERTICAL: ${qa.vertical}`,
    `DURACION: ${qa.duracion_estimada}`,
    `PUNTAJE TOTAL: ${qa.puntaje_total}/100 - ${qa.nivel}`,
    '',
    'DESGLOSE POR ETAPA:',
    ...Object.entries(etapas).map(
      ([k, v]) => `  ${k}: ${v.puntaje}/${v.max} - ${v.observacion}`
    ),
    '',
    `ERRORES CRITICOS: ${qa.errores_criticos_detectados.filter(e => e.detectado).map(e => e.error).join(' | ') || 'Ninguno'}`,
    `OBJECIONES MANEJADAS BIEN: ${qa.objeciones_manejadas_bien.join(' | ') || 'N/A'}`,
    `OBJECIONES MANEJADAS MAL: ${qa.objeciones_manejadas_mal.join(' | ') || 'N/A'}`,
    `PUNTOS FUERTES: ${qa.puntos_fuertes.join(' | ')}`,
    `AREAS DE MEJORA: ${qa.areas_mejora.join(' | ')}`,
    `CITA CONFIRMADA: ${qa.cita_bien_confirmada ? 'SI' : 'NO'}`,
    '',
    `RESUMEN: ${qa.resumen_ejecutivo}`,
    `ACCION: ${qa.recomendacion_accion}`,
    '',
    '================================',
    'Generado automaticamente por E-Minded QA Bot',
  ].join('\n');

  // 3. Guardar nota en el contacto
  await axios.post(
    `https://services.leadconnectorhq.com/contacts/${contactId}/notes`,
    { body: nota, userId: process.env.GHL_USER_ID },
    {
      headers: {
        Authorization: `Bearer ${process.env.GHL_TOKEN}`,
        'Content-Type': 'application/json',
        Version: '2021-07-28',
      },
    }
  );

  console.log('Nota guardada en GHL para contacto:', contactId);
}

/**
 * Obtiene la grabacion del call log con retry + backoff.
 */
async function getRecordingUrl(callId, attempt = 1) {
  const maxAttempts = 3;
  const delays = [60000, 120000, 180000]; // 60s, 120s, 180s

  const response = await axios.get(
    `https://${process.env.CALLTOOLS_SILO}.calltools.io/api/calllogs/${callId}/`,
    { headers: { Authorization: `Token ${process.env.CALLTOOLS_API_KEY}` } }
  );

  const recordingUrl = response.data.recording_url;

  if (!recordingUrl && attempt < maxAttempts) {
    console.log(`Grabacion no disponible aun (intento ${attempt}/${maxAttempts}). Reintentando...`);
    await new Promise(resolve => setTimeout(resolve, delays[attempt]));
    return getRecordingUrl(callId, attempt + 1);
  }

  return recordingUrl;
}

/**
 * Pipeline completo: obtener grabacion -> transcribir -> analizar -> guardar nota.
 */
async function processCall(callId, contact) {
  try {
    // 1. Obtener URL de grabacion (con retry)
    const recordingUrl = await getRecordingUrl(callId);
    if (!recordingUrl) {
      console.log('No hay grabacion disponible para call_id:', callId);
      return;
    }

    console.log('Grabacion obtenida:', recordingUrl);

    // 2. Transcribir con Deepgram
    const transcript = await transcribeCall(recordingUrl);
    console.log('Transcripcion completada. Longitud:', transcript.length, 'caracteres');

    // 3. Analizar con Claude
    const qa = await analyzeCall(transcript);
    console.log('Analisis QA completado. Puntaje:', qa.puntaje_total);

    // 4. Guardar nota en GHL
    const phone = contact?.phone_number || contact?.phone;
    if (phone) {
      await saveNoteInGHL(phone, qa);
    } else {
      console.log('No se encontro telefono del contacto. Resultado QA:', JSON.stringify(qa, null, 2));
    }
  } catch (err) {
    console.error('Error en pipeline para call_id', callId, ':', err.message);
  }
}

// ── Endpoints ──

// Webhook receptor de Call Tools
app.post('/webhook/calltools', async (req, res) => {
  // Responder inmediatamente para evitar reintentos de Call Tools
  res.status(200).json({ received: true });

  const { call_id, contact } = req.body;
  console.log('Webhook recibido. call_id:', call_id);

  // Esperar 60 segundos para que el call log y la grabacion esten listos
  await new Promise(resolve => setTimeout(resolve, 60000));

  await processCall(call_id, contact);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'eminded-qa-pipeline' });
});

// ── Iniciar servidor ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`E-Minded QA Pipeline activo en puerto ${PORT}`);
});
