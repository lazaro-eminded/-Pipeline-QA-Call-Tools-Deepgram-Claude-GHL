# Filtro de origen: Call Tools → E-Trainer

El filtro de coste primario vive en **Call Tools**, antes de que E-Trainer reciba
un webhook. E-Trainer conserva su comprobación de duración como defensa secundaria,
pero no sustituye esta automatización de origen.

## Configuración requerida en Call Tools (cuenta administradora)

1. En Call Tools, vaya a **Data / Integrations → Automations** y cree una
   automatización inicialmente inactiva. La documentación oficial indica que las
   automations se configuran en la interfaz y que pueden dispararse con el objeto
   `Call` y enviar una solicitud HTTP del lado del servidor.
2. Seleccione el disparador **Call** (evento de creación/post-llamada). No use un
   connector de agente ni un evento al inicio de la llamada: la grabación y la
   duración solo son definitivas tras colgar.
3. Cree un conjunto de condiciones con **todas** estas condiciones:
   - el campo de grabación de Call existe (en la guía oficial aparece como
     `Call Recording FsFile ID Integer`);
   - el campo de duración de la llamada, mostrado por el selector DSL de esa
     cuenta, es **mayor que 60 segundos**;
   - opcionalmente, limite campaña/equipo/disposición a los que pertenecen a
     E-Trainer.
4. Agregue acción **Web Hook**, método `POST`, a
   `https://<host-de-etrainer>/webhook/calltools`. Inserte mediante el selector
   DSL (no texto copiado) el identificador único de llamada, duración, agente,
   teléfono y URL/archivo de grabación. El cuerpo debe mapear a este contrato:

   ```json
   {
     "callId": "<Call ID>",
     "duration": "<Call duration in seconds>",
     "user": "<Call user>",
     "phone": "<Call phone>",
     "recordingUrl": "<Call recording URL>"
   }
   ```

   Los nombres exactos que Call Tools muestra pueden variar; lo verificable es
   que `duration` llegue como número de segundos y que `callId` sea estable para
   deduplicación. No active la automatización si el selector no ofrece un campo
   de duración numérico utilizable en una condición `> 60`.
5. Guarde, active y ejecute tres llamadas de prueba: 59 s, 60 s y 61 s. En
   **Reports → Logs → Automation Execution Logs** y **HTTP Request Logs**, deben
   existir exactamente cero solicitudes para 59/60 y una para 61. Verifique que
   el body de 61 contenga duración y `callId`.

## Bloqueo y alternativa segura

La documentación pública de Call Tools confirma el disparador `Call`, las
condiciones de automatización y la acción Web Hook, pero no publica el nombre
exacto del campo de duración dentro del selector de condiciones. Si ese selector
no permite comparar duración, **no active un webhook para todas las llamadas**:
abrir un caso con soporte/integraciones de Call Tools para confirmar el campo y
operador de duración de la cuenta, o implementar una automatización intermedia
que filtre antes de reenviar a E-Trainer. Esto requiere acceso/configuración de
la cuenta Call Tools; no se ha realizado en este repositorio.

## Defensa secundaria de E-Trainer

`MIN_CALL_DURATION_SECONDS=60` y `ALLOW_UNKNOWN_DURATION=false` son los valores
predeterminados. Por tanto, incluso tras un error de la automatización, E-Trainer
rechaza duración ausente, 59 s y 60 s. Solo una llamada con duración conocida
mayor que 60 se encola.

## Evidencia

- [Call Tools: Automations](https://calltools.com/developers/automations/)
  describe disparadores por objeto, condiciones y acciones HTTP del servidor.
- [Guía oficial para enviar grabaciones por webhook](https://calltools.zendesk.com/hc/en-us/articles/30065605670292-Send-Call-Recordings-Files-Via-Web-Hook)
  documenta Trigger `Call`, condición de grabación, Web Hook, activación y logs.
