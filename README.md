# HT — Personal Progress

MVP personal de progreso gamificado, usable sin integraciones. Skills independientes,
XP basada en un ledger, quests y una memoria de hitos. Sin Life Level ni XP decay.

## Ejecutar

Node.js 24. No hay dependencias de ejecución que instalar.

```sh
npm run dev
# http://localhost:3000
npm test
npm run check
```

## Implementado

- Dashboard, gráfico de actividad (4 semanas / 3 meses / año), métricas semanales.
- 10 skills iniciales; creación hasta 15, edición y detalle con evolución y ledger.
- Quick Capture: actividad manual, skill, XP, fecha, nota y evidencia opcional.
- Curva XP v1 y niveles 1–100; nivel derivado del ledger, nunca un campo editable.
- Inbox con editar / confirmar / rechazar; selección múltiple y deduplicación.
- Quests numéricas, progreso manual o por actividad vinculada y recompensa única.
- Achievements automáticos y notificaciones; racha actual y mejor racha.
- Timeline de actividades, level-ups, quests, logros y milestones; filtros.
- Historial filtrado por skill, origen, estado, fechas y texto.
- Weekly Review, comparación, separación de XP de quests/baseline y reflexiones.
- Perfil tipo ficha de personaje y navegación de escritorio/móvil.
- Onboarding con baseline opcional, fecha de corte y ledger initial_baseline.
- Milestones históricos con fecha exacta / mes / año / desconocida, logros históricos.
- Importación pública de GitHub (commits, PRs, repos) mediante función Vercel.
- Importación local de calendarios .ics con TZID, eventos cancelados/futuros omitidos.
- Backup JSON validado, exportación y restauración con copia previa.
- Demo independiente del perfil real.

## Persistencia y alcance de esta entrega

La versión actual es local-first: el perfil y todas las entidades viven en un único
snapshot versionado de localStorage. Las mutaciones clonan el estado, validan el
resultado y hacen un único commit del snapshot. Web Locks serializa las escrituras
entre pestañas cuando está disponible. Los totales se derivan del ledger y todas
las concesiones tienen claves de negocio únicas.

No hay autenticación de usuario, PostgreSQL ni sincronización entre dispositivos.
Exporta un backup para conservar o mover los datos. No registra información privada
en el servidor; sólo consulta actividad pública de GitHub cuando lo solicitas.

Esto prioriza un primer MVP ejecutable con P0/P1. La propuesta React/Express/PostgreSQL
se mantiene en docs como diseño para una siguiente versión con cuenta y nube. El
módulo de dominio y los tipos de entidad pueden reutilizarse en ese backend.

Integraciones P2 parciales: no hay OAuth, repositorios privados ni sincronización
continua. GitHub limita las consultas a 12 repositorios propios recientes, rama
principal, hasta 100 commits por repo y 100 PRs; muestra límites y omisiones. Los
límites públicos de GitHub pueden impedir importar temporalmente. El importador
Calendar no expande RRULE/RDATE/EXDATE; informa de las series omitidas y acepta
instancias explícitas. Nada externo concede XP antes de confirmar en Inbox.

## Progreso histórico

La XP anterior se establece mediante un baseline por skill. La fecha de corte evita
que las evidencias importadas del mismo periodo vuelvan a conceder XP. Un milestone
no concede XP. Las fechas aproximadas se conservan como tales; nunca se inventa un
día para una racha. El resumen semanal separa reconstrucción histórica de práctica
actual y excluye el baseline del indicador de XP ganada.

## Verificación

19 pruebas Node verifican curva y umbrales, confirmación única, eventos externos,
ledger, baselines, recompensas, rachas, zona horaria y DST, milestones, calendarios,
backups y normalización de GitHub. `tests/ui-smoke.cjs` recorre onboarding, actividad,
quest, milestone, reflexión persistida, Inbox, .ics y demo en escritorio y móvil.

Para repetir el smoke test, inicia `npm run dev`, instala Playwright de forma opcional
(`npm install --no-save playwright` y `npx playwright install chromium`) y ejecuta
`node tests/ui-smoke.cjs`. `HT_BROWSER_PATH` permite indicar un Chromium instalado.
La prueba de GitHub en este recorrido usa fixtures; el servidor usa la API pública real.

## Publicación en Vercel

Importar este repositorio como framework **Other**, raíz del repositorio y output `.`.
`vercel.json` incluye la función GitHub y cabeceras de seguridad. No hacen falta
variables de entorno. Node.js 24. La app navega mediante hash; no necesita rewrites.

La primera publicación se creó como proyecto temporal reclamable al no funcionar la
herramienta deploy_to_vercel del conector. Ese despliegue debe reclamarse antes de
caducar para conservarlo. No contiene todavía una conexión Git→Vercel automática.

## Diseño previo

- [Primer approach y arquitectura futura](docs/first-approach.md)
- [Borrador SQL para backend futuro](docs/schema.sql)
- [Mockups originales](docs/mockups.svg)

### Captura rápida

El dashboard permite escribir directamente lo realizado o tocar una habilidad. Las sugerencias rellenan la actividad y su XP; la fecha por defecto es el momento de guardar. Fecha personalizada, nota, evidencia y quest son opciones desplegables. Un acceso separado conserva hitos sin otorgar XP, y permite reutilizar el texto de la captura. Las tarjetas de skill tienen un acceso explícito a su detalle.

### Registro en un toque

La entrada abre directamente el dashboard. Fitness aparece primero con **+1 entreno (+40 XP)**; un toque crea la actividad confirmada y su transacción, actualiza el progreso y el contador de hoy sin formulario. Las otras habilidades tienen una acción rápida equivalente. Personalizar el perfil y registrar actividades especiales son acciones opcionales. El botón bloquea clics repetidos durante el guardado y 900 ms posteriores.
