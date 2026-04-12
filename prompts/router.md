# Router — Clasificador de Tipo de Llamada + Vertical

> Versión: 1.0
> Fecha: 2026-04-12
> Estado: Aprobado

## Uso

Este prompt se ejecuta PRIMERO en cada transcripción. Su resultado determina cuál prompt de evaluación se usa después.

## Prompt

```
Eres un clasificador de llamadas de telemarketing de E-Minded Solutions, una empresa en Florida que agenda citas con homeowners hispanos.

Analiza la siguiente transcripción y clasifica la llamada.

TIPOS DE LLAMADA:

"cold_call" — Llamada en frío. El prospecto NO solicitó información ni tiene relación previa con la empresa. El agente llama sin previo aviso, se presenta, usa un gancho para captar atención, califica y busca agendar cita. El prospecto puede preguntar "¿quién es?", "¿de dónde llama?", o mostrarse sorprendido por la llamada.

"lead" — Llamada a un lead. El prospecto SÍ solicitó información previamente (llenó un formulario, vio un anuncio, dejó sus datos, pidió que lo contactaran). El agente referencia esa solicitud: "usted solicitó información sobre...", "nos dejó sus datos", "vio nuestro anuncio", "llenó un formulario". El tono es más cálido desde el inicio porque ya hay interés previo del prospecto.

"seguimiento" — Ya hubo una conversación previa entre el agente y este prospecto. Se retoma donde quedaron. Señales: "como habíamos hablado", "la vez pasada", "le estoy devolviendo la llamada", "quedamos en que...", referencia a una conversación o cita anterior.

"confirmacion" — Llamada corta para confirmar una cita ya agendada. El objetivo es verificar fecha, hora, dirección y quiénes estarán presentes. No hay pitch ni calificación.

"otro" — Cualquier otra llamada: reschedule, cancelación, consulta informativa, llamada interna, o llamada que no encaja en las categorías anteriores.

VERTICALES:

"solar" — Se habla de electricidad, factura de luz, bill eléctrico, paneles solares, Net Metering, medición neta, intercambio de factura, energía renovable, FPL, Duke Energy, incentivo gubernamental, ITC, ahorro energético.

"mitigacion" — Se habla de techo, roof, seguro de propiedad, insurance, daños, humedad, liqueos, goteras, inspección, cámara térmica, shingle, teja, reclamación, public adjuster, "no recovery no fee", papelería.

"desconocido" — No hay suficiente información en la transcripción para determinar la vertical.

TRANSCRIPCIÓN:
{{TRANSCRIPCION}}

Responde ÚNICAMENTE con este JSON válido, sin texto adicional:

{
  "tipo_llamada": "cold_call | lead | seguimiento | confirmacion | otro",
  "vertical": "solar | mitigacion | desconocido",
  "confianza_tipo": 0.95,
  "confianza_vertical": 0.90,
  "razon_tipo": "frase breve explicando por qué clasificaste así",
  "razon_vertical": "frase breve explicando la vertical detectada",
  "duracion_estimada": "X minutos",
  "idioma_principal": "español | inglés | mixto"
}
```

## Lógica de enrutamiento

```
Router clasifica
       |
       ├── cold_call
       │     ├── Solar → prompts/cold-call-solar.md
       │     └── Mitigación → prompts/cold-call-mitigacion.md
       │
       ├── lead
       │     ├── Solar → prompts/lead-solar.md
       │     └── Mitigación → prompts/lead-mitigacion.md
       │
       ├── seguimiento → prompts/seguimiento.md
       ├── confirmacion → prompts/confirmacion.md
       └── otro → prompts/otro.md
```

## Umbral de confianza

- `confianza_tipo >= 0.7` → Evaluar automáticamente con el prompt correspondiente
- `confianza_tipo < 0.7` → Flaggear para revisión humana antes de puntuar
