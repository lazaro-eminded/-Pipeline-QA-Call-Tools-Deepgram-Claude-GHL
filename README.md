# E-Trainer — base de QA de llamadas

Primera fase local y segura de la plataforma: recibe llamadas desde Call Tools,
filtra llamadas cortas, encola trabajos persistentes, genera una evaluación única
y expone resultados para un futuro dashboard LeadMinded. No activa proveedores,
Tella ni roleplay por voz por defecto.

## Arranque local

```bash
npm install
cp .env.example .env
npm start
```

Sin claves, use modo local enviando una transcripción de prueba:

```bash
curl -X POST http://localhost:3000/webhook/calltools \
  -H 'Content-Type: application/json' \
  -d '{"callId":"demo-1","user":"Ana","duration":61,"transcript":"Agente: Hola. Prospecto: Me parece caro."}'
```

Consulte `GET /api/calls?agent=Ana`, `GET /api/calls/:id`, `GET /api/objections`
y `GET /api/catalog`. Los resultados se guardan localmente en `data/etrainer.json`.

## Proveedores y seguridad

`TRANSCRIPTION_PROVIDER=local` y `ANALYSIS_PROVIDER=local` son los valores por
defecto. Para producción configure explícitamente Deepgram y Anthropic en un
gestor de secretos, use una cuenta de prueba con límite de gasto y mantenga
`GHL_WRITE_ENABLED=false` hasta validar los resultados. El webhook conserva las
rutas anteriores (`/webhook/calltools`, `/webhook/solar`, `/webhook/mitigacion`)
y devuelve 202 inmediatamente; el worker procesa en segundo plano.

La base de datos JSON es adecuada para desarrollo y piloto de una instancia.
Antes de desplegar con varios procesos debe migrarse a PostgreSQL/cola gestionada,
añadir firma del webhook y autenticar/RBAC las APIs de lectura. `courses` y
`roleplayScenarios` son modelos reservados para futuras integraciones; no hay
integración Tella ni práctica por voz implementada todavía.

## Pruebas

```bash
npm test
```
