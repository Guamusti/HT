export const VERSION = 1;
export const uid = () => crypto.randomUUID();
export const threshold = l => 50 * (Math.min(100, Math.max(1, l)) - 1) ** 2;
export const level = xp => Math.min(100, Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1);
export const presets = [
 ['Programming','⌘','Construir y comprender software','#9b88ff'],
 ['Business','◈','Crear valor y desarrollar proyectos','#f0be70'],
 ['Finance','↗','Entender el dinero y las decisiones','#65cdb3'],
 ['Mathematics','∑','Resolver problemas y pensar con rigor','#81b9ec'],
 ['Fitness','⚡','Fuerza, resistencia y movimiento','#fb917c'],
 ['Reading','▤','Descubrir ideas a través de libros','#d29ce2'],
 ['Networking','◎','Conectar y aprender de otras personas','#75c4c3'],
 ['Writing','✎','Expresar ideas con claridad','#d4b690'],
 ['Languages','文','Comprender y comunicar en otros idiomas','#91a9ff'],
 ['Philosophy','◇','Preguntar, razonar y explorar ideas','#abb993']
];
export function freshState() {
 const now = new Date().toISOString();
 return {version:VERSION, profile:{name:'',avatar:'✦',timezone:'Europe/Madrid',createdAt:now,onboarded:false},
 skills:presets.map(([name,icon,description,color])=>({id:uid(),name,icon,description,color,createdAt:now,curveVersion:1})),
 events:[],ledger:[],quests:[],milestones:[],unlocks:[],reflections:{},integrations:{github:''},updatedAt:now};
}
export const xpFor = (s,id) => s.ledger.filter(x=>x.skillId===id).reduce((n,x)=>n+x.amount,0);
export function progress(s,id) {
 const xp=xpFor(s,id),l=level(xp),start=threshold(l),end=l===100?start:threshold(l+1);
 return {xp,level:l,remaining:l===100?0:end-xp,earned:xp-start,needed:end-start,fraction:l===100?1:(xp-start)/(end-start)};
}
export function dayKey(instant,tz='Europe/Madrid') {
 const parts = new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(instant));
 return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');
}
export function shiftDay(key,days) { const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10); }
export function weekStart(key) {const d=new Date(key+'T12:00:00Z');return shiftDay(key,-((d.getUTCDay()+6)%7));}
export const confirmed = s=>s.events.filter(e=>e.status==='confirmed');
export function streaks(s,now=new Date()) {
 const days=[...new Set(confirmed(s).map(e=>dayKey(e.occurredAt,s.profile.timezone)))].sort();
 let best=0,run=0,prev;
 for(const d of days){run=prev&&shiftDay(prev,1)===d?run+1:1;best=Math.max(best,run);prev=d;}
 const active=new Set(days),today=dayKey(now,s.profile.timezone);
 let date=active.has(today)?today:shiftDay(today,-1),current=0;
 while(active.has(date)){current++;date=shiftDay(date,-1);}
 return {current,best,totalDays:days.length};
}
function requiredText(v,label,max=180){if(typeof v!=='string'||!v.trim()||v.length>max)throw new Error(`${label}: introduce un texto válido (máximo ${max}).`);return v.trim();}
function positive(v,label,max=1000000){const n=Number(v);if(!Number.isFinite(n)||n<0||n>max)throw new Error(`${label}: valor no válido.`);return n;}
function activityDate(v,now){const d=new Date(v);if(Number.isNaN(+d)||d>new Date(now))throw new Error('La actividad debe tener una fecha válida, hasta ahora.');return d.toISOString();}
export function addSkill(s,data,now=new Date().toISOString()) {
 const sk={id:uid(),name:requiredText(data.name,'Nombre',60),icon:requiredText(data.icon||'✦','Icono',12),description:String(data.description||'').slice(0,1000),color:/^#[0-9a-f]{6}$/i.test(data.color||'')?data.color:'#9b88ff',curveVersion:1,createdAt:now};
 if(s.skills.filter(x=>!x.archived).length>=15)throw new Error('Esta primera versión admite hasta 15 skills activas.');
 s.skills.push(sk);return sk;
}
export function updateSkill(s,id,data){const sk=s.skills.find(x=>x.id===id);if(!sk)throw new Error('Skill no encontrada.');sk.name=requiredText(data.name,'Nombre',60);sk.icon=requiredText(data.icon||'✦','Icono',12);sk.description=String(data.description||'').slice(0,1000);if(/^#[0-9a-f]{6}$/i.test(data.color||''))sk.color=data.color;}
function award(s,{skillId,amount,type,reason,sourceId,effectiveAt,now=new Date().toISOString()}) {
 const key=`${type}:${sourceId}`;
 if(s.ledger.some(x=>x.key===key))return;
 const n=positive(amount,'XP');if(!Number.isInteger(n))throw new Error('XP debe ser un número entero.');
 s.ledger.push({id:uid(),key,skillId,amount:n,type,reason,sourceId,effectiveAt,createdAt:now,curveVersion:1});
}
export function baseline(s,skillId,l,cutoff,now=new Date().toISOString()) {
 const sk=s.skills.find(x=>x.id===skillId);if(!sk)throw new Error('Skill no encontrada.');
 if(s.ledger.some(x=>x.skillId===skillId))throw new Error('La skill ya tiene progreso. El baseline sólo se define una vez al empezar.');
 const n=Number(l);if(!Number.isInteger(n)||n<1||n>100)throw new Error('Nivel inicial entre 1 y 100.');
 sk.baselineCutoff=activityDate(cutoff,now);
 award(s,{skillId,amount:threshold(n),type:'initial_baseline',reason:'Historical progress before joining',sourceId:skillId,effectiveAt:sk.baselineCutoff,now});
 checkAchievements(s,now);
}
export function createEvent(s,data,now=new Date().toISOString()) {
 const sk=s.skills.find(x=>x.id===data.skillId&&!x.archived);if(!sk)throw new Error('Selecciona una skill activa.');
 const xp=positive(data.xp,'XP');if(!Number.isInteger(xp))throw new Error('XP debe ser entero.');
 const date=activityDate(data.occurredAt||now,now);
 const keys=Array.isArray(data.externalKeys)?data.externalKeys:[];
 if(keys.some(k=>s.events.some(e=>(e.externalKeys||[]).includes(k))))return null;
 const src=['github','calendar'].includes(data.source)?data.source:'manual';
 const evidence=String(data.evidence||'').slice(0,2000);if(evidence&&!/^https?:\/\//i.test(evidence))throw new Error('La evidencia debe ser una URL http o https.');
 const ev={id:uid(),title:requiredText(data.title,'Actividad'),description:String(data.description||'').slice(0,3000),skillId:sk.id,xp,occurredAt:date,createdAt:now,source:src,status:'pending',evidence,externalKeys:keys,isHistorical:!!data.isHistorical,xpMode:sk.baselineCutoff&&date<=sk.baselineCutoff?'evidence_only':'award',questId:data.questId||null,questDelta:data.questId?positive(data.questDelta||1,'Progreso'):0};
 s.events.push(ev);if(src==='manual')confirmEvent(s,ev.id,now);return ev;
}
export function editEvent(s,id,data,now=new Date().toISOString()) {
 const e=s.events.find(x=>x.id===id);if(!e||e.status!=='pending')throw new Error('Sólo se pueden editar actividades pendientes.');
 const sk=s.skills.find(x=>x.id===data.skillId&&!x.archived);if(!sk)throw new Error('Skill no encontrada.');
 const xp=positive(data.xp,'XP');if(!Number.isInteger(xp))throw new Error('XP debe ser entero.');
 e.title=requiredText(data.title,'Actividad');e.skillId=sk.id;e.xp=xp;e.occurredAt=activityDate(data.occurredAt,now);e.xpMode=sk.baselineCutoff&&e.occurredAt<=sk.baselineCutoff?'evidence_only':'award';
}
export function confirmEvent(s,id,now=new Date().toISOString()) {
 const e=s.events.find(x=>x.id===id);if(!e)throw new Error('Actividad no encontrada.');if(e.status==='confirmed')return e;
 if(e.status==='rejected')throw new Error('La actividad fue descartada.');
 const sk=s.skills.find(x=>x.id===e.skillId);if(!sk)throw new Error('Skill no encontrada.');
 e.xpMode=sk.baselineCutoff&&e.occurredAt<=sk.baselineCutoff?'evidence_only':'award';
 if(e.xpMode==='award')award(s,{skillId:e.skillId,amount:e.xp,type:'activity',reason:e.title,sourceId:e.id,effectiveAt:e.occurredAt,now});
 e.status='confirmed';e.confirmedAt=now;
 if(e.questId&&e.xpMode==='award')contributeQuest(s,e.questId,e.id,e.questDelta,now);
 checkAchievements(s,now);return e;
}
export function rejectEvent(s,id) {const e=s.events.find(x=>x.id===id);if(!e||e.status!=='pending')throw new Error('Sólo puedes descartar pendientes.');e.status='rejected';}
export function createQuest(s,data,now=new Date().toISOString()) {
 if(!s.skills.some(sk=>sk.id===data.skillId&&!sk.archived))throw new Error('Selecciona una skill.');
 const target=positive(data.target,'Objetivo'),reward=positive(data.rewardXp,'Recompensa');
 if(target===0||!Number.isInteger(reward))throw new Error('Objetivo mayor que cero y XP entero.');
 if(data.deadline&&dayKey(now,s.profile.timezone)>data.deadline)throw new Error('El deadline debe ser hoy o posterior.');
 const q={id:uid(),name:requiredText(data.name,'Quest'),description:String(data.description||'').slice(0,1000),skillId:data.skillId,startedAt:now,deadline:data.deadline||null,target,unit:requiredText(data.unit||'veces','Unidad',40),progress:0,rewardXp:reward,status:'active',contributions:[]};s.quests.push(q);return q;
}
export function questProgress(s,id,value,now=new Date().toISOString()) {
 const q=s.quests.find(x=>x.id===id);if(!q||q.status!=='active')throw new Error('La quest ya no está activa.');
 q.progress=positive(value,'Progreso');
 if(q.progress>=q.target){q.status='completed';q.completedAt=now;award(s,{skillId:q.skillId,amount:q.rewardXp,type:'quest_reward',reason:`Quest: ${q.name}`,sourceId:q.id,effectiveAt:now,now});}
 checkAchievements(s,now);return q;
}
function contributeQuest(s,id,eventId,delta,now) {const q=s.quests.find(x=>x.id===id);const e=s.events.find(x=>x.id===eventId);if(!q||q.status!=='active'||q.skillId!==e.skillId||q.contributions.includes(eventId))return;q.contributions.push(eventId);questProgress(s,id,q.progress+delta,now);}
export function abandonQuest(s,id) {const q=s.quests.find(x=>x.id===id);if(!q||q.status!=='active')throw new Error('Quest no activa.');q.status='abandoned';}
export const achievementCatalog = [
 {code:'first-activity',icon:'✦',name:'The first step',description:'Registrar tu primera actividad confirmada.',type:'events',target:1},
 {code:'hundred-events',icon:'◆',name:'Practice makes progress',description:'Confirmar 100 actividades.',type:'events',target:100},
 {code:'streak-7',icon:'⚡',name:'Finding your rhythm',description:'Una racha de 7 días activos.',type:'streak',target:7},
 {code:'streak-30',icon:'☀',name:'A month of momentum',description:'Una racha de 30 días activos.',type:'streak',target:30},
 {code:'first-quest',icon:'⚑',name:'Quest accomplished',description:'Completar tu primera quest.',type:'quests',target:1},
 {code:'commits-100',icon:'⌘',name:'Committed',description:'Confirmar 100 commits importados de GitHub.',type:'commits',target:100},
 {code:'first-client',icon:'♜',name:'First paying customer',description:'Conseguir tu primer cliente de pago.',type:'milestone',target:'first_client'},
 {code:'first-company',icon:'◈',name:'Builder',description:'Crear tu primera empresa.',type:'milestone',target:'first_company'},
 {code:'first-project',icon:'▣',name:'Into the world',description:'Publicar tu primera aplicación.',type:'milestone',target:'first_project'}
];
export function catalog(s) {return [...achievementCatalog,...s.skills.flatMap(sk=>[10,20,50,100].map(n=>({code:`skill:${sk.id}:${n}`,icon:sk.icon,name:`${sk.name} · Level ${n}`,description:`Alcanzar Level ${n} en ${sk.name}.`,type:'level',skillId:sk.id,target:n})))];}
export function checkAchievements(s,now=new Date().toISOString()) {
 const counts={events:confirmed(s).length,streak:streaks(s,now).best,quests:s.quests.filter(q=>q.status==='completed').length,commits:confirmed(s).filter(e=>e.source==='github'&&e.externalKind==='commit').length};
 for(const a of catalog(s)) {
  if(s.unlocks.some(u=>u.code===a.code))continue;
  if(a.type==='milestone')continue;
  const val=a.type==='level'?level(xpFor(s,a.skillId)):counts[a.type];
  if(val>=a.target){const isHistorical=a.type==='level'&&s.ledger.filter(x=>x.skillId===a.skillId).every(x=>x.type==='initial_baseline');const sk=s.skills.find(x=>x.id===a.skillId);s.unlocks.push({id:uid(),code:a.code,createdAt:now,unlockedAt:isHistorical?sk.baselineCutoff:now,precision:'exact',isHistorical});}
 }
}
export function addMilestone(s,data,now=new Date().toISOString()) {
 const precision=data.precision||'exact';if(!['exact','month','year','unknown'].includes(precision))throw new Error('Precisión no válida.');
 let date=null;
 if(precision!=='unknown'){
  const re=precision==='exact'?/^\d{4}-\d{2}-\d{2}$/:precision==='month'?/^\d{4}-\d{2}$/:/^\d{4}$/;
  if(!re.test(data.date||''))throw new Error('Introduce una fecha con la precisión seleccionada.');
  date=data.date;const full=precision==='year'?date+'-01-01':precision==='month'?date+'-01':date;
  const d=new Date(full+'T12:00:00Z');if(Number.isNaN(+d)||d.toISOString().slice(0,10)!==full||full>dayKey(now,s.profile.timezone))throw new Error('Fecha histórica no válida.');
 }
 const evidence=String(data.evidence||'');if(evidence&&!/^https?:\/\//i.test(evidence))throw new Error('La evidencia debe ser una URL http o https.');
 const m={id:uid(),title:requiredText(data.title,'Milestone'),description:String(data.description||'').slice(0,3000),precision,date,skillIds:(data.skillIds||[]).filter(id=>s.skills.some(sk=>sk.id===id)),type:data.type||'personal',evidence,isHistorical:true,createdAt:now};s.milestones.push(m);
 const a=achievementCatalog.find(a=>a.type==='milestone'&&a.target===m.type);
 if(a&&!s.unlocks.some(x=>x.code===a.code))s.unlocks.push({id:uid(),code:a.code,createdAt:now,unlockedAt:date,precision,isHistorical:true,milestoneId:m.id});
 return m;
}
export function weeklySummary(s,start) {
 const end=shiftDay(start,7),within=i=>{const d=dayKey(i,s.profile.timezone);return d>=start&&d<end;};
 const events=confirmed(s).filter(e=>within(e.occurredAt)&&!e.isHistorical);
 const ledger=s.ledger.filter(x=>x.type!=='initial_baseline'&&within(x.effectiveAt)&&!s.events.find(e=>e.id===x.sourceId)?.isHistorical);
 const perSkill=s.skills.map(sk=>({...sk,xp:ledger.filter(x=>x.skillId===sk.id).reduce((n,x)=>n+x.amount,0)})).filter(sk=>sk.xp>0).sort((a,b)=>b.xp-a.xp);
 return {xp:ledger.reduce((n,x)=>n+x.amount,0),activityXp:ledger.filter(x=>x.type==='activity').reduce((n,x)=>n+x.amount,0),questXp:ledger.filter(x=>x.type==='quest_reward').reduce((n,x)=>n+x.amount,0),events:events.length,quests:s.quests.filter(q=>q.status==='completed'&&within(q.completedAt)),unlocks:s.unlocks.filter(u=>!u.isHistorical&&u.precision==='exact'&&within(u.unlockedAt)),historical:confirmed(s).filter(e=>e.isHistorical&&within(e.occurredAt)).length,perSkill};
}
export function timeline(s) {
 const rows=confirmed(s).map(e=>({id:e.id,type:'activity',title:e.title,date:e.occurredAt,precision:'exact',skillIds:[e.skillId],xp:e.xpMode==='award'?e.xp:0,source:e.source,isHistorical:e.isHistorical,description:e.description}));
 for(const q of s.quests.filter(x=>x.status==='completed'))rows.push({id:q.id,type:'quest',title:q.name,date:q.completedAt,precision:'exact',skillIds:[q.skillId],xp:q.rewardXp});
 for(const m of s.milestones)rows.push({...m,type:'milestone',date:m.date,skillIds:m.skillIds,xp:0});
 for(const u of s.unlocks){const a=catalog(s).find(a=>a.code===u.code);rows.push({id:u.id,type:'achievement',title:a?.name||u.code,description:a?.description,date:u.unlockedAt,precision:u.precision,skillIds:a?.skillId?[a.skillId]:(s.milestones.find(m=>m.id===u.milestoneId)?.skillIds||[]),isHistorical:u.isHistorical,xp:0});}
 for(const sk of s.skills){let total=0;for(const x of s.ledger.filter(x=>x.skillId===sk.id).sort((a,b)=>a.effectiveAt.localeCompare(b.effectiveAt)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))){const before=level(total);total+=x.amount;const after=level(total);if(after>before)rows.push({id:'level:'+x.id,type:'level',title:`${sk.name} → Level ${after}`,description:x.type==='initial_baseline'?'Punto de partida histórico':`Level ${before} → ${after}`,date:x.effectiveAt,precision:'exact',skillIds:[sk.id],xp:0,isHistorical:x.type==='initial_baseline'});}}
 return rows.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
}
export function validateState(s) {
 const validDate=v=>typeof v==='string'&&Number.isFinite(+new Date(v));
 if(!s||s.version!==VERSION||!s.profile||!['skills','events','ledger','quests','milestones','unlocks'].every(k=>Array.isArray(s[k]))||!s.reflections||typeof s.reflections!=='object'||!s.integrations||typeof s.integrations!=='object')throw new Error('No es un backup de HT compatible.');
 if(typeof s.profile.name!=='string'||typeof s.profile.avatar!=='string'||!validDate(s.profile.createdAt))throw new Error('Perfil inválido.');
 new Intl.DateTimeFormat('es',{timeZone:s.profile.timezone}).format();
 for(const key of ['skills','events','ledger','quests','milestones','unlocks']){
  const list=s[key];if(list.length>100000||new Set(list.map(x=>x.id)).size!==list.length||list.some(x=>typeof x.id!=='string'))throw new Error('Identificadores o tamaño de backup inválidos.');
 }
 const ids=new Set(s.skills.map(x=>x.id));if(s.skills.length>100)throw new Error('Skills inválidas.');
 for(const sk of s.skills)if(typeof sk.name!=='string'||typeof sk.icon!=='string'||!/^#[0-9a-f]{6}$/i.test(sk.color)||!validDate(sk.createdAt))throw new Error('Skill inválida.');
 const externalKeys=new Set();
 for(const e of s.events){
  if(!ids.has(e.skillId)||typeof e.title!=='string'||!['pending','confirmed','rejected'].includes(e.status)||!['manual','github','calendar'].includes(e.source)||!['award','evidence_only'].includes(e.xpMode)||!Number.isSafeInteger(e.xp)||e.xp<0||!validDate(e.occurredAt)||!Array.isArray(e.externalKeys))throw new Error('Actividades inválidas.');
  for(const key of e.externalKeys){if(typeof key!=='string'||externalKeys.has(key))throw new Error('Evidencias externas duplicadas.');externalKeys.add(key);}
 }
 for(const q of s.quests)if(!ids.has(q.skillId)||typeof q.name!=='string'||!['active','completed','abandoned'].includes(q.status)||!(q.target>0)||!Number.isFinite(q.progress)||q.progress<0||!Number.isSafeInteger(q.rewardXp)||q.rewardXp<0||!Array.isArray(q.contributions)||(q.status==='completed'&&!validDate(q.completedAt)))throw new Error('Quests inválidas.');
 const keys=new Set();
 for(const x of s.ledger){
  if(!ids.has(x.skillId)||!Number.isSafeInteger(x.amount)||x.amount<0||typeof x.key!=='string'||keys.has(x.key)||!['activity','quest_reward','initial_baseline'].includes(x.type)||!validDate(x.effectiveAt)||!validDate(x.createdAt))throw new Error('Ledger inválido o duplicado.');
  keys.add(x.key);
  if(x.key!==`${x.type}:${x.sourceId}`)throw new Error('Clave de transacción inválida.');
  if(x.type==='activity'){const e=s.events.find(e=>e.id===x.sourceId);if(!e||e.status!=='confirmed'||e.xpMode!=='award'||e.skillId!==x.skillId||e.xp!==x.amount)throw new Error('Transacción sin actividad confirmada coherente.');}
  if(x.type==='quest_reward'){const q=s.quests.find(q=>q.id===x.sourceId);if(!q||q.status!=='completed'||q.skillId!==x.skillId||q.rewardXp!==x.amount)throw new Error('Recompensa de quest inválida.');}
  if(x.type==='initial_baseline'&&x.sourceId!==x.skillId)throw new Error('Baseline inválido.');
 }
 for(const e of s.events)if(e.status==='confirmed'&&e.xpMode==='award'&&!keys.has(`activity:${e.id}`))throw new Error('Actividad confirmada sin ledger.');
 for(const m of s.milestones)if(typeof m.title!=='string'||!['exact','month','year','unknown'].includes(m.precision)||!Array.isArray(m.skillIds)||m.skillIds.some(id=>!ids.has(id))||(m.precision!=='unknown'&&!validDate(m.date)))throw new Error('Milestones inválidos.');
 if(new Set(s.unlocks.map(u=>u.code)).size!==s.unlocks.length)throw new Error('Achievements duplicados.');
 for(const u of s.unlocks)if(typeof u.code!=='string'||!['exact','month','year','unknown'].includes(u.precision)||(u.precision!=='unknown'&&!validDate(u.unlockedAt)))throw new Error('Achievement inválido.');
 return s;
}
export function demoState(now=new Date().toISOString()) {
 const s=freshState();s.profile={...s.profile,name:'Marcos',avatar:'✦',onboarded:true};
 const cutoff=new Date(+new Date(now)-30*86400000).toISOString();baseline(s,s.skills[0].id,18,cutoff,cutoff);baseline(s,s.skills[1].id,10,cutoff,cutoff);baseline(s,s.skills[4].id,5,cutoff,cutoff);
 const qs=createQuest(s,{name:'Entrenar 3 veces esta semana',skillId:s.skills[4].id,target:3,unit:'sesiones',rewardXp:80},now);
 for(let i=13;i>=0;i--){if([12,9,6].includes(i))continue;const date=new Date(+new Date(now)-i*86400000).toISOString();const sk=i%3===0?s.skills[4]:s.skills[i%2];createEvent(s,{title:i%3===0?'Sesión de gimnasio':i%2?'Reunión y propuesta a un cliente':'Trabajar en el MVP de HT',skillId:sk.id,xp:i%3===0?40:50,occurredAt:date,questId:sk.id===qs.skillId?qs.id:null,questDelta:1},date);}
 createQuest(s,{name:'Leer 20 páginas',skillId:s.skills[5].id,target:20,unit:'páginas',rewardXp:50},now);
 createQuest(s,{name:'Publicar el MVP de HT',skillId:s.skills[0].id,target:5,unit:'entregables',rewardXp:100},now);
 addMilestone(s,{title:'Primer cliente de pago',type:'first_client',precision:'month',date:'2025-12',skillIds:[s.skills[1].id],description:'Un proyecto se convierte en un negocio.'},now);
 const e=createEvent(s,{title:'7 commits en HT',skillId:s.skills[0].id,xp:35,source:'github',externalKeys:['demo:github:7'],occurredAt:now},now);e.externalKind='commit';
 return s;
}
