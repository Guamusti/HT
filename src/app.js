import * as D from "./domain.js";
import { localDateTime, zonedInput } from "./dates.js";
import {
  load,
  getState,
  isDemo,
  toggleDemo,
  mutate,
  restore,
  backup,
  observe,
} from "./store.js";
import { parseICS, importRecords } from "./integrations.js";

const app = document.querySelector("#app"),
  modal = document.querySelector("#modal"),
  modalContent = document.querySelector("#modal-content");
let heatRange = 90,
  heatMetric = "events",
  questTab = "active",
  filters = {
    skill: "",
    source: "",
    status: "",
    query: "",
    from: "",
    to: "",
    type: "",
  },
  selected = new Set(),
  reviewWeek = "",
  busy = false,
  restoreData = null;
const quickLocks = new Set();

const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? esc(u) : "#");
const num = (n) => Number(n || 0).toLocaleString("es");

const icons = {
  dashboard:
    '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  inbox: '<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 4h14l2 9v7H3v-7L5 4Z"/>',
  skills: '<path d="M4 20V14M10 20V9M16 20V4M22 20H2"/>',
  quests: '<path d="M5 21V4m0 0h11l-2 4 2 4H5"/>',
  timeline:
    '<path d="M12 3v18"/><circle cx="12" cy="7" r="2"/><circle cx="12" cy="17" r="2"/><path d="M14 7h6M4 17h6"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  achievements:
    '<path d="M8 4h8v6a4 4 0 0 1-8 0V4ZM12 14v4m-4 3h8M8 6H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4"/>',
  review: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-6"/>',
  profile:
    '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  settings:
    '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  bolt: '<path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4m8-4v4"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
};
const icon = (name, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.skills}</svg>`;

const activeSkills = () => getState().skills.filter((s) => !s.archived);
const skBy = (id) => getState().skills.find((s) => s.id === id);
const localDay = () => D.dayKey(new Date(), getState().profile.timezone);
const dateLabel = (date, opts = { day: "numeric", month: "short" }) =>
  new Intl.DateTimeFormat("es-ES", {
    ...opts,
    timeZone: getState().profile.timezone,
  }).format(new Date(date));
const dateHistorical = (date, precision = "exact") => {
  if (!date) return "Fecha desconocida";
  if (precision === "year") return `≈ ${esc(date)}`;
  if (precision === "month")
    return (
      "≈ " +
      new Intl.DateTimeFormat("es-ES", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(date + "-01T12:00:00Z"))
    );
  return dateLabel(date.length === 10 ? date + "T12:00:00Z" : date);
};
function datetimeInput(iso = new Date().toISOString()) {
  return localDateTime(iso, getState().profile.timezone);
}
const route = () => location.hash.slice(1) || "/";
const names = {
  "/": "Inicio",
  "/inbox": "Inbox",
  "/skills": "Skills",
  "/quests": "Quests",
  "/timeline": "Timeline",
  "/achievements": "Logros",
  "/review": "Revisión semanal",
  "/profile": "Perfil",
  "/settings": "Ajustes",
  "/activities": "Historial",
};
const sourceNames = { manual: "manual", github: "GitHub", calendar: "calendario" };
const statusNames = {
  confirmed: "confirmada",
  pending: "pendiente",
  rejected: "descartada",
};
const typeNames = {
  activity: "actividad",
  level: "nivel",
  quest: "quest",
  achievement: "logro",
  milestone: "hito",
};

function toast(message, kind = "") {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = message;
  const notifications = document.querySelector("#notifications");
  notifications.append(el);
  while (notifications.children.length > 3)
    notifications.firstElementChild.remove();
  setTimeout(() => el.remove(), kind === "achievement" ? 6500 : 4000);
}
function notifyUnlocks(unlocks) {
  const s = getState();
  for (const u of unlocks) {
    const a = D.catalog(s).find((a) => a.code === u.code);
    toast(`Logro desbloqueado · ${a?.name || u.code}`, "achievement");
  }
}
async function change(fn, message) {
  if (busy) return;
  busy = true;
  try {
    const { result, unlocks } = await mutate(fn);
    render();
    if (message) toast(message);
    notifyUnlocks(unlocks);
    return result;
  } catch (e) {
    toast(e.message, "error");
    throw e;
  } finally {
    busy = false;
  }
}

/* ---------- Building blocks ---------- */

function empty(title, description, action = "activity", label = "Registrar actividad") {
  return `<div class="empty"><strong>${esc(title)}</strong><p>${esc(description)}</p>${action ? `<button class="btn btn-sm" data-action="${esc(action)}">${esc(label)}</button>` : ""}</div>`;
}
function heading(title, sub, action = "", label = "", eyebrow = "") {
  return `<header class="page-head"><div><p class="label">${esc(eyebrow || names[route()] || "HT")}</p><h1>${esc(title)}</h1>${sub ? `<p class="page-sub">${esc(sub)}</p>` : ""}</div>${action ? `<button class="btn" data-action="${esc(action)}">${icon("plus", 14)} ${esc(label)}</button>` : ""}</header>`;
}
function sectionHead(title, right = "") {
  return `<div class="section-head"><h2>${esc(title)}</h2>${right}</div>`;
}
const moreLink = (href, label) =>
  `<a class="link" href="${href}">${esc(label)} ${icon("arrow", 13)}</a>`;
const bar = (fraction, label = "") =>
  `<div class="bar" ${label ? `role="progressbar" aria-label="${label}" aria-valuenow="${Math.round(fraction * 100)}" aria-valuemin="0" aria-valuemax="100"` : ""}><span style="width:${Math.min(100, fraction * 100)}%"></span></div>`;
const glyph = (sk) =>
  `<span class="glyph" style="--skill:${esc(sk?.color || "#888")}">${esc(sk?.icon || "✦")}</span>`;

function stat(title, value, unit, note, symbol, good = false) {
  return `<div class="stat"><span class="label">${esc(title)}</span><div class="stat-value">${esc(value)}${unit ? `<span>${esc(unit)}</span>` : ""}</div><div class="stat-note ${good ? "good" : ""}">${esc(note)}</div></div>`;
}

const quickDefaults = {
  Fitness: ["+1 entreno", "Entrenamiento completado", 40],
  Programming: ["+1 sesión", "Sesión de programación", 40],
  Reading: ["+1 lectura", "Sesión de lectura", 20],
  Business: ["+1 sesión", "Sesión de trabajo en mi negocio", 40],
  Finance: ["+1 sesión", "Sesión de finanzas", 20],
  Mathematics: ["+1 práctica", "Práctica de matemáticas", 30],
  Networking: ["+1 encuentro", "Encuentro de networking", 30],
  Writing: ["+1 sesión", "Sesión de escritura", 20],
  Languages: ["+1 práctica", "Práctica de idiomas", 20],
  Philosophy: ["+1 sesión", "Sesión de filosofía", 20],
};
function quickFor(sk) {
  return (
    quickDefaults[sk.name] || ["+1 práctica", `Práctica de ${sk.name}`, 20]
  );
}
function skillCard(sk) {
  const p = D.progress(getState(), sk.id),
    [label, , xp] = quickFor(sk),
    count = D.confirmed(getState()).filter(
      (e) =>
        e.skillId === sk.id &&
        D.dayKey(e.occurredAt, getState().profile.timezone) === localDay(),
    ).length;
  return `<article class="skill-card ${count ? "is-today" : ""}" style="--skill:${esc(sk.color)}"><a class="skill-head" href="#/skills/${esc(sk.id)}" aria-label="Ver progreso de ${esc(sk.name)}">${glyph(sk)}<span class="skill-name"><strong>${esc(sk.name)}</strong><small>Nivel ${p.level} · ${num(p.xp)} XP</small></span><span class="skill-go">${icon("arrow", 14)}</span></a>${bar(p.fraction, `Progreso de ${esc(sk.name)}`)}<p class="today-count" aria-live="polite">${count ? `<span class="pulse"></span>${count} ${count === 1 ? "actividad registrada" : "actividades registradas"} hoy` : "Sin actividad hoy"}</p><div class="skill-actions"><button class="btn one-tap" data-action="quick-log" data-skill="${esc(sk.id)}" ${quickLocks.has(sk.id) ? "disabled" : ""}>${esc(label)} <small>+${xp} XP</small></button><button class="btn btn-square" data-action="activity" data-skill="${esc(sk.id)}" aria-label="Registrar otra actividad en ${esc(sk.name)}" title="Otra actividad">${icon("plus", 15)}</button></div></article>`;
}

function eventRow(e, full = false) {
  const sk = skBy(e.skillId);
  const amount = e.status === "confirmed" && e.xpMode === "award" ? e.xp : 0;
  const meta = [
    esc(sk?.name),
    dateLabel(e.occurredAt),
    esc(sourceNames[e.source] || e.source),
    e.isHistorical ? "histórico" : "",
    full ? esc(statusNames[e.status] || e.status) : "",
  ].filter(Boolean);
  return `<div class="row" style="--skill:${esc(sk?.color || "#888")}"><span class="dot"></span><div class="row-main"><strong>${esc(e.title)}</strong><small>${meta.join(" · ")}</small>${full && e.description ? `<p>${esc(e.description)}</p>` : ""}${full && e.evidence ? `<a class="link" href="${safeUrl(e.evidence)}" target="_blank" rel="noopener noreferrer">Ver evidencia ${icon("external", 11)}</a>` : ""}</div><span class="row-xp ${e.status === "pending" ? "is-pending" : e.status === "rejected" || e.xpMode === "evidence_only" ? "is-muted" : ""}">${e.status === "pending" ? `~${e.xp} XP` : e.status === "rejected" ? "Descartada" : e.xpMode === "evidence_only" ? "Evidencia" : `+${amount} XP`}</span></div>`;
}

function heatmap() {
  const s = getState(),
    end = localDay(),
    start = D.shiftDay(end, -heatRange + 1),
    weekstart = D.shiftDay(
      start,
      -((new Date(start + "T12:00Z").getUTCDay() + 6) % 7),
    );
  const events = D.confirmed(s);
  const days = new Map();
  for (const e of events) {
    const day = D.dayKey(e.occurredAt, s.profile.timezone);
    const cur = days.get(day) || { count: 0, xp: 0 };
    cur.count++;
    cur.xp += e.xpMode === "award" ? e.xp : 0;
    days.set(day, cur);
  }
  let boxes = "",
    active = 0,
    total = 0;
  for (let d = weekstart; d <= end; d = D.shiftDay(d, 1)) {
    const val = days.get(d) || { count: 0, xp: 0 };
    const value = heatMetric === "events" ? val.count : val.xp;
    const intensity =
      heatMetric === "events"
        ? Math.min(4, value)
        : value === 0
          ? 0
          : value < 30
            ? 1
            : value < 70
              ? 2
              : value < 120
                ? 3
                : 4;
    if (d >= start) {
      if (val.count) active++;
      total += val.count;
    }
    boxes += `<button class="heatmap-day" data-intensity="${intensity}" data-action="heat-day" data-day="${d}" title="${d}: ${val.count} actividades · ${val.xp} XP" aria-label="${d}: ${val.count} actividades, ${val.xp} XP"></button>`;
  }
  const months = [];
  for (let d = start; d <= end; d = D.shiftDay(d, 28))
    months.push(
      new Intl.DateTimeFormat("es", { month: "short" }).format(
        new Date(d + "T12:00Z"),
      ),
    );
  return `<section class="panel"><div class="panel-head"><h2>Actividad</h2><div class="panel-tools"><select class="select-sm" id="heat-range" aria-label="Rango de actividad">${[
    [28, "4 semanas"],
    [90, "3 meses"],
    [365, "Último año"],
  ]
    .map(
      ([v, l]) =>
        `<option value="${v}" ${v === heatRange ? "selected" : ""}>${l}</option>`,
    )
    .join(
      "",
    )}</select><select class="select-sm" id="heat-metric" aria-label="Intensidad de actividad"><option value="events" ${heatMetric === "events" ? "selected" : ""}>Actividades</option><option value="xp" ${heatMetric === "xp" ? "selected" : ""}>XP</option></select></div></div><div class="heatmap-wrap"><div class="heatmap-months">${[...new Set(months)].map((m) => `<span>${esc(m)}</span>`).join("")}</div><div class="heatmap">${boxes}</div></div><div class="panel-foot"><span>${active} días activos · ${total} actividades</span><span class="legend">Menos ${[0, 1, 2, 3, 4].map((i) => `<span class="heatmap-day" data-intensity="${i}"></span>`).join("")} Más</span></div></section>`;
}

function questMini(q) {
  const sk = skBy(q.skillId);
  return `<div class="quest-mini" style="--skill:${esc(sk?.color || "#888")}"><div class="quest-line"><strong>${esc(q.name)}</strong><span class="xp">+${q.rewardXp} XP</span></div>${bar(q.progress / q.target)}<div class="quest-meta"><span>${q.progress} / ${q.target} ${esc(q.unit)}</span><span>${q.deadline ? dateLabel(q.deadline + "T12:00Z") : "Sin fecha límite"}</span></div></div>`;
}

/* ---------- Views ---------- */

function dashboard() {
  const s = getState(),
    current = D.weeklySummary(s, D.weekStart(localDay())),
    previous = D.weeklySummary(s, D.shiftDay(D.weekStart(localDay()), -7)),
    streak = D.streaks(s),
    recent = D.confirmed(s)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 6),
    quests = s.quests.filter((q) => q.status === "active").slice(0, 4),
    skills = activeSkills().sort((a, b) =>
      a.name === "Fitness" ? -1 : b.name === "Fitness" ? 1 : 0,
    );
  const first = s.profile.name ? s.profile.name.split(" ")[0] : "";
  return (
    heading(
      first ? `Hola, ${first}.` : "Cada paso cuenta.",
      "Termina una actividad, toca +1 y sigue con tu día.",
      "",
      "",
      dateLabel(new Date(), { weekday: "long", day: "numeric", month: "long" }),
    ) +
    `<div class="stats">${stat("XP esta semana", "+" + current.xp, "XP", current.xp > previous.xp ? `+${current.xp - previous.xp} XP frente a la anterior` : `Semana anterior: ${previous.xp} XP`, "bolt", current.xp > previous.xp)}${stat("Racha actual", streak.current, "días", `Mejor racha: ${streak.best} días`, "bolt")}${stat("Actividades", D.confirmed(s).length, "", `${current.events} esta semana`, "calendar")}${stat("Quests completadas", s.quests.filter((q) => q.status === "completed").length, "", `${s.quests.filter((q) => q.status === "active").length} en marcha`, "quests")}</div>` +
    sectionHead(
      "Hoy",
      !s.profile.onboarded
        ? '<button class="link" data-action="onboarding">Personalizar perfil</button>'
        : moreLink("#/skills", "Todas las skills"),
    ) +
    `<div class="skills-grid dashboard-skills">${skills.map(skillCard).join("")}</div><details class="other-capture"><summary><span>${icon("plus", 14)} Registrar algo diferente o un hito</span></summary>${captureHome()}</details><div class="split"><div>${heatmap()}${sectionHead("Actividad reciente", moreLink("#/activities", "Historial"))}<div class="panel list">${recent.length ? recent.map((e) => eventRow(e)).join("") : empty("Tu historia empieza aquí", "Registra algo que hayas hecho hoy. No tiene que ser grande.")}</div></div><div><section class="panel"><div class="panel-head"><h2>Quests activas</h2>${moreLink("#/quests", String(s.quests.filter((q) => q.status === "active").length))}</div>${quests.length ? quests.map(questMini).join("") : empty("Sin quests activas", "Un objetivo concreto, una skill y tu propio ritmo.", "quest", "Crear quest")}</section><a href="#/timeline" class="panel panel-link"><span class="label">Timeline</span><strong>Hay una historia detrás de tus skills.</strong><span class="link">Explorar ${icon("arrow", 13)}</span></a></div></div>`
  );
}
function captureHome() {
  return `<section class="capture"><form data-form="quick-start" class="capture-start"><label class="sr-only" for="quick-title">Qué has hecho o conseguido</label><input id="quick-title" name="title" placeholder="He terminado mi proyecto, he ido al gimnasio…" maxlength="180" required autocomplete="off"><button class="btn btn-primary" type="submit">Continuar ${icon("arrow", 14)}</button></form><div class="chips"><span class="label">O por skill</span>${activeSkills()
    .map(
      (sk) =>
        `<button class="chip" data-action="activity" data-skill="${esc(sk.id)}">${esc(sk.icon)} ${esc(sk.name)}</button>`,
    )
    .join(
      "",
    )}</div><button class="milestone-shortcut" data-action="milestone">${icon("achievements", 16)} <strong>He conseguido un hito</strong> <span>Primer cliente, proyecto terminado, carrera…</span></button></section>`;
}
const suggestions = {
  Fitness: [
    ["He ido al gimnasio", 40],
    ["He salido a correr", 40],
    ["He caminado 30 minutos", 20],
  ],
  Programming: [
    ["He trabajado en mi proyecto", 40],
    ["He practicado programación", 20],
    ["He hecho 3 commits", 15],
  ],
  Reading: [
    ["He leído 30 minutos", 20],
    ["He terminado un capítulo", 20],
  ],
  Business: [
    ["He trabajado en mi negocio", 40],
    ["He tenido una reunión con un cliente", 30],
  ],
  Writing: [["He escrito durante 30 minutos", 20]],
  Languages: [["He practicado un idioma", 20]],
  Mathematics: [["He resuelto ejercicios", 30]],
};
function captureSuggestions(skillId) {
  return (
    suggestions[skBy(skillId)?.name] || [
      ["He practicado 30 minutos", 20],
      ["He trabajado durante una hora", 40],
    ]
  )
    .map(
      ([title, xp]) =>
        `<button type="button" class="chip" data-action="capture-preset" data-title="${esc(title)}" data-xp="${xp}">${esc(title)} <small>+${xp} XP</small></button>`,
    )
    .join("");
}

function skillsView() {
  return (
    heading(
      "Skills",
      "Cada habilidad avanza por su cuenta. Los niveles miden práctica acumulada, no tu valor.",
      "skill",
      "Nueva skill",
      `${activeSkills().length} activas`,
    ) + `<div class="skills-grid">${activeSkills().map(skillCard).join("")}</div>`
  );
}
function skillDetail(id) {
  const s = getState(),
    sk = skBy(id);
  if (!sk)
    return empty("Skill no encontrada", "Vuelve a la lista de habilidades.", null);
  const p = D.progress(s, id),
    events = D.confirmed(s)
      .filter((e) => e.skillId === id)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    ledger = s.ledger
      .filter((x) => x.skillId === id)
      .sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt));
  let running = 0;
  const amounts = ledger.map((x) => (running += x.amount));
  const points = amounts.length ? [0, ...amounts] : [0, 0];
  const max = Math.max(...points, 1),
    coords = points
      .map(
        (v, i) =>
          `${(i / (points.length - 1)) * 600},${150 - (v / max) * 135}`,
      )
      .join(" ");
  const related = s.quests.filter((q) => q.skillId === id);
  const achievements = D.catalog(s).filter((a) => a.skillId === id);
  return `<header class="page-head"><div><a class="label back" href="#/skills">${icon("left", 12)} Skills</a><h1 class="with-glyph">${glyph(sk)} ${esc(sk.name)}</h1>${sk.description ? `<p class="page-sub">${esc(sk.description)}</p>` : ""}</div><div class="head-actions"><button class="btn" data-action="skill" data-id="${esc(id)}">Editar</button><button class="btn btn-primary" data-action="activity" data-skill="${esc(id)}">${icon("plus", 14)} Registrar</button></div></header><div class="stats">${stat("Nivel", p.level === 100 ? "MAX" : p.level, "", p.level === 100 ? "Nivel máximo alcanzado" : `${num(p.remaining)} XP para el nivel ${p.level + 1}`, "skills")}${stat("XP acumulada", num(p.xp), "XP", `${ledger.length} transacciones`, "bolt")}${stat("Actividades", events.length, "", events[0] ? `Última: ${dateLabel(events[0].occurredAt)}` : "Sin actividad aún", "calendar")}${stat("Quests", related.length, "", `${related.filter((q) => q.status === "active").length} activas`, "quests")}</div><div class="split"><div><section class="panel"><div class="panel-head"><h2>Evolución</h2><span class="mono">${Math.round(p.fraction * 100)}% del nivel ${p.level}</span></div>${bar(p.fraction)}<svg class="graph" viewBox="0 0 600 160" preserveAspectRatio="none" role="img" aria-label="Evolución de XP: ${p.xp} XP total"><path d="M0 150H600M0 82H600M0 15H600" class="graph-grid"/><polyline points="0,150 ${coords} 600,150" class="graph-fill"/><polyline points="${coords}" class="graph-line"/></svg><div class="graph-labels"><span>${ledger.length ? dateLabel(ledger[0].effectiveAt) : "Punto de partida"}</span><span>Hoy</span></div></section>${sectionHead("Actividades recientes")}<div class="panel list">${
    events.length
      ? events
          .slice(0, 12)
          .map((e) => eventRow(e, true))
          .join("")
      : empty("Práctica pendiente", "Tu próximo paso es la primera actividad.", "activity")
  }</div>${sectionHead("Ledger de XP")}<div class="panel table-scroll"><table class="table"><thead><tr><th>Fecha</th><th>Motivo</th><th>Tipo</th><th class="num">XP</th></tr></thead><tbody>${ledger
    .slice()
    .reverse()
    .map(
      (x) =>
        `<tr><td class="mono">${dateLabel(x.effectiveAt)}</td><td>${esc(x.reason)}</td><td class="mono muted">${esc(x.type)}</td><td class="num">+${num(x.amount)}</td></tr>`,
    )
    .join(
      "",
    )}</tbody></table>${ledger.length ? "" : `<p class="muted pad">Toda concesión de XP aparecerá aquí con su motivo.</p>`}</div></div><div><section class="panel"><div class="panel-head"><h2>Quests relacionadas</h2></div>${related.length ? related.map(questMini).join("") : empty("Sin quests", "Define un objetivo para esta habilidad.", "quest", "Crear quest")}</section>${!ledger.length ? `<section class="panel"><span class="label">Punto de partida</span><p class="muted" style="margin:8px 0 14px">¿Ya llevas tiempo practicando? Define un nivel inicial aproximado.</p><button class="btn btn-sm" data-action="baseline" data-id="${esc(id)}">Añadir baseline</button></section>` : ""}${achievements.length ? sectionHead("Logros") + `<div class="stack">${achievements.map(achievementCard).join("")}</div>` : ""}</div></div>`;
}
function filterBar(mode = "events") {
  return `<div class="filters"><input id="filter-query" type="search" value="${esc(filters.query)}" placeholder="Buscar…" aria-label="Buscar actividades"><select id="filter-skill" aria-label="Filtrar por skill"><option value="">Skill: todas</option>${activeSkills()
    .map(
      (sk) =>
        `<option value="${esc(sk.id)}" ${filters.skill === sk.id ? "selected" : ""}>${esc(sk.name)}</option>`,
    )
    .join("")}</select>${
    mode === "events"
      ? `<select id="filter-source" aria-label="Filtrar por origen"><option value="">Origen: todos</option>${["manual", "github", "calendar"].map((x) => `<option value="${x}" ${filters.source === x ? "selected" : ""}>${sourceNames[x]}</option>`).join("")}</select><select id="filter-status" aria-label="Filtrar por estado"><option value="">Estado: todos</option>${["confirmed", "pending", "rejected"].map((x) => `<option value="${x}" ${filters.status === x ? "selected" : ""}>${statusNames[x]}</option>`).join("")}</select>`
      : `<select id="filter-type" aria-label="Filtrar por tipo"><option value="">Tipo: todos</option>${[
          ["activity", "Actividades"],
          ["level", "Subidas de nivel"],
          ["quest", "Quests"],
          ["achievement", "Logros"],
          ["milestone", "Hitos"],
        ]
          .map(
            ([v, l]) =>
              `<option value="${v}" ${filters.type === v ? "selected" : ""}>${l}</option>`,
          )
          .join("")}</select>`
  }<input id="filter-from" type="date" value="${esc(filters.from)}" aria-label="Desde"><input id="filter-to" type="date" value="${esc(filters.to)}" aria-label="Hasta"></div>`;
}
function activitiesView() {
  const s = getState();
  const list = s.events
    .filter(
      (e) =>
        (!filters.skill || e.skillId === filters.skill) &&
        (!filters.source || e.source === filters.source) &&
        (!filters.status || e.status === filters.status) &&
        (!filters.query ||
          (e.title + " " + e.description)
            .toLowerCase()
            .includes(filters.query.toLowerCase())) &&
        (!filters.from ||
          D.dayKey(e.occurredAt, s.profile.timezone) >= filters.from) &&
        (!filters.to ||
          D.dayKey(e.occurredAt, s.profile.timezone) <= filters.to),
    )
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return (
    heading("Historial", "Todas tus actividades, con su origen y estado.") +
    filterBar() +
    `<p class="count-line">${list.length} actividades</p><div class="panel list">${list.length ? list.map((e) => eventRow(e, true)).join("") : empty("Sin actividades en este rango", "Prueba otros filtros o registra una actividad.")}</div>`
  );
}
function questsView() {
  const list = getState().quests.filter((q) => q.status === questTab);
  return (
    heading(
      "Quests",
      "Objetivos concretos con un final claro. No penalizan por descansar.",
      "quest",
      "Nueva quest",
    ) +
    `<div class="toolbar"><div class="tabs" role="tablist">${[
      ["active", "Activas"],
      ["completed", "Completadas"],
      ["abandoned", "Abandonadas"],
    ]
      .map(
        ([v, l]) =>
          `<button class="tab ${questTab === v ? "active" : ""}" role="tab" aria-selected="${questTab === v}" data-action="quest-tab" data-tab="${v}">${l} <span>${getState().quests.filter((q) => q.status === v).length}</span></button>`,
      )
      .join("")}</div></div><div class="grid-2">${list
      .map((q) => {
        const sk = skBy(q.skillId);
        const overdue = q.deadline && q.deadline < localDay() && q.status === "active";
        return `<article class="panel quest-card" style="--skill:${esc(sk?.color || "#888")}"><div class="quest-card-head"><span class="tag"><span class="dot"></span>${esc(sk?.name)}</span><span class="xp">+${q.rewardXp} XP</span></div><h3>${esc(q.name)}</h3>${q.description ? `<p class="muted">${esc(q.description)}</p>` : ""}${bar(q.progress / q.target)}<div class="quest-meta"><span>${q.progress} / ${q.target} ${esc(q.unit)}</span><span class="${overdue ? "warn" : ""}">${q.deadline ? `${overdue ? "Vencida · " : ""}${dateLabel(q.deadline + "T12:00Z")}` : "Sin fecha límite"}</span></div>${q.status === "active" ? `<form class="quest-controls" data-form="quest-progress" data-id="${esc(q.id)}"><input type="number" name="progress" value="${q.progress}" min="0" max="1000000" step="any" aria-label="Progreso de ${esc(q.name)}" required><button class="btn btn-sm" type="submit">Actualizar</button><button class="btn btn-sm btn-quiet" type="button" data-action="quest-abandon" data-id="${esc(q.id)}">Abandonar</button></form>` : `<p class="quest-status">${q.status === "completed" ? `${icon("check", 13)} Completada · ${dateLabel(q.completedAt)}` : "Abandonada · el progreso de la skill se conserva"}</p>`}</article>`;
      })
      .join("")}</div>${list.length ? "" : empty(questTab === "active" ? "Sin quests activas" : "Nada por aquí", "No hace falta un gran objetivo. Puedes empezar con tres entrenamientos o diez páginas.", questTab === "active" ? "quest" : null, "Crear quest")}`
  );
}
function achievementCard(a) {
  const u = getState().unlocks.find((u) => u.code === a.code);
  return `<div class="achievement ${u ? "unlocked" : "locked"}"><span class="achievement-icon">${esc(a.icon)}</span><div><h3>${esc(a.name)}</h3><p>${esc(a.description)}</p><small>${u ? `${u.isHistorical ? "Histórico · " : ""}${dateHistorical(u.unlockedAt, u.precision)}` : "Bloqueado"}</small></div></div>`;
}
function achievementsView() {
  const s = getState(),
    all = D.catalog(s),
    unlocked = all.filter((a) => s.unlocks.some((u) => u.code === a.code)),
    locked = all.filter((a) => !s.unlocks.some((u) => u.code === a.code));
  return (
    heading(
      "Logros",
      "La práctica suma XP. Los resultados merecen un lugar en tu historia.",
      "",
      "",
      `${unlocked.length} / ${all.length} desbloqueados`,
    ) +
    `<div class="progress-line">${bar(all.length ? unlocked.length / all.length : 0)}</div><div class="achievement-grid">${[...unlocked, ...locked].map(achievementCard).join("")}</div>`
  );
}
function timelineView() {
  const s = getState(),
    list = D.timeline(s).filter(
      (r) =>
        (!filters.skill || r.skillIds.includes(filters.skill)) &&
        (!filters.type || r.type === filters.type) &&
        (!filters.query ||
          (r.title + " " + (r.description || ""))
            .toLowerCase()
            .includes(filters.query.toLowerCase())) &&
        (!filters.from || (r.date && r.date.slice(0, 10) >= filters.from)) &&
        (!filters.to || (r.date && r.date.slice(0, 10) <= filters.to)),
    );
  let month = "",
    rows = "";
  for (const r of list) {
    const m = r.date ? r.date.slice(0, 7) : "unknown";
    if (m !== month) {
      month = m;
      rows += `<div class="timeline-month">${m === "unknown" ? "Fecha desconocida" : r.precision === "year" ? esc(r.date) : new Intl.DateTimeFormat("es", { month: "long", year: "numeric" }).format(new Date(m + "-01T12:00Z"))}</div>`;
    }
    rows += `<div class="timeline-row t-${esc(r.type)}"><span class="timeline-dot"></span><span class="timeline-date">${dateHistorical(r.date, r.precision)}</span><div class="timeline-body"><h3>${esc(r.title)}</h3>${r.description ? `<p>${esc(r.description)}</p>` : ""}<span class="tag">${esc(typeNames[r.type] || r.type)}${r.isHistorical ? " · histórico" : ""}${r.xp ? " · +" + r.xp + " XP" : ""}</span></div></div>`;
  }
  return (
    heading(
      "Timeline",
      "La historia que estás construyendo, paso a paso.",
      "milestone",
      "Añadir milestone",
    ) +
    filterBar("timeline") +
    `<div class="panel timeline">${rows || empty("Tu timeline aún está por escribir", "Empieza con una actividad o conserva un hito importante del pasado.", "milestone", "Añadir hito")}</div>`
  );
}
function weeklyView() {
  const s = getState();
  if (!reviewWeek) reviewWeek = D.weekStart(localDay());
  const summary = D.weeklySummary(s, reviewWeek),
    prev = D.weeklySummary(s, D.shiftDay(reviewWeek, -7)),
    reflection = s.reflections[reviewWeek] || {},
    delta = summary.xp - prev.xp,
    isCurrent = reviewWeek === D.weekStart(localDay());
  return (
    heading(
      "Revisión semanal",
      "Una semana no define tu camino. Una reflexión ayuda a elegir el siguiente paso.",
    ) +
    `<div class="toolbar"><div class="week-nav"><button class="btn btn-square btn-sm" data-action="review-prev" aria-label="Semana anterior">${icon("left", 14)}</button><span class="mono">${dateLabel(reviewWeek + "T12:00Z")} — ${dateLabel(D.shiftDay(reviewWeek, 6) + "T12:00Z", { day: "numeric", month: "short", year: "numeric" })}</span><button class="btn btn-square btn-sm" data-action="review-next" ${reviewWeek >= D.weekStart(localDay()) ? "disabled" : ""} aria-label="Semana siguiente">${icon("right", 14)}</button></div><span class="tag ${isCurrent ? "tag-accent" : ""}">${isCurrent ? "Semana en curso" : "Semana cerrada"}</span></div><div class="stats">${stat("XP de la semana", summary.xp, "XP", `${delta >= 0 ? "+" : ""}${delta} XP frente a la anterior`, "bolt", delta > 0)}${stat("Actividades", summary.events, "", `${summary.historical} históricas, aparte`, "calendar")}${stat("Quests", summary.quests.length, "", `${summary.questXp} XP de recompensas`, "quests")}${stat("Logros", summary.unlocks.length, "", "Desbloqueados esta semana", "achievements")}</div><div class="split split-even"><form class="panel review-card" data-form="reflection"><div class="panel-head"><h2>Reflexión</h2></div><label for="went-well">¿Qué ha ido bien?</label><textarea id="went-well" name="wentWell" placeholder="Lo que quieres repetir…">${esc(reflection.wentWell)}</textarea><label for="went-wrong">¿Qué ha costado?</label><textarea id="went-wrong" name="wentWrong" placeholder="Sin juzgar…">${esc(reflection.wentWrong)}</textarea><label for="next-focus">¿En qué centrarte la próxima semana?</label><textarea id="next-focus" name="nextFocus" placeholder="Un siguiente paso concreto…">${esc(reflection.nextFocus)}</textarea><div class="form-foot"><button class="btn btn-primary" type="submit">Guardar reflexión</button>${reflection.savedAt ? `<small class="muted">Guardada · ${dateLabel(reflection.savedAt)}</small>` : ""}</div></form><div><section class="panel"><div class="panel-head"><h2>Skills trabajadas</h2></div>${summary.perSkill.length ? `<div class="list">${summary.perSkill.map((sk) => `<div class="row" style="--skill:${esc(sk.color)}"><span class="dot"></span><div class="row-main"><strong>${esc(sk.name)}</strong></div><span class="row-xp">+${sk.xp} XP</span></div>`).join("")}</div>` : empty("Sin práctica esta semana", "Tu progreso anterior sigue intacto.", null)}<p class="panel-note">${summary.activityXp} XP de actividades · ${summary.questXp} XP de quests · baselines excluidos</p></section><section class="panel"><div class="panel-head"><h2>Quests completadas</h2></div>${summary.quests.length ? summary.quests.map(questMini).join("") : empty("Una semana también puede ser de descanso", "Tus niveles no bajan por parar.", null)}</section></div></div>`
  );
}
function inboxView() {
  const s = getState(),
    pending = s.events
      .filter((e) => e.status === "pending")
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  let group = "",
    html = "";
  for (const e of pending) {
    const day = D.dayKey(e.occurredAt, s.profile.timezone);
    if (day !== group) {
      group = day;
      html += `<div class="inbox-group">${dateLabel(e.occurredAt, { day: "numeric", month: "long", year: "numeric" })}</div>`;
    }
    const sk = skBy(e.skillId);
    html += `<div class="inbox-card ${selected.has(e.id) ? "is-selected" : ""}" style="--skill:${esc(sk?.color || "#888")}"><input class="checkbox inbox-check" type="checkbox" value="${esc(e.id)}" ${selected.has(e.id) ? "checked" : ""} aria-label="Seleccionar ${esc(e.title)}"><div class="inbox-main"><h3>${esc(e.title)}</h3><p><span class="tag">${esc(sourceNames[e.source] || e.source)}${e.isHistorical ? " · histórico" : ""}</span> <span class="dot"></span> ${esc(sk?.name)} · <span class="${e.xpMode === "evidence_only" ? "muted" : "xp"}">${e.xpMode === "evidence_only" ? "Sólo evidencia · +0 XP" : `+${e.xp} XP propuestos`}</span></p>${e.xpMode === "evidence_only" ? `<p class="muted">Esta fecha está incluida en el baseline de la skill. Se conserva como evidencia sin duplicar XP.</p>` : ""}${e.evidence ? `<a href="${safeUrl(e.evidence)}" rel="noopener noreferrer" target="_blank" class="link">Ver evidencia ${icon("external", 11)}</a>` : ""}</div><div class="inbox-actions"><button class="btn btn-sm btn-quiet" data-action="event-reject" data-id="${esc(e.id)}">Descartar</button><button class="btn btn-sm" data-action="event-edit" data-id="${esc(e.id)}">Editar</button><button class="btn btn-sm btn-primary" data-action="event-confirm" data-id="${esc(e.id)}">${icon("check", 13)} Confirmar</button></div></div>`;
  }
  return (
    heading(
      "Inbox",
      "La actividad externa propone. Tú decides qué cuenta.",
      "",
      "",
      `${pending.length} pendientes`,
    ) +
    `<div class="toolbar">${pending.length ? `<button class="btn btn-sm btn-quiet" data-action="select-all">${selected.size === pending.length ? "Deseleccionar" : "Seleccionar"} todas</button><div class="toolbar-group"><button class="btn btn-sm btn-quiet" data-action="bulk-reject" ${selected.size ? "" : "disabled"}>Descartar</button><button class="btn btn-sm btn-primary" data-action="bulk-confirm" ${selected.size ? "" : "disabled"}>Confirmar ${selected.size} seleccionadas</button></div>` : "<span></span>"}<a class="btn btn-sm" href="#/settings">Importar actividad</a></div>${html ? `<div class="inbox">${html}</div>` : empty("Todo al día", "Importa actividad pública de GitHub o un calendario .ics. La XP sólo llega después de tu confirmación.", null)}`
  );
}
function profileView() {
  const s = getState(),
    st = D.streaks(s),
    unlocked = D.catalog(s)
      .filter((a) => s.unlocks.some((u) => u.code === a.code))
      .slice(0, 6);
  return (
    `<section class="profile-hero"><span class="avatar avatar-lg">${esc(s.profile.avatar)}</span><div><p class="label">Ficha de personaje</p><h1>${esc(s.profile.name || "Tu personaje")}</h1><p class="page-sub">En esta aventura desde ${dateLabel(s.profile.createdAt, { month: "long", year: "numeric" })}</p></div><button class="btn" data-action="profile-edit">Editar perfil</button></section>` +
    `<div class="stats">${stat("Actividades", D.confirmed(s).length, "", "Confirmadas", "calendar")}${stat("Logros", s.unlocks.length, "", "Resultados y hitos", "achievements")}${stat("Racha actual", st.current, "días", `Mejor racha: ${st.best} días`, "bolt")}${stat("Skills", activeSkills().length, "", "Cada una a su ritmo", "skills")}</div>` +
    sectionHead("Skills y niveles", moreLink("#/skills", "Explorar")) +
    `<div class="panel list">${activeSkills()
      .map((sk) => {
        const p = D.progress(s, sk.id);
        return `<a class="row level-row" href="#/skills/${esc(sk.id)}" style="--skill:${esc(sk.color)}">${glyph(sk)}<div class="row-main"><strong>${esc(sk.name)}</strong>${bar(p.fraction)}</div><span class="row-xp">Nv ${p.level}</span></a>`;
      })
      .join("")}</div>` +
    sectionHead("Logros destacados", moreLink("#/achievements", "Ver todos")) +
    (unlocked.length
      ? `<div class="achievement-grid">${unlocked.map(achievementCard).join("")}</div>`
      : empty("Tus hitos tendrán un lugar aquí", "También puedes añadir resultados anteriores a usar HT.", "milestone", "Añadir hito"))
  );
}
function settingsView() {
  const s = getState();
  return (
    heading(
      "Ajustes",
      "Tu perfil, tus fuentes de actividad y el control de tus datos.",
    ) +
    `<div class="notice"><span class="status-dot"></span>Tus datos se guardan en este navegador. Exporta una copia para conservarlos o moverlos a otro dispositivo. No hay cuenta ni sincronización en la nube.</div><div class="settings">
<form class="panel settings-panel" data-form="profile"><div class="panel-head"><h2>Perfil</h2></div><label for="profile-name">Nombre</label><input id="profile-name" name="name" value="${esc(s.profile.name)}" maxlength="60" required><label for="profile-avatar">Símbolo</label><input id="profile-avatar" name="avatar" value="${esc(s.profile.avatar)}" maxlength="12" required><label for="profile-timezone">Zona horaria</label><select id="profile-timezone" name="timezone">${timezones()
      .map(
        (tz) =>
          `<option ${s.profile.timezone === tz ? "selected" : ""}>${esc(tz)}</option>`,
      )
      .join(
        "",
      )}</select><p class="hint">Las rachas y las semanas siguen esta zona horaria.</p><div class="form-foot"><button class="btn btn-primary" type="submit">Guardar perfil</button></div></form>
<div class="panel settings-panel"><div class="panel-head"><h2>Tu historia antes de HT</h2></div><p>Un nivel inicial aproximado y tus hitos importantes. No hace falta reconstruir cientos de días.</p><div class="btn-stack"><button class="btn" data-action="baseline">Añadir baseline a una skill</button><button class="btn" data-action="milestone">Añadir milestone histórico</button></div><p class="hint">La fecha de corte del baseline evita duplicar XP al importar el pasado.</p>${moreLink("#/timeline", "Ver timeline")}</div>
<form class="panel settings-panel" data-form="github"><div class="panel-head"><h2>GitHub</h2><span class="tag">Público</span></div><p>Importa commits, pull requests y repositorios públicos. Todo entra pendiente al Inbox.</p><label for="github-user">Usuario</label><input id="github-user" name="username" placeholder="Guamusti" value="${esc(s.integrations.github)}" pattern="[A-Za-z0-9-]{1,39}" required><div class="field-row"><div><label for="github-since">Desde</label><input id="github-since" name="since" type="date" value="${D.shiftDay(localDay(), -30)}" max="${localDay()}" required></div><div><label for="github-skill">Skill</label><select id="github-skill" name="skillId">${skillOptions()}</select></div></div><p class="hint">Hasta 12 repositorios recientes y 100 commits por repositorio. Repetir la importación no duplica evidencias.</p><div class="form-foot"><button class="btn btn-primary" type="submit" ${busy ? "disabled" : ""}>Importar a Inbox</button></div></form>
<div class="panel settings-panel"><div class="panel-head"><h2>Calendario</h2><span class="tag">.ics</span></div><p>Exporta un calendario desde Google, Outlook o Apple e impórtalo. Sólo se revisan eventos pasados.</p><label for="calendar-skill">Skill sugerida</label><select id="calendar-skill">${skillOptions(activeSkills().find((sk) => sk.name === "Mathematics")?.id)}</select><label for="calendar-file">Archivo</label><input id="calendar-file" type="file" accept=".ics,text/calendar"><p class="hint">Las reglas de recurrencia no se expanden: se importan las instancias explícitas y se informa de las omitidas.</p></div>
<div class="panel settings-panel"><div class="panel-head"><h2>Copia de seguridad</h2></div><p>Incluye actividades, ledger, quests, logros, hitos y reflexiones.</p><div class="btn-stack"><button class="btn btn-primary" data-action="export">Exportar mis datos</button></div><label for="restore-file">Restaurar desde un backup</label><input id="restore-file" type="file" accept=".json,application/json"><p class="hint">Podrás revisar la copia antes de reemplazar tu perfil. Antes se descarga una copia del perfil actual.</p></div>
<div class="panel settings-panel"><div class="panel-head"><h2>Demo</h2></div><p>Prueba HT con datos de ejemplo en un perfil independiente. No modifica tu historia real.</p><div class="btn-stack"><button class="btn" data-action="demo">${isDemo() ? "Salir de la demo" : "Abrir demo"}</button></div><p class="hint mono">HT 0.1 · curva de niveles v1 · sin decay de XP</p><a class="link" href="/docs/first-approach.md">Propuesta de arquitectura ${icon("arrow", 13)}</a></div>
</div>`
  );
}
function timezones() {
  return [
    ...new Set([
      getState().profile.timezone,
      "Europe/Madrid",
      "Europe/London",
      "UTC",
      "America/Lima",
      "America/New_York",
      "Asia/Dubai",
    ]),
  ];
}

const nav = [
  ["/", "dashboard", "Inicio"],
  ["/inbox", "inbox", "Inbox"],
  ["/skills", "skills", "Skills"],
  ["/quests", "quests", "Quests"],
  ["/timeline", "timeline", "Timeline"],
  ["/activities", "history", "Historial"],
  ["/achievements", "achievements", "Logros"],
  ["/review", "review", "Revisión"],
  ["/profile", "profile", "Perfil"],
  ["/settings", "settings", "Ajustes"],
];
const isActive = (url, r) =>
  url === r || (url === "/skills" && r.startsWith("/skills/"));

function render() {
  const s = getState();
  if (!s) return;
  const r = route(),
    name = names[r] || (r.startsWith("/skills/") ? "Skill" : "Inicio"),
    pending = s.events.filter((e) => e.status === "pending").length;
  let body;
  switch (r) {
    case "/skills":
      body = skillsView();
      break;
    case "/quests":
      body = questsView();
      break;
    case "/timeline":
      body = timelineView();
      break;
    case "/achievements":
      body = achievementsView();
      break;
    case "/review":
      body = weeklyView();
      break;
    case "/profile":
      body = profileView();
      break;
    case "/settings":
      body = settingsView();
      break;
    case "/activities":
      body = activitiesView();
      break;
    case "/inbox":
      body = inboxView();
      break;
    default:
      body = r.startsWith("/skills/")
        ? skillDetail(r.split("/")[2])
        : dashboard();
  }
  const link = ([url, symbol, label]) =>
    `<a class="nav-link ${isActive(url, r) ? "active" : ""}" href="#${url}" ${url === r ? 'aria-current="page"' : ""}>${icon(symbol)}<span>${label}</span>${url === "/inbox" && pending ? `<span class="count">${pending}</span>` : ""}</a>`;
  const tabs = nav.slice(0, 4);
  const moreActive = !tabs.some(([url]) => isActive(url, r));
  app.innerHTML = `<div class="shell"><aside class="side"><a class="brand" href="#/"><span class="brand-mark">HT</span><span class="brand-text">Personal<br>progress</span></a><nav class="nav" aria-label="Principal"><p class="label">Progreso</p>${nav.slice(0, 5).map(link).join("")}<p class="label">Registro</p>${nav.slice(5, 8).map(link).join("")}<p class="label">Cuenta</p>${nav.slice(8).map(link).join("")}</nav><div class="side-foot"><div class="local-status"><span class="status-dot"></span>${isDemo() ? "Perfil demo" : "Guardado local"}</div><a class="user" href="#/profile"><span class="avatar">${esc(s.profile.avatar)}</span><span><strong>${esc(s.profile.name || "Tu personaje")}</strong><small>Ver ficha</small></span></a></div></aside><main class="main">${isDemo() ? `<div class="demo-banner"><span><b>Demo</b> · datos de ejemplo en un perfil independiente</span><button data-action="demo">Volver a mi perfil</button></div>` : ""}<header class="top"><a class="top-brand" href="#/"><span class="brand-mark">HT</span></a><div class="crumb"><span>ht</span><span class="sep">/</span><strong>${esc(name.toLowerCase())}</strong></div><div class="top-actions"><button class="btn btn-sm btn-quiet demo-trigger" data-action="demo">${isDemo() ? "Mi perfil" : "Ver demo"}</button><button class="btn btn-primary btn-sm" data-action="activity">${icon("plus", 14)} Registrar</button></div></header><div class="page page-in">${body}</div><footer class="foot"><span>HT · Personal progress</span><span>Sin decay de XP · sin puntuación global</span></footer></main><nav class="tabbar" aria-label="Navegación móvil">${tabs.map(link).join("")}<button class="nav-link ${moreActive ? "active" : ""}" data-action="more" aria-label="Más vistas">${icon("more")}<span>Más</span></button></nav></div>`;
}

/* ---------- Forms ---------- */

const skillOptions = (value) =>
  activeSkills()
    .map(
      (sk) =>
        `<option value="${esc(sk.id)}" ${value === sk.id ? "selected" : ""}>${esc(sk.icon)} ${esc(sk.name)}</option>`,
    )
    .join("");
function field(label, name, type = "text", value = "", extra = "") {
  return `<div class="field"><label for="f-${name}">${esc(label)}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${type === "datetime-local" ? 'step="0.001"' : ""} ${extra}></div>`;
}
function selectField(label, name, options) {
  return `<div class="field"><label for="f-${name}">${esc(label)}</label><select id="f-${name}" name="${name}">${options}</select></div>`;
}
function textarea(label, name, value = "") {
  return `<div class="field"><label for="f-${name}">${esc(label)}</label><textarea id="f-${name}" name="${name}" maxlength="3000">${esc(value)}</textarea></div>`;
}
function openForm(title, sub, type, content, id = "", submit = "Guardar") {
  modalContent.innerHTML = `<div class="modal-header"><div><h2>${esc(title)}</h2><p>${esc(sub)}</p></div><button class="icon-btn" data-action="close" aria-label="Cerrar">${icon("close", 18)}</button></div><form class="modal-body" data-form="${type}" data-id="${esc(id)}">${content}<p class="form-error" role="alert"></p><div class="modal-footer"><button type="button" class="btn btn-quiet" data-action="close">Cancelar</button><button type="submit" class="btn btn-primary">${esc(submit)}</button></div></form>`;
  if (!modal.open) modal.showModal();
}
function activityForm(skillId, title = "") {
  const chosen = skillId || activeSkills()[0]?.id;
  openForm(
    "Registrar actividad",
    "Lo que has hecho. Ajusta los detalles sólo si lo necesitas.",
    "activity",
    `<div class="segmented"><span class="selected">He practicado</span><button type="button" data-action="capture-milestone">He conseguido un hito →</button></div>` +
      field(
        "¿Qué has hecho?",
        "title",
        "text",
        title,
        'placeholder="Escribe una actividad o elige una sugerencia" maxlength="180" required',
      ) +
      selectField("Skill", "skillId", skillOptions(chosen)) +
      `<div class="chips capture-suggestions">${captureSuggestions(chosen)}</div><div class="field"><span class="field-label">Esfuerzo</span><div class="effort-picker">${[
        [10, "Pequeño"],
        [20, "Normal"],
        [40, "Intenso"],
        [60, "Extra"],
      ]
        .map(
          ([xp, label]) =>
            `<button type="button" class="${xp === 40 ? "selected" : ""}" data-action="xp-preset" data-xp="${xp}">${label}<small>+${xp} XP</small></button>`,
        )
        .join(
          "",
        )}</div></div><details class="more-options"><summary>Fecha, nota y más opciones</summary><div class="field-row">${field("XP", "xp", "number", "40", 'min="0" max="1000000" step="1" required')}${field("Fecha y hora (vacío = ahora)", "occurredAt", "datetime-local", "")}</div>` +
      textarea("Nota", "description") +
      field("Evidencia (URL)", "evidence", "url", "", 'placeholder="https://…"') +
      `<div class="field-row">` +
      selectField(
        "Quest relacionada",
        "questId",
        '<option value="">Ninguna</option>' +
          getState()
            .quests.filter((q) => q.status === "active")
            .map((q) => `<option value="${esc(q.id)}">${esc(q.name)}</option>`)
            .join(""),
      ) +
      field(
        "Progreso aportado",
        "questDelta",
        "number",
        "1",
        'min="0.01" max="1000000" step="any"',
      ) +
      `</div><label class="check-label"><input type="checkbox" name="isHistorical"> Actividad histórica</label></details>`,
    "",
    "Guardar actividad",
  );
  modal.querySelector('[name="title"]').focus();
}
function skillForm(id) {
  const sk = skBy(id);
  openForm(
    sk ? "Editar skill" : "Nueva skill",
    "Cada skill tiene su propio nivel y progreso.",
    "skill",
    field("Nombre", "name", "text", sk?.name || "", 'maxlength="60" required') +
      `<div class="field-row">${field("Símbolo", "icon", "text", sk?.icon || "✦", 'maxlength="12" required')}${field("Color", "color", "color", sk?.color || "#7c6ff7")}</div>` +
      textarea("Descripción", "description", sk?.description || ""),
    id || "",
  );
}
function baselineForm(id) {
  const eligible = activeSkills().filter(
    (sk) => !getState().ledger.some((x) => x.skillId === sk.id),
  );
  if (!eligible.length) {
    toast(
      "Todas tus skills ya tienen progreso. Crea una nueva skill para definir su punto de partida.",
    );
    return;
  }
  openForm(
    "Punto de partida",
    "Nivel aproximado antes de usar HT. Se registra en el ledger.",
    "baseline",
    selectField(
      "Skill",
      "skillId",
      eligible
        .map(
          (sk) =>
            `<option value="${esc(sk.id)}" ${sk.id === id ? "selected" : ""}>${esc(sk.name)}</option>`,
        )
        .join(""),
    ) +
      `<div class="field-row">` +
      field("Nivel inicial", "level", "number", "1", 'min="1" max="100" required') +
      field(
        "Fecha de corte",
        "cutoff",
        "datetime-local",
        datetimeInput(),
        "required",
      ) +
      `</div><p class="hint">La actividad importada anterior al corte se conserva como evidencia sin añadir la XP que ya representa el baseline. El baseline sólo se fija una vez.</p>`,
  );
}
function questForm() {
  openForm(
    "Nueva quest",
    "Un objetivo concreto y una recompensa por completarlo.",
    "quest",
    field(
      "Nombre",
      "name",
      "text",
      "",
      'placeholder="Ir al gimnasio 3 veces" maxlength="180" required',
    ) +
      selectField("Skill", "skillId", skillOptions()) +
      textarea("Descripción", "description") +
      `<div class="field-row">${field("Objetivo", "target", "number", "3", 'min="0.01" max="1000000" step="any" required')}${field("Unidad", "unit", "text", "sesiones", 'maxlength="40" required')}</div><div class="field-row">${field("Recompensa XP", "rewardXp", "number", "80", 'min="0" max="1000000" step="1" required')}${field("Fecha límite", "deadline", "date", "", 'min="' + localDay() + '"')}</div>`,
    "",
    "Crear quest",
  );
}
function milestoneForm(title = "", skillId = "") {
  openForm(
    "Nuevo hito",
    "Un resultado importante merece un lugar en tu historia.",
    "milestone",
    field(
      "Nombre del hito",
      "title",
      "text",
      title,
      'placeholder="Mi primer cliente de pago" maxlength="180" required',
    ) +
      `<details class="more-options"><summary>Fecha, skills y más detalles</summary>` +
      textarea("Historia", "description") +
      selectField(
        "Tipo",
        "type",
        [
          ["personal", "Personal"],
          ["first_client", "Primer cliente de pago"],
          ["first_company", "Primera empresa"],
          ["first_project", "Primera app publicada"],
          ["education", "Estudios"],
          ["project", "Proyecto"],
          ["fitness", "Fitness"],
        ]
          .map(([v, l]) => `<option value="${v}">${l}</option>`)
          .join(""),
      ) +
      `<div class="field-row">${selectField(
        "Precisión de fecha",
        "precision",
        [
          ["exact", "Fecha exacta"],
          ["month", "Mes y año"],
          ["year", "Sólo año"],
          ["unknown", "No la recuerdo"],
        ]
          .map(([v, l]) => `<option value="${v}">${l}</option>`)
          .join(""),
      )}${field("Fecha", "date", "date", localDay(), "required")}</div><div class="field"><span class="field-label">Skills relacionadas</span><div class="skill-checks">${activeSkills()
        .map(
          (sk) =>
            `<label><input type="checkbox" name="skillIds" value="${esc(sk.id)}" ${sk.id === skillId ? "checked" : ""}>${esc(sk.icon)} ${esc(sk.name)}</label>`,
        )
        .join("")}</div></div>` +
      field("Evidencia (URL)", "evidence", "url", "", 'placeholder="https://…"') +
      `<p class="hint">Un hito conserva un resultado. No concede XP automáticamente.</p></details>`,
    "",
    "Guardar hito",
  );
}
function onboarding() {
  openForm(
    "Empieza tu ficha",
    "Tu nombre y, si quieres, el nivel aproximado que ya tienes en cada skill.",
    "onboarding",
    field(
      "Tu nombre",
      "name",
      "text",
      "",
      'placeholder="¿Cómo te llamas?" maxlength="60" required',
    ) +
      `<div class="field-row">${field("Símbolo", "avatar", "text", "✦", 'maxlength="12" required')}${selectField(
        "Zona horaria",
        "timezone",
        timezones()
          .map((tz) => `<option>${esc(tz)}</option>`)
          .join(""),
      )}</div><div class="field"><span class="field-label">Nivel inicial · opcional</span><p class="hint">Deja 1 para empezar de cero. El resto se guarda como XP histórica.</p></div><div class="onboarding-skills">${activeSkills()
        .map(
          (sk) =>
            `<div class="baseline-row"><label for="base-${esc(sk.id)}">${esc(sk.icon)} ${esc(sk.name)}</label><input id="base-${esc(sk.id)}" name="base:${esc(sk.id)}" type="number" value="1" min="1" max="100" required aria-label="Nivel inicial de ${esc(sk.name)}"></div>`,
        )
        .join("")}</div>`,
    "",
    "Empezar mi aventura",
  );
}
function editEventForm(id) {
  const e = getState().events.find((e) => e.id === id);
  if (!e) return;
  openForm(
    "Revisar actividad",
    "Ajusta la propuesta antes de confirmarla.",
    "event-edit",
    field("Actividad", "title", "text", e.title, 'maxlength="180" required') +
      selectField("Skill", "skillId", skillOptions(e.skillId)) +
      `<div class="field-row">${field("XP propuesta", "xp", "number", e.xp, 'min="0" max="1000000" step="1" required')}${field("Fecha y hora", "occurredAt", "datetime-local", datetimeInput(e.occurredAt), "required")}</div>`,
    id,
    "Guardar cambios",
  );
}
function download(text, name, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function exportBackup() {
  download(backup(), `HT-${isDemo() ? "demo" : "backup"}-${localDay()}.json`);
  toast("Copia exportada. Guárdala para conservar tu historia.");
}
function filterEvents() {
  render();
}

/* ---------- Events ---------- */

app.addEventListener("change", async (e) => {
  const el = e.target;
  try {
    if (el.id === "heat-range") {
      heatRange = Number(el.value);
      render();
    } else if (el.id === "heat-metric") {
      heatMetric = el.value;
      render();
    } else if (el.id.startsWith("filter-")) {
      filters[el.id.slice(7)] = el.value;
      filterEvents();
    } else if (el.classList.contains("inbox-check")) {
      el.checked ? selected.add(el.value) : selected.delete(el.value);
      render();
    } else if (el.id === "calendar-file") {
      const file = el.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024)
        throw new Error("El calendario debe ocupar menos de 5 MB.");
      const skillId = document.querySelector("#calendar-skill").value;
      const parsed = parseICS(await file.text(), getState().profile.timezone);
      let imported = 0;
      await change((s) => {
        imported = importRecords(s, parsed.records, skillId);
      });
      toast(`${imported} eventos importados a Inbox`);
      toast(parsed.message);
      location.hash = "/inbox";
    } else if (el.id === "restore-file") {
      const file = el.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024)
        throw new Error("La copia debe ocupar menos de 10 MB.");
      restoreData = D.validateState(JSON.parse(await file.text()));
      openForm(
        "Restaurar backup",
        "La copia reemplazará el perfil actual de este navegador.",
        "restore",
        `<div class="notice">${esc(restoreData.profile.name || "Perfil")} · ${restoreData.events.length} actividades · ${restoreData.skills.length} skills · ${restoreData.ledger.length} transacciones de XP</div><p class="hint">Antes de restaurar se descargará una copia de tu perfil actual. No se mezclan dos historiales.</p>`,
        "",
        "Exportar actual y restaurar",
      );
    }
  } catch (err) {
    toast(err.message, "error");
  }
});
// Search keeps focus and caret while updating results.
app.addEventListener("input", (e) => {
  if (e.target.id === "filter-query") {
    const caret = e.target.selectionStart;
    filters.query = e.target.value;
    render();
    const el = document.querySelector("#filter-query");
    el.focus();
    el.setSelectionRange(caret, caret);
  }
});
modal.addEventListener("change", (e) => {
  if (e.target.name === "precision") {
    const el = modal.querySelector('[name="date"]'),
      v = e.target.value;
    el.type = v === "month" ? "month" : v === "year" ? "number" : "date";
    el.disabled = v === "unknown";
    el.required = v !== "unknown";
    el.value =
      v === "month"
        ? localDay().slice(0, 7)
        : v === "year"
          ? localDay().slice(0, 4)
          : localDay();
    if (v === "year") {
      el.min = "1";
      el.max = localDay().slice(0, 4);
    } else {
      el.removeAttribute("min");
      el.removeAttribute("max");
    }
  }
  if (e.target.name === "skillId" && modal.querySelector('[name="questId"]')) {
    const suggestionsEl = modal.querySelector(".capture-suggestions");
    if (suggestionsEl)
      suggestionsEl.innerHTML = captureSuggestions(e.target.value);
    const qel = modal.querySelector('[name="questId"]');
    qel.value = "";
    for (const o of qel.options) {
      const q = getState().quests.find((q) => q.id === o.value);
      o.disabled = !!q && q.skillId !== e.target.value;
    }
  }
});
async function action(el) {
  const act = el.dataset.action,
    id = el.dataset.id;
  switch (act) {
    case "close":
      modal.close();
      return;
    case "more": {
      const r = route();
      modalContent.innerHTML = `<div class="modal-header"><div><h2>Más vistas</h2><p>Todo tu progreso.</p></div><button class="icon-btn" data-action="close" aria-label="Cerrar">${icon("close", 18)}</button></div><nav class="modal-body sheet-nav">${nav
        .slice(4)
        .map(
          ([url, symbol, name]) =>
            `<button class="nav-link ${isActive(url, r) ? "active" : ""}" data-action="navigate" data-route="${url}">${icon(symbol)}<span>${name}</span></button>`,
        )
        .join(
          "",
        )}<button class="nav-link" data-action="demo">${icon("profile")}<span>${isDemo() ? "Volver a mi perfil real" : "Ver demo"}</span></button></nav>`;
      modal.showModal();
      return;
    }
    case "navigate":
      modal.close();
      location.hash = el.dataset.route;
      return;
    case "quick-log": {
      const skillId = el.dataset.skill;
      if (busy || quickLocks.has(skillId)) return;
      const sk = skBy(skillId);
      if (!sk) return;
      const [, title, xp] = quickFor(sk);
      quickLocks.add(skillId);
      el.disabled = true;
      try {
        const now = new Date().toISOString();
        await change(
          (s) => D.createEvent(s, { title, skillId, xp, occurredAt: now }, now),
          `${sk.name} · ${title} · +${xp} XP`,
        );
      } finally {
        setTimeout(() => {
          quickLocks.delete(skillId);
          const b = app.querySelector(
            `[data-action="quick-log"][data-skill="${CSS.escape(skillId)}"]`,
          );
          if (b) b.disabled = false;
        }, 900);
      }
      return;
    }
    case "activity":
      activityForm(el.dataset.skill);
      return;
    case "capture-milestone":
      milestoneForm(
        modal.querySelector("[name=title]").value,
        modal.querySelector("[name=skillId]").value,
      );
      return;
    case "capture-preset":
      modal.querySelector("[name=title]").value = el.dataset.title;
    case "xp-preset":
      modal.querySelector("[name=xp]").value = el.dataset.xp;
      modal
        .querySelectorAll(".effort-picker button")
        .forEach((b) =>
          b.classList.toggle("selected", b.dataset.xp === el.dataset.xp),
        );
      return;
    case "skill":
      skillForm(id);
      return;
    case "quest":
      questForm();
      return;
    case "milestone":
      milestoneForm();
      return;
    case "baseline":
      baselineForm(id);
      return;
    case "onboarding":
      onboarding();
      return;
    case "profile-edit":
      location.hash = "/settings";
      return;
    case "demo":
      if (busy) return;
      toggleDemo();
      selected.clear();
      modal.close();
      render();
      toast(
        isDemo()
          ? "Demo abierta. Tu perfil real sigue intacto."
          : "Has vuelto a tu perfil.",
      );
      return;
    case "export":
      exportBackup();
      return;
    case "quest-tab":
      questTab = el.dataset.tab;
      render();
      return;
    case "quest-abandon":
      await change(
        (s) => D.abandonQuest(s, id),
        "Quest abandonada. Tu XP se conserva.",
      );
      return;
    case "event-confirm":
      await change((s) => D.confirmEvent(s, id), "Actividad confirmada.");
      selected.delete(id);
      render();
      return;
    case "event-reject":
      await change(
        (s) => D.rejectEvent(s, id),
        "Actividad descartada, sin XP.",
      );
      selected.delete(id);
      render();
      return;
    case "event-edit":
      editEventForm(id);
      return;
    case "select-all": {
      const all = getState().events.filter((e) => e.status === "pending");
      selected.size === all.length
        ? selected.clear()
        : all.forEach((e) => selected.add(e.id));
      render();
      return;
    }
    case "bulk-confirm":
    case "bulk-reject": {
      const ids = [...selected];
      await change(
        (s) =>
          ids.forEach((id) =>
            act === "bulk-confirm"
              ? D.confirmEvent(s, id)
              : D.rejectEvent(s, id),
          ),
        `${ids.length} actividades ${act === "bulk-confirm" ? "confirmadas" : "descartadas"}.`,
      );
      selected.clear();
      render();
      return;
    }
    case "review-prev":
      reviewWeek = D.shiftDay(reviewWeek, -7);
      render();
      return;
    case "review-next":
      if (reviewWeek < D.weekStart(localDay()))
        reviewWeek = D.shiftDay(reviewWeek, 7);
      render();
      return;
    case "heat-day":
      filters = {
        skill: "",
        source: "",
        status: "confirmed",
        query: "",
        from: el.dataset.day,
        to: el.dataset.day,
        type: "",
      };
      location.hash = "/activities";
      return;
  }
}
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (el) {
    e.preventDefault();
    action(el).catch(() => {});
  }
});
document.addEventListener("submit", async (e) => {
  const form = e.target;
  if (!form.dataset.form) return;
  e.preventDefault();
  const btn = form.querySelector('button[type="submit"]');
  if (btn?.disabled) return;
  const data = new FormData(form),
    v = Object.fromEntries(data.entries()),
    type = form.dataset.form,
    id = form.dataset.id;
  const err = form.querySelector(".form-error");
  if (err) err.textContent = "";
  if (btn) btn.disabled = true;
  try {
    const now = new Date().toISOString();
    switch (type) {
      case "quick-start":
        activityForm(undefined, v.title);
        return;
      case "activity": {
        if (
          v.questId &&
          getState().quests.find((q) => q.id === v.questId)?.skillId !==
            v.skillId
        )
          throw new Error("La quest debe pertenecer a la misma skill.");
        await change(
          (s) =>
            D.createEvent(
              s,
              {
                ...v,
                occurredAt: v.occurredAt
                  ? zonedInput(v.occurredAt, s.profile.timezone)
                  : now,
                isHistorical: data.has("isHistorical"),
              },
              now,
            ),
          "Actividad registrada. Un paso más.",
        );
        break;
      }
      case "skill":
        await change(
          (s) => (id ? D.updateSkill(s, id, v) : D.addSkill(s, v)),
          id ? "Skill actualizada." : "Nueva skill creada.",
        );
        break;
      case "baseline":
        await change(
          (s) =>
            D.baseline(
              s,
              v.skillId,
              Number(v.level),
              zonedInput(v.cutoff, s.profile.timezone),
              now,
            ),
          "Tu punto de partida está registrado.",
        );
        break;
      case "quest":
        await change(
          (s) => D.createQuest(s, v, now),
          "Tu nueva quest está activa.",
        );
        break;
      case "quest-progress":
        await change(
          (s) => D.questProgress(s, id, v.progress, now),
          "Progreso actualizado.",
        );
        return;
      case "milestone":
        await change(
          (s) =>
            D.addMilestone(s, { ...v, skillIds: data.getAll("skillIds") }, now),
          "Hito guardado en tu historia.",
        );
        break;
      case "event-edit":
        await change(
          (s) =>
            D.editEvent(
              s,
              id,
              {
                ...v,
                occurredAt: zonedInput(v.occurredAt, s.profile.timezone),
              },
              now,
            ),
          "Propuesta actualizada.",
        );
        break;
      case "onboarding":
        await change((s) => {
          if (!v.name.trim()) throw new Error("Introduce tu nombre.");
          s.profile.name = v.name.trim();
          s.profile.avatar = v.avatar.trim() || "✦";
          s.profile.timezone = v.timezone;
          s.profile.onboarded = true;
          for (const sk of s.skills) {
            const l = Number(v["base:" + sk.id]);
            if (l > 1 && !s.ledger.some((x) => x.skillId === sk.id))
              D.baseline(s, sk.id, l, now, now);
          }
        }, "Perfil listo. Bienvenido.");
        break;
      case "reflection":
        await change((s) => {
          s.reflections[reviewWeek] = {
            wentWell: String(v.wentWell).slice(0, 10000),
            wentWrong: String(v.wentWrong).slice(0, 10000),
            nextFocus: String(v.nextFocus).slice(0, 10000),
            savedAt: now,
            summary: D.weeklySummary(s, reviewWeek),
          };
        }, "Reflexión guardada.");
        return;
      case "profile":
        await change((s) => {
          if (!v.name.trim() || !v.avatar.trim())
            throw new Error("Introduce un nombre y un símbolo.");
          s.profile.name = v.name.trim().slice(0, 60);
          s.profile.avatar = v.avatar.trim().slice(0, 12);
          new Intl.DateTimeFormat("es", { timeZone: v.timezone }).format();
          s.profile.timezone = v.timezone;
          s.profile.onboarded = true;
        }, "Perfil actualizado.");
        return;
      case "github": {
        btn.textContent = "Importando…";
        const since = v.since + "T00:00:00Z";
        if (+new Date(since) > +new Date())
          throw new Error("La fecha de inicio no puede ser futura.");
        const res = await fetch(
          `/api/github?username=${encodeURIComponent(v.username)}&since=${encodeURIComponent(since)}`,
        );
        const json = await res.json();
        if (!res.ok)
          throw new Error(json.error || "No se pudo consultar GitHub.");
        let added = 0;
        await change((s) => {
          s.integrations.github = v.username;
          added = importRecords(s, json.records, v.skillId);
          s.integrations.lastGithubSync = now;
        });
        toast(`${added} actividades nuevas en Inbox.`);
        toast(json.message);
        location.hash = "/inbox";
        return;
      }
      case "restore":
        exportBackup();
        {
          await restore(restoreData);
          restoreData = null;
          render();
          toast("Backup restaurado.");
        }
        break;
    }
    modal.close();
  } catch (error) {
    if (err) err.textContent = error.message;
    else toast(error.message, "error");
  } finally {
    if (btn?.isConnected) {
      btn.disabled = false;
      if (type === "github") btn.textContent = "Importar a Inbox";
    }
  }
});
window.addEventListener("hashchange", () => {
  selected.clear();
  render();
  window.scrollTo(0, 0);
});
modal.addEventListener("click", (e) => {
  if (e.target === modal) {
    const r = modal.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      modal.close();
  }
});
try {
  load();
  render();
  observe((error) => (error ? toast(error.message, "error") : render()));
} catch (error) {
  app.innerHTML = `<main class="fatal"><p class="label">Error</p><h1>No se pudo abrir tu historia.</h1><p>${esc(error.message)}. No se han borrado tus datos. Comprueba que el navegador permite almacenamiento local.</p></main>`;
}
