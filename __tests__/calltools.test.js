const axios = require('axios');
const { getCallLog } = require('../src/calltools');

jest.mock('axios');

describe('getCallLog', () => {
  beforeEach(() => {
    process.env.CALLTOOLS_SILO = 'west-4';
    process.env.CALLTOOLS_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('returns call data with normalized recording_url from recording_url field', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        id: 'call-123',
        recording_url: 'https://s3.example.com/recording.wav',
        duration: 120,
      },
    });

    const result = await getCallLog('call-123');
    expect(result.recording_url).toBe('https://s3.example.com/recording.wav');
    expect(result.id).toBe('call-123');
  });

  test('normalizes recording field to recording_url', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        id: 'call-456',
        recording: 'https://s3.example.com/alt-recording.wav',
      },
    });

    const result = await getCallLog('call-456');
    expect(result.recording_url).toBe('https://s3.example.com/alt-recording.wav');
  });

  test('normalizes audio_url field to recording_url', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        id: 'call-789',
        audio_url: 'https://s3.example.com/audio.wav',
      },
    });

    const result = await getCallLog('call-789');
    expect(result.recording_url).toBe('https://s3.example.com/audio.wav');
  });

  test('normalizes call_recording_url field to recording_url', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        id: 'call-000',
        call_recording_url: 'https://s3.example.com/call-recording.wav',
      },
    });

    const result = await getCallLog('call-000');
    expect(result.recording_url).toBe('https://s3.example.com/call-recording.wav');
  });

  test('returns null recording_url when no recording field exists', async () => {
    axios.get.mockResolvedValueOnce({
      data: { id: 'call-no-rec', duration: 60 },
    });

    const result = await getCallLog('call-no-rec');
    expect(result.recording_url).toBeNull();
  });

  test('uses correct API URL with silo and call ID', async () => {
    axios.get.mockResolvedValueOnce({
      data: { id: 'test-call' },
    });

    await getCallLog('test-call');

    expect(axios.get).toHaveBeenCalledWith(
      'https://west-4.calltools.io/api/calllogs/test-call/',
      expect.objectContaining({
        headers: { Authorization: 'Token test-api-key' },
      })
    );
  });

  test('prioritizes recording_url over other field names', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        recording_url: 'https://primary.wav',
        recording: 'https://secondary.wav',
        audio_url: 'https://tertiary.wav',
      },
    });

    const result = await getCallLog('call-priority');
    expect(result.recording_url).toBe('https://primary.wav');
  });

  test('propagates API errors', async () => {
    axios.get.mockRejectedValueOnce(new Error('Network error'));

    await expect(getCallLog('call-error')).rejects.toThrow('Network error');
  });
});
