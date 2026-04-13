const axios = require('axios');

/**
 * Obtiene el call log de Call Tools para extraer la recording_url.
 * El campo puede llamarse recording_url, recording, audio_url — ajustar según el payload real.
 *
 * @param {string} callId - ID de la llamada recibido en el webhook
 * @returns {Object} Call log con recording_url normalizada
 */
async function getCallLog(callId) {
  const silo = process.env.CALLTOOLS_SILO;
  const apiKey = process.env.CALLTOOLS_API_KEY;

  const res = await axios.get(
    `https://${silo}.calltools.io/api/calllogs/${callId}/`,
    {
      headers: { Authorization: `Token ${apiKey}` },
    }
  );

  const data = res.data;

  // Normalizar el campo de grabación (verificar cuál aplica en tu cuenta)
  const recordingUrl =
    data.recording_url ||
    data.recording ||
    data.audio_url ||
    data.call_recording_url ||
    null;

  return {
    ...data,
    recording_url: recordingUrl,
  };
}

module.exports = { getCallLog };
