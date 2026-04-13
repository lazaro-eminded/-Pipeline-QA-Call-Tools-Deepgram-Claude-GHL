const { buildTranscript } = require('../src/transcribe');

// ─── buildTranscript ────────────────────────────────────────────────────────

describe('buildTranscript', () => {
  test('formats utterances with speaker labels', () => {
    const result = {
      results: {
        utterances: [
          { speaker: 0, transcript: 'Hola, buenos días.' },
          { speaker: 1, transcript: 'Buenos días, ¿cómo está?' },
          { speaker: 0, transcript: 'Muy bien, gracias.' },
        ],
      },
    };

    const transcript = buildTranscript(result);
    expect(transcript).toBe(
      'Speaker 0: Hola, buenos días.\n' +
      'Speaker 1: Buenos días, ¿cómo está?\n' +
      'Speaker 0: Muy bien, gracias.'
    );
  });

  test('falls back to channel transcript when no utterances', () => {
    const result = {
      results: {
        utterances: null,
        channels: [
          {
            alternatives: [
              { transcript: 'Hola, esta es la transcripción completa.' },
            ],
          },
        ],
      },
    };

    const transcript = buildTranscript(result);
    expect(transcript).toBe('Hola, esta es la transcripción completa.');
  });

  test('falls back to channel transcript when utterances is empty array', () => {
    const result = {
      results: {
        utterances: [],
        channels: [
          {
            alternatives: [
              { transcript: 'Fallback transcript.' },
            ],
          },
        ],
      },
    };

    const transcript = buildTranscript(result);
    expect(transcript).toBe('Fallback transcript.');
  });

  test('handles single speaker transcript', () => {
    const result = {
      results: {
        utterances: [
          { speaker: 0, transcript: 'Solo yo hablando aquí.' },
        ],
      },
    };

    const transcript = buildTranscript(result);
    expect(transcript).toBe('Speaker 0: Solo yo hablando aquí.');
  });

  test('handles multiple speakers (3+)', () => {
    const result = {
      results: {
        utterances: [
          { speaker: 0, transcript: 'Línea uno.' },
          { speaker: 1, transcript: 'Línea dos.' },
          { speaker: 2, transcript: 'Línea tres.' },
        ],
      },
    };

    const transcript = buildTranscript(result);
    expect(transcript).toContain('Speaker 0:');
    expect(transcript).toContain('Speaker 1:');
    expect(transcript).toContain('Speaker 2:');
  });

  test('preserves Spanish characters and punctuation', () => {
    const result = {
      results: {
        utterances: [
          { speaker: 0, transcript: '¿Cómo está usted señor García? ¡Excelente!' },
        ],
      },
    };

    const transcript = buildTranscript(result);
    expect(transcript).toContain('¿Cómo está usted señor García? ¡Excelente!');
  });
});

// ─── transcribeCall (mocked) ────────────────────────────────────────────────

describe('transcribeCall', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('throws when DEEPGRAM_API_KEY is not set', async () => {
    const originalKey = process.env.DEEPGRAM_API_KEY;
    delete process.env.DEEPGRAM_API_KEY;

    // Need fresh require to avoid cached Deepgram client
    jest.mock('@deepgram/sdk', () => ({
      createClient: jest.fn(),
    }));

    const { transcribeCall } = require('../src/transcribe');

    await expect(transcribeCall('http://example.com/audio.wav')).rejects.toThrow(
      'DEEPGRAM_API_KEY'
    );

    if (originalKey) process.env.DEEPGRAM_API_KEY = originalKey;
  });
});
