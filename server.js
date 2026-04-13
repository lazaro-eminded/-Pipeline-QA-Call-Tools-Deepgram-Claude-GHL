require('dotenv').config();

const express = require('express');
const { transcribeCall } = require('./src/transcribe');
const { analyzeCall } = require('./src/analyze');
const { saveNoteInGHL } = require('./src/ghl');

const multer = require('multer');
const upload = multer();

const app = express();
// Call Tools envía Multipart Form Data incluyendo el archivo de audio (recordingFile)
// upload.any() acepta tanto campos de texto como archivos binarios
app.use(upload.any());
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const PORT = process.env.PORT || 3000;

// Configuración por campaña
// Un solo token de agencia GHL + location ID por subcuenta
const CAMPAIGN_CONFIG = {
  solar: {
    label: 'Solar',
    vertical: 'Solar',
    ghlToken: () => process.env.GHL_TOKEN,
    ghlUserId: () => process.env.GHL_USER_ID,
    ghlLocationId: () => process.env.GHL_LOCATION_ID_SOLAR,
  },
  mitigacion: {
    label: 'Mitigación',
    vertical: 'Mitigación',
    ghlToken: () => process.env.GHL_TOKEN,
    ghlUserId: () => process.env.GHL_USER_ID,
    ghlLocationId: () => process.env.GHL_LOCATION_ID_MITIGACION,
  },
};

async function processCall(payload, campaign) {
  const { label, vertical, ghlToken, ghlUserId, ghlLocationId } = campaign;

  // Campos que llegan directamente del webhook de Call Tools
  const recordingUrl = payload.recordingUrl;
  const phoneNumber = payload.phone;
  const agentName = payload.user;
  const contactName = `${payload.firstName || ''} ${payload.lastName || ''}`.trim();

  console.log(`\n[QA Pipeline - ${label}]`);
  console.log(` Agente: ${agentName || 'No identificado'}`);
  console.log(` Contacto: ${contactName || 'No identificado'}`);
  console.log(` Teléfono: ${phoneNumber}`);
  console.log(` Recording: ${recordingUrl}`);

  if (!recordingUrl) {
    console.error(`[QA Pipeline - ${label}] No hay recordingUrl en el payload, abortando.`);
    return;
  }

  if (!phoneNumber) {
    console.warn(`[QA Pipeline - ${label}] No hay número de teléfono — no se podrá guardar en GHL.`);
  }

  // Esperar 60s para asegurarse de que el archivo de audio ya esté listo en el servidor de Call Tools
  console.log(`[QA Pipeline - ${label}] Esperando 60s para que el audio esté disponible...`);
  await new Promise(resolve => setTimeout(resolve, 60000));

  // Paso 1: Transcribir con Deepgram
  console.log(`[QA Pipeline - ${label}] Transcribiendo con Deepgram...`);
  let transcript;
  try {
    transcript = await transcribeCall(recordingUrl);
  } catch (err) {
    console.error(`[QA Pipeline - ${label}] Error en transcripción: ${err.message}`);
    return;
  }

  if (!transcript) {
    console.error(`[QA Pipeline - ${label}] Transcripción vacía, abortando.`);
    return;
  }
  console.log(`[QA Pipeline - ${label}] Transcripción completada (${transcript.length} chars)`);

  // Paso 2: Analizar con Claude (Router + Prompt Especializado)
  console.log(`[QA Pipeline - ${label}] Analizando con Claude (Router + QA)...`);
  let qa;
  try {
    qa = await analyzeCall(transcript, vertical, agentName);
  } catch (err) {
    console.error(`[QA Pipeline - ${label}] Error en análisis Claude: ${err.message}`);
    return;
  }
  console.log(`[QA Pipeline - ${label}] Router: ${qa.router?.tipo_llamada}/${qa.router?.vertical}`);
  console.log(`[QA Pipeline - ${label}] Score: ${qa.puntaje_total} — ${qa.nivel}`);

  // Paso 3: Guardar nota en GHL
  if (phoneNumber) {
    console.log(`[QA Pipeline - ${label}] Guardando nota en GHL...`);
    try {
      await saveNoteInGHL(phoneNumber, qa, ghlToken(), ghlUserId(), ghlLocationId());
      console.log(`[QA Pipeline - ${label}] ✅ Nota guardada en GHL`);
    } catch (err) {
      console.error(`[QA Pipeline - ${label}] Error guardando en GHL: ${err.message}`);
    }
  }

  console.log(`[QA Pipeline - ${label}] ✅ Proceso completado`);
}

function createWebhookHandler(campaign) {
  return async (req, res) => {
    res.status(200).json({ received: true });

    const body = req.body;
    console.log(`\n[Webhook - ${campaign.label}] Payload recibido:`, JSON.stringify(body, null, 2));

    if (!body.recordingUrl) {
      console.error(`[Webhook - ${campaign.label}] No hay recordingUrl en el payload, ignorando.`);
      return;
    }

    processCall(body, campaign).catch(err => {
      console.error(`[QA Pipeline - ${campaign.label}] Error no capturado:`, err.message);
    });
  };
}

// ─── Endpoints por campaña (específicos) ─────────────────────────────────────
app.post('/webhook/solar', createWebhookHandler(CAMPAIGN_CONFIG.solar));
app.post('/webhook/mitigacion', createWebhookHandler(CAMPAIGN_CONFIG.mitigacion));

// ─── Endpoint universal (Call Tools apunta aquí) ─────────────────────────────
// El Router clasifica la vertical automáticamente y enruta a la subcuenta correcta
const { classifyCall } = require('./src/analyze');

app.post('/webhook/calltools', async (req, res) => {
  res.status(200).json({ received: true });

  const body = req.body;
  console.log('\n[Webhook - CallTools] Payload recibido:', JSON.stringify(body, null, 2));

  const recordingUrl = body.recordingUrl;
  if (!recordingUrl) {
    console.error('[Webhook - CallTools] No hay recordingUrl en el payload, ignorando.');
    return;
  }

  const phoneNumber = body.phone;
  const agentName = body.user;
  const contactName = `${body.firstName || ''} ${body.lastName || ''}`.trim();

  console.log(`[Webhook - CallTools] Agente: ${agentName || 'N/A'}, Contacto: ${contactName || 'N/A'}, Tel: ${phoneNumber}`);

  // Esperar 60s para que el audio esté disponible
  console.log('[Webhook - CallTools] Esperando 60s para que el audio esté disponible...');
  await new Promise(resolve => setTimeout(resolve, 60000));

  try {
    // Paso 1: Transcribir
    console.log('[Webhook - CallTools] Transcribiendo con Deepgram...');
    const { transcribeCall } = require('./src/transcribe');
    const transcript = await transcribeCall(recordingUrl);
    if (!transcript) {
      console.error('[Webhook - CallTools] Transcripción vacía, abortando.');
      return;
    }
    console.log(`[Webhook - CallTools] Transcripción completada (${transcript.length} chars)`);

    // Paso 2: Analizar con Router + Prompt especializado
    console.log('[Webhook - CallTools] Analizando con Claude (Router + QA)...');
    const { analyzeCall } = require('./src/analyze');
    const qa = await analyzeCall(transcript, null, agentName);
    const routerVertical = qa.router?.vertical || 'desconocido';
    console.log(`[Webhook - CallTools] Router: ${qa.router?.tipo_llamada}/${routerVertical}`);
    console.log(`[Webhook - CallTools] Score: ${qa.puntaje_total} — ${qa.nivel}`);

    // Paso 3: Determinar subcuenta GHL basado en la vertical del Router
    let locationId;
    if (routerVertical === 'mitigacion') {
      locationId = process.env.GHL_LOCATION_ID_MITIGACION;
    } else {
      // solar, asesoria_legal, desconocido → subcuenta Solar
      locationId = process.env.GHL_LOCATION_ID_SOLAR;
    }

    // Paso 4: Guardar nota en GHL
    if (phoneNumber) {
      console.log(`[Webhook - CallTools] Guardando nota en GHL (location: ${locationId})...`);
      const { saveNoteInGHL } = require('./src/ghl');
      await saveNoteInGHL(phoneNumber, qa, process.env.GHL_TOKEN, process.env.GHL_USER_ID, locationId);
      console.log('[Webhook - CallTools] ✅ Nota guardada en GHL');
    }

    console.log('[Webhook - CallTools] ✅ Proceso completado');
  } catch (err) {
    console.error('[Webhook - CallTools] Error:', err.message);
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'E-Minded QA Pipeline v2.0 (Router + Prompts)',
    timestamp: new Date().toISOString(),
    endpoints: {
      calltools: 'POST /webhook/calltools → Router determina vertical → GHL subcuenta correcta',
      solar: 'POST /webhook/solar → GHL: E-Minded Solutions (directo)',
      mitigacion: 'POST /webhook/mitigacion → GHL: SAF Services (directo)',
    },
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 E-Minded QA Pipeline v2.0 corriendo en puerto ${PORT}`);
  console.log(` CallTools: POST http://localhost:${PORT}/webhook/calltools (universal)`);
  console.log(` Solar: POST http://localhost:${PORT}/webhook/solar`);
  console.log(` Mitigación: POST http://localhost:${PORT}/webhook/mitigacion`);
  console.log(` Health: GET http://localhost:${PORT}/health\n`);

  const vars = {
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GHL_TOKEN: process.env.GHL_TOKEN,
    GHL_USER_ID: process.env.GHL_USER_ID,
    GHL_LOCATION_ID_SOLAR: process.env.GHL_LOCATION_ID_SOLAR,
    GHL_LOCATION_ID_MITIGACION: process.env.GHL_LOCATION_ID_MITIGACION,
  };
  console.log('[ENV] Estado de variables de entorno:');
  for (const [key, val] of Object.entries(vars)) {
    if (val) {
      console.log(`  ✅ ${key} = ${val.substring(0, 6)}...${val.slice(-4)} (${val.length} chars)`);
    } else {
      console.log(`  ❌ ${key} = NO CONFIGURADA`);
    }
  }
  console.log('');
});
