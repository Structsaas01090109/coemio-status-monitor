import {pathToFileURL} from 'node:url';
import {deliverOperationsReport} from './packages/commercial/operations-mail-delivery.mjs';
import {sendOperationsMail} from './packages/commercial/operations-mail.mjs';

const repository = 'Structsaas01090109/coemio-status-monitor';
const readyUrl = 'https://coemio-prelaunch.onrender.com/api/staging/ready';
const env = process.env;

export async function checkPublicReadiness(fetchImpl = fetch, checkedAt = new Date().toISOString()) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetchImpl(readyUrl, {
        redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: {'cache-control': 'no-cache'},
      });
      if (response.ok && (await response.json()).status === 'ready')
        return {checkedAt, status: 'healthy', issues: []};
    } catch { /* A failed check is never healthy. */ }
  }
  return {checkedAt, status: 'attention', issues: ['SERVICE_NOT_READY']};
}

async function run() {
  const drill = process.argv.includes('--drill');
  const statePath = `monitor-state/${drill ? 'drill' : 'production'}.json`;
  if (env.GITHUB_REPOSITORY !== repository || !env.GITHUB_TOKEN ||
      !env.COEMIO_RESEND_API_KEY || !env.COEMIO_EMAIL_FROM ||
      env.COEMIO_OPERATIONS_EMAIL_TO !== 'info@struct-saas.com') throw Error('MONITOR_CONFIG');
  let sha;
  async function github(path, options = {}) {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
      ...options, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: {
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        accept: 'application/vnd.github+json', 'content-type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (response.status === 404 && options.allowMissing) return null;
    if (!response.ok) throw Error('MONITOR_STATE_UNAVAILABLE');
    return response.json();
  }
  async function save(state) {
    const result = await github(`contents/${statePath}`, {
      method: 'PUT', body: JSON.stringify({
        message: 'Persist public readiness notification state', branch: 'main',
        ...(sha ? {sha} : {}), content: Buffer.from(JSON.stringify(state)).toString('base64'),
      }),
    });
    sha = result.content.sha;
  }
  const stored = await github(`contents/${statePath}?ref=main`, {allowMissing: true});
  sha = stored?.sha;
  let state = stored ? JSON.parse(Buffer.from(stored.content, 'base64').toString()) : {};
  const reports = drill
    ? [
      {checkedAt: new Date().toISOString(), status: 'attention', issues: ['SERVICE_NOT_READY']},
      {checkedAt: new Date().toISOString(), status: 'healthy', issues: []},
    ]
    : [await checkPublicReadiness()];
  for (const report of reports) {
    const result = await deliverOperationsReport({
      report, state, save,
      from: env.COEMIO_EMAIL_FROM, to: env.COEMIO_OPERATIONS_EMAIL_TO,
      send: args => sendOperationsMail({
        ...args, key: env.COEMIO_RESEND_API_KEY,
        mail: {
          ...args.mail,
          subject: `${drill ? '【訓練】' : '【外部監視】'}${args.mail.subject}`,
          text: `${drill ? '通知訓練です。本番の障害・復旧を示すものではありません。\n\n' : '公開readinessの外部監視です。\n\n'}${args.mail.text}`,
        },
      }),
    });
    state = result.state;
    console.log(JSON.stringify({drill, status: report.status, accepted: result.accepted.length}));
    if (!drill && report.status !== 'healthy') process.exitCode = 2;
  }
  // A date-only state change keeps the scheduled workflow enabled without logging secrets.
  const day = new Date().toISOString().slice(0, 10);
  if (state.lastCheckDay !== day) {
    state.lastCheckDay = day;
    await save(state);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await run(); }
  catch (error) {
    console.error(JSON.stringify({monitor: 'failed', reconciliation:
      error.message === 'OPERATIONS_MAIL_RECONCILIATION_REQUIRED'}));
    process.exitCode = 1;
  }
}
