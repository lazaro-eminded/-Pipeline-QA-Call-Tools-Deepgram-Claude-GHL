const crypto = require('crypto');
const { transcribeCall } = require('./transcribe');
const { evaluateCallUnified } = require('./analyze');
const { saveNoteInGHL } = require('./ghl');

function makeIdempotencyKey(payload) {
  const stable = payload.callId || payload.id || payload.recordingUrl || `${payload.phone || ''}:${payload.startedAt || ''}`;
  return crypto.createHash('sha256').update(String(stable)).digest('hex');
}

function extractDurationSeconds(payload) {
  const value = payload.durationSeconds ?? payload.duration ?? payload.callDuration ?? payload.duration_seconds;
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function passesDurationFilter(durationSeconds, minimumSeconds = 60, allowUnknown = false) {
  if (durationSeconds === null) return allowUnknown;
  return durationSeconds > minimumSeconds;
}

function createProcessor(store) {
  return async job => {
    const transcript = job.transcript || await transcribeCall(job.recordingUrl);
    if (!transcript) throw new Error('No se obtuvo transcripción');
    const analysis = await evaluateCallUnified(transcript, { agentName: job.agent, verticalHint: job.vertical });
    const call = await store.saveCall({
      jobId: job.id, agent: job.agent || 'No identificado', phone: job.phone || null,
      contactName: job.contactName || null, recordingUrl: job.recordingUrl || null,
      durationSeconds: job.durationSeconds, transcript, analysis,
      // Reserved integration points; no external course/voice feature is claimed as active.
      courseRefs: [], roleplayScenarioIds: [],
    });
    if (process.env.GHL_WRITE_ENABLED === 'true' && job.phone && process.env.GHL_TOKEN) {
      await saveNoteInGHL(job.phone, analysis, process.env.GHL_TOKEN, process.env.GHL_USER_ID, process.env.GHL_LOCATION_ID_SOLAR);
    }
    return call;
  };
}

module.exports = { makeIdempotencyKey, extractDurationSeconds, passesDurationFilter, createProcessor };
