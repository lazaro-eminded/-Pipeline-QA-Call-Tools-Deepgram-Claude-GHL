const request = require('supertest');

// Mock all external dependencies before requiring server
jest.mock('../src/transcribe', () => ({
  transcribeCall: jest.fn(),
}));

jest.mock('../src/analyze', () => {
  const actual = jest.requireActual('../src/analyze');
  return {
    ...actual,
    analyzeCall: jest.fn(),
    classifyCall: jest.fn(),
  };
});

jest.mock('../src/ghl', () => {
  const actual = jest.requireActual('../src/ghl');
  return {
    ...actual,
    saveNoteInGHL: jest.fn(),
  };
});

// Set required env vars
process.env.GHL_TOKEN = 'test-token';
process.env.GHL_USER_ID = 'test-user';
process.env.GHL_LOCATION_ID_SOLAR = 'loc-solar';
process.env.GHL_LOCATION_ID_MITIGACION = 'loc-mitigacion';

// We need to import the Express app without starting the server.
// server.js calls app.listen() at module level, so we mock it.
let app;

beforeAll(() => {
  // Prevent actual server from starting
  const express = require('express');
  const originalListen = express.application.listen;
  express.application.listen = jest.fn(function () {
    // no-op: don't actually start listening
    return { close: jest.fn() };
  });

  // Suppress startup logs
  jest.spyOn(console, 'log').mockImplementation();
  jest.spyOn(console, 'error').mockImplementation();
  jest.spyOn(console, 'warn').mockImplementation();

  app = require('../server.js');

  // Restore listen for other tests if needed
  express.application.listen = originalListen;
});

afterAll(() => {
  console.log.mockRestore();
  console.error.mockRestore();
  console.warn.mockRestore();
});

// ─── Health endpoint ────────────────────────────────────────────────────────

describe('GET /health', () => {
  test('returns 200 with correct structure', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('service');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('endpoints');
    expect(res.body.endpoints).toHaveProperty('calltools');
    expect(res.body.endpoints).toHaveProperty('solar');
    expect(res.body.endpoints).toHaveProperty('mitigacion');
  });

  test('returns service name containing v2.0', async () => {
    const res = await request(app).get('/health');
    expect(res.body.service).toContain('v2.0');
  });

  test('returns valid ISO timestamp', async () => {
    const res = await request(app).get('/health');
    const date = new Date(res.body.timestamp);
    expect(date.toISOString()).toBe(res.body.timestamp);
  });
});

// ─── Webhook endpoints ──────────────────────────────────────────────────────

describe('POST /webhook/solar', () => {
  test('returns 200 immediately with { received: true }', async () => {
    const res = await request(app)
      .post('/webhook/solar')
      .send({ recordingUrl: 'http://example.com/audio.wav', phone: '5551234567' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('returns 200 even without recordingUrl', async () => {
    const res = await request(app)
      .post('/webhook/solar')
      .send({ phone: '5551234567' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});

describe('POST /webhook/mitigacion', () => {
  test('returns 200 immediately with { received: true }', async () => {
    const res = await request(app)
      .post('/webhook/mitigacion')
      .send({ recordingUrl: 'http://example.com/audio.wav', phone: '5551234567' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});

describe('POST /webhook/calltools', () => {
  test('returns 200 immediately with { received: true }', async () => {
    const res = await request(app)
      .post('/webhook/calltools')
      .send({ recordingUrl: 'http://example.com/audio.wav', phone: '5551234567', user: 'Agent' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('returns 200 even without recordingUrl', async () => {
    const res = await request(app)
      .post('/webhook/calltools')
      .send({ phone: '5551234567' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});

// ─── 404 for unknown routes ─────────────────────────────────────────────────

describe('Unknown routes', () => {
  test('GET /nonexistent returns 404', async () => {
    const res = await request(app).get('/nonexistent');
    expect(res.status).toBe(404);
  });
});
