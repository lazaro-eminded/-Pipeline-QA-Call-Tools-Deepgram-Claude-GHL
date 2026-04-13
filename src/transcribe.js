const { createClient } = require('@deepgram/sdk');
const axios = require('axios');

/**
 * Descarga el audio desde Call Tools (S3 privado) usando la API key.
 * Retorna el buffer del audio para enviarlo directamente a Deepgram.
 */
async function downloadAudio(recordingUrl) {
  const response = await axios.get(recordingUrl, {
    responseType: 'arraybuffer',
    timeout: 30000, // 30s timeout para la descarga
    headers: {
      // Si el S3 requiere auth de Call Tools, agregar aquí
      // Authorization: `Token ${process.env.CALLTOOLS_API_KEY}`,
    },
  });
  return Buffer.from(response.data);
}

/**
 * Transcribe una grabación de llamada usando Deepgram nova-2 en español.
 * Descarga el audio primero y lo envía como buffer para evitar problemas
 * con URLs de S3 privadas que Deepgram no puede acceder directamente.
 *
 * @param {string} recordingUrl - URL del audio de la llamada
 * @returns {string} Transcripción con speaker labels
 */
async function transcribeCall(recordingUrl) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY no está configurada en las variables de entorno');
  }
  console.log(`[Deepgram] API key encontrada (${apiKey.substring(0, 6)}...${apiKey.slice(-4)})`);
  const deepgram = createClient(apiKey);

  // Intentar primero con URL directa (más rápido)
  // Si falla, descargar y enviar el buffer
  let audioBuffer;
  try {
    console.log('[Deepgram] Intentando acceso directo a URL...');
    const { result, error } = await Promise.race([
      deepgram.listen.prerecorded.transcribeUrl(
        { url: recordingUrl },
        {
          model: 'nova-2',
          language: 'es-419',
          diarize: true,
          punctuate: true,
          smart_format: true,
          utterances: true,
        }
      ),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 20000) // 20s timeout
      ),
    ]);

    if (!error) {
      return buildTranscript(result);
    }
  } catch (err) {
    if (err.message !== 'timeout' && !err.message.includes('403') && !err.message.includes('401')) {
      throw err;
    }
    console.log(`[Deepgram] URL directa falló (${err.message}), descargando audio...`);
  }

  // Fallback: descargar el audio y enviarlo como buffer
  console.log('[Deepgram] Descargando audio desde S3...');
  audioBuffer = await downloadAudio(recordingUrl);
  console.log(`[Deepgram] Audio descargado (${Math.round(audioBuffer.length / 1024)} KB), transcribiendo...`);

  const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
    audioBuffer,
    {
      model: 'nova-2',
      language: 'es-419',
      diarize: true,
      punctuate: true,
      smart_format: true,
      utterances: true,
      mimetype: 'audio/wav',
    }
  );

  if (error) {
    throw new Error(`Deepgram error: ${error.message}`);
  }

  return buildTranscript(result);
}

function buildTranscript(result) {
  const utterances = result.results?.utterances;
  if (utterances && utterances.length > 0) {
    return utterances
      .map(u => `Speaker ${u.speaker}: ${u.transcript}`)
      .join('\n');
  }
  return result.results.channels[0].alternatives[0].transcript;
}

module.exports = { transcribeCall };
