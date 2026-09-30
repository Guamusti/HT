import {createEvent} from './domain.js';
function unescapeText(text=''){return text.replace(/\\[nN]/g,'\n').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\');}
function parseDate(value,params,tz){
 const m=/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value);
 if(!m)throw new Error('Fecha iCalendar no soportada.');
 const iso=`${m[1]}-${m[2]}-${m[3]}T${m[4]||'00'}:${m[5]||'00'}:${m[6]||'00'}`;
 const base=+new Date(iso+'Z');if(!Number.isFinite(base))throw new Error('Fecha no válida.');
 if(m[7])return new Date(base).toISOString();
 const zone=params.TZID?.replace(/^"|"$/g,'')||tz;
 let guess=base;
 for(let i=0;i<3;i++){
  const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(guess));
  guess+=base-(+new Date(parts.replace(' ','T')+'Z'));
 }
 return new Date(guess).toISOString();
}
export function parseICS(text,tz='Europe/Madrid',now=new Date().toISOString()) {
 if(!text.includes('BEGIN:VCALENDAR'))throw new Error('Selecciona un archivo iCalendar (.ics) válido.');
 const lines=text.replace(/\r\n/g,'\n').replace(/\n[ \t]/g,'').split('\n'),records=[];
 let event=null,skip=0,recurring=0,cancelled=0,future=0,withoutUid=0;
 for(const line of lines){
  if(line==='BEGIN:VEVENT'){event={};continue;}
  if(line==='END:VEVENT'){
   if(!event)continue;
   try{
    if(event.STATUS?.value==='CANCELLED'){cancelled++;continue;}
    if(event.RRULE||event.RDATE||event.EXDATE){recurring++;continue;}
    if(!event.UID){withoutUid++;continue;}
    if(!event.DTSTART){skip++;continue;}
    const start=parseDate(event.DTSTART.value,event.DTSTART.params,tz);
    const end=event.DTEND?parseDate(event.DTEND.value,event.DTEND.params,tz):new Date(+new Date(start)+(event.DTSTART.value.length===8?86400000:0)).toISOString();
    if(+new Date(end)>+new Date(now)||+new Date(start)>+new Date(now)){future++;continue;}
    const minutes=Math.max(0,(+new Date(end)-+new Date(start))/60000);
    const rec=event['RECURRENCE-ID']?.value||event.DTSTART.value;
    records.push({title:unescapeText(event.SUMMARY?.value||'Actividad de calendario').slice(0,180),description:unescapeText(event.DESCRIPTION?.value||'').slice(0,3000),occurredAt:start,source:'calendar',xp:Math.min(60,Math.max(10,Math.round(minutes/60)*10)),externalKeys:[`calendar:${event.UID.value}:${rec}`],externalKind:'calendar'});
   }catch{skip++;}finally{event=null;}
   continue;
  }
  if(event){const i=line.indexOf(':');if(i<0)continue;const [name,...raw]=line.slice(0,i).split(';');const params={};for(const p of raw){const eq=p.indexOf('=');if(eq>0)params[p.slice(0,eq)]=p.slice(eq+1);}event[name]={value:line.slice(i+1),params};}
 }
 return {records,message:`Calendario: ${records.length} eventos pasados. Omitidos: ${future} futuros, ${recurring} series recurrentes sin expansión, ${cancelled} cancelados, ${skip+withoutUid} no compatibles. No se ha concedido XP.`};
}
export function importRecords(s,records,skillId,now=new Date().toISOString()) {
 let added=0;
 for(const record of records){
  if(!record.externalKeys?.length)continue;
  const event=createEvent(s,{...record,skillId,isHistorical:new Date(record.occurredAt)<new Date(s.profile.createdAt)},now);
  if(event){event.externalKind=record.externalKind;added++;}
 }
 return added;
}
