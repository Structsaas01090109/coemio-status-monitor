import { randomUUID } from 'node:crypto';
import { planOperationsMail } from './operations-mail.mjs';

// Caller holds the filesystem lock. Save must persist atomically before resolving.
export async function deliverOperationsReport({ report, state = {}, save, send, from, to, test = false, now = Date.now(), makeKey = () => 'coemio-ops-' + randomUUID() }) {
  const next = structuredClone(state), accepted = [];
  const flush = async () => {
    const p = next.pending;
    // Provider dedup lasts 24h. Stop conservatively at 23h; never invent a new retry key.
    if (!p || !Number.isFinite(p.createdAt) || !Number.isFinite(now) || now < p.createdAt || now - p.createdAt >= 23 * 3600000 ||
        !p.key || !p.mail?.signature || typeof p.mail.subject !== 'string' || typeof p.mail.text !== 'string' ||
        p.from !== from || p.to !== to || p.test !== test) throw Error('OPERATIONS_MAIL_RECONCILIATION_REQUIRED');
    const result = await send({ from: p.from, to: p.to, mail: p.mail, idempotencyKey: p.key });
    if (!result?.accepted || !result.id) throw Error('OPERATIONS_MAIL_RESULT_UNKNOWN');
    if (!test) next.delivered = { signature: p.mail.signature };
    delete next.pending;
    await save(structuredClone(next));
    accepted.push(result.id);
  };
  if (next.pending) {
    await flush();
    if (test) return { accepted, state: next };
  }
  const mail = test ? { signature: 'test', subject: 'COEMIO 運用監視：テスト通知', text: 'これは通知経路の確認メールです。実際の稼働状態を示す通知ではありません。受信できたことをご確認ください。' }
    : planOperationsMail(report, next.delivered);
  if (mail) {
    next.pending = { key: makeKey(), mail, from, to, test, createdAt: now };
    await save(structuredClone(next));
    await flush();
  }
  return { accepted, state: next };
}
