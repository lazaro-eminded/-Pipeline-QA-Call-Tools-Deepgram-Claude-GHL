const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/store');
const { JobQueue } = require('../src/queue');
const { makeIdempotencyKey, extractDurationSeconds, passesDurationFilter } = require('../src/process-call');

function temporaryStore() {
  return new Store(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'etrainer-test-')), 'data.json'));
}

test('idempotency key is stable and duration supports Call Tools variants', () => {
  assert.equal(makeIdempotencyKey({ callId: 'call-1' }), makeIdempotencyKey({ callId: 'call-1' }));
  assert.equal(extractDurationSeconds({ callDuration: '61' }), 61);
  assert.equal(extractDurationSeconds({}), null);
  assert.equal(passesDurationFilter(59), false);
  assert.equal(passesDurationFilter(60), false);
  assert.equal(passesDurationFilter(61), true);
  assert.equal(passesDurationFilter(null), false);
  assert.equal(passesDurationFilter(null, 60, true), true);
});

test('store prevents duplicate jobs and persists a call with objections', async () => {
  const store = temporaryStore();
  await store.init();
  const first = await store.createJob({ idempotencyKey: 'same' });
  const second = await store.createJob({ idempotencyKey: 'same' });
  assert.equal(second.duplicate, true);
  const call = await store.saveCall({ jobId: first.job.id, agent: 'Ana', analysis: { objections: [{ texto: 'Es caro', categoria: 'precio' }] } });
  assert.equal(store.listCalls({ agent: 'Ana' })[0].id, call.id);
  assert.equal(store.data.objections[0].status, 'pending');
});

test('queue retries a failed job and completes it', async () => {
  const store = temporaryStore();
  await store.init();
  const { job } = await store.createJob({ idempotencyKey: 'retry', maxAttempts: 2 });
  let runs = 0;
  const queue = new JobQueue({ store, pollMs: 99999, processJob: async () => { runs += 1; if (runs === 1) throw new Error('temporary'); } });
  await queue.drain();
  assert.equal(job.status, 'queued');
  job.nextAttemptAt = new Date(0).toISOString();
  await queue.drain();
  assert.equal(job.status, 'completed');
});
