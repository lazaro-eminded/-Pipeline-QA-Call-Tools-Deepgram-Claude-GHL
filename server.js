require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { Store } = require('./src/store');
const { JobQueue } = require('./src/queue');
const { makeIdempotencyKey, extractDurationSeconds, passesDurationFilter, createProcessor } = require('./src/process-call');

const app = express();
app.use(multer().any());
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
const port = Number(process.env.PORT || 3000);
const minDuration = Number(process.env.MIN_CALL_DURATION_SECONDS || 60);
const allowUnknownDuration = process.env.ALLOW_UNKNOWN_DURATION === 'true';
const store = new Store();
const queue = new JobQueue({ store, processJob: createProcessor(store) });

function campaignFor(path) {
  return path.includes('mitigacion') ? 'mitigacion' : path.includes('solar') ? 'solar' : null;
}

async function receiveCall(req, res) {
  const payload = req.body || {};
  if (!payload.recordingUrl && !payload.transcript) return res.status(400).json({ received: false, error: 'recordingUrl o transcript es requerido' });
  const durationSeconds = extractDurationSeconds(payload);
  // Conservative default: unknown and short calls never invoke paid providers.
  if (!passesDurationFilter(durationSeconds, minDuration, allowUnknownDuration)) {
    return res.status(202).json({ received: true, queued: false, reason: durationSeconds === null ? 'duration_required' : 'below_minimum_duration' });
  }
  const contactName = `${payload.firstName || ''} ${payload.lastName || ''}`.trim();
  const result = await store.createJob({
    idempotencyKey: makeIdempotencyKey(payload), recordingUrl: payload.recordingUrl || null, transcript: payload.transcript || null,
    durationSeconds, agent: payload.user || payload.agent || null, phone: payload.phone || null, contactName: contactName || null,
    vertical: payload.vertical || campaignFor(req.path), maxAttempts: Number(process.env.JOB_MAX_ATTEMPTS || 3),
  });
  // No raw payload, phone, recording URL, or secret is emitted to logs.
  return res.status(202).json({ received: true, queued: !result.duplicate, duplicate: result.duplicate, jobId: result.job.id });
}

app.post(['/webhook/calltools', '/webhook/solar', '/webhook/mitigacion'], (req, res, next) => receiveCall(req, res).catch(next));
// Read APIs for the future LeadMinded UI. Auth/RBAC must precede public deployment.
app.get('/api/calls', (req, res) => res.json({ calls: store.listCalls({ agent: req.query.agent, limit: req.query.limit }) }));
app.get('/api/calls/:id', (req, res) => {
  const call = store.getCall(req.params.id);
  return call ? res.json({ call }) : res.status(404).json({ error: 'not_found' });
});
app.get('/api/objections', (req, res) => res.json({ objections: store.data.objections }));
app.get('/api/catalog', (req, res) => res.json({ courses: store.data.courses, roleplayScenarios: store.data.roleplayScenarios }));
app.get('/health', (req, res) => res.json({ status: 'ok', mode: { transcription: process.env.TRANSCRIPTION_PROVIDER || 'local', analysis: process.env.ANALYSIS_PROVIDER || 'local' }, queued: store.data.jobs.filter(job => job.status === 'queued').length }));
app.use((error, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[server] Request failed:', error.message);
  res.status(500).json({ error: 'internal_error' });
});

async function start() {
  await store.init();
  queue.start();
  app.listen(port, () => console.log(`E-Trainer API listening on ${port}`));
}
if (require.main === module) start().catch(error => { console.error(error.message); process.exit(1); });
module.exports = { app, store, receiveCall, start };
