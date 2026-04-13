const path = require('path');
const fs = require('fs');

// Mock Anthropic SDK before requiring the module
jest.mock('@anthropic-ai/sdk', () => {
  const mockCreate = jest.fn();
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
});

const Anthropic = require('@anthropic-ai/sdk');

// ─── loadPrompt ─────────────────────────────────────────────────────────────

describe('loadPrompt', () => {
  // We need to require fresh each time since the module loads prompts at import
  let loadPrompt;

  beforeAll(() => {
    // Require after mock is set up
    const analyze = require('../src/analyze');
    loadPrompt = analyze.loadPrompt;
  });

  test('loads a valid prompt file and extracts content between backticks', () => {
    const content = loadPrompt('router.md');
    expect(content).toBeDefined();
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain('{{TRANSCRIPCION}}');
  });

  test('loads lead-solar prompt successfully', () => {
    const content = loadPrompt('lead-solar.md');
    expect(content).toBeDefined();
    expect(content).toContain('{{TRANSCRIPCION}}');
  });

  test('loads lead-asesoria-legal prompt successfully', () => {
    const content = loadPrompt('lead-asesoria-legal.md');
    expect(content).toBeDefined();
    expect(content).toContain('{{TRANSCRIPCION}}');
  });

  test('loads reagendar prompt successfully', () => {
    const content = loadPrompt('reagendar.md');
    expect(content).toBeDefined();
    expect(content).toContain('{{TRANSCRIPCION}}');
  });

  test('loads seguimiento-solar prompt successfully', () => {
    const content = loadPrompt('seguimiento-solar.md');
    expect(content).toBeDefined();
    expect(content).toContain('{{TRANSCRIPCION}}');
  });

  test('throws error for non-existent prompt file', () => {
    expect(() => loadPrompt('does-not-exist.md')).toThrow();
  });
});

// ─── PROMPT_MAP ─────────────────────────────────────────────────────────────

describe('PROMPT_MAP', () => {
  let PROMPT_MAP;

  beforeAll(() => {
    const analyze = require('../src/analyze');
    PROMPT_MAP = analyze.PROMPT_MAP;
  });

  test('contains lead_solar prompt', () => {
    expect(PROMPT_MAP).toHaveProperty('lead_solar');
    expect(PROMPT_MAP.lead_solar.length).toBeGreaterThan(0);
  });

  test('contains lead_asesoria_legal prompt', () => {
    expect(PROMPT_MAP).toHaveProperty('lead_asesoria_legal');
  });

  test('contains seguimiento_solar prompt', () => {
    expect(PROMPT_MAP).toHaveProperty('seguimiento_solar');
  });

  test('contains reagendar prompt', () => {
    expect(PROMPT_MAP).toHaveProperty('reagendar');
  });

  test('all prompts contain the transcription placeholder', () => {
    for (const [key, template] of Object.entries(PROMPT_MAP)) {
      expect(template).toContain('{{TRANSCRIPCION}}');
    }
  });
});

// ─── classifyCall (mocked Claude API) ───────────────────────────────────────

describe('classifyCall', () => {
  let classifyCall;
  let mockCreate;

  beforeAll(() => {
    const analyze = require('../src/analyze');
    classifyCall = analyze.classifyCall;
    mockCreate = Anthropic.mock.results[0].value.messages.create;
  });

  afterEach(() => {
    mockCreate.mockReset();
  });

  test('parses valid JSON classification from Claude response', async () => {
    const classification = {
      tipo_llamada: 'lead',
      vertical: 'solar',
      confianza_tipo: 0.95,
      confianza_vertical: 0.9,
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ text: JSON.stringify(classification) }],
    });

    const result = await classifyCall('Speaker 0: Hola, buenos días.');
    expect(result).toEqual(classification);
  });

  test('extracts JSON from response with surrounding text', async () => {
    const classification = {
      tipo_llamada: 'seguimiento',
      vertical: 'solar',
      confianza_tipo: 0.85,
      confianza_vertical: 0.8,
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ text: `Here is the classification:\n${JSON.stringify(classification)}\nEnd.` }],
    });

    const result = await classifyCall('Speaker 0: Hola');
    expect(result.tipo_llamada).toBe('seguimiento');
  });

  test('throws when Claude returns no JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ text: 'I cannot classify this call.' }],
    });

    await expect(classifyCall('some transcript')).rejects.toThrow(
      'Router: Claude no devolvió un JSON válido'
    );
  });

  test('throws on malformed JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ text: '{ tipo_llamada: lead, broken json }' }],
    });

    await expect(classifyCall('some transcript')).rejects.toThrow();
  });

  test('sends transcript in the prompt to Claude', async () => {
    const classification = { tipo_llamada: 'lead', vertical: 'solar', confianza_tipo: 0.9, confianza_vertical: 0.9 };
    mockCreate.mockResolvedValueOnce({
      content: [{ text: JSON.stringify(classification) }],
    });

    await classifyCall('Mi transcripción de prueba');

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('Mi transcripción de prueba');
  });

  test('uses claude-sonnet-4-6 model', async () => {
    const classification = { tipo_llamada: 'lead', vertical: 'solar', confianza_tipo: 0.9, confianza_vertical: 0.9 };
    mockCreate.mockResolvedValueOnce({
      content: [{ text: JSON.stringify(classification) }],
    });

    await classifyCall('test');

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe('claude-sonnet-4-6');
  });
});

// ─── analyzeCall (mocked) ───────────────────────────────────────────────────

describe('analyzeCall', () => {
  let analyzeCall;
  let mockCreate;

  beforeAll(() => {
    const analyze = require('../src/analyze');
    analyzeCall = analyze.analyzeCall;
    mockCreate = Anthropic.mock.results[0].value.messages.create;
  });

  afterEach(() => {
    mockCreate.mockReset();
  });

  test('enriches QA result with router classification', async () => {
    const routerResponse = {
      tipo_llamada: 'lead',
      vertical: 'solar',
      confianza_tipo: 0.95,
      confianza_vertical: 0.9,
    };

    const qaResponse = {
      agente: 'No identificado',
      puntaje_total: 80,
      nivel: 'Bueno',
    };

    // First call: router classification
    mockCreate.mockResolvedValueOnce({
      content: [{ text: JSON.stringify(routerResponse) }],
    });
    // Second call: QA evaluation
    mockCreate.mockResolvedValueOnce({
      content: [{ text: JSON.stringify(qaResponse) }],
    });

    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();

    const result = await analyzeCall('Speaker 0: Hola', 'Solar', 'Carlos');

    expect(result.router).toEqual(routerResponse);
    expect(result.agente).toBe('Carlos'); // webhook name overrides "No identificado"
    expect(result.puntaje_total).toBe(80);

    console.log.mockRestore();
    console.warn.mockRestore();
  });

  test('does not override valid agent name from Claude', async () => {
    const routerResponse = {
      tipo_llamada: 'lead',
      vertical: 'solar',
      confianza_tipo: 0.95,
      confianza_vertical: 0.9,
    };

    const qaResponse = {
      agente: 'María López',
      puntaje_total: 90,
      nivel: 'Excelente',
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ text: JSON.stringify(routerResponse) }],
    });
    mockCreate.mockResolvedValueOnce({
      content: [{ text: JSON.stringify(qaResponse) }],
    });

    jest.spyOn(console, 'log').mockImplementation();

    const result = await analyzeCall('test transcript', null, 'Carlos');
    expect(result.agente).toBe('María López'); // Claude's name preserved

    console.log.mockRestore();
  });

  test('logs warning for low confidence classification', async () => {
    const routerResponse = {
      tipo_llamada: 'otro',
      vertical: 'desconocido',
      confianza_tipo: 0.4,
      confianza_vertical: 0.3,
    };

    const fallbackResponse = {
      agente: 'Test',
      puntaje_total: 50,
      nivel: 'Regular',
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ text: JSON.stringify(routerResponse) }],
    });
    mockCreate.mockResolvedValueOnce({
      content: [{ text: JSON.stringify(fallbackResponse) }],
    });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();

    await analyzeCall('test', null, null);

    const warnMessages = warnSpy.mock.calls.map(c => c[0]);
    expect(warnMessages.some(m => m.includes('Confianza baja en tipo'))).toBe(true);
    expect(warnMessages.some(m => m.includes('Confianza baja en vertical'))).toBe(true);

    warnSpy.mockRestore();
    console.log.mockRestore();
  });
});
