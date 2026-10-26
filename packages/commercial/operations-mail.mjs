import {createHash} from 'node:crypto';
const codes=new Set(['SERVICE_NOT_READY','BACKUP_UNVERIFIED','BACKUP_STALE','BILLING_QUEUE_ATTENTION','SECURITY_NOTICE_ATTENTION','OPERATIONS_CHECK_FAILED']);
export function planOperationsMail(report,previous=null){
 const issues=Array.isArray(report?.issues)?[...new Set(report.issues)].sort():[];
 if(!['healthy','attention','unverified'].includes(report?.status)||issues.some(x=>!codes.has(x))||(report.status==='healthy'&&issues.length))throw Error('INVALID_OPERATIONS_REPORT');
 if(report.status!=='healthy'&&!issues.length)throw Error('INVALID_OPERATIONS_REPORT');
 const signature=createHash('sha256').update(JSON.stringify({status:report.status,issues})).digest('hex');
 if(previous?.signature===signature)return null;
 if(report.status==='healthy'&&!previous)return null;
 const recovered=report.status==='healthy';
 return {signature,subject:recovered?'COEMIO 運用監視：復旧':'COEMIO 運用監視：要確認',
 text:`${recovered?'運用検査が正常に戻りました。':'運用検査で確認が必要な状態を検出しました。'}\n確認時刻: ${new Date(report.checkedAt).toISOString()}\n${issues.join('\n')}\n\n管理画面で稼働状況とログを確認してください。\nhttps://dashboard.render.com/web/srv-dbdcl87b9u1s7397tkh0\n\nこの通知には顧客情報・秘密情報を含みません。`};
}
export async function sendOperationsMail({key,from,to,mail,idempotencyKey,fetchImpl=fetch}){
 if(!key||!from||!/^\S+@[^\s@]+\.[^\s@]+$/.test(to??'')||!idempotencyKey)throw Error('OPERATIONS_MAIL_CONFIG');
 const r=await fetchImpl('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{authorization:`Bearer ${key}`,'content-type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify({from,to:[to],subject:mail.subject,text:mail.text})});
 if(!r.ok)throw Error('OPERATIONS_MAIL_NOT_ACCEPTED');
 const result=await r.json();if(!result.id)throw Error('OPERATIONS_MAIL_RESULT_UNKNOWN');return {accepted:true,id:result.id};
}
