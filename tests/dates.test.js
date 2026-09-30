import test from 'node:test';
import assert from 'node:assert/strict';
import {localDateTime,zonedInput} from '../src/dates.js';
test('datetime capture preserves sub-second precision after a baseline',()=>{const iso='2026-09-30T20:00:00.783Z';const local=localDateTime(iso,'Europe/Madrid');assert.equal(local,'2026-09-30T22:00:00.783');assert.equal(zonedInput(local,'Europe/Madrid'),iso);});
test('timezone interpretation follows summer and winter offsets',()=>{assert.equal(zonedInput('2026-09-30T12:00','Europe/Madrid'),'2026-09-30T10:00:00.000Z');assert.equal(zonedInput('2026-12-30T12:00','Europe/Madrid'),'2026-12-30T11:00:00.000Z');});
test('nonexistent local times during spring DST are rejected',()=>{assert.throws(()=>zonedInput('2026-03-29T02:30','Europe/Madrid'));});
