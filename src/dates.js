export function localDateTime(iso,tz){
 const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',fractionalSecondDigits:3,hour12:false}).formatToParts(new Date(iso));
 const part=k=>parts.find(x=>x.type===k)?.value||'000';
 return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}.${part('fractionalSecond')}`;
}
export function zonedInput(value,tz){
 const base=+new Date(value+'Z');if(!Number.isFinite(base))throw new Error('Fecha no válida.');
 let guess=base;for(let i=0;i<3;i++){const displayed=+new Date(localDateTime(guess,tz)+'Z');guess+=base-displayed;}
 const result=new Date(guess).toISOString();
 if(+new Date(localDateTime(result,tz)+'Z')!==base)throw new Error('Esta hora no existe en la zona horaria seleccionada (cambio de horario).');
 return result;
}
