const { normalizePhone, formatQANote, findContactByPhone, saveNoteInGHL } = require('../src/ghl');
const axios = require('axios');

jest.mock('axios');

// ─── normalizePhone ─────────────────────────────────────────────────────────

describe('normalizePhone', () => {
  test('returns null for null input', () => {
    expect(normalizePhone(null)).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(normalizePhone(undefined)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(normalizePhone('')).toBeNull();
  });

  test('adds +1 prefix to 10-digit US number', () => {
    expect(normalizePhone('5551234567')).toBe('+15551234567');
  });

  test('adds + prefix to 11-digit number', () => {
    expect(normalizePhone('15551234567')).toBe('+15551234567');
  });

  test('preserves number already starting with +', () => {
    expect(normalizePhone('+15551234567')).toBe('+15551234567');
  });

  test('strips parentheses, dashes, and spaces', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('+15551234567');
  });

  test('strips dots from formatted numbers', () => {
    expect(normalizePhone('555.123.4567')).toBe('+15551234567');
  });

  test('handles number with country code and formatting', () => {
    expect(normalizePhone('+1 (555) 123-4567')).toBe('+15551234567');
  });

  test('handles short numbers by adding + prefix', () => {
    expect(normalizePhone('12345')).toBe('+12345');
  });
});

// ─── formatQANote ───────────────────────────────────────────────────────────

describe('formatQANote', () => {
  const fullQA = {
    tipo_llamada: 'lead',
    vertical: 'solar',
    nivel: 'Excelente',
    puntaje_total: 92,
    agente: 'María López',
    duracion_estimada: '8 minutos',
    resumen_ejecutivo: 'Excelente llamada de venta con cierre de cita.',
    recomendacion_accion: 'Felicitar al agente',
    cita_agendada: true,
    errores_criticos: [
      { error: 'Reveló precio', detectado: false, penalizacion: -10 },
      { error: 'No verificó propiedad', detectado: true, penalizacion: -5 },
    ],
    puntos_fuertes: ['Buen manejo de objeciones', 'Tono profesional'],
    areas_mejora: ['Mejorar cierre', 'Verificar datos'],
    objeciones_bien_manejadas: ['Precio alto', 'No tengo tiempo'],
    objeciones_mal_manejadas: ['Ya tengo proveedor'],
    desglose_etapas: {
      intro: { puntaje: 9, max: 10, observacion: 'Buena presentación' },
      cierre: { puntaje: 12, max: 15, observacion: 'Faltó urgencia' },
    },
  };

  test('includes correct emoji for Excelente nivel', () => {
    const note = formatQANote(fullQA);
    expect(note).toContain('🟢');
  });

  test('includes correct emoji for Bueno nivel', () => {
    const note = formatQANote({ ...fullQA, nivel: 'Bueno' });
    expect(note).toContain('🔵');
  });

  test('includes correct emoji for Regular nivel', () => {
    const note = formatQANote({ ...fullQA, nivel: 'Regular' });
    expect(note).toContain('🟡');
  });

  test('includes correct emoji for Crítico nivel', () => {
    const note = formatQANote({ ...fullQA, nivel: 'Crítico' });
    expect(note).toContain('🔴');
  });

  test('uses default emoji for unknown nivel', () => {
    const note = formatQANote({ ...fullQA, nivel: 'Desconocido' });
    expect(note).toContain('⚪');
  });

  test('includes score and nivel', () => {
    const note = formatQANote(fullQA);
    expect(note).toContain('92/100');
    expect(note).toContain('EXCELENTE');
  });

  test('includes agent name', () => {
    const note = formatQANote(fullQA);
    expect(note).toContain('María López');
  });

  test('includes resumen ejecutivo', () => {
    const note = formatQANote(fullQA);
    expect(note).toContain('Excelente llamada de venta con cierre de cita.');
  });

  test('only shows detected errores criticos', () => {
    const note = formatQANote(fullQA);
    expect(note).toContain('No verificó propiedad');
    expect(note).not.toContain('Reveló precio');
  });

  test('shows "Ninguno detectado" when no errors are detected', () => {
    const qa = {
      ...fullQA,
      errores_criticos: [{ error: 'Test', detectado: false, penalizacion: -5 }],
    };
    const note = formatQANote(qa);
    expect(note).toContain('Ninguno detectado');
  });

  test('includes puntos fuertes', () => {
    const note = formatQANote(fullQA);
    expect(note).toContain('Buen manejo de objeciones');
    expect(note).toContain('Tono profesional');
  });

  test('includes areas de mejora', () => {
    const note = formatQANote(fullQA);
    expect(note).toContain('Mejorar cierre');
    expect(note).toContain('Verificar datos');
  });

  test('includes objeciones bien/mal manejadas', () => {
    const note = formatQANote(fullQA);
    expect(note).toContain('Precio alto');
    expect(note).toContain('Ya tengo proveedor');
  });

  test('shows cita agendada as SÍ when true', () => {
    const note = formatQANote(fullQA);
    expect(note).toContain('SÍ ✅');
  });

  test('shows cita agendada as NO when false', () => {
    const note = formatQANote({ ...fullQA, cita_agendada: false });
    expect(note).toContain('NO ❌');
  });

  test('includes desglose etapas with puntaje/max', () => {
    const note = formatQANote(fullQA);
    expect(note).toContain('intro: 9/10');
    expect(note).toContain('cierre: 12/15');
  });

  test('handles desglose_fases key (alternative format)', () => {
    const qa = {
      ...fullQA,
      desglose_etapas: undefined,
      desglose_fases: {
        fase1: { puntaje: 8, max: 10, observacion: 'Bien' },
      },
    };
    const note = formatQANote(qa);
    expect(note).toContain('fase1: 8/10');
  });

  test('handles desglose_pasos key (alternative format)', () => {
    const qa = {
      ...fullQA,
      desglose_etapas: undefined,
      desglose_pasos: {
        paso1: { puntaje: 7, max: 10, observacion: 'Ok' },
      },
    };
    const note = formatQANote(qa);
    expect(note).toContain('paso1: 7/10');
  });

  test('handles missing errores_criticos gracefully', () => {
    const qa = { ...fullQA, errores_criticos: undefined };
    const note = formatQANote(qa);
    expect(note).toContain('Ninguno detectado');
  });

  test('handles missing puntos_fuertes and areas_mejora', () => {
    const qa = { ...fullQA, puntos_fuertes: undefined, areas_mejora: undefined };
    expect(() => formatQANote(qa)).not.toThrow();
  });

  test('uses errores_criticos_detectados as alternative key', () => {
    const qa = {
      ...fullQA,
      errores_criticos: undefined,
      errores_criticos_detectados: [
        { error: 'Error alternativo', detectado: true, penalizacion: -3 },
      ],
    };
    const note = formatQANote(qa);
    expect(note).toContain('Error alternativo');
  });

  test('uses objeciones_manejadas_bien as alternative key', () => {
    const qa = {
      ...fullQA,
      objeciones_bien_manejadas: undefined,
      objeciones_manejadas_bien: ['Alt objeción bien'],
    };
    const note = formatQANote(qa);
    expect(note).toContain('Alt objeción bien');
  });
});

// ─── findContactByPhone (mocked) ───────────────────────────────────────────

describe('findContactByPhone', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('returns contact ID when found on first attempt', async () => {
    axios.get.mockResolvedValueOnce({
      data: { contact: { id: 'contact-123' } },
    });

    const result = await findContactByPhone('5551234567', 'token', 'loc-1');
    expect(result).toBe('contact-123');
  });

  test('tries without +1 prefix on second attempt', async () => {
    axios.get
      .mockResolvedValueOnce({ data: {} }) // first attempt: no match
      .mockResolvedValueOnce({
        data: { contact: { id: 'contact-456' } },
      });

    const result = await findContactByPhone('+15551234567', 'token', 'loc-1');
    expect(result).toBe('contact-456');
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  test('returns null when contact not found', async () => {
    axios.get.mockResolvedValue({ data: {} });

    const result = await findContactByPhone('5551234567', 'token', 'loc-1');
    expect(result).toBeNull();
  });

  test('returns null and logs error on non-404 API error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    axios.get.mockRejectedValue({
      response: { status: 500 },
      message: 'Server error',
    });

    const result = await findContactByPhone('5551234567', 'token', 'loc-1');
    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test('silently handles 404 errors', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    axios.get.mockRejectedValue({
      response: { status: 404 },
      message: 'Not found',
    });

    const result = await findContactByPhone('5551234567', 'token', 'loc-1');
    expect(result).toBeNull();
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ─── saveNoteInGHL (mocked) ─────────────────────────────────────────────────

describe('saveNoteInGHL', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  const qa = {
    tipo_llamada: 'lead',
    vertical: 'solar',
    nivel: 'Bueno',
    puntaje_total: 75,
    agente: 'Test Agent',
    duracion_estimada: '5 min',
    resumen_ejecutivo: 'Test',
    recomendacion_accion: 'Test',
    cita_agendada: false,
  };

  test('returns early without phone number', async () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    await saveNoteInGHL(null, qa, 'token', 'user-1', 'loc-1');
    expect(axios.get).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test('returns early without token', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    await saveNoteInGHL('5551234567', qa, null, 'user-1', 'loc-1');
    expect(axios.get).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test('does not post note if contact not found', async () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    axios.get.mockResolvedValue({ data: {} });

    await saveNoteInGHL('5551234567', qa, 'token', 'user-1', 'loc-1');
    expect(axios.post).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test('posts formatted note to correct endpoint when contact found', async () => {
    axios.get.mockResolvedValueOnce({
      data: { contact: { id: 'contact-789' } },
    });
    axios.post.mockResolvedValueOnce({ data: { success: true } });

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    await saveNoteInGHL('5551234567', qa, 'token', 'user-1', 'loc-1');

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/contacts/contact-789/notes'),
      expect.objectContaining({ body: expect.any(String), userId: 'user-1' }),
      expect.any(Object)
    );
    consoleSpy.mockRestore();
  });

  test('omits userId from payload when not provided', async () => {
    axios.get.mockResolvedValueOnce({
      data: { contact: { id: 'contact-789' } },
    });
    axios.post.mockResolvedValueOnce({ data: { success: true } });

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    await saveNoteInGHL('5551234567', qa, 'token', null, 'loc-1');

    const postCall = axios.post.mock.calls[0];
    expect(postCall[1]).not.toHaveProperty('userId');
    consoleSpy.mockRestore();
  });
});
