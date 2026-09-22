# Kit visual aislado para E-Trainer

## Qué contiene

- `leadminded-theme.tokens.json`: contrato de tokens semánticos.
- `leadminded-theme.css`: variables que el frontend deberá proveer desde el kit oficial.
- `e-trainer-dashboard-wireframe.html`: maqueta estructural navegable, sin conexión a APIs ni datos de producción.

La maqueta cubre la navegación requerida: Inicio, Llamadas, Coaching, Objeciones, Academia y Equipo. Las piezas de producto previstas son lista/detalle de llamadas, coaching, curso de Tella y práctica IA.

## Integración para el executor funcional

1. Para el servidor Express actual, servir `public/` con `express.static`; no importarlo en `server.js` ni en los módulos de transcripción, análisis o GHL. El panel vanilla de `public/index.html` ya consume los endpoints acordados.
2. Sustituir `--lm-*-approved` por los valores entregados por la marca durante el bootstrap global de estilos.
3. Transformar cada bloque de la maqueta en rutas/pantallas del frontend y enlazar los datos mediante una capa adaptadora propia. La UI no debe llamar directamente a `src/transcribe.js`, `src/analyze.js`, `src/ghl.js` ni manejar credenciales.
4. Conectar las acciones de detalle, curso y práctica IA únicamente a endpoints/autorizaciones definidos por el executor funcional.

## Activos necesarios para fidelidad LeadMinded

No se encontró un skill ni un activo oficial en el workspace o repositorio de referencia. Para producir una versión fiel faltan: logotipo (SVG y variantes), paleta aprobada con contraste, familias tipográficas/licencias, iconografía, reglas de uso y, si existe, fotografía/ilustración y tono de UI.

Hasta recibirlos, esta entrega es deliberadamente una arquitectura visual neutra y tokenizable; no representa ni infiere la identidad de LeadMinded.
