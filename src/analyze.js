const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Cargar prompts desde archivos .md ────────────────────────────────────────

function loadPrompt(filename) {
  const filePath = path.join(__dirname, '..', 'prompts', filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  // Extraer el contenido entre los backticks ``` del bloque de prompt
  const match = content.match(/```\n([\s\S]*?)```/);
  return match ? match[1].trim() : content;
}

const ROUTER_PROMPT = loadPrompt('router.md');

// Mapa de prompts por tipo_llamada + vertical
const PROMPT_MAP = {
  'lead_solar': loadPrompt('lead-solar.md'),
  'lead_asesoria_legal': loadPrompt('lead-asesoria-legal.md'),
  'seguimiento_solar': loadPrompt('seguimiento-solar.md'),
  'reagendar': loadPrompt('reagendar.md'),
  // Prompts pendientes de crear — usan fallback
  // 'cold_call_solar': loadPrompt('cold-call-solar.md'),
  // 'cold_call_mitigacion': loadPrompt('cold-call-mitigacion.md'),
  // 'lead_mitigacion': loadPrompt('lead-mitigacion.md'),
  // 'confirmacion': loadPrompt('confirmacion.md'),
};

// ─── Paso 1: Router — Clasificar la llamada ──────────────────────────────────

async function classifyCall(transcript) {
  const prompt = ROUTER_PROMPT.replace('{{TRANSCRIPCION}}', transcript);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Router: Claude no devolvió un JSON válido');
  }

  return JSON.parse(jsonMatch[0]);
}

// ─── Paso 2: Evaluación QA — Usar prompt especializado ──────────────────────

async function evaluateCall(transcript, classification) {
  const { tipo_llamada, vertical } = classification;

  // Buscar prompt específico para tipo + vertical
  let promptKey = `${tipo_llamada}_${vertical}`;
  let promptTemplate = PROMPT_MAP[promptKey];

  // Fallback: buscar solo por tipo (ej: "reagendar" no tiene vertical)
  if (!promptTemplate) {
    promptTemplate = PROMPT_MAP[tipo_llamada];
  }

  // Si no hay prompt especializado, usar fallback genérico
  if (!promptTemplate) {
    console.warn(`[Analyze] No hay prompt para "${promptKey}", usando fallback genérico`);
    return buildFallbackAnalysis(transcript, classification);
  }

  const prompt = promptTemplate.replace('{{TRANSCRIPCION}}', transcript);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Evaluación: Claude no devolvió un JSON válido');
  }

  return JSON.parse(jsonMatch[0]);
}

// ─── Fallback genérico para tipos sin prompt especializado ───────────────────

async function buildFallbackAnalysis(transcript, classification) {
  const prompt = `Eres el sistema de QA de E-Minded Solutions. Analiza esta transcripción de una llamada de telemarketing.

Tipo de llamada detectado: ${classification.tipo_llamada}
Vertical detectada: ${classification.vertical}

TRANSCRIPCIÓN:
${transcript}

Evalúa la calidad general de la llamada sobre 100 puntos considerando: profesionalismo, escucha activa, manejo de la conversación, y resultado obtenido.

Responde ÚNICAMENTE con este JSON:
{
  "agente": "nombre o 'No identificado'",
  "tipo_llamada": "${classification.tipo_llamada}",
  "vertical": "${classification.vertical}",
  "duracion_estimada": "X minutos",
  "puntaje_total": 50,
  "nivel": "Excelente | Bueno | Regular | Crítico",
  "puntos_fuertes": ["punto 1"],
  "areas_mejora": ["área 1"],
  "cita_agendada": false,
  "resumen_ejecutivo": "resumen de 2-3 oraciones",
  "recomendacion_accion": "Feedback puntual",
  "nota": "Evaluado con prompt genérico — no hay prompt especializado para este tipo de llamada"
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Fallback: Claude no devolvió un JSON válido');
  }

  return JSON.parse(jsonMatch[0]);
}

// ─── Función principal — Router + Evaluación ─────────────────────────────────

/**
 * Analiza una transcripción de llamada usando el sistema Router + Prompts.
 *
 * Paso 1: Router clasifica tipo de llamada + vertical
 * Paso 2: Se selecciona el prompt especializado correspondiente
 * Paso 3: Claude evalúa con los criterios específicos de ese tipo
 *
 * @param {string} transcript - Transcripción de la llamada
 * @param {string} [verticalHint] - Pista de la vertical (del endpoint del webhook)
 * @param {string} [agentName] - Nombre del agente (del webhook de Call Tools)
 * @returns {Object} Análisis QA completo en formato JSON
 */
async function analyzeCall(transcript, verticalHint, agentName) {
  // Paso 1: Router
  console.log('[Analyze] Paso 1: Clasificando llamada con Router...');
  const classification = await classifyCall(transcript);
  console.log(`[Analyze] Router: tipo=${classification.tipo_llamada}, vertical=${classification.vertical}, confianza_tipo=${classification.confianza_tipo}, confianza_vertical=${classification.confianza_vertical}`);

  // Si la confianza es baja, loguear advertencia
  if (classification.confianza_tipo < 0.7) {
    console.warn(`[Analyze] ⚠️ Confianza baja en tipo (${classification.confianza_tipo}). Considerar revisión humana.`);
  }
  if (classification.confianza_vertical < 0.7) {
    console.warn(`[Analyze] ⚠️ Confianza baja en vertical (${classification.confianza_vertical}). Considerar revisión humana.`);
  }

  // Paso 2: Evaluación con prompt especializado
  const promptKey = `${classification.tipo_llamada}_${classification.vertical}`;
  console.log(`[Analyze] Paso 2: Evaluando con prompt "${promptKey}"...`);
  const qa = await evaluateCall(transcript, classification);

  // Enriquecer con datos del router y del webhook
  qa.router = classification;
  if (agentName && (!qa.agente || qa.agente === 'No identificado')) {
    qa.agente = agentName;
  }

  return qa;
}

module.exports = { analyzeCall, classifyCall, loadPrompt, PROMPT_MAP };
