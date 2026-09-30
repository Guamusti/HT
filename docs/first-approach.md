# HT — Primer approach del MVP

Estado: propuesta de diseño, sin aplicación implementada. Repositorio Guamusti/HT vacío al revisarlo el 30/09/2026. Este documento cubre RF-01–RF-39 y propone decisiones concretas para empezar por P0.

## 1. Arquitectura

Un monolito modular: React + TypeScript para la interfaz, Node.js + Express + TypeScript para una API REST y PostgreSQL para persistencia. Se propone este stack por su encaje con el entorno habitual de Zyra; no es una dependencia del producto. Un único repositorio, un backend y una base de datos. Sin microservicios, event bus, Redis ni framework de agentes.

La interfaz llama a la API; sólo el servidor concede XP y decide transiciones de estado. PostgreSQL garantiza atomicidad e idempotencia. El ledger es la fuente de verdad: XP total y nivel son derivados, no campos editables. Las métricas se calculan por consulta inicialmente; sólo introducir cachés cuando lo justifique el uso.

Auth: sesión con cookie HttpOnly, Secure en producción, SameSite y protección CSRF para mutaciones. Usar un proveedor de autenticación existente al publicar; no construir recuperación de contraseñas desde cero. En desarrollo puede existir un usuario local mediante configuración explícita, jamás como fallback en producción. Todas las consultas se restringen al usuario autenticado. Integrar GitHub para importar actividad es independiente de usar GitHub para iniciar sesión.

Timezone por usuario, inicialmente Europe/Madrid. Instantes en UTC; días, semanas y rachas se calculan en su zona. Semanas de lunes a domingo. La API valida entradas y devuelve errores estructurados. El cliente no envía user_id como autorización.

## 2. Modelo de datos

El archivo `schema.sql` es un borrador estructural, no una migración lista para producción. Antes de usarlo deben completarse las invariantes transaccionales descritas aquí.

| Entidad | Campos principales | Responsabilidad |
| --- | --- | --- |
| User | id, auth_subject, name, avatar_url, timezone, created_at | Propietario y ficha de personaje; sin Life Level |
| Skill | id, user_id, name, icon, description, curve_version, created_at, archived_at | Habilidad; total XP y nivel derivados |
| Event | id, user_id, skill_id, title, description, occurred_at, source, status, proposed_xp, evidence_url, is_historical, xp_mode | Actividad manual o sugerida |
| XPTransaction | id, user_id, skill_id, amount, type, reason, event_id/quest_id, idempotency_key, effective_at, created_at, curve_version | Ledger append-only |
| Quest | id, user_id, skill_id, name, description, started_at, deadline, target, unit, progress, reward_xp, status | Objetivo numérico explícito |
| QuestContribution | quest_id, event_id, delta | Relación explícita entre actividad y objetivo; evita contar dos veces |
| Achievement | id, code, name, description, icon, condition_type, condition_config | Catálogo y condiciones tipadas; sin ejecutar código arbitrario |
| UnlockedAchievement | user_id, achievement_id, unlocked_at, date_precision, milestone_id, created_at | Concesión única; fecha histórica distinta de la fecha de registro |
| Milestone | id, user_id, title, description, type, date_precision, year/month/day, evidence_url, created_at | Hito histórico sin inventar días |
| MilestoneSkill | milestone_id, skill_id | Un milestone puede relacionarse con varias skills |
| WeeklyReview | user_id, week_start, summary_snapshot, reflection fields, generated_at | Resumen y reflexión histórica |
| Integration | id, user_id, provider, external_account_id, status, cursor, last_sync_at | Estado de sincronización; secretos fuera de respuestas API |
| ExternalActivity | integration_id, external_key, kind, occurred_at, payload, event_id | Evidencia individual y deduplicación aun con importaciones agrupadas |
| HistoricalBaseline | user_id, skill_id, cutoff_at, level, transaction_id | Cobertura histórica de la XP inicial |

No almacenar entidades independientes para cada fila del timeline en P0: componerlo desde actividades confirmadas, ledger, quests, unlocks y milestones. Un level-up se reconstruye con la secuencia del ledger y la curva versionada. Orden: effective_at y created_at/id como desempate. Una importación retroactiva puede cambiar la fecha de un level-up; no debe generar notificaciones de subida repetidas por recalcular el pasado.

## 3. Estructura de carpetas

```text
HT/
  apps/
    web/src/
      app/                 # router, shell, proveedores
      components/          # UI común
      features/
        dashboard/ skills/ events/ inbox/ quests/
        timeline/ achievements/ reviews/ profile/ onboarding/ settings/
      lib/                 # cliente API, fechas
    api/src/
      app.ts
      middleware/          # sesión, CSRF, validación, errores
      modules/
        skills/ events/ progression/ quests/ achievements/
        timeline/ reviews/ backfill/ integrations/
      db/                  # consultas y migraciones
      jobs/                # sincronización; inicialmente comando programado
  packages/domain/         # tipos, curva XP y lógica pura compartida
  tests/                   # invariantes y recorridos críticos
  docs/
    first-approach.md
    schema.sql
    mockups.svg
```

Cada módulo empieza pequeño: rutas, servicio y consultas. No crear interfaces genéricas o repositorios abstractos para cada tabla. El dominio compartido no importa Express, React ni PostgreSQL.

## 4. Componentes UI

CharacterShell, Sidebar/MobileNav, SkillCard, XPProgressBar, QuickCaptureDialog, ActivityHeatmap, ActivityList, QuestCard, InboxEventCard, TimelineEntry, AchievementToast, WeeklySummary, HistoricalDateInput y BaselineWizard.

Estética: ficha RPG sobria, fondo oscuro, detalles violeta/dorado, iconos de habilidades y barras de progreso. Avatar y nombre como centro del perfil; sin nivel global, radar que puntúe toda la vida ni clasificación. El color no es el único indicador. Teclado, etiquetas, foco visible, gráficos con lista textual equivalente y respeto de reduced-motion. Navegación móvil y escritorio.

Quick Capture preselecciona fecha actual y recuerda la última skill; acepta título, skill y XP sin exigir nota. XP sugerida mediante presets editables, nunca una afirmación sobre el valor real del esfuerzo. Fechas futuras no se aceptan para actividades realizadas; pueden usarse en deadlines de quests.

El heatmap usa cantidad de actividades confirmadas por defecto y ofrece modo XP de actividades. Baselines y recompensas de quests no crean días de actividad. Rango 4 semanas, 3 meses o año; tooltip con fecha, cantidad y XP. No fingir 365 días de datos iniciales.

## 5. Rutas

| Ruta | Vista |
| --- | --- |
| /onboarding | Perfil, 10–15 skills sugeridas, baseline opcional y primeros milestones |
| / | Dashboard: skills principales, XP semanal de actividad, racha, graph, quests y recientes |
| /skills | Crear/editar/archivar skills y ver progreso |
| /skills/:id | Nivel, total, siguiente umbral, evolución, actividades, quests y logros |
| /activities | RF-31: búsqueda e historial con skill/origen/fecha/estado |
| /inbox | Detectadas pendientes, confirmar/editar/rechazar; revisión histórica agrupada |
| /quests | Activas, completadas, abandonadas; crear y actualizar progreso |
| /timeline | Progreso cronológico y milestones; filtros skill/tipo/fecha |
| /achievements | Desbloqueados y condiciones de los próximos |
| /weekly-review | Semana seleccionada, comparación y reflexión |
| /profile | Character sheet, avatar, skills, logros, rachas y fecha de inicio |
| /settings | Zona horaria e integraciones |
| /settings/history | Baselines, milestones e importaciones históricas |

Mockups estáticos de Dashboard, Skill, Inbox, Onboarding y Timeline: `mockups.svg`. Los datos del mockup son ficticios y no calculan una puntuación global.

## 6. API REST

Prefijo `/api`; listas paginadas por cursor y filtros documentados. POST sensibles usan `Idempotency-Key`; errores 400/401/403/404/409/422 según corresponda. Fechas ISO y XP enteros no negativos, con límite configurable para evitar valores accidentales enormes.

| Método y endpoint | Acción |
| --- | --- |
| GET /me; PATCH /me | Perfil, timezone, avatar |
| GET /dashboard?from&to | Resumen principal |
| GET /activity-graph?from&to&metric | Días agregados en timezone local |
| GET/POST /skills | Listar y crear |
| GET/PATCH /skills/:id | Detalle y edición; archivado sin borrar ledger |
| GET /skills/:id/progression | Serie XP y niveles |
| GET/POST /events | Historial filtrado; manual confirmado o automático pendiente |
| PATCH /events/:id | Sólo pending; editar título/skill/XP/fecha |
| POST /events/:id/confirm | Conceder XP una única vez |
| POST /events/:id/reject | pending → rejected, sin XP |
| GET /inbox | Pendientes e importaciones históricas |
| GET /skills/:id/xp-ledger | Transacciones auditables |
| GET/POST /quests | Listar/crear |
| PATCH /quests/:id | Metadatos de quest activa |
| POST /quests/:id/progress | Establecer progreso manual con clave idempotente |
| POST /quests/:id/contributions | Vincular evento confirmado y delta |
| POST /quests/:id/abandon | Abandonar sin recompensa |
| GET /achievements | Catálogo y desbloqueados |
| GET /timeline?skill&type&from&to | Timeline paginado |
| GET /weekly-reviews/:week | Generar/recalcular resumen y conservar reflexión |
| PUT /weekly-reviews/:week/reflection | Tres respuestas manuales |
| POST /backfill/baselines | Batch de nivel inicial y fecha de corte por skill |
| GET/POST /milestones; PATCH /milestones/:id | Hitos y precisión de fecha |
| POST /milestones/:id/achievements | Asociar achievement histórico compatible |
| GET /integrations | Estado sin tokens |
| GET /integrations/:provider/authorize | Iniciar OAuth con state y permisos mínimos |
| GET /integrations/:provider/callback | Validar state y almacenar credenciales cifradas |
| POST /integrations/:id/sync | Importar con desde/hasta; no concede XP |
| DELETE /integrations/:id | Revocar y borrar credenciales, conservar evidencia del ledger |
| GET /historical-imports/:id | Grupos y miembros para revisión |
| POST /historical-imports/:id/confirm | Confirmar subconjunto o grupo, transacción atómica |
| POST /historical-imports/:id/ignore | Descartar pendientes seleccionados |

No hay endpoint público de «establecer XP total» ni de «establecer nivel». Confirmados son inmutables en el MVP; correcciones posteriores requieren transacciones compensatorias auditadas y una política explícita, sin confundirse con penalizaciones por descansar.

## 7. XP y niveles

Propuesta inicial, ajustable tras uso real:

`threshold(level) = 50 × (level − 1)²`, niveles 1–100.

`level(xp) = min(100, floor(sqrt(xp / 50)) + 1)` para XP entero ≥ 0.

El siguiente nivel cuesta progresivamente más: 50, 150, 250… XP. Nivel 1: 0 XP; 5: 800; 10: 4.050; 18: 14.450; 20: 18.050; 100: 490.050. Son unidades de práctica dentro del producto, no equivalencias científicas de dominio.

Progreso de barra: `(xp − threshold(level)) / (threshold(level+1) − threshold(level))`. Nivel 100 muestra MAX sin un nivel 101; XP puede seguir acumulándose. Baseline de nivel L crea exactamente threshold(L) XP.

Curva central y versionada en packages/domain. Fijar versión por skill evita que editar el algoritmo cambie silenciosamente los niveles antiguos. Un cambio de curva requiere una migración deliberada; no reescribir el ledger.

Confirmación en UNA transacción PostgreSQL:

1. Leer evento con bloqueo de fila y comprobar pertenencia al usuario.
2. Si confirmed, devolver resultado existente. Si rejected, devolver conflicto.
3. Leer/bloquear skill para serializar concesiones concurrentes sobre esa skill.
4. Insertar XPTransaction con clave única `event:{id}`; modo evidence_only no concede XP.
5. Cambiar estado a confirmed. Aplicar contribuciones de quest explícitas, cada relación una sola vez.
6. Si una quest alcanza target, completed + transacción `quest:{id}:reward` una sola vez.
7. Evaluar condiciones de achievements y crear unlocks únicos.
8. Commit; sólo después emitir respuesta/notificaciones de novedades.

Reintentos y llamadas concurrentes no duplican ledger, recompensa ni unlocks. Manual capture crea evento y sigue esta misma lógica en una sola transacción. Nunca usar «guardar evento» y «sumar XP» como operaciones independientes.

## 8. Backfill sin doble contabilización

Baseline opcional y único por skill durante onboarding, con cutoff_at. Para empezar desde cero se omite. Tras la primera actividad con XP no se edita libremente el baseline: una futura corrección necesitará política de ajuste explícita.

Actividad anterior o igual al corte de la skill: `xp_mode=evidence_only`; se revisa, aparece en historial/timeline y puede aportar contadores verificables de milestones, pero no vuelve a conceder XP ya representada por el baseline. Actividad posterior: `xp_mode=award`; pasa por confirmación. La decisión se muestra en la revisión. Prohibir ampliar automáticamente el corte sobre XP concedida.

Milestones no dan XP por defecto. Admiten exact/month/year/unknown con campos separados y validación de fechas reales. El timeline indica «≈ marzo 2026», «≈ 2022» o «Fecha desconocida» en una sección propia; no inventa 1 de enero. Achievements históricos conservan la precisión de fecha real. Para comparaciones temporales, una fecha incompleta no cuenta como actividad de un día concreto.

Los grupos de importación son una representación UI de evidencias individuales, no otra fuente de XP. Conservar claves externas de cada commit/PR/evento. Revisar un grupo debe permitir inspeccionar o excluir miembros; confirmar otorga exactamente el agregado de sus miembros elegibles, nunca grupo + miembros. Este endpoint y la estructura final del grupo se implementan en P2.

## 9. Integraciones futuras

Adaptador pequeño por proveedor: authorize, sync, normalize; ambos producen el mismo Event pending. Separar identidad externa, evidencia, evento y recompensa permite añadir futuros conectores sin rehacer el ledger.

GitHub: proponer commits 5 XP, PR creadas 15 XP, repositorios creados 20 XP como valores iniciales editables. Agrupar por repo/día para presentación. Cada evidencia mantiene su identificador: repo+SHA para commits, repo+PR-number+tipo para PRs, repo-id para creación. Un commit presente en ramas/reimportaciones no se cuenta de nuevo. Una PR puede incluir commits; avisar de que puntuar ambos mide actividades distintas, sin afirmar calidad de código.

Calendar: primera integración concreta propuesta Google Calendar, no una abstracción de todos los calendarios. Sólo eventos ya terminados. Sugerencias por reglas de título/duración configurables y editables, no IA en MVP. Presencia en calendario no prueba asistencia: siempre confirmar. Instancias recurrentes se identifican con calendar-id + event-id + original-start-time. Cancelaciones no conceden XP. Editar una entrada ya confirmada del proveedor no altera el ledger automáticamente.

Sincronización manual primero; después tarea periódica con cursor, paginación, backoff y estado visible. Tokens cifrados en servidor con clave fuera de la base de datos, mínimo acceso y nunca enviados al navegador. No asumir que GitHub permite «toda la historia» con un único feed: validar las API disponibles, permisos y límites al implementar P2; mostrar alcance real y omisiones. Lo mismo para calendarios recurrentes y rangos históricos.

## 10. Rachas, logros y revisiones

Racha: fechas locales distintas con al menos una actividad confirmed y fecha exacta. Si hoy no tiene actividad pero ayer sí, mantener la racha de ayer hasta terminar hoy. Baseline, recompensas y milestones no generan días activos. Una actividad histórica exacta puede reconstruir la mejor racha y se distingue de la actividad capturada en tiempo real; ambas categorías se muestran por separado en la revisión cuando exista backfill.

Quests: objetivo > 0, unidad explícita (sesiones, ejercicios, páginas…), progreso nunca inferido sólo por XP. Manual establece el total; contribución de evento añade delta bajo bloqueo. Al alcanzar target se completa una sola vez. No reabrir automáticamente quests completadas. Deadline informa «vencida» en la UI, sin convertirla por sí sola a abandoned ni restar progreso.

Achievements iniciales: 100 actividades confirmadas, racha 30 días, skill nivel 10/20 y milestones seleccionados. El baseline puede satisfacer un logro de nivel, marcado como histórico; no simula cientos de actividades. El logro de 100 commits usa evidencias verificadas, no títulos manuales. Notificación especial después de commit y sólo para unlocks nuevos; respetar reduced-motion.

Weekly Review: XP de actividades, XP de quests y baseline separados; baseline excluido del indicador «XP ganada esta semana». Cuenta actividades por occurred_at, quests por completed_at y achievements por su fecha real exacta. Semana actual provisional; generar al consultar y guardar snapshot. Actividades retroactivas permiten recalcular resumen sin borrar la reflexión. Comparación absoluta si semana anterior = 0; no dividir por cero. Separar imports históricos en el resumen para no presentar reconstrucción como práctica actual.

## 11. Fases y criterios de aceptación

| Fase | Alcance | Criterio de salida |
| --- | --- | --- |
| 0 · Diseño | Este approach, modelo, contratos y mockups | Decisiones listas para implementar, sin servicios desplegados |
| P0a · Dominio | DB, sesión, skills, curva, ledger, manual capture | Crear actividad +40 y verla en skill; reintento/concurrencia no duplica XP |
| P0b · Producto usable | Dashboard, heatmap, skill detail, historial, timeline, perfil y baseline/milestones manuales | Se usa desde cero o con nivel inicial; sin integraciones; recarga conserva datos |
| P1 · Gamificación | Quests, achievements, rachas, Weekly Review y reflexión | Recompensa/unlock únicos, rachas correctas en zona local, reflexión persistida |
| P2a · Inbox | Pending/edit/confirm/reject con fixtures de desarrollo | Rechazar no concede XP; confirmar/edit produce el resultado esperado |
| P2b · Automatización | GitHub y Google Calendar, OAuth, deduplicación, backfill agrupado | Reimportar datos no duplica actividad ni XP; confirmación obligatoria |

Incluir columnas de estado y cobertura RF en el seguimiento de implementación. RF-01–08, 23–24, 29, 31–34, 38–39 se abordan en P0; RF-18–22, 25–28 y 35 en P1; RF-09–17, 30, 36–37 en P2. RF-30 se prepara mediante claves únicas en P0 aunque los conectores lleguen después. RF-32 perfil simple en P0 y enriquecido con logros/rachas en P1.

## 12. Verificación necesaria al implementar

- Curva: umbrales exactos, baseline inverso, nivel 100 y acumulación posterior.
- Transacciones: doble click, reintentos y confirmaciones concurrentes; rollback no deja eventos confirmados sin ledger.
- Aislamiento: un usuario no puede leer, editar ni confirmar IDs ajenos, incluidas relaciones quest/evento/skill.
- Quests: contribución duplicada y recompensa simultánea se aplican una sola vez.
- Backfill: cutoff, baseline excluido de actividad/semana y fechas incompletas sin rachas ficticias.
- Tiempo: medianoche local, cambio horario, racha con ayer/hoy y semana anterior vacía.
- Importación: claves externas por miembro, grupos solapados e instancias recurrentes.
- Recorrido UI: crear skill → registrar → progreso/graph/timeline → revisar semana; y pending → editar → confirmar/rechazar.

Las pruebas de lógica pura y las de integración PostgreSQL son necesarias para las invariantes, más un recorrido de navegador por el flujo central. No añadir pruebas de snapshots de cada tarjeta sólo por cobertura.

## 13. Primer incremento recomendado

Implementar únicamente P0a y P0b en la primera entrega ejecutable. El onboarding ya debe permitir baseline y milestones; así el usuario puede incorporar progreso previo sin rellenar cientos de actividades. Después de usarlo con datos reales, ajustar presets y curva deliberadamente antes de automatizar importaciones. El Inbox figura en navegación cuando exista P2; antes no mostrar una integración simulada como si estuviera conectada.
