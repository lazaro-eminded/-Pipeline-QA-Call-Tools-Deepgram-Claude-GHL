# E-Minded QA Pipeline

Pipeline de automatizacion que detecta cuando un agente agenda una cita en **Call Tools** (webhook), extrae la grabacion via API, la transcribe con **Deepgram** (espanol), la analiza con **Claude API** para QA, y guarda el resultado como nota en el contacto de **GHL**.

## Stack

```
Call Tools (fuente) -> Node.js (servidor) -> Deepgram (transcripcion) -> Claude API (QA) -> GHL (nota en contacto)
```

## Flujo

1. **Webhook**: Call Tools envia un POST cuando un agente marca "Appointment Set"
2. **Delay 60s**: Se espera a que la grabacion este disponible en el call log
3. **Call Tools API**: GET al call log para obtener `recording_url`
4. **Deepgram**: Transcripcion en espanol latinoamericano (`es-419`) con diarizacion (identifica agente vs prospecto)
5. **Claude API**: Analisis QA completo basado en el sistema de entrenamiento E-Minded (Solar, Mitigacion, Agua)
6. **GHL API**: Busca el contacto por telefono y guarda la nota con el reporte QA

## Verticales soportados

- **Solar** (Net Metering / Intercambio de Factura)
- **Mitigacion** (Techo / Seguro de Propiedad)
- **Agua** (Purificacion de Agua)

## Criterios de evaluacion

El sistema evalua cada llamada en 8 etapas + habilidades blandas (total 100 pts):

| Etapa | Puntos max |
|-------|-----------|
| Intro | 10 |
| Hook / Informacion | 10 |
| Calificacion | 15 |
| Agitacion del dolor | 10 |
| Presentacion | 15 |
| Cierre | 15 |
| Verificacion de asistencia | 10 |
| Confirmacion de cita | 10 |
| Habilidades blandas | 30 |

### Escala de nivel

- **90-100**: Excelente - Compartir como ejemplo con el equipo
- **75-89**: Bueno - Feedback puntual en 1-2 areas
- **60-74**: Regular - Sesion de coaching esta semana
- **< 60**: Critico - Revision inmediata con Julieth

## Instalacion

```bash
git clone <repo-url>
cd eminded-qa-pipeline
npm install
cp .env.example .env
# Edita .env con tus API keys
```

## Variables de entorno

| Variable | Descripcion | Donde obtenerla |
|----------|-------------|-----------------|
| `CALLTOOLS_API_KEY` | API key de Call Tools | Login -> Integrations -> API Keys |
| `CALLTOOLS_SILO` | Subdominio de tu cuenta (ej: `eminded`) | URL de tu cuenta Call Tools |
| `DEEPGRAM_API_KEY` | API key de Deepgram | deepgram.com -> Console -> API Keys |
| `ANTHROPIC_API_KEY` | API key de Anthropic | console.anthropic.com -> API Keys |
| `GHL_TOKEN` | Private Integration Token de GHL | Settings -> Integrations -> Private Integration Token |
| `GHL_USER_ID` | ID del usuario que firma las notas | Panel de GHL |
| `PORT` | Puerto del servidor (default: 3000) | Opcional |

## Ejecucion

```bash
# Produccion
npm start

# Desarrollo (auto-reload)
npm run dev
```

## Endpoints

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| POST | `/webhook/calltools` | Receptor del webhook de Call Tools |
| GET | `/health` | Health check del servidor |

## Configurar webhook en Call Tools

1. Ve a **Integrations -> Webhooks -> Nuevo webhook**
2. Evento: `New Call Disposition`
3. Condicion: disposition name = `Appointment Set`
4. URL: `https://tu-servidor.com/webhook/calltools`
5. Method: `POST`

> Tip: Prueba primero con webhook.site para ver el payload exacto.

## Costos estimados

| Servicio | Costo por llamada (8 min) |
|----------|--------------------------|
| Deepgram nova-2 | $0.034 |
| Claude Sonnet | $0.010 |
| **Total** | **$0.044** |
| 50 citas/mes | ~$2.20/mes |

## Errores comunes

1. **Webhook duplicado**: Siempre responder 200 inmediatamente antes de procesar. Call Tools reintenta si no recibe respuesta rapida.
2. **Grabacion no disponible**: El audio puede tardar mas de 60s. El pipeline tiene retry con backoff (60s, 120s, 180s).
3. **Contacto no encontrado en GHL**: El telefono puede tener formato diferente (+1 vs sin codigo). Se normaliza automaticamente.
4. **recording_url requiere auth**: Si la URL devuelve 403, verificar que el token de Call Tools se esta enviando.

## Subtareas del proyecto

1. Verificar campo `recording_url` en el call log de Call Tools
2. Configurar Webhook en Call Tools (evento: Appointment Set)
3. Crear servidor Node.js + endpoint receptor del webhook
4. Integrar Deepgram para transcripcion en espanol
5. Integrar Claude API para analisis QA de la llamada
6. Integrar GHL API para guardar nota QA en el contacto
7. Testing end-to-end con llamadas reales
