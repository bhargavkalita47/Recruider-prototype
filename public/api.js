/* Persistence adapter. app.js retains the supplied prototype's screen renderers. */
let config = {demo:false}, csrf = '', signature = '', busy = false, ready = false;
let operationQueue = Promise.resolve(), queueCount = 0, mutationGeneration = 0;
const htmlEscape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// The legacy templates interpolate strings into HTML. Encode every server-owned
// string once at that boundary; never store HTML-encoded values in the database.
function safeView(value) {
  if(typeof value === 'string') return htmlEscape(value);
  if(Array.isArray(value)) return value.map(safeView);
  if(value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,safeView(v)]));
  return value;
}
function decodeText(value) {const node=document.createElement('textarea');node.innerHTML=value;return node.value;}
async function api(path,method='GET',body) {
  const response=await fetch('/api'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();
  if(!response.ok) throw new Error(data.error || 'Could not complete your request.');
  return data;
}
function applySnapshot(data) {
  config.demo=data.demo; csrf=data.csrf||'';
  signature=JSON.stringify({demo:data.demo,user:data.user,csrf:data.csrf,state:data.state});
  Object.assign(DB,safeView(data.state));
  if(data.user) {
    const changed=session.userId!==data.user.id || session.role!==data.user.role;
    session.role=data.user.role;session.userId=data.user.id;session.authRole=data.user.role;
    if(changed || ['landing','auth'].includes(session.screen)) {
      session.screen=data.user.role==='admin'?'admin-dashboard':data.user.role+'-home';
      session.candTab='browse';session.recTab='browse';session.companySel=null;session.modal=null;session.activeMatchId=null;
    }
  } else if(session.userId) {session.userId=null;session.role=null;session.screen='landing';session.modal=null;session.activeMatchId=null;}
}
function fieldKey(el,index) {return el.id?'id:'+el.id:el.name?'name:'+el.name:el.tagName+':'+(el.closest('.field')?.querySelector('label')?.textContent||index);}
function captureDrafts() {
  const active=document.activeElement;
  return [...document.querySelectorAll('input,textarea,select')].map((el,index)=>({key:fieldKey(el,index),value:el.value,focused:el===active,start:el.selectionStart,end:el.selectionEnd}));
}
function restoreDrafts(saved) {
  const fields=new Map([...document.querySelectorAll('input,textarea,select')].map((el,i)=>[fieldKey(el,i),el]));
  for(const draft of saved) {const el=fields.get(draft.key);if(!el)continue;el.value=draft.value;if(draft.focused){el.focus({preventScroll:true});if(typeof draft.start==='number' && ['INPUT','TEXTAREA'].includes(el.tagName)) try{el.setSelectionRange(draft.start,draft.end);}catch{}}}
}
function backgroundRender() {
  const drafts=captureDrafts(), scroll=window.scrollY;
  const box=document.getElementById('chatBody'), chatScroll=box?.scrollTop;
  const atBottom=box && box.scrollHeight-box.scrollTop-box.clientHeight<50;
  render(); restoreDrafts(drafts);window.scrollTo(0,scroll);
  const updated=document.getElementById('chatBody');if(updated) updated.scrollTop=atBottom?updated.scrollHeight:chatScroll||0;
}
let toastTimer;
function toast(message) {
  clearTimeout(toastTimer);document.querySelector('.toast')?.remove();
  const el=document.createElement('div');el.className='toast';el.setAttribute('role','status');el.textContent=message;document.body.append(el);
  toastTimer=setTimeout(()=>el.remove(),2500);
}
function transact(work) {
  queueCount++;mutationGeneration++;
  const result=operationQueue.then(async()=>{busy=true;try{return await work();}catch(e){toast(e.message);return false;}finally{busy=false;queueCount--;}});
  operationQueue=result.catch(()=>{});return result;
}
async function mutate(path,method,body,message,screen,options={}) {
  const data=await api(path,method,body);applySnapshot(data);
  if(screen) {session.screen=screen;session.modal=null;}
  if(options.preserve) backgroundRender();else render();
  if(data.matched) toast('It is a match! Chat unlocked.');else if(message) toast(message);
  return data;
}
function formData(event) {event.preventDefault();return Object.fromEntries(new FormData(event.target));}
function loginAs(role,id) {return transact(()=>mutate('/auth/login','POST',{role,id}));}
function enterAdmin() {if(config.demo) loginAs('admin','admin1');else pickRole('admin');}
function loginCredentials(event) {const data=formData(event);return transact(()=>mutate('/auth/login','POST',{...data,role:session.authRole}));}
function signupCandidate(event) {const data=formData(event);return transact(()=>mutate('/auth/signup','POST',{...data,role:'candidate'}));}
function signupRecruiter(event) {const data=formData(event);return transact(()=>mutate('/auth/signup','POST',{...data,role:'recruiter'}));}
function backToLanding() {
  return transact(async()=>{
    if(session.userId) applySnapshot(await api('/auth/logout','POST',{}));
    session.role=null;session.userId=null;session.screen='landing';session.modal=null;session.activeMatchId=null;render();
  });
}
function selectCompany(recruiterId) {session.companySel=recById(recruiterId)?.company;render();}
function candidateSwipe(jobId,decision) {return transact(()=>mutate('/swipes/candidate','POST',{jobId,decision})).then(result=>{if(!result)render();return result;});}
function recruiterDecide(candidateId,decision,jobId) {return transact(()=>mutate('/swipes/recruiter','POST',{candidateId,decision,jobId})).then(result=>{if(!result)render();return result;});}
function confirmPosition(candidateId,jobId) {return transact(async()=>{await mutate('/swipes/recruiter','POST',{candidateId,decision:'interested',jobId},'Interest sent.');session.modal=null;render();});}
function saveProfile(field,value) {return transact(()=>mutate('/profile','PATCH',{[field]:value},'Saved.',null,{preserve:true}));}
function submitChallenge(challengeId) {
  const text=document.getElementById('sub-'+challengeId).value.trim();
  if(!text) return toast('Write something before submitting.');
  return transact(()=>mutate('/submissions','POST',{challengeId,text},'Challenge submitted.'));
}
function postJob(event) {const data=formData(event);return transact(()=>mutate('/jobs','POST',data,'Job posted.','recruiter-profile'));}
function postChallenge(event) {const data=formData(event);return transact(()=>mutate('/challenges','POST',data,'Challenge posted.','recruiter-profile'));}
function postAdminChallenge(event) {const data=formData(event);return transact(()=>mutate('/challenges','POST',data,'Challenge posted.','admin-challenges'));}
function deleteChallenge(id) {return transact(()=>mutate('/challenges/'+id,'DELETE',{},'Challenge deleted.'));}
function archiveChallenge(id) {return transact(()=>{const archived=!DB.challenges.find(c=>c.id===id)?.archived;return mutate('/challenges/'+id,'PATCH',{archived},archived?'Challenge archived.':'Challenge restored.');});}
function toggleReview(id) {return transact(()=>mutate('/submissions/'+id,'PATCH',{reviewed:!DB.submissions.find(s=>s.id===id)?.reviewed}));}
function awardBadge(event) {const data=formData(event);return transact(()=>mutate('/badges/award','POST',{candidateId:data.cand,badgeId:data.badge},'Badge awarded.'));}
const sending=new Set();
function sendChat(matchId) {
  const input=document.getElementById('chatInput'),text=input?.value.trim();if(!text||sending.has(matchId))return;
  sending.add(matchId);
  return transact(async()=>{
    try {
      await mutate('/matches/'+matchId+'/messages','POST',{text},null,null,{preserve:true});
      const current=document.getElementById('chatInput');if(current?.value.trim()===text) current.value='';current?.focus();
      const box=document.getElementById('chatBody');if(box)box.scrollTop=box.scrollHeight;
    } finally {sending.delete(matchId);}
  });
}
function renderAuth() {
  if(config.demo) return renderDemoAuth();
  const role=session.authRole,isCand=role==='candidate',isAdmin=role==='admin',signup=session.authMode==='signup'&&!isAdmin;
  const sectors=['Tech','Design','Marketing','Product','Other'];
  return `<div class="landing"><div class="auth-box">
    <div class="eyebrow" style="margin-bottom:10px;">${isAdmin?'Admin':isCand?'Candidate':'Recruiter'} access</div>
    ${!isAdmin?`<div class="auth-tabs"><button class="${!signup?'active':''}" onclick="session.authMode='login';render()">Log in</button><button class="${signup?'active':''}" onclick="session.authMode='signup';render()">Sign up</button></div>`:'<h3 style="font-size:22px;margin-bottom:20px;">Platform control room</h3>'}
    <form onsubmit="${signup?isCand?'signupCandidate':'signupRecruiter':'loginCredentials'}(event)">
      ${signup?`<div class="field"><label>${isCand?'Full name':'Your name'}</label><input name="name" required maxlength="100" autocomplete="name" placeholder="${isCand?'Jordan Lee':'Sam Patel'}"/></div>
      ${!isCand?'<div class="field"><label>Company</label><input name="company" required maxlength="150" placeholder="Acme Inc."/></div>':''}`:''}
      <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email" placeholder="${isCand?'jordan@mail.com':'sam@acme.com'}"/></div>
      <div class="field"><label>Password</label><input name="password" type="password" required minlength="10" maxlength="128" autocomplete="${signup?'new-password':'current-password'}" placeholder="At least 10 characters"/></div>
      ${signup?`<div class="field"><label>Sector</label><select name="sector">${sectors.map(s=>`<option>${s}</option>`).join('')}</select></div><div class="field"><label>${isCand?'Portfolio paragraph':'About the company'}</label><textarea name="${isCand?'bio':'about'}" placeholder="${isCand?"A few sentences on what you've built and how you work.":'What does the company do?'}"></textarea></div>`:''}
      <button class="btn btn-primary btn-block" type="submit">${signup?`Create ${role} account`:'Log in'}</button>
    </form><button class="btn btn-ghost btn-block" style="margin-top:10px;" onclick="backToLanding()">Back</button>
  </div></div>`;
}
async function refresh() {
  if(busy||queueCount||document.hidden||!ready)return;
  busy=true;
  try {const generation=mutationGeneration,previousUser=session.userId;const data=await api('/state');if(generation!==mutationGeneration)return;const next=JSON.stringify({demo:data.demo,user:data.user,csrf:data.csrf,state:data.state});if(next!==signature){applySnapshot(data);if(previousUser!==session.userId)render();else backgroundRender();}}
  catch(e) {if(navigator.onLine===false) toast('You are offline. Changes need a connection.');}
  finally {busy=false;}
}
// Also refresh while typing: backgroundRender preserves unfinished forms and cursors.
setInterval(refresh,2000);
window.addEventListener('focus',refresh);
window.addEventListener('online',refresh);
(async()=>{
  try {applySnapshot(await api('/state'));ready=true;render();}
  catch(e) {
    const box=document.createElement('div');box.className='landing';
    const panel=document.createElement('div');panel.className='auth-box';
    const heading=document.createElement('h3');heading.textContent='Unable to connect';
    const message=document.createElement('p');message.textContent='Start the Recruider server, then retry.';
    const button=document.createElement('button');button.className='btn btn-primary';button.textContent='Retry';button.onclick=()=>location.reload();
    panel.append(heading,message,button);box.append(panel);document.getElementById('root').replaceChildren(box);
  }
})();
