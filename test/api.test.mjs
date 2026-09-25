import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const temp=mkdtempSync(join(tmpdir(),'recruider-test-'));
let app,base,normal,normalBase;
async function start(demo,path) {
  const child=spawn(process.execPath,['server.mjs',...(demo?['--demo']:[])],{cwd:root,env:{...process.env,PORT:'0',HOST:'127.0.0.1',DATABASE_PATH:path,COOKIE_SECURE:'false'}});
  let log='';
  const url=await new Promise((resolve,reject)=>{child.stdout.on('data',chunk=>{log+=chunk;const m=log.match(/http:\/\/127\.0\.0\.1:\d+/);if(m)resolve(m[0]);});child.stderr.on('data',c=>log+=c);child.on('exit',()=>reject(new Error(log)));setTimeout(()=>reject(new Error('Server startup timeout: '+log)),10000).unref();});
  return [child,url];
}
async function stop(child) {if(!child||child.exitCode!==null)return;await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});}
function client(url) {
  return {cookie:'',csrf:'',async request(path,method='GET',data,headers={}) {
    const res=await fetch(url+path,{method,headers:{'Content-Type':'application/json',Cookie:this.cookie,'X-CSRF-Token':this.csrf,...headers},...(data===undefined?{}:{body:JSON.stringify(data)})});
    const cookie=res.headers.get('set-cookie');if(cookie)this.cookie=cookie.split(';')[0];
    const body=await res.json();if(body.csrf)this.csrf=body.csrf;return {status:res.status,body};
  }, async login(role,id){const r=await this.request('/api/auth/login','POST',{role,id});assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}};
}
before(async()=>{[app,base]=await start(true,join(temp,'demo.sqlite'));[normal,normalBase]=await start(false,join(temp,'normal.sqlite'));});
after(async()=>{await stop(app);await stop(normal);rmSync(temp,{recursive:true,force:true});});
test('demo login, profile persistence, company rename propagates to jobs',async()=>{
  const c=client(base);await c.login('candidate','cand1');
  let r=await c.request('/api/profile','PATCH',{name:'Aisha updated',skills:['SQL','Systems'],bio:'Persisted portfolio'});assert.equal(r.status,200);
  assert.equal((await c.request('/api/state')).body.state.candidates.find(x=>x.id==='cand1').bio,'Persisted portfolio');
  assert.equal((await c.request('/api/profile','PATCH',{badges:['b2']})).status,400);
  const rec=client(base);await rec.login('recruiter','rec2');r=await rec.request('/api/profile','PATCH',{company:"Studio O'Brien & Co"});assert.equal(r.status,200);assert.equal(r.body.state.jobs.find(j=>j.id==='job3').company,"Studio O'Brien & Co");
});
test('mutual interest, job ownership, duplicate match prevention, private chat',async()=>{
  const c=client(base),r=client(base),outsider=client(base);await c.login('candidate','cand1');await r.login('recruiter','rec1');await outsider.login('candidate','cand2');
  assert.equal((await r.request('/api/swipes/recruiter','POST',{candidateId:'cand1',jobId:'job3',decision:'interested'})).status,403);
  let result=await c.request('/api/swipes/candidate','POST',{jobId:'job1',decision:'interested'});assert.equal(result.body.state.matches.length,0);
  result=await r.request('/api/swipes/recruiter','POST',{candidateId:'cand1',jobId:'job1',decision:'interested'});assert.equal(result.body.matched,true);const match=result.body.state.matches[0];
  result=await r.request('/api/swipes/recruiter','POST',{candidateId:'cand1',jobId:'job1',decision:'interested'});assert.equal(result.body.state.matches.length,1);assert.equal(result.body.matched,false);
  assert.equal((await c.request('/api/matches/'+match.id+'/messages','POST',{text:'Hello from candidate'})).status,200);
  result=await r.request('/api/matches/'+match.id+'/messages','POST',{text:'Hello from recruiter'});assert.equal(result.body.state.matches[0].chat.length,2);
  assert.equal((await outsider.request('/api/matches/'+match.id+'/messages','POST',{text:'intrusion'})).status,403);
  const other=(await outsider.request('/api/state')).body.state;assert.equal(other.matches.length,0);assert.equal(other.swipesC.cand1,undefined);assert.equal(other.candidates.find(c=>c.id==='cand1').email,undefined);
});
test('job/challenge posting, submission review, badges, archive/restore/delete',async()=>{
  const r=client(base),c=client(base),a=client(base);await r.login('recruiter','rec1');await c.login('candidate','cand2');await a.login('admin','admin1');
  let result=await r.request('/api/jobs','POST',{title:'New job',sector:'Tech',blurb:'Build things',desc:'A new role'});assert.equal(result.status,200);assert.equal(result.body.state.jobs.at(-1).recruiterId,'rec1');
  result=await r.request('/api/challenges','POST',{title:'New task',sector:'Tech',desc:'Build a service'});const ch=result.body.state.challenges.at(-1);
  result=await c.request('/api/submissions','POST',{challengeId:ch.id,text:'My implementation'});assert.equal(result.status,200);const sub=result.body.state.submissions.find(s=>s.challengeId===ch.id);
  assert.equal((await c.request('/api/submissions','POST',{challengeId:ch.id,text:'Duplicate'})).status,409);
  assert.equal((await r.request('/api/submissions/'+sub.id,'PATCH',{reviewed:true})).status,403);
  result=await a.request('/api/submissions/'+sub.id,'PATCH',{reviewed:true});assert.equal(result.body.state.submissions.find(s=>s.id===sub.id).reviewed,true);
  await a.request('/api/badges/award','POST',{candidateId:'cand2',badgeId:'b1'});result=await a.request('/api/badges/award','POST',{candidateId:'cand2',badgeId:'b1'});assert.deepEqual(result.body.state.candidates.find(c=>c.id==='cand2').badges,['b1']);
  assert.equal((await a.request('/api/challenges/'+ch.id,'DELETE',{})).status,409);
  await a.request('/api/challenges/'+ch.id,'PATCH',{archived:true});
  const other=client(base);await other.login('candidate','cand3');assert.equal((await other.request('/api/submissions','POST',{challengeId:ch.id,text:'Late'})).status,409);
  await a.request('/api/challenges/'+ch.id,'PATCH',{archived:false});assert.equal((await other.request('/api/submissions','POST',{challengeId:ch.id,text:'Restored'})).status,200);
  result=await a.request('/api/challenges','POST',{title:'Delete me',sector:'Other',desc:'Empty challenge'});assert.equal((await a.request('/api/challenges/'+result.body.state.challenges.at(-1).id,'DELETE',{})).status,200);
});
test('authorization, validation, CSRF and origin protection',async()=>{
  const guest=client(base),c=client(base);assert.equal((await guest.request('/api/jobs','POST',{})).status,401);await c.login('candidate','cand1');
  assert.equal((await c.request('/api/jobs','POST',{})).status,403);
  assert.equal((await c.request('/api/profile','PATCH',{name:'attack'},{'X-CSRF-Token':'bad'})).status,403);
  assert.equal((await c.request('/api/profile','PATCH',{name:'attack'},{Origin:'https://evil.test'})).status,403);
  assert.equal((await c.request('/api/swipes/candidate','POST',{jobId:'missing',decision:'interested'})).status,404);
  assert.equal((await c.request('/api/profile','PATCH',{skills:'not array'})).status,400);
  assert.equal((await c.request('/api/profile','PATCH',{sector:'unknown'})).status,400);
  assert.equal((await c.request('/api/profile','PATCH',{name:''})).status,400);
  assert.equal((await c.request('/api/profile','PATCH',{bio:'x'.repeat(70000)})).status,413);
});
test('normal accounts: signup, secure login, logout, no quick login or public admin signup',async()=>{
  const c=client(normalBase);let r=await c.request('/api/state');assert.equal(r.body.demo,false);assert.equal(r.body.state.candidates.length,0);
  assert.equal((await c.request('/api/auth/login','POST',{role:'admin',id:'admin1'})).status,400);
  assert.equal((await c.request('/api/auth/signup','POST',{role:'admin'})).status,400);
  const registration={role:'candidate',name:'Normal User',email:'user@example.com',sector:'Tech',bio:'<script>bad()</script>',password:' test-password-123 '};
  assert.equal((await c.request('/api/auth/signup','POST',{...registration,password:'short'})).status,400);
  r=await c.request('/api/auth/signup','POST',registration);assert.equal(r.status,201);const uid=r.body.user.id;
  assert.match(c.cookie,/recruider_session=/);assert.equal(r.body.state.candidates[0].bio,registration.bio);
  const oldCookie=c.cookie;await c.request('/api/auth/logout','POST',{});assert.equal((await c.request('/api/state')).body.user,null);
  assert.equal((await c.request('/api/state','GET',undefined,{Cookie:oldCookie})).body.user,null);
  assert.equal((await c.request('/api/auth/login','POST',{role:'candidate',email:registration.email,password:'wrong-password'})).status,401);
  r=await c.request('/api/auth/login','POST',{role:'candidate',email:registration.email,password:registration.password});assert.equal(r.status,200);assert.equal(r.body.user.id,uid);
  assert.equal((await c.request('/api/auth/signup','POST',registration)).status,409);
});
test('admin provisioning in normal mode',async()=>{
  const result=spawnSync(process.execPath,['server.mjs','--create-admin'],{cwd:root,env:{...process.env,DATABASE_PATH:join(temp,'normal.sqlite'),ADMIN_EMAIL:'admin@example.com',ADMIN_PASSWORD:'admin-password-123'},encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  const c=client(normalBase);const r=await c.request('/api/auth/login','POST',{role:'admin',email:'admin@example.com',password:'admin-password-123'});assert.equal(r.status,200);assert.equal(r.body.user.role,'admin');
});
test('restart retains profiles, matches, messages and server sessions',async()=>{
  const c=client(base);await c.login('candidate','cand1');const cookie=c.cookie;
  await stop(app);[app,base]=await start(true,join(temp,'demo.sqlite'));
  const resumed=client(base);resumed.cookie=cookie;const r=await resumed.request('/api/state');assert.equal(r.body.user.id,'cand1');assert.equal(r.body.state.candidates.find(c=>c.id==='cand1').name,'Aisha updated');assert.equal(r.body.state.matches[0].chat.length,2);
});
