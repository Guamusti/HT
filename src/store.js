import {freshState,demoState,validateState} from './domain.js';
let demo=false;
let state;
const key=()=>demo?'ht-demo-v1':'ht-personal-v1';
const read=()=>{const raw=localStorage.getItem(key());return raw?validateState(JSON.parse(raw)):(demo?demoState():freshState());};
export function load(){state=read();if(!localStorage.getItem(key()))localStorage.setItem(key(),JSON.stringify(state));return state;}
export const getState=()=>state;
export const isDemo=()=>demo;
export function toggleDemo(){demo=!demo;return load();}
export async function mutate(fn) {
 const currentKey=key();
 const perform=()=>{if(currentKey!==key())throw new Error('El perfil ha cambiado. Inténtalo de nuevo.');const next=structuredClone(read());const oldCodes=new Set(next.unlocks.map(u=>u.code));const result=fn(next);next.updatedAt=new Date().toISOString();validateState(next);localStorage.setItem(currentKey,JSON.stringify(next));state=next;return {result,unlocks:next.unlocks.filter(u=>!oldCodes.has(u.code))};};
 // Web Locks serialize mutations across tabs; localStorage commits the complete ledger atomically.
 return navigator.locks?navigator.locks.request(currentKey,perform):perform();
}
export async function restore(snapshot){validateState(snapshot);return mutate(s=>{for(const k of Object.keys(s))delete s[k];Object.assign(s,structuredClone(snapshot));});}
export function backup(){return JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2);}
export function observe(onChange){window.addEventListener('storage',e=>{if(e.key===key()){try{state=read();onChange();}catch{onChange(new Error('No se pudieron leer los datos actualizados.'));}}});}
