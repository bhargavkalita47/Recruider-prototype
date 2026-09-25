
/* ===== DATA ===== */
function uid() { return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function initials(name) { return htmlEscape(decodeText(name || '').split(' ').filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase()); }
function timeNow() { return new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); }

const DB = {candidates:[],recruiters:[],jobs:[],challenges:[],submissions:[],badgesCatalog:[],swipesC:{},swipesR:{},matches:[]};
const session = {
  role: null, 
  userId: null, 
  screen: 'landing',
  authRole: null, 
  authMode: 'login',
  candTab: 'browse', 
  recTab: 'browse',
  companySel: null,
  modal: null,
  activeMatchId: null,
  toast: null,
  positionPickFor: null,
};

/* ===== HELPERS ===== */
function me() {
  if (session.role === 'admin') return { name: 'Admin User', company: 'Platform Admin' };
  return session.role === 'candidate'
    ? DB.candidates.find(c => c.id === session.userId)
    : session.role === 'recruiter' ? DB.recruiters.find(r => r.id === session.userId) : null;
}
function jobById(id) { return DB.jobs.find(j => j.id === id); }
function candById(id) { return DB.candidates.find(c => c.id === id); }
function recById(id) { return DB.recruiters.find(r => r.id === id); }
function badgeById(id) { return DB.badgesCatalog.find(b => b.id === id); }

function companiesList() {
  const map = {};
  DB.jobs.forEach(j => {
    if (!map[j.company]) map[j.company] = { company: j.company, sector: j.sector, recruiterId: j.recruiterId, count: 0 };
    map[j.company].count++;
  });
  return Object.values(map);
}









function matchScore(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return 72 + (h % 26);
}

/* ===== NAV / AUTH ===== */
function goto(screen) { session.screen = screen; session.modal = null; render(); }
function pickRole(role) {
  session.authRole = role;
  session.authMode = 'login';
  session.screen = 'auth';
  render();
}


/* FIX APPLIED HERE: Restored setting session.role = role so admin screen functions properly */






/* ===== SHELL ===== */
function shell(navItems, activeKey, title, desc, content) {
  const u = me() || { name: 'User', company: '' };
  return `
  <div class="app-shell">
    <div class="sidebar">
      <div class="brand">RECRU<span>IDER</span></div>
      <div class="side-user">
        <div class="avatar">${initials(u.name)}</div>
        <div>
          <div class="name">${u.name}</div>
          <div class="role">${session.role}${u.company ? ' • ' + u.company : ''}</div>
        </div>
      </div>
      ${navItems.map(n => `<button class="nav-item ${n.key === activeKey ? 'active' : ''}" onclick="${n.action}">${n.label}</button>`).join('')}
      <div class="sidebar-foot">
        <button class="btn btn-ghost btn-sm btn-block" onclick="backToLanding()">Switch account</button>
      </div>
    </div>
    <div class="main">
      <div class="page-head">
        <div>
          <h2>${title}</h2>
          ${desc ? `<div class="desc">${desc}</div>` : ''}
        </div>
      </div>
      ${content}
    </div>
  </div>`;
}

/* ===== LANDING / AUTH ===== */
function renderLanding() {
  return `
  <div class="landing">
    <div class="landing-mark">Skills-first hiring • prototype</div>
    <h1>Show the work.<br/><span>Get matched.</span></h1>
    <p class="sub">Recruider skips the resume screen. Candidates prove skill through open challenges and a portfolio; recruiters swipe on proof, not just a CV.</p>
    <div class="role-grid">
      <div class="role-card">
        <div class="num">01 Candidate</div>
        <h3>I'm looking for work</h3>
        <p>Build a portfolio, take on challenges, browse and swipe on open roles.</p>
        <button class="btn btn-primary btn-block" onclick="pickRole('candidate')">Continue as candidate</button>
      </div>
      <div class="role-card">
        <div class="num">02 Recruiter</div>
        <h3>I'm hiring</h3>
        <p>Post roles and challenges, swipe on candidates who've already proven skill.</p>
        <button class="btn btn-primary btn-block" onclick="pickRole('recruiter')">Continue as recruiter</button>
      </div>
      <div class="role-card">
        <div class="num">03 Admin</div>
        <h3>Platform admin</h3>
        <p>Post global challenges, track submissions, and award badges.</p>
        <button class="btn btn-primary btn-block" type="button" onclick="enterAdmin()">Enter admin</button>
      </div>
    </div>
  </div>`;
}

function renderDemoAuth() {
  const role = session.authRole;
  if (role === 'admin') {
    return `
    <div class="landing">
      <div class="auth-box">
        <div class="eyebrow" style="margin-bottom:10px;">Admin access</div>
        <h3 style="font-size:22px;margin-bottom:6px;">Platform control room</h3>
        <p style="color:var(--graphite); font-size:13px;margin-bottom:20px;">Single shared admin account for this prototype.</p>
        <button class="btn btn-primary btn-block" type="button" onclick="enterAdmin()">Enter as Admin</button>
        <button class="btn btn-ghost btn-block" style="margin-top:10px;" onclick="backToLanding()">Back</button>
      </div>
    </div>`;
  }
  const isCand = role === 'candidate';
  const list = isCand ? DB.candidates : DB.recruiters;
  const sectors = ['Tech', 'Design', 'Marketing', 'Product', 'Other'];
  return `
  <div class="landing">
    <div class="auth-box">
      <div class="eyebrow" style="margin-bottom:10px;">${isCand ? 'Candidate' : 'Recruiter'} access</div>
      <div class="auth-tabs">
        <button class="${session.authMode === 'login' ? 'active' : ''}" onclick="session.authMode='login'; render()">Log in</button>
        <button class="${session.authMode === 'signup' ? 'active' : ''}" onclick="session.authMode='signup'; render()">Sign up</button>
      </div>
      ${session.authMode === 'login' ? `
        ${list.map(u => `
          <div class="quick-login-item">
            <div style="display:flex; align-items:center; gap:10px;">
              <div class="avatar">${initials(u.name)}</div>
              <div>
                <div style="font-weight:600;font-size:13.5px;">${u.name}</div>
                <div style="font-size:11.5px;color:var(--graphite);">${isCand ? u.sector : u.company}</div>
              </div>
            </div>
            <button class="btn btn-sm btn-primary" onclick="loginAs('${role}','${u.id}')">Log in</button>
          </div>
        `).join('')}
      ` : isCand ? `
        <form onsubmit="signupCandidate(event)">
          <div class="field"><label>Full name</label><input name="name" required placeholder="Jordan Lee"/></div>
          <div class="field"><label>Email</label><input name="email" type="email" placeholder="jordan@mail.com"/></div>
          <div class="field"><label>Sector</label><select name="sector">${sectors.map(s=>`<option>${s}</option>`).join('')}</select></div>
          <div class="field"><label>Portfolio paragraph</label><textarea name="bio" placeholder="A few sentences on what you've built and how you work."></textarea></div>
          <button class="btn btn-primary btn-block" type="submit">Create candidate account</button>
        </form>
      ` : `
        <form onsubmit="signupRecruiter(event)">
          <div class="field"><label>Your name</label><input name="name" required placeholder="Sam Patel"/></div>
          <div class="field"><label>Company</label><input name="company" required placeholder="Acme Inc."/></div>
          <div class="field"><label>Sector</label><select name="sector">${sectors.map(s=>`<option>${s}</option>`).join('')}</select></div>
          <div class="field"><label>Email</label><input name="email" type="email" placeholder="sam@acme.com"/></div>
          <div class="field"><label>About the company</label><textarea name="about" placeholder="What does the company do?"></textarea></div>
          <button class="btn btn-primary btn-block" type="submit">Create recruiter account</button>
        </form>
      `}
      <button class="btn btn-ghost btn-block" style="margin-top:10px;" onclick="backToLanding()">Back</button>
    </div>
  </div>`;
}

/* ===== CANDIDATE VIEWS ===== */
function candNav(active) {
  return [
    { key: 'home', label: 'Home', action: "goto('candidate-home')" },
    { key: 'challenges', label: 'Open Challenges', action: "goto('candidate-challenges')" },
    { key: 'matches', label: 'Matches & Chat', action: "goto('candidate-matches')" },
    { key: 'profile', label: 'Profile', action: "goto('candidate-profile')" },
  ].map(n => ({ ...n, active: n.key === active }));
}

function jobDeckHtml(cid) {
  const undecided = DB.jobs.filter(j => !(DB.swipesC[cid] && DB.swipesC[cid][j.id]));
  if (undecided.length === 0) {
    return `<div class="deck-empty">You've been through every open role.<br/>Check back later or revisit your matches.</div>`;
  }
  const top = undecided[0], second = undecided[1];
  const cardHtml = (job, cls, score) => `
    <div class="dossier-card ${cls}" ${cls === 'top' ? 'id="topCard"' : ''} data-swipe-id="${job.id}">
      <div class="stamp"><b>${score}%</b><small>match</small></div>
      <div class="sector-pill">${job.sector}</div>
      <h3>${job.title}</h3>
      <div class="card-sub">${job.company} • ${job.location}</div>
      <div class="perforation"></div>
      <div class="card-meta"><span>${job.pay}</span><span>•</span><span>${job.location}</span></div>
      <div class="card-desc">${job.blurb}</div>
      <div class="card-actions">
        <button class="swipe-btn pass" onclick="candidateSwipe('${job.id}', 'pass')">✕ Not interested</button>
        <button class="swipe-btn like" onclick="candidateSwipe('${job.id}', 'interested')">♥ Interested</button>
      </div>
    </div>`;
  return `
    ${second ? cardHtml(second, 'behind', matchScore(second.id + cid)) : ''}
    ${cardHtml(top, 'top', matchScore(top.id + cid))}
  `;
}

function renderCandidateHome() {
  const cid = session.userId;
  const tabs = `
    <div class="tabbar">
      <button class="${session.candTab === 'browse' ? 'active' : ''}" onclick="session.candTab='browse'; session.companySel=null; render()">Browse</button>
      <button class="${session.candTab === 'jobs' ? 'active' : ''}" onclick="session.candTab='jobs'; render()">Search jobs</button>
      <button class="${session.candTab === 'companies' ? 'active' : ''}" onclick="session.candTab='companies'; session.companySel=null; render()">Companies</button>
    </div>`;
  let body = '';
  if (session.candTab === 'browse') {
    body = `
      <div class="deck-wrap">
        <div class="deck">${jobDeckHtml(cid)}</div>
        <div class="deck-hint">Drag the card, or use the buttons below</div>
      </div>`;
  } else if (session.candTab === 'jobs') {
    body = `
      <div class="search-row">
        <input placeholder="Search by job title, company, or sector..." oninput="session.jobQuery=this.value; backgroundRender()" value="${htmlEscape(session.jobQuery || '')}"/>
      </div>
      ${jobResultsList((session.jobQuery || '').toLowerCase(), cid)}`;
  } else {
    if (session.companySel) {
      const comp = session.companySel;
      const jobs = DB.jobs.filter(j => j.company === comp);
      body = `
        <button class="btn btn-ghost btn-sm" style="margin-bottom:14px;" onclick="session.companySel=null; render()">← All companies</button>
        <h3 style="margin-bottom:14px;">${comp} open positions</h3>
        ${jobs.map(j => jobRowHtml(j, cid)).join('') || `<div class="empty-note">No open roles right now.</div>`}`;
    } else {
      body = `
        <div class="grid-companies">
          ${companiesList().map(c => `
            <div class="company-card" onclick="selectCompany('${c.recruiterId}')">
              <h4>${c.company}</h4>
              <div class="lr-meta">${c.sector} • ${c.count} open role${c.count > 1 ? 's' : ''}</div>
            </div>
          `).join('')}
        </div>`;
    }
  }
  return shell(candNav('home'), 'home', 'Candidate home', 'Browse open roles, search by job or company, and swipe to show interest.', tabs + body);
}

function jobRowHtml(j, cid) {
  const decided = DB.swipesC[cid] && DB.swipesC[cid][j.id];
  return `
    <div class="list-row" onclick="openJobDetail('${j.id}')" style="cursor:pointer;">
      <div class="lr-stamp">${matchScore(j.id + cid)}%</div>
      <div class="lr-main">
        <h4>${j.title}</h4>
        <div class="lr-sub">${j.company} • ${j.location} • ${j.pay}</div>
        <div class="lr-meta">${j.sector} ${decided ? '• ' + (decided === 'interested' ? 'You showed interest' : 'Passed') : ''}</div>
      </div>
    </div>`;
}

function jobResultsList(q, cid) {
  const results = DB.jobs.filter(j => !q || decodeText(j.title + j.company + j.sector).toLowerCase().includes(q));
  if (results.length === 0) return '<div class="empty-note">No roles match that search.</div>';
  return results.map(j => jobRowHtml(j, cid)).join('');
}

function renderCandidateChallenges() {
  const cid = session.userId;
  const mySubs = DB.submissions.filter(s => s.candidateId === cid);
  const body = DB.challenges.filter(ch => !ch.archived).map(ch => {
    const mine = mySubs.find(s => s.challengeId === ch.id);
    const posterLabel = ch.postedBy === 'admin' ? 'Recruider' : recById(ch.postedBy)?.company;
    return `
      <div class="panel">
        <div style="display:flex; justify-content:space-between; gap:14px; flex-wrap:wrap;">
          <div>
            <div class="eyebrow">${ch.sector} • posted by ${posterLabel}</div>
            <h3 style="margin-top:6px;">${ch.title}</h3>
          </div>
          ${mine ? `<span class="badge-chip" style="align-self:flex-start;">✓ ${mine.reviewed ? 'Reviewed' : 'Submitted'}</span>` : ''}
        </div>
        <p style="font-size:13.5px;color:var(--graphite); line-height:1.6;margin:12px 0 14px;">${ch.desc}</p>
        ${mine ? `
          <div class="panel" style="background:var(--ink-softer);margin:0;">
            <div class="eyebrow" style="margin-bottom:8px;">Your submission</div>
            <div style="font-size:13.5px; line-height:1.55;">${mine.text}</div>
          </div>
        ` : `
          <textarea id="sub-${ch.id}" placeholder="Write your submission as a short paragraph..." style="width:100%; background:var(--ink-softer); border:1px solid var(--line);border-radius:10px;padding:12px; color:var(--paper); min-height:80px;margin-bottom:10px;"></textarea>
          <button class="btn btn-primary btn-sm" onclick="submitChallenge('${ch.id}')">Submit challenge</button>
        `}
      </div>`;
  }).join('');
  return shell(candNav('challenges'), 'challenges', 'Open challenges', 'Take on a challenge to build proof-of-work into your portfolio.', body);
}



function renderCandidateProfile() {
  const c = candById(session.userId);
  const interestedRecruiters = [];
  Object.entries(DB.swipesR).forEach(([rid, map]) => {
    if (map[c.id] && map[c.id].decision === 'interested') {
      const job = jobById(map[c.id].jobId);
      const matched = DB.matches.find(m => m.candidateId === c.id && m.jobId === map[c.id].jobId);
      interestedRecruiters.push({ recruiter: recById(rid), job, matched: !!matched });
    }
  });
  const mySubs = DB.submissions.filter(s => s.candidateId === c.id);
  const body = `
    <div class="two-col">
      <div class="panel">
        <h3>Basic info</h3>
        <div class="field"><label>Name</label><input value="${c.name}" onchange="saveProfile('name',this.value)"/></div>
        <div class="field"><label>Sector</label>
          <select onchange="saveProfile('sector',this.value)">
            ${['Tech', 'Design', 'Marketing', 'Product', 'Other'].map(s=>`<option ${s===c.sector?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Skills (comma separated)</label>
          <input value="${c.skills.join(', ')}" onchange="saveProfile('skills',this.value.split(',').map(s=>s.trim()).filter(Boolean))"/>
        </div>
      </div>
      <div class="panel">
        <h3>Portfolio paragraph • ${c.sector}</h3>
        <div class="field"><textarea onchange="saveProfile('bio',this.value)" style="min-height:150px;">${c.bio}</textarea></div>
        <div class="eyebrow">This paragraph is what recruiters see as your portfolio.</div>
      </div>
    </div>
    <div class="panel">
      <h3>Badges earned</h3>
      ${c.badges.length ? c.badges.map(bid => { const b = badgeById(bid); return `<span class="badge-chip">★ ${b ? b.name : bid}</span>`; }).join('') : `<div class="empty-note">No badges yet - complete a challenge to earn one from the admin team.</div>`}
    </div>
    <div class="panel">
      <h3>Challenges completed</h3>
      ${mySubs.length ? mySubs.map(s => `
        <div class="sub-item">
          <div class="sub-title" style="color:var(--paper);">${DB.challenges.find(ch => ch.id === s.challengeId)?.title}</div>
          <div class="sub-text">${s.text}</div>
        </div>
      `).join('') : '<div class="empty-note">No submissions yet - check Open Challenges.</div>'}
    </div>
    <div class="panel">
      <h3>Companies that showed interest</h3>
      ${interestedRecruiters.length ? interestedRecruiters.map(x => `
        <div class="list-row">
          <div class="lr-stamp">${initials(x.recruiter.company)}</div>
          <div class="lr-main">
            <h4>${x.recruiter.company}</h4>
            <div class="lr-sub">Interested in you for ${x.job ? x.job.title : 'a role'}</div>
          </div>
          ${x.matched ? `<span class="badge-chip" style="color:var(--green); background:var(--green-soft);">Matched</span>` : `<button class="btn btn-sm btn-primary" onclick="candidateSwipe('${x.job.id}','interested'); goto('candidate-profile')">Show interest back</button>`}
        </div>
      `).join('') : '<div class="empty-note">No companies have shown interest yet.</div>'}
    </div>`;
  return shell(candNav('profile'), 'profile', 'Your profile', 'Edit your info and portfolio paragraph - this is what recruiters see.', body);
}

function renderCandidateMatches() {
  return shell(candNav('matches'), 'matches', 'Matches & chat', 'Chat unlocks once you and a recruiter both show interest.', matchesAndChatHtml('candidate'));
}

/* ===== RECRUITER VIEWS ===== */
function recNav(active) {
  return [
    { key: 'home', label: 'Home', action: "goto('recruiter-home')" },
    { key: 'postjob', label: '+ Post a job', action: "goto('recruiter-postjob')" },
    { key: 'postchal', label: 'Post a challenge', action: "goto('recruiter-postchallenge')" },
    { key: 'matches', label: 'Matches & Chat', action: "goto('recruiter-matches')" },
    { key: 'profile', label: 'Profile', action: "goto('recruiter-profile')" },
  ].map(n => ({ ...n, active: n.key === active }));
}

function candDeckHtml(rid) {
  const undecided = DB.candidates.filter(c => !(DB.swipesR[rid] && DB.swipesR[rid][c.id]));
  if (undecided.length === 0) {
    return `<div class="deck-empty">You've reviewed every candidate.<br/>Check back later or revisit your matches.</div>`;
  }
  const top = undecided[0], second = undecided[1];
  const cardHtml = (c, cls, score) => `
    <div class="dossier-card ${cls}" ${cls === 'top' ? 'id="topCard"' : ''} data-swipe-id="${c.id}">
      <div class="stamp"><b>${score}%</b><small>fit</small></div>
      <div class="sector-pill">${c.sector}</div>
      <h3>${c.name}</h3>
      <div class="card-sub">${c.skills.slice(0,3).join(' • ') || 'Skills not listed'}</div>
      <div class="perforation"></div>
      <div class="card-desc">${c.bio}</div>
      <div class="skill-tags">${c.badges.map(b => `<span class="skill-tag">★ ${badgeById(b)?.name || b}</span>`).join('')}</div>
      <div class="card-actions">
        <button class="swipe-btn pass" onclick="recruiterDecide('${c.id}', 'pass', null); render()">✕ Not interested</button>
        <button class="swipe-btn like" onclick="openPositionPicker('${c.id}')">♥ Interested</button>
      </div>
      <button class="btn btn-ghost btn-sm" style="margin-top:8px;" onclick="openPortfolio('${c.id}')">See portfolio →</button>
    </div>`;
  return `
    ${second ? cardHtml(second, 'behind', matchScore(second.id + rid)) : ''}
    ${cardHtml(top, 'top', matchScore(top.id + rid))}
  `;
}

function openPositionPicker(candidateId) {
  const rid = session.userId;
  const myJobs = DB.jobs.filter(j => j.recruiterId === rid);
  session.modal = { type: 'positionPicker', candidateId, myJobs };
  render();
}



function candRowHtml(c, rid) {
  const decided = DB.swipesR[rid] && DB.swipesR[rid][c.id];
  return `
    <div class="list-row" onclick="openCandidateDetail('${c.id}')" style="cursor:pointer;">
      <div class="lr-stamp">${initials(c.name)}</div>
      <div class="lr-main">
        <h4>${c.name}</h4>
        <div class="lr-sub">${c.sector} • ${c.skills.slice(0,3).join(', ') || '-'}</div>
        <div class="lr-meta">${decided ? (decided.decision === 'interested' ? 'You showed interest' : 'Passed') : 'Not reviewed yet'}</div>
      </div>
    </div>`;
}

function renderRecruiterHome() {
  const rid = session.userId;
  const tabs = `
    <div class="tabbar">
      <button class="${session.recTab === 'browse' ? 'active' : ''}" onclick="session.recTab='browse'; render()">Browse</button>
      <button class="${session.recTab === 'search' ? 'active' : ''}" onclick="session.recTab='search'; render()">Search candidates</button>
    </div>`;
  let body;
  if (session.recTab === 'browse') {
    body = `
      <div class="deck-wrap">
        <div class="deck">${candDeckHtml(rid)}</div>
        <div class="deck-hint">Drag left to pass, drag right to show interest or use the buttons below.</div>
      </div>`;
  } else {
    const q = (session.candQuery || '').toLowerCase();
    const results = DB.candidates.filter(c => !q || decodeText(c.name + c.sector + c.skills.join(' ')).toLowerCase().includes(q));
    body = `
      <div class="search-row"><input placeholder="Search by name or skill..." value="${htmlEscape(session.candQuery || '')}" oninput="session.candQuery=this.value; backgroundRender()"/></div>
      ${results.length ? results.map(c => candRowHtml(c, rid)).join('') : `<div class="empty-note">No candidates match that search.</div>`}`;
  }
  return shell(recNav('home'), 'home', 'Find candidates', 'Browse the swipe deck or search directly by name or skill.', tabs + body);
}

function renderRecruiterPostJob() {
  const body = `
    <div class="panel" style="max-width:520px;">
      <form onsubmit="postJob(event)">
        <div class="field"><label>Job title</label><input name="title" required placeholder="e.g. Backend Engineer"/></div>
        <div class="field"><label>Sector</label><select name="sector">${['Tech', 'Design', 'Marketing', 'Product', 'Other'].map(s=>`<option>${s}</option>`).join('')}</select></div>
        <div class="field"><label>Location</label><input name="location" placeholder="Remote / City"/></div>
        <div class="field"><label>Pay range</label><input name="pay" placeholder="₹18-26L/yr"/></div>
        <div class="field"><label>Short blurb (shown on swipe card)</label><input name="blurb" required placeholder="One line describing the role"/></div>
        <div class="field"><label>Full description</label><textarea name="desc" required placeholder="Full job description..."></textarea></div>
        <button class="btn btn-primary btn-block" type="submit">Post job</button>
      </form>
    </div>`;
  return shell(recNav('postjob'), 'postjob', 'Post a job', 'This will appear in candidate browse, search, and your company page.', body);
}



function renderRecruiterPostChallenge() {
  const body = `
    <div class="panel" style="max-width:520px;">
      <form onsubmit="postChallenge(event)">
        <div class="field"><label>Challenge title</label><input name="title" required placeholder="e.g. Design a webhook retry system"/></div>
        <div class="field"><label>Sector</label><select name="sector">${['Tech', 'Design', 'Marketing', 'Product', 'Other'].map(s=>`<option>${s}</option>`).join('')}</select></div>
        <div class="field"><label>Description</label><textarea name="desc" required placeholder="What should the candidate do or write?"></textarea></div>
        <button class="btn btn-primary btn-block" type="submit">Post custom challenge</button>
      </form>
    </div>`;
  return shell(recNav('postchal'), 'postchal', 'Post a custom challenge', 'Candidates in the matching sector will see this under Open Challenges.', body);
}



function renderRecruiterProfile() {
  const r = me();
  const myJobs = DB.jobs.filter(j => j.recruiterId === r.id);
  const bySector = {};
  myJobs.forEach(j => { (bySector[j.sector] = bySector[j.sector] || []).push(j); });
  const body = `
    <div class="panel">
      <h3>Company info</h3>
      <div class="two-col">
        <div class="field"><label>Contact name</label><input value="${r.name}" onchange="saveProfile('name',this.value)"/></div>
        <div class="field"><label>Company</label><input value="${r.company}" onchange="saveProfile('company',this.value)"/></div>
      </div>
      <div class="field"><label>About</label><textarea onchange="saveProfile('about',this.value)">${r.about || ''}</textarea></div>
    </div>
    <div class="panel">
      <h3>Posted jobs - by sector</h3>
      ${Object.keys(bySector).length ? Object.entries(bySector).map(([sec, jobs]) => `
        <div class="sector-group">
          <h4>${sec}</h4>
          ${jobs.map(j => `
            <div class="list-row">
              <div class="lr-stamp">${initials(j.title)}</div>
              <div class="lr-main"><h4>${j.title}</h4><div class="lr-sub">${j.location} • ${j.pay}</div></div>
            </div>
          `).join('')}
        </div>
      `).join('') : '<div class="empty-note">You haven\'t posted any jobs yet.</div>'}
      <button class="btn btn-primary btn-sm" onclick="goto('recruiter-postjob')">+ Post a job</button>
    </div>`;
  return shell(recNav('profile'), 'profile', 'Company profile', '', body);
}

function renderRecruiterMatches() {
  return shell(recNav('matches'), 'matches', 'Matches & chat', 'Chat unlocks once you and the candidate both show interest.', matchesAndChatHtml('recruiter'));
}

/* ===== ADMIN VIEWS ===== */
function adminNav(active) {
  return [
    { key: 'dashboard', label: 'Dashboard', action: "goto('admin-dashboard')" },
    { key: 'challenges', label: 'Challenges', action: "goto('admin-challenges')" },
    { key: 'badges', label: 'Award badges', action: "goto('admin-badges')" },
    { key: 'data', label: 'Backend data', action: "goto('admin-data')" },
  ].map(n => ({ ...n, active: n.key === active }));
}

function renderAdminDashboard() {
  const pending = DB.submissions.filter(s => !s.reviewed);
  const activeChallenges = DB.challenges.filter(c => !c.archived);
  const archivedChallenges = DB.challenges.filter(c => c.archived);
  const recent = DB.submissions.slice().reverse().slice(0, 6);
  const body = `
    <div class="stat-row">
      <div class="stat-box"><div class="val">${DB.candidates.length}</div><div class="lbl">Candidates</div></div>
      <div class="stat-box"><div class="val">${DB.recruiters.length}</div><div class="lbl">Recruiters</div></div>
      <div class="stat-box"><div class="val">${DB.jobs.length}</div><div class="lbl">Open jobs</div></div>
      <div class="stat-box"><div class="val">${activeChallenges.length}</div><div class="lbl">Active challenges</div></div>
      <div class="stat-box"><div class="val">${pending.length}</div><div class="lbl">Pending reviews</div></div>
      <div class="stat-box"><div class="val">${DB.matches.length}</div><div class="lbl">Mutual matches</div></div>
    </div>
    <div class="two-col">
      <div class="panel">
        <h3>Review queue</h3>
        ${pending.length ? pending.slice().reverse().slice(0,5).map(s => `
          <div class="list-row">
            <div class="lr-stamp">${initials(candById(s.candidateId)?.name || '?')}</div>
            <div class="lr-main">
              <h4>${candById(s.candidateId)?.name || 'Unknown candidate'}</h4>
              <div class="lr-sub">${DB.challenges.find(c => c.id === s.challengeId)?.title || 'Unknown challenge'}</div>
              <div class="lr-meta">${s.ts}</div>
            </div>
            <button class="btn btn-sm btn-ok" onclick="toggleReview('${s.id}')">Mark reviewed</button>
          </div>
        `).join('') : `<div class="empty-note">Nothing waiting for review.</div>`}
        <button class="btn btn-ghost btn-sm" onclick="goto('admin-challenges')" style="margin-top:8px;">Open challenge manager →</button>
      </div>
      <div class="panel">
        <h3>Challenge health</h3>
        <div class="sub-item">
          <div class="sub-title">${activeChallenges.length} active</div>
          <div class="sub-text">Visible to candidates and accepting submissions.</div>
        </div>
        <div class="sub-item">
          <div class="sub-title">${archivedChallenges.length} archived</div>
          <div class="sub-text">Hidden from candidate challenge browsing but retained in admin records.</div>
        </div>
        <div class="sub-item">
          <div class="sub-title">${DB.submissions.length} total submissions</div>
          <div class="sub-text">${pending.length} pending review • ${DB.submissions.length - pending.length} reviewed.</div>
        </div>
      </div>
    </div>
    <div class="panel">
      <h3>Recent submissions</h3>
      ${recent.map(s => `
        <div class="sub-item">
          <div class="sub-title">${candById(s.candidateId)?.name || 'Unknown'} → ${DB.challenges.find(c => c.id === s.challengeId)?.title || 'Unknown challenge'}</div>
          <div class="sub-text">${s.text}</div>
          <div class="lr-meta">${s.reviewed ? 'Reviewed' : 'Pending review'} • ${s.ts}</div>
        </div>
      `).join('') || '<div class="empty-note">No submissions yet.</div>'}
    </div>`;
  return shell(adminNav('dashboard'), 'dashboard', 'Admin dashboard', 'Platform-wide overview and review queue.', body);
}

function renderAdminChallenges() {
  const q = (session.adminChallengeQuery || '').toLowerCase();
  const filter = session.adminChallengeFilter || 'active';
  const challenges = DB.challenges.filter(ch => {
    const matchesQ = !q || decodeText(ch.title + ' ' + ch.sector + ' ' + (ch.postedBy === 'admin' ? 'Recruider' : recById(ch.postedBy)?.company || '')).toLowerCase().includes(q);
    const matchesFilter = filter === 'all' || (filter === 'active' ? !ch.archived : ch.archived);
    return matchesQ && matchesFilter;
  });
  const body = `
    <div class="panel" style="max-width:720px;">
      <div style="display:flex; justify-content:space-between; gap:12px;align-items:center; flex-wrap:wrap;">
        <h3>Post a global challenge</h3>
        <span class="badge-chip">${DB.challenges.filter(c => !c.archived).length} active</span>
      </div>
      <form onsubmit="postAdminChallenge(event)">
        <div class="two-col">
          <div class="field"><label>Title</label><input name="title" required placeholder="e.g. Redesign a checkout"/></div>
          <div class="field"><label>Sector</label><select name="sector">${['Tech', 'Design', 'Marketing', 'Product', 'Other'].map(s=>`<option>${s}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Description</label><textarea name="desc" required placeholder="What should the candidate solve, build, design, or explain?"></textarea></div>
        <button class="btn btn-primary btn-block" type="submit">Post challenge</button>
      </form>
    </div>
    <div class="panel">
      <div style="display:flex; gap:10px;align-items:center; flex-wrap:wrap;margin-bottom:16px;">
        <input style="flex:1; min-width:220px; background:var(--ink-softer); border:1px solid var(--line);color:var(--paper);border-radius:10px;padding:11px 13px;" placeholder="Search challenges..." value="${htmlEscape(session.adminChallengeQuery || '')}" oninput="session.adminChallengeQuery=this.value; backgroundRender()"/>
        <div class="tabbar" style="margin:0;">
          <button class="${filter === 'active' ? 'active' : ''}" onclick="session.adminChallengeFilter='active'; render()">Active</button>
          <button class="${filter === 'archived' ? 'active' : ''}" onclick="session.adminChallengeFilter='archived'; render()">Archived</button>
          <button class="${filter === 'all' ? 'active' : ''}" onclick="session.adminChallengeFilter='all';render()">All</button>
        </div>
      </div>
      <h3>Challenge manager</h3>
      ${challenges.length ? challenges.map(ch => {
        const st = challengeStatus(ch);
        const poster = ch.postedBy === 'admin' ? 'Recruider' : recById(ch.postedBy)?.company || 'Recruiter';
        const subs = DB.submissions.filter(s => s.challengeId === ch.id);
        return `
          <div class="panel" style="background:var(--ink-softer); margin:14px 0;">
            <div style="display:flex; justify-content:space-between; gap:14px;align-items:flex-start; flex-wrap:wrap;">
              <div>
                <div class="eyebrow">${ch.sector} • ${poster} • ${ch.archived ? 'ARCHIVED' : 'ACTIVE'}</div>
                <h3 style="margin-top:6px;">${ch.title}</h3>
                <div style="font-size:13px;color:var(--graphite); line-height:1.5;margin-top:8px;">${ch.desc}</div>
              </div>
              <div style="display:flex;gap:6px; flex-wrap:wrap;">
                <span class="badge-chip">${st.submissions} submissions</span>
                <span class="badge-chip">${st.pending} pending</span>
                <span class="badge-chip">${st.reviewed} reviewed</span>
              </div>
            </div>
            <div style="display:flex;gap:8px; flex-wrap:wrap;margin-top:14px;">
              <button class="btn btn-sm btn-primary" onclick="archiveChallenge('${ch.id}')">${ch.archived ? 'Restore' : 'Archive'}</button>
              ${st.submissions === 0 ? `<button class="btn btn-sm btn-danger" onclick="deleteChallenge('${ch.id}')">Delete</button>` : ''}
            </div>
            <div style="margin-top:16px;">
              <div class="eyebrow" style="margin-bottom:8px;">Submissions</div>
              ${subs.map(s => `
                <div class="list-row">
                  <div class="lr-stamp">${initials(candById(s.candidateId)?.name || '?')}</div>
                  <div class="lr-main">
                    <h4>${candById(s.candidateId)?.name || 'Unknown candidate'}</h4>
                    <div class="lr-sub">${s.text}</div>
                    <div class="lr-meta">${s.ts} • ${s.reviewed ? 'Reviewed' : 'Pending review'}</div>
                  </div>
                  <button class="btn btn-sm ${s.reviewed ? 'btn-ok' : 'btn-primary'}" onclick="toggleReview('${s.id}')">${s.reviewed ? 'Reviewed' : 'Mark reviewed'}</button>
                </div>
              `).join('') || '<div class="empty-note">No submissions for this challenge yet.</div>'}
            </div>
          </div>`;
      }).join('') : '<div class="empty-note">No challenges match this filter.</div>'}
    </div>`;
  return shell(adminNav('challenges'), 'challenges', 'Challenges', 'Create, monitor, review, archive, and manage platform challenges.', body);
}



function challengeStatus(ch) {
  const subs = DB.submissions.filter(s => s.challengeId === ch.id);
  return { submissions: subs.length, reviewed: subs.filter(s => s.reviewed).length, pending: subs.filter(s => !s.reviewed).length };
}







function renderAdminBadges() {
  const body = `
    <div class="panel" style="max-width:560px;">
      <h3>Award a badge</h3>
      <form onsubmit="awardBadge(event)">
        <div class="field"><label>Candidate</label>
          <select name="cand">${DB.candidates.map(c => `<option value="${c.id}">${c.name} • ${c.sector} (${c.badges.length} badge${c.badges.length !== 1 ? 's' : ''})</option>`).join('')}</select>
        </div>
        <div class="field"><label>Badge</label>
          <select name="badge">${DB.badgesCatalog.map(b => `<option value="${b.id}">${b.name} - ${b.desc}</option>`).join('')}</select>
        </div>
        <button class="btn btn-primary btn-block" type="submit">Award badge</button>
      </form>
    </div>
    <div class="panel">
      <h3>Badge catalog</h3>
      ${DB.badgesCatalog.map(b => `
        <div class="sub-item">
          <div class="sub-title">${b.name}</div>
          <div class="sub-text">${b.desc}</div>
        </div>
      `).join('')}
    </div>
    <div class="panel">
      <h3>Current badge holders</h3>
      ${DB.candidates.filter(c => c.badges.length).map(c => `
        <div class="list-row">
          <div class="lr-stamp">${initials(c.name)}</div>
          <div class="lr-main">
            <h4>${c.name}</h4>
            <div class="lr-sub">${c.sector} • ${c.badges.map(bid => badgeById(bid)?.name).filter(Boolean).join(', ')}</div>
          </div>
          <span class="badge-chip">${c.badges.length} earned</span>
        </div>
      `).join('') || '<div class="empty-note">No badges awarded yet.</div>'}
    </div>`;
  return shell(adminNav('badges'), 'badges', 'Award badges', 'Recognise strong challenge submissions and surface verified proof-of-work.', body);
}



function renderAdminData() {
  const body = `
    <div class="panel">
      <div style="display:flex; justify-content:space-between; gap:10px;align-items:center; flex-wrap:wrap;">
        <h3>Candidates (${DB.candidates.length})</h3>
        <span class="eyebrow">profiles / badges</span>
      </div>
      <table class="data-table">
        <thead><tr><th>ID</th><th>Name</th><th>Sector</th><th>Badges</th></tr></thead>
        <tbody>${DB.candidates.map(c => `<tr><td>${c.id}</td><td>${c.name}</td><td>${c.sector}</td><td>${c.badges.length}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="panel">
      <h3>Recruiters (${DB.recruiters.length})</h3>
      <table class="data-table">
        <thead><tr><th>ID</th><th>Name</th><th>Company</th><th>Sector</th></tr></thead>
        <tbody>${DB.recruiters.map(r => `<tr><td>${r.id}</td><td>${r.name}</td><td>${r.company}</td><td>${r.sector}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="panel">
      <h3>Jobs (${DB.jobs.length})</h3>
      <table class="data-table">
        <thead><tr><th>ID</th><th>Title</th><th>Company</th><th>Sector</th><th>Location</th></tr></thead>
        <tbody>${DB.jobs.map(j => `<tr><td>${j.id}</td><td>${j.title}</td><td>${j.company}</td><td>${j.sector}</td><td>${j.location}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="panel">
      <h3>Challenges (${DB.challenges.length})</h3>
      <table class="data-table">
        <thead><tr><th>ID</th><th>Title</th><th>Sector</th><th>Posted by</th><th>Status</th><th>Submissions</th></tr></thead>
        <tbody>${DB.challenges.map(ch => `<tr><td>${ch.id}</td><td>${ch.title}</td><td>${ch.sector}</td><td>${ch.postedBy === 'admin' ? 'Recruider' : recById(ch.postedBy)?.company || 'Recruiter'}</td><td>${ch.archived ? 'Archived' : 'Active'}</td><td>${challengeStatus(ch).submissions}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="panel">
      <h3>Submissions (${DB.submissions.length})</h3>
      <table class="data-table">
        <thead><tr><th>ID</th><th>Candidate</th><th>Challenge</th><th>Status</th><th>Submitted</th></tr></thead>
        <tbody>${DB.submissions.map(s => `<tr><td>${s.id}</td><td>${candById(s.candidateId)?.name || 'Unknown'}</td><td>${DB.challenges.find(c => c.id === s.challengeId)?.title || 'Unknown'}</td><td>${s.reviewed ? 'Reviewed' : 'Pending'}</td><td>${s.ts}</td></tr>`).join('') || `<tr><td colspan="5" style="color:var(--graphite);">No submissions yet</td></tr>`}</tbody>
      </table>
    </div>
    <div class="panel">
      <h3>Matches (${DB.matches.length})</h3>
      <table class="data-table">
        <thead><tr><th>Candidate</th><th>Recruiter</th><th>Job</th><th>Messages</th></tr></thead>
        <tbody>${DB.matches.map(m => `<tr><td>${candById(m.candidateId)?.name}</td><td>${recById(m.recruiterId)?.company}</td><td>${jobById(m.jobId)?.title}</td><td>${m.chat.length}</td></tr>`).join('') || `<tr><td colspan="4" style="color:var(--graphite);">No matches yet</td></tr>`}</tbody>
      </table>
    </div>`;
  return shell(adminNav('data'), 'data', 'Backend data', 'Inspect the prototype data layer across candidates, recruiters, jobs, challenges, submissions, and matches.', body);
}

/* ===== MATCHES & CHAT ===== */
function matchesAndChatHtml(role) {
  const uidCur = session.userId;
  const mine = role === 'candidate' ? DB.matches.filter(m => m.candidateId === uidCur) : DB.matches.filter(m => m.recruiterId === uidCur);
  const active = session.activeMatchId && mine.find(m => m.id === session.activeMatchId);
  const list = mine.map(m => {
    const other = role === 'candidate' ? recById(m.recruiterId) : candById(m.candidateId);
    const otherLabel = role === 'candidate' ? (other?.company || 'Company') : (other?.name || 'Candidate');
    const job = jobById(m.jobId);
    return `
      <div class="match-row" onclick="session.activeMatchId='${m.id}';render()" style="${active && active.id === m.id ? 'border-color:var(--amber);' : ''}">
        <div class="avatar">${initials(otherLabel)}</div>
        <div>
          <div style="font-weight:600;font-size:13.5px;">${otherLabel}</div>
          <div style="font-size:11.5px;color:var(--graphite);">${job ? job.title : ''}</div>
        </div>
      </div>`;
  }).join('') || `<div class="empty-note">No matches yet. Swipe right on something you both like.</div>`;

  let panel = `<div class="chat-panel"><div class="chat-empty">Select a match to open the chat.</div></div>`;
  if (active) {
    const other = role === 'candidate' ? recById(active.recruiterId) : candById(active.candidateId);
    const otherLabel = role === 'candidate' ? (other?.company || 'Company') : (other?.name || 'Candidate');
    const job = jobById(active.jobId);
    panel = `
      <div class="chat-panel">
        <div class="chat-head"><h4>${otherLabel}</h4><div class="eyebrow">${job ? job.title : ''}</div></div>
        <div class="chat-body" id="chatBody">
          ${active.chat.length ? active.chat.map(m => `
            <div class="bubble ${m.from === role ? 'me' : 'them'}">${m.text}<span class="ts">${m.ts}</span></div>
          `).join('') : '<div class="chat-empty">Say hello - you matched!</div>'}
        </div>
        <div class="chat-input">
          <input id="chatInput" placeholder="Write a message..." onkeydown="if(event.key==='Enter') sendChat('${active.id}','${role}')"/>
          <button class="btn btn-primary" onclick="sendChat('${active.id}','${role}')">Send</button>
        </div>
      </div>`;
  }
  return `<div class="chat-shell"><div class="chat-list">${list}</div>${panel}</div>`;
}



/* ===== MODALS ===== */
function openJobDetail(jobId) { session.modal = { type: 'job', jobId }; render(); }
function openCandidateDetail(candidateId) { session.modal = { type: 'candidate', candidateId }; render(); }
function openPortfolio(candidateId) { session.modal = { type: 'portfolio', candidateId }; render(); }
function closeModal() { session.modal = null; render(); }

function modalHtml() {
  const m = session.modal;
  if (!m) return '';
  let inner = '';
  if (m.type === 'job') {
    const j = jobById(m.jobId);
    const cid = session.userId;
    const decided = session.role === 'candidate' && DB.swipesC[cid] && DB.swipesC[cid][j.id];
    inner = `
      <div class="sector-pill">${j.sector}</div>
      <h3>${j.title}</h3>
      <div class="m-sub">${j.company} • ${j.location} • ${j.pay}</div>
      <div class="card-desc">${j.desc}</div>
      ${session.role === 'candidate' ? `
        <div class="card-actions">
          <button class="swipe-btn pass" onclick="candidateSwipe('${j.id}','pass'); closeModal()">✕ Not interested</button>
          <button class="swipe-btn like" onclick="candidateSwipe('${j.id}','interested'); closeModal()">♥ Interested</button>
        </div>
        ${decided ? `<div class="eyebrow" style="margin-top:10px;">You already marked this: ${decided}</div>` : ''}
      ` : ''}`;
  } else if (m.type === 'candidate') {
    const c = candById(m.candidateId);
    inner = `
      <div class="sector-pill">${c.sector}</div>
      <h3>${c.name}</h3>
      <div class="m-sub">${c.skills.join(' • ') || 'No skills listed'}</div>
      <div class="portfolio-block"><p>${c.bio}</p></div>
      <button class="btn btn-ghost btn-sm" onclick="openPortfolio('${c.id}')">See full portfolio →</button>
      ${session.role === 'recruiter' ? `
        <div class="card-actions" style="margin-top:16px;">
          <button class="swipe-btn pass" onclick="recruiterDecide('${c.id}','pass', null); closeModal()">✕ Not interested</button>
          <button class="swipe-btn like" onclick="closeModal(); openPositionPicker('${c.id}')">♥ Interested</button>
        </div>
      ` : ''}`;
  } else if (m.type === 'portfolio') {
    const c = candById(m.candidateId);
    const subs = DB.submissions.filter(s => s.candidateId === c.id);
    inner = `
      <div class="sector-pill">${c.sector} portfolio</div>
      <h3>${c.name}</h3>
      <div class="portfolio-block"><p>${c.bio}</p></div>
      <div class="eyebrow" style="margin:16px 0 8px;">Badges</div>
      ${c.badges.length ? c.badges.map(bid => `<span class="badge-chip">★ ${badgeById(bid)?.name}</span>`).join('') : `<div class="empty-note">No badges yet.</div>`}
      <div class="eyebrow" style="margin:16px 0 8px;">Challenges completed</div>
      ${subs.length ? subs.map(s => `
        <div class="sub-item"><div class="sub-title">${DB.challenges.find(ch => ch.id === s.challengeId)?.title}</div><div class="sub-text">${s.text}</div></div>
      `).join('') : '<div class="empty-note">No completed challenges yet.</div>'}`;
  } else if (m.type === 'positionPicker') {
    inner = `
      <h3>Which position is this for?</h3>
      <div class="m-sub">Choose one of your open roles to send interest with.</div>
      ${m.myJobs.length ? m.myJobs.map(j => `
        <div class="list-row" style="cursor:pointer;" onclick="confirmPosition('${m.candidateId}','${j.id}')">
          <div class="lr-stamp">${initials(j.title)}</div>
          <div class="lr-main"><h4>${j.title}</h4><div class="lr-sub">${j.sector} • ${j.location}</div></div>
        </div>
      `).join('') : `<div class="empty-note">Post a job first before showing interest.</div>`}`;
  }
  return `
    <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="modal"><button class="modal-close" onclick="closeModal()">×</button>${inner}</div>
    </div>`;
}

/* ===== DRAG (top swipe card) ===== */
function attachDrag() {
  const card = document.getElementById('topCard');
  if (!card) return;
  if (card._cleanup) card._cleanup();

  let startX = 0, startY = 0, curX = 0, dragging = false, pointerId = null;

  const onDown = (e) => {
    if (e.target.closest('button, a, input, textarea, select')) return;
    dragging = true;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    curX = 0;
    card.style.transition = 'none';
    card.style.cursor = 'grabbing';
    try { card.setPointerCapture(pointerId); } catch (_) {}
  };

  const onMove = (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    curX = e.clientX - startX;
    const dy = (e.clientY - startY) * 0.2;
    card.style.transform = `translate(${curX}px, ${dy}px) rotate(${curX / 18}deg)`;
  };

  const finish = () => {
    if (!dragging) return;
    dragging = false;
    card.style.cursor = 'grab';
    card.style.transition = 'transform .25s ease, opacity .25s ease';
    const cardId = card.dataset.swipeId || card.getAttribute('data-swipe-id');
    if (curX > 120) {
      card.style.transform = 'translate(650px, -40px) rotate(24deg)';
      card.style.opacity = '0';
      setTimeout(() => swipeFromCard(cardId, 'interested'), 180);
    } else if (curX < -120) {
      card.style.transform = 'translate(-650px, -40px) rotate(-24deg)';
      card.style.opacity = '0';
      setTimeout(() => swipeFromCard(cardId, 'pass'), 180);
    } else {
      card.style.transform = 'translate(0,0) rotate(0)';
      curX = 0;
      pointerId = null;
    }
  };

  const onCancel = () => {
    if (!dragging) return;
    dragging = false;
    curX = 0;
    pointerId = null;
    card.style.transition = 'transform .2s ease';
    card.style.transform = 'translate(0,0) rotate(0)';
    card.style.cursor = 'grab';
  };

  card.addEventListener('pointerdown', onDown);
  card.addEventListener('pointermove', onMove);
  card.addEventListener('pointerup', finish);
  card.addEventListener('pointercancel', onCancel);

  card._cleanup = () => {
    card.removeEventListener('pointerdown', onDown);
    card.removeEventListener('pointermove', onMove);
    card.removeEventListener('pointerup', finish);
    card.removeEventListener('pointercancel', onCancel);
  };
}

function swipeFromCard(id, decision) {
  if (!id) return;
  if (session.role === 'candidate') {
    candidateSwipe(id, decision);
  } else if (session.role === 'recruiter') {
    if (decision === 'interested') openPositionPicker(id);
    else recruiterDecide(id, 'pass', null);
  }
}

/* ===== RENDER ENGINE ===== */
function render() {
  let html = '';
  if (session.screen === 'landing') html = renderLanding();
  else if (session.screen === 'auth') html = renderAuth();
  else if (session.screen === 'candidate-home') html = renderCandidateHome();
  else if (session.screen === 'candidate-challenges') html = renderCandidateChallenges();
  else if (session.screen === 'candidate-matches') html = renderCandidateMatches();
  else if (session.screen === 'candidate-profile') html = renderCandidateProfile();
  else if (session.screen === 'recruiter-home') html = renderRecruiterHome();
  else if (session.screen === 'recruiter-postjob') html = renderRecruiterPostJob();
  else if (session.screen === 'recruiter-postchallenge') html = renderRecruiterPostChallenge();
  else if (session.screen === 'recruiter-profile') html = renderRecruiterProfile();
  else if (session.screen === 'recruiter-matches') html = renderRecruiterMatches();
  else if (session.screen === 'admin-dashboard') html = renderAdminDashboard();
  else if (session.screen === 'admin-challenges') html = renderAdminChallenges();
  else if (session.screen === 'admin-badges') html = renderAdminBadges();
  else if (session.screen === 'admin-data') html = renderAdminData();

  html += modalHtml();
  if (session.toast) html += `<div class="toast">${session.toast}</div>`;

  document.getElementById('root').innerHTML = html;
  attachDrag();
}

