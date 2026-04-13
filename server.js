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

// ─── Endpoints por campaña ───────────────────────────────────────────────────
app.post('/webhook/solar', createWebhookHandler(CAMPAIGN_CONFIG.solar));
app.post('/webhook/mitigacion', createWebhookHandler(CAMPAIGN_CONFIG.mitigacion));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'E-Minded QA Pipeline v2.0 (Router + Prompts)',
    timestamp: new Date().toISOString(),
    endpoints: {
      solar: 'POST /webhook/solar → GHL: E-Minded Solutions',
      mitigacion: 'POST /webhook/mitigacion → GHL: SAF Services',
    },
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 E-Minded QA Pipeline v2.0 corriendo en puerto ${PORT}`);
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
