import test from 'node:test';
import assert from 'node:assert/strict';
import {checkPublicReadiness} from './monitor.mjs';

test('a public ready response is healthy', async () => {
  let calls = 0;
  const result = await checkPublicReadiness(async () => {
    calls++;
    return {ok: true, json: async () => ({status: 'ready'})};
  }, '2026-10-26T00:00:00.000Z');
  assert.equal(calls, 1);
  assert.deepEqual(result, {checkedAt: '2026-10-26T00:00:00.000Z', status: 'healthy', issues: []});
});

test('unavailable or non-ready responses fail closed after three bounded attempts', async () => {
  let calls = 0;
  const result = await checkPublicReadiness(async () => {
    calls++;
    if (calls === 1) throw Error('network');
    return {ok: true, json: async () => ({status: 'degraded'})};
  });
  assert.equal(calls, 3);
  assert.deepEqual(result.issues, ['SERVICE_NOT_READY']);
  assert.equal(result.status, 'attention');
});
