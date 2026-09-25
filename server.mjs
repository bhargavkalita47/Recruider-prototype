import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const demo = process.argv.includes('--demo');
const host = process.env.HOST || '127.0.0.1';
if (demo && !['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('Demo mode must bind to localhost. Use normal mode for network access.');
const dbPath = resolve(process.env.DATABASE_PATH || join(root, 'data', demo ? 'demo.sqlite' : 'recruider.sqlite'));
mkdirSync(dirname(dbPath), {recursive:true});
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('candidate','recruiter','admin')), email TEXT NOT NULL UNIQUE COLLATE NOCASE, password TEXT NOT NULL, profile TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, recruiter_id TEXT NOT NULL REFERENCES users(id), data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY, poster_id TEXT REFERENCES users(id), data TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY, challenge_id TEXT NOT NULL REFERENCES challenges(id), candidate_id TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL, created_at TEXT NOT NULL, reviewed INTEGER NOT NULL DEFAULT 0, UNIQUE(challenge_id,candidate_id));
CREATE TABLE IF NOT EXISTS badges(id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS awards(candidate_id TEXT REFERENCES users(id), badge_id TEXT REFERENCES badges(id), PRIMARY KEY(candidate_id,badge_id));
CREATE TABLE IF NOT EXISTS candidate_swipes(candidate_id TEXT REFERENCES users(id),job_id TEXT REFERENCES jobs(id),decision TEXT CHECK(decision IN ('pass','interested')),PRIMARY KEY(candidate_id,job_id));
CREATE TABLE IF NOT EXISTS recruiter_swipes(recruiter_id TEXT REFERENCES users(id),candidate_id TEXT REFERENCES users(id),job_id TEXT REFERENCES jobs(id),decision TEXT CHECK(decision IN ('pass','interested')),PRIMARY KEY(recruiter_id,candidate_id));
CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY,candidate_id TEXT REFERENCES users(id),recruiter_id TEXT REFERENCES users(id),job_id TEXT REFERENCES jobs(id),UNIQUE(candidate_id,job_id));
CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,match_id TEXT NOT NULL REFERENCES matches(id),sender_id TEXT NOT NULL REFERENCES users(id),text TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS messages_match ON messages(match_id,created_at);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
`);
const get = (sql,...args) => db.prepare(sql).get(...args);
const all = (sql,...args) => db.prepare(sql).all(...args);
const run = (sql,...args) => db.prepare(sql).run(...args);
const id = () => 'id' + randomUUID().replaceAll('-','');
const now = () => new Date().toISOString();
const fail = (status,message) => {throw Object.assign(new Error(message),{status});};
function transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const value=fn(); db.exec('COMMIT'); return value; } catch(e) { db.exec('ROLLBACK'); throw e; } }
const sectors = ['Tech','Design','Marketing','Product','Other'];
function str(body,key,max=200,required=true) {
  const value=body[key];
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail(400,`Invalid ${key}.`);
  return value.trim();
}
function sector(body) {const value=str(body,'sector'); if(!sectors.includes(value)) fail(400,'Choose a valid sector.'); return value;}
function email(body) {const value=str(body,'email',254).toLowerCase(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail(400,'Enter a valid email address.'); return value;}
const scryptAsync=promisify(scrypt);
async function hashPassword(password) {const salt=randomBytes(16).toString('hex'); return salt+':'+(await scryptAsync(password,salt,64)).toString('hex');}
async function verifyPassword(password,stored) {const [salt,hash]=stored.split(':'); if(!salt || !hash) return false; const actual=await scryptAsync(password,salt,64); return actual.length === Buffer.from(hash,'hex').length && timingSafeEqual(actual,Buffer.from(hash,'hex'));}
function password(body) {const value=body.password; if(typeof value !== 'string' || value.length<10 || value.length>128) fail(400,'Use a password of 10–128 characters.'); return value;}
const tokenHash = value => createHash('sha256').update(value).digest('hex');
function userProfile(row,privateEmail=false) {const p={...JSON.parse(row.profile),id:row.id}; if(privateEmail) p.email=row.email; else delete p.email; if(row.role==='candidate') p.badges=all('SELECT badge_id FROM awards WHERE candidate_id=?',row.id).map(x=>x.badge_id); return p;}
const mode=get("SELECT value FROM meta WHERE key='demo'");
if(mode && mode.value !== String(demo)) throw new Error('This database belongs to a different mode. Choose a separate DATABASE_PATH.');
if(!mode) {
  const seed=JSON.parse(readFileSync(join(root,'seed.json'),'utf8'));
  transaction(()=>{
    run("INSERT INTO meta VALUES('demo',?)",String(demo));
    for(const b of seed.badgesCatalog) run('INSERT INTO badges VALUES(?,?)',b.id,JSON.stringify(b));
    if(demo) {
      for(const [role,list] of [['candidate',seed.candidates],['recruiter',seed.recruiters]]) for(const p of list) run('INSERT INTO users VALUES(?,?,?,?,?,1)',p.id,role,p.email,'',JSON.stringify(p));
      run('INSERT INTO users VALUES(?,?,?,?,?,1)','admin1','admin','admin@demo.local','',JSON.stringify({name:'Admin User'}));
      for(const j of seed.jobs) run('INSERT INTO jobs VALUES(?,?,?)',j.id,j.recruiterId,JSON.stringify(j));
    }
    for(const c of seed.challenges.filter(c=>demo || c.postedBy==='admin')) run('INSERT INTO challenges VALUES(?,?,?,0)',c.id,c.postedBy==='admin'?null:c.postedBy,JSON.stringify(c));
    if(demo) {
      for(const s of seed.submissions) run('INSERT INTO submissions VALUES(?,?,?,?,?,?)',s.id,s.challengeId,s.candidateId,s.text,s.ts,Number(s.reviewed));
      for(const c of seed.candidates) for(const b of c.badges) run('INSERT INTO awards VALUES(?,?)',c.id,b);
    }
  });
}
if(process.argv.includes('--create-admin')) {
  const address=email({email:process.env.ADMIN_EMAIL});
  const hashed=await hashPassword(password({password:process.env.ADMIN_PASSWORD}));
  const existing=get('SELECT * FROM users WHERE email=?',address);
  if(existing && existing.role!=='admin') throw new Error('That email belongs to a non-admin account.');
  transaction(()=>{
    if(existing) {run('UPDATE users SET password=? WHERE id=?',hashed,existing.id);run('DELETE FROM sessions WHERE user_id=?',existing.id);}
    else run('INSERT INTO users VALUES(?,?,?,?,?,0)',id(),'admin',address,hashed,JSON.stringify({name:'Admin User'}));
  });
  console.log('Admin account saved.'); db.close(); process.exit(0);
}
const rate = new Map();
function throttle(req,bucket,limit) {
  const key=bucket+':'+req.socket.remoteAddress; const time=Date.now();
  const item=rate.get(key); const next=!item || item.until<time ? {count:0,until:time+60_000} : item;
  if(++next.count>limit) fail(429,'Too many requests. Please wait a minute.'); rate.set(key,next);
}
setInterval(()=>{for(const [k,v] of rate) if(v.until<Date.now()) rate.delete(k);run('DELETE FROM sessions WHERE expires<?',Date.now());},60_000).unref();
function authenticate(req) {
  const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('recruider_session='))?.slice(18);
  if(!raw) return null;
  return get('SELECT u.*,s.csrf,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires>?',tokenHash(raw),Date.now());
}
function requireRole(user,...roles) {if(!user) fail(401,'Please log in.'); if(!roles.includes(user.role)) fail(403,'This action is not available to your account.');}
const secure=process.env.COOKIE_SECURE==='true';
function setSession(res,user,old) {
  const token=randomBytes(32).toString('hex'), csrf=randomBytes(24).toString('hex');
  if(old) run('DELETE FROM sessions WHERE token_hash=?',old.token_hash);
  run('INSERT INTO sessions VALUES(?,?,?,?)',tokenHash(token),user.id,csrf,Date.now()+7*86400_000);
  res.setHeader('Set-Cookie',`recruider_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure?'; Secure':''}`);
  return {...user,csrf};
}
function snapshot(user) {
  const state={candidates:[],recruiters:[],jobs:[],challenges:[],submissions:[],badgesCatalog:[],swipesC:{},swipesR:{},matches:[]};
  if(!user) {
    if(demo) { state.candidates=all("SELECT * FROM users WHERE role='candidate' AND demo=1").map(u=>userProfile(u)); state.recruiters=all("SELECT * FROM users WHERE role='recruiter' AND demo=1").map(u=>userProfile(u)); }
    return {demo,user:null,state};
  }
  state.candidates=all("SELECT * FROM users WHERE role='candidate'").map(u=>userProfile(u,u.id===user.id||user.role==='admin'));
  state.recruiters=all("SELECT * FROM users WHERE role='recruiter'").map(u=>userProfile(u,u.id===user.id||user.role==='admin'));
  state.jobs=all('SELECT * FROM jobs ORDER BY rowid').map(j=>JSON.parse(j.data));
  state.challenges=all('SELECT * FROM challenges ORDER BY rowid').map(c=>({...JSON.parse(c.data),archived:!!c.archived}));
  state.badgesCatalog=all('SELECT * FROM badges').map(b=>JSON.parse(b.data));
  const subs=user.role==='candidate'?all('SELECT * FROM submissions WHERE candidate_id=?',user.id):all('SELECT * FROM submissions');
  state.submissions=subs.map(s=>({id:s.id,challengeId:s.challenge_id,candidateId:s.candidate_id,text:s.text,ts:s.created_at,reviewed:!!s.reviewed}));
  const cs=user.role==='admin'?all('SELECT * FROM candidate_swipes'):user.role==='candidate'?all('SELECT * FROM candidate_swipes WHERE candidate_id=?',user.id):[];
  for(const s of cs) (state.swipesC[s.candidate_id] ||= {})[s.job_id]=s.decision;
  const rs=user.role==='admin'?all('SELECT * FROM recruiter_swipes'):user.role==='candidate'?all("SELECT * FROM recruiter_swipes WHERE candidate_id=? AND decision='interested'",user.id):all('SELECT * FROM recruiter_swipes WHERE recruiter_id=?',user.id);
  for(const s of rs) (state.swipesR[s.recruiter_id] ||= {})[s.candidate_id]={decision:s.decision,jobId:s.job_id};
  const matches=user.role==='admin'?all('SELECT * FROM matches'):all('SELECT * FROM matches WHERE candidate_id=? OR recruiter_id=?',user.id,user.id);
  state.matches=matches.map(m=>({id:m.id,candidateId:m.candidate_id,recruiterId:m.recruiter_id,jobId:m.job_id,chat:all('SELECT m.*,u.role FROM messages m JOIN users u ON u.id=m.sender_id WHERE match_id=? ORDER BY m.rowid',m.id).map(x=>({id:x.id,from:x.role,text:x.text,ts:new Date(x.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'}),createdAt:x.created_at}))}));
  return {demo,user:{id:user.id,role:user.role},csrf:user.csrf,state};
}
function tryMatch(candidateId,jobId) {
  const job=get('SELECT * FROM jobs WHERE id=?',jobId);
  const c=get("SELECT 1 FROM candidate_swipes WHERE candidate_id=? AND job_id=? AND decision='interested'",candidateId,jobId);
  const r=get("SELECT 1 FROM recruiter_swipes WHERE recruiter_id=? AND candidate_id=? AND job_id=? AND decision='interested'",job.recruiter_id,candidateId,jobId);
  if(c&&r) return run('INSERT OR IGNORE INTO matches VALUES(?,?,?,?)',id(),candidateId,job.recruiter_id,jobId).changes>0;
  return false;
}
async function bodyJSON(req) {
  if(!(req.headers['content-type']||'').startsWith('application/json')) fail(415,'Use application/json.');
  let size=0; const chunks=[];
  for await (const chunk of req) {size+=chunk.length; if(size>64*1024) fail(413,'Request is too large.'); chunks.push(chunk);}
  try {const value=JSON.parse(Buffer.concat(chunks).toString()); if(!value || typeof value!=='object' || Array.isArray(value)) throw 0; return value;} catch {fail(400,'Invalid JSON request.');}
}
function respond(res,status,data) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
const staticFiles=new Map([['/',['index.html','text/html; charset=utf-8']],['/index.html',['index.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/api.js',['api.js','text/javascript; charset=utf-8']]]);
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Frame-Options','DENY'); res.setHeader('Referrer-Policy','same-origin');
  // Inline handlers/styles are inherited from the supplied prototype; no external scripts are allowed.
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  try {
    const path=new URL(req.url,'http://localhost').pathname;
    if(req.method==='GET' && staticFiles.has(path)) {const [file,type]=staticFiles.get(path);res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});res.end(readFileSync(join(root,'public',file)));return;}
    if(path==='/favicon.ico') {res.writeHead(204);res.end();return;}
    if(path==='/api/health' && req.method==='GET') {respond(res,200,{ok:true});return;}
    const user=authenticate(req);
    if(path==='/api/state' && req.method==='GET') {respond(res,200,snapshot(user));return;}
    if(!['POST','PATCH','DELETE'].includes(req.method)) fail(404,'Not found.');
    const origin=req.headers.origin;
    if(origin && origin!==(process.env.PUBLIC_ORIGIN||`http${secure?'s':''}://${req.headers.host}`)) fail(403,'Request origin is not allowed.');
    if(req.headers['sec-fetch-site']==='cross-site') fail(403,'Cross-site request blocked.');
    const body=await bodyJSON(req);
    if(path==='/api/auth/signup' && req.method==='POST') {
      throttle(req,'auth',20);
      const role=str(body,'role'); if(!['candidate','recruiter'].includes(role)) fail(400,'Invalid account type.');
      const address=email(body); const name=str(body,'name',100); const sec=sector(body);
      const p=role==='candidate'?{name,sector:sec,bio:str(body,'bio',10000,false)||'No portfolio paragraph written yet.',skills:[]}:{name,sector:sec,company:str(body,'company',150),about:str(body,'about',10000,false)};
      const hashed=await hashPassword(demo && !body.password ? randomBytes(32).toString('hex') : password(body));
      if(get('SELECT 1 FROM users WHERE email=?',address)) fail(409,'An account with this email already exists.');
      const uid=id();run('INSERT INTO users VALUES(?,?,?,?,?,?)',uid,role,address,hashed,JSON.stringify(p),Number(demo));
      const current=setSession(res,get('SELECT * FROM users WHERE id=?',uid),user);respond(res,201,snapshot(current));return;
    }
    if(path==='/api/auth/login' && req.method==='POST') {
      throttle(req,'auth',20);
      let target;
      if(demo && body.id) target=get('SELECT * FROM users WHERE id=? AND demo=1',str(body,'id'));
      else {target=get('SELECT * FROM users WHERE email=?',email(body)); if(typeof body.password!=='string'||!body.password.length||body.password.length>128) fail(400,'Enter a valid password.');const supplied=body.password;const ok=await verifyPassword(supplied,target?.password || DUMMY_PASSWORD);if(!ok) target=null;}
      if(!target || target.role!==body.role) fail(401,'Email or password is incorrect.');
      respond(res,200,snapshot(setSession(res,target,user)));return;
    }
    requireRole(user,'candidate','recruiter','admin');
    if(req.headers['x-csrf-token']!==user.csrf) fail(403,'Session verification failed. Refresh and try again.');
    throttle(req,'write',180);
    if(path==='/api/auth/logout' && req.method==='POST') {run('DELETE FROM sessions WHERE token_hash=?',user.token_hash);res.setHeader('Set-Cookie',`recruider_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure?'; Secure':''}`);respond(res,200,snapshot(null));return;}
    let matched=false;
    transaction(()=>{
      if(path==='/api/profile' && req.method==='PATCH') {
        requireRole(user,'candidate','recruiter'); const p=JSON.parse(user.profile);
        const allowed=user.role==='candidate'?['name','sector','bio','skills']:['name','company','about'];
        if(!Object.keys(body).length || Object.keys(body).some(k=>!allowed.includes(k))) fail(400,'Invalid profile field.');
        for(const k of Object.keys(body)) {
          if(k==='skills') {if(!Array.isArray(body.skills)||body.skills.length>30||body.skills.some(v=>typeof v!=='string'||!v.trim()||v.length>80)) fail(400,'Use up to 30 skills of 80 characters each.');p.skills=body.skills.map(s=>s.trim());}
          else p[k]=k==='sector'?sector(body):str(body,k,['bio','about'].includes(k)?10000:k==='company'?150:100,!['bio','about'].includes(k));
        }
        run('UPDATE users SET profile=? WHERE id=?',JSON.stringify(p),user.id);
        if(body.company!==undefined) for(const j of all('SELECT * FROM jobs WHERE recruiter_id=?',user.id)) run('UPDATE jobs SET data=? WHERE id=?',JSON.stringify({...JSON.parse(j.data),company:p.company}),j.id);
      } else if(path==='/api/jobs' && req.method==='POST') {
        requireRole(user,'recruiter');const j={id:id(),recruiterId:user.id,company:JSON.parse(user.profile).company,title:str(body,'title',150),sector:sector(body),location:str(body,'location',150,false)||'Remote',pay:str(body,'pay',100,false)||'Not disclosed',blurb:str(body,'blurb',500),desc:str(body,'desc',15000)};
        run('INSERT INTO jobs VALUES(?,?,?)',j.id,user.id,JSON.stringify(j));
      } else if(path==='/api/challenges' && req.method==='POST') {
        requireRole(user,'recruiter','admin');const c={id:id(),postedBy:user.role==='admin'?'admin':user.id,title:str(body,'title',150),sector:sector(body),desc:str(body,'desc',15000)};
        run('INSERT INTO challenges VALUES(?,?,?,0)',c.id,user.role==='admin'?null:user.id,JSON.stringify(c));
      } else if(/^\/api\/challenges\/[^/]+$/.test(path) && ['PATCH','DELETE'].includes(req.method)) {
        requireRole(user,'admin');const cid=path.split('/')[3];const c=get('SELECT * FROM challenges WHERE id=?',cid);if(!c) fail(404,'Challenge not found.');
        if(req.method==='DELETE') {if(get('SELECT 1 FROM submissions WHERE challenge_id=?',cid)) fail(409,'Cannot delete a challenge with submissions. Archive it instead.');run('DELETE FROM challenges WHERE id=?',cid);}
        else {if(typeof body.archived!=='boolean') fail(400,'Invalid archive state.');run('UPDATE challenges SET archived=? WHERE id=?',Number(body.archived),cid);}
      } else if(path==='/api/submissions' && req.method==='POST') {
        requireRole(user,'candidate'); const cid=str(body,'challengeId'); const c=get('SELECT * FROM challenges WHERE id=?',cid);if(!c) fail(404,'Challenge not found.'); if(c.archived) fail(409,'This challenge has been archived.');
        if(get('SELECT 1 FROM submissions WHERE challenge_id=? AND candidate_id=?',cid,user.id)) fail(409,'You already submitted this challenge.');
        run('INSERT INTO submissions VALUES(?,?,?,?,?,0)',id(),cid,user.id,str(body,'text',20000),now());
      } else if(/^\/api\/submissions\/[^/]+$/.test(path) && req.method==='PATCH') {
        requireRole(user,'admin');if(typeof body.reviewed!=='boolean') fail(400,'Invalid review state.');const sid=path.split('/')[3];if(!get('SELECT 1 FROM submissions WHERE id=?',sid)) fail(404,'Submission not found.');run('UPDATE submissions SET reviewed=? WHERE id=?',Number(body.reviewed),sid);
      } else if(path==='/api/badges/award' && req.method==='POST') {
        requireRole(user,'admin');const cid=str(body,'candidateId'),bid=str(body,'badgeId');if(!get("SELECT 1 FROM users WHERE id=? AND role='candidate'",cid)||!get('SELECT 1 FROM badges WHERE id=?',bid)) fail(404,'Candidate or badge not found.');run('INSERT OR IGNORE INTO awards VALUES(?,?)',cid,bid);
      } else if(path==='/api/swipes/candidate' && req.method==='POST') {
        requireRole(user,'candidate');const jid=str(body,'jobId');if(!['pass','interested'].includes(body.decision)) fail(400,'Invalid decision.');if(!get('SELECT 1 FROM jobs WHERE id=?',jid)) fail(404,'Job not found.');
        run('INSERT INTO candidate_swipes VALUES(?,?,?) ON CONFLICT(candidate_id,job_id) DO UPDATE SET decision=excluded.decision',user.id,jid,body.decision);matched=tryMatch(user.id,jid);
      } else if(path==='/api/swipes/recruiter' && req.method==='POST') {
        requireRole(user,'recruiter');const cid=str(body,'candidateId');if(!get("SELECT 1 FROM users WHERE id=? AND role='candidate'",cid)) fail(404,'Candidate not found.');if(!['pass','interested'].includes(body.decision)) fail(400,'Invalid decision.');
        const jid=body.decision==='interested'?str(body,'jobId'):null;
        if(jid&&!get('SELECT 1 FROM jobs WHERE id=? AND recruiter_id=?',jid,user.id)) fail(403,'Choose a job posted by your account.');
        run('INSERT INTO recruiter_swipes VALUES(?,?,?,?) ON CONFLICT(recruiter_id,candidate_id) DO UPDATE SET job_id=excluded.job_id,decision=excluded.decision',user.id,cid,jid,body.decision);if(jid) matched=tryMatch(cid,jid);
      } else if(/^\/api\/matches\/[^/]+\/messages$/.test(path) && req.method==='POST') {
        requireRole(user,'candidate','recruiter');const mid=path.split('/')[3];if(!get('SELECT 1 FROM matches WHERE id=? AND (candidate_id=? OR recruiter_id=?)',mid,user.id,user.id)) fail(403,'Only participants can message this match.');
        run('INSERT INTO messages VALUES(?,?,?,?,?)',id(),mid,user.id,str(body,'text',4000),now());
      } else fail(404,'Not found.');
    });
    respond(res,200,{...snapshot({...get('SELECT * FROM users WHERE id=?',user.id),csrf:user.csrf}),matched});
  } catch(e) {if(!e.status) console.error(e);if(!res.headersSent) respond(res,e.status||500,{error:e.status?e.message:'An unexpected server error occurred.'});else res.end();}
});
const DUMMY_PASSWORD=await hashPassword(randomBytes(32).toString('hex'));
server.listen(Number(process.env.PORT||3000),host,()=>console.log(`Recruider ${demo?'DEMO':'app'} running at http://${host}:${server.address().port}`));
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
