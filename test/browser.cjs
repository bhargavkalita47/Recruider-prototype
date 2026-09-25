// Optional browser verification: npm install --no-save playwright; npx playwright install chromium
// Run: node test/browser.cjs. CHROMIUM_PATH may point to an existing browser.
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync,readFileSync,mkdirSync,writeFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root=join(__dirname,'..'),temp=mkdtempSync(join(tmpdir(),'recruider-browser-'));
let server,browser;
const issues=[],report=[];
async function start(demo=true) {
 server=spawn(process.execPath,['server.mjs',...(demo?['--demo']:[])],{cwd:root,env:{...process.env,PORT:'0',HOST:'127.0.0.1',DATABASE_PATH:join(temp,demo?'demo.sqlite':'normal.sqlite')}});
 return new Promise((resolve,reject)=>{let log='';server.stdout.on('data',c=>{log+=c;const m=log.match(/http:\/\/127\.0\.0\.1:\d+/);if(m)resolve(m[0]);});server.stderr.on('data',c=>log+=c);server.on('exit',()=>reject(new Error(log)));});
}
async function stop(){await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM');});}
async function wait(page){await page.waitForFunction(()=>ready&&!busy&&!queueCount);}
async function pageAt(url) {const p=await browser.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>issues.push(e.message));await p.route('https://fonts.**/*',r=>r.abort());await p.goto(url);return p;}
async function login(page,role,id){await page.evaluate(async({role,id})=>{await loginAs(role,id);},{role,id});await wait(page);}
(async()=>{
 try {
 const base=await start();
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-gpu']});
 const original=await pageAt(pathToFileURL(join(root,'reference/prototype.html')).href), app=await pageAt(base);await wait(app);
 const originalCSS=readFileSync(join(root,'reference/prototype.html'),'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
 assert.equal(readFileSync(join(root,'public/index.html'),'utf8').match(/<style>([\s\S]*?)<\/style>/)[1],originalCSS);
 const output=join(root,'test-results');mkdirSync(output,{recursive:true});
 async function compare(name,code) {
   if(code) {await original.evaluate(code);await app.evaluate(code);}
   await original.evaluate(()=>document.fonts.ready);await app.evaluate(()=>document.fonts.ready);
   const a=await original.screenshot({animations:'disabled'}),b=await app.screenshot({animations:'disabled'});
   const equal=a.equals(b);report.push({screen:name,exactScreenshotMatch:equal});
   if(!equal){writeFileSync(join(output,name+'-original.png'),a);writeFileSync(join(output,name+'-app.png'),b);}
 }
 await compare('landing');
 await compare('candidate-auth',()=>pickRole('candidate'));
 await original.evaluate(()=>loginAs('candidate','cand1'));await login(app,'candidate','cand1');

 for(const screen of ['candidate-home','candidate-challenges','candidate-profile','candidate-matches']) {
   await original.evaluate(s=>goto(s),screen);await app.evaluate(s=>goto(s),screen);await compare(screen);
 }
 for(const tab of ['jobs','companies']) {await compare('candidate-'+tab,()=>goto('candidate-home'));await original.evaluate(t=>{session.candTab=t;render();},tab);await app.evaluate(t=>{session.candTab=t;render();},tab);await compare('candidate-tab-'+tab);}
 await original.evaluate(()=>openJobDetail('job1'));await app.evaluate(()=>openJobDetail('job1'));await compare('job-modal');
 await original.evaluate(()=>loginAs('recruiter','rec1'));await login(app,'recruiter','rec1');
 for(const screen of ['recruiter-home','recruiter-postjob','recruiter-postchallenge','recruiter-profile','recruiter-matches']) {await original.evaluate(s=>goto(s),screen);await app.evaluate(s=>goto(s),screen);await compare(screen);}
 await original.evaluate(()=>openPortfolio('cand1'));await app.evaluate(()=>openPortfolio('cand1'));await compare('portfolio-modal');
 await original.evaluate(()=>loginAs('admin','admin1'));await login(app,'admin','admin1');
 for(const screen of ['admin-dashboard','admin-challenges','admin-badges','admin-data']) {await original.evaluate(s=>goto(s),screen);await app.evaluate(s=>goto(s),screen);await compare(screen);}
 await original.setViewportSize({width:390,height:844});await app.setViewportSize({width:390,height:844});
 await original.evaluate(()=>backToLanding());await app.evaluate(()=>backToLanding());await wait(app);await compare('mobile-landing');
 await original.evaluate(()=>loginAs('candidate','cand1'));await login(app,'candidate','cand1');await compare('mobile-candidate');
 await app.setViewportSize({width:1440,height:1000});
 // Full UI actions, using separate browser contexts for separate identities.
 const rec=await pageAt(base);await wait(rec);await login(rec,'recruiter','rec1');
 await app.locator('#topCard').getByRole('button',{name:'♥ Interested',exact:true}).click();await wait(app);
 await rec.locator('#topCard').getByRole('button',{name:'♥ Interested',exact:true}).click();
 await rec.locator('.modal .list-row').first().click();await wait(rec);
 await app.evaluate(()=>refresh());await app.evaluate(()=>goto('candidate-matches'));await app.locator('.match-row').first().click();
 await rec.evaluate(()=>goto('recruiter-matches'));await rec.locator('.match-row').first().click();
 await app.locator('#chatInput').fill('Hello from UI');await app.getByRole('button',{name:'Send',exact:true}).click();await wait(app);
 await rec.waitForFunction(()=>document.body.textContent.includes('Hello from UI'));
 await rec.locator('#chatInput').fill('Unsent draft');
 await app.locator('#chatInput').fill('Second message');await app.getByRole('button',{name:'Send',exact:true}).click();await wait(app);
 await rec.waitForFunction(()=>document.body.textContent.includes('Second message'));assert.equal(await rec.locator('#chatInput').inputValue(),'Unsent draft');
 // Character-by-character typing must retain focus, including HTML-like query text.
 await rec.evaluate(()=>{goto('recruiter-home');session.recTab='search';render();});
 const search=rec.getByPlaceholder('Search by name or skill...');await search.pressSequentially('Aisha');assert.equal(await search.inputValue(),'Aisha');assert.ok((await rec.locator('.list-row').count())>=1);
 await search.fill('" autofocus onfocus="window.__injected=1');await rec.evaluate(()=>render());assert.equal(await rec.evaluate(()=>window.__injected),undefined);
 // Profile persistence and stored XSS protection.
 await app.evaluate(()=>goto('candidate-profile'));
 const hostile='<img src=x onerror="window.__injected=1">';
 await app.locator('textarea').fill(hostile);await app.locator('textarea').press('Tab');await wait(app);
 await app.reload();await wait(app);await app.evaluate(()=>goto('candidate-profile'));assert.equal(await app.locator('textarea').inputValue(),hostile);assert.equal(await app.evaluate(()=>window.__injected),undefined);
 // Candidate submission and admin review.
 await app.evaluate(()=>goto('candidate-challenges'));await app.locator('#sub-chal2').fill('Browser submission');await app.locator('#sub-chal2').locator('..').getByRole('button',{name:'Submit challenge'}).click();await wait(app);
 const admin=await pageAt(base);await wait(admin);await login(admin,'admin','admin1');assert.ok((await admin.locator('body').innerText()).includes('Browser submission'));
 await admin.getByRole('button',{name:'Mark reviewed',exact:true}).first().click();await wait(admin);
 // Recruiter form posting and candidate discovery.
 await rec.evaluate(()=>goto('recruiter-postjob'));
 for(const [name,value] of Object.entries({title:'Browser engineer',blurb:'Browser-created role',desc:'Build applications'}))await rec.locator(`[name="${name}"]`).fill(value);
 await rec.getByRole('button',{name:'Post job',exact:true}).click();await wait(rec);assert.ok((await rec.locator('body').innerText()).toLowerCase().includes('browser engineer'), await rec.locator('body').innerText());
 await rec.evaluate(()=>goto('recruiter-postchallenge'));await rec.locator('[name="title"]').fill('Browser challenge');await rec.locator('[name="desc"]').fill('Solve this');await rec.getByRole('button',{name:'Post custom challenge',exact:true}).click();await wait(rec);
 // Company apostrophes and HTML characters must survive safely in company navigation.
 await rec.evaluate(()=>goto('recruiter-profile'));await rec.locator('.field input').nth(1).fill("O'Brien & Partners");await rec.locator('.field input').nth(1).press('Tab');await wait(rec);
 await app.evaluate(()=>refresh());await app.evaluate(()=>{goto('candidate-home');session.candTab='companies';render();});await app.locator('.company-card').filter({hasText:"O'Brien & Partners"}).click();assert.ok((await app.locator('body').innerText()).toLowerCase().includes('browser engineer'));
 // Demo registration retains the supplied signup form.
 const newbie=await pageAt(base);await wait(newbie);await newbie.getByRole('button',{name:'Continue as candidate'}).click();await newbie.getByRole('button',{name:'Sign up',exact:true}).click();await newbie.locator('[name="name"]').fill('New browser user');await newbie.locator('[name="email"]').fill('browser@example.com');await newbie.getByRole('button',{name:'Create candidate account'}).click();await wait(newbie);assert.ok((await newbie.locator('body').innerText()).includes('New browser user'));
 // Drag swipe via actual pointer events.
 const top=newbie.locator('#topCard'),bounds=await top.boundingBox();const old=await top.getAttribute('data-swipe-id');await newbie.mouse.move(bounds.x+100,bounds.y+80);await newbie.mouse.down();await newbie.mouse.move(bounds.x-150,bounds.y+80,{steps:12});await newbie.mouse.up();await newbie.waitForFunction(old=>document.getElementById('topCard')?.dataset.swipeId!==old,old);assert.notEqual(await newbie.locator('#topCard').getAttribute('data-swipe-id'),old);
 // Normal-mode password signup/login uses the same visual components.
 await browser.contexts().reduce((p,c)=>p.then(()=>c.close()),Promise.resolve());
 await stop();server=null;const normalBase=await start(false);
 const normal=await pageAt(normalBase);await wait(normal);await normal.getByRole('button',{name:'Continue as recruiter'}).click();await normal.getByRole('button',{name:'Sign up',exact:true}).click();
 for(const [name,value] of Object.entries({name:'Real recruiter',company:'Real company',email:'real@example.com',password:'real-password-123'}))await normal.locator(`[name="${name}"]`).fill(value);
 await normal.getByRole('button',{name:'Create recruiter account'}).click();await wait(normal);assert.ok((await normal.locator('body').innerText()).includes('Real recruiter'));
 await normal.getByRole('button',{name:'Switch account'}).click();await wait(normal);await normal.getByRole('button',{name:'Continue as recruiter'}).click();await normal.locator('[name="email"]').fill('real@example.com');await normal.locator('[name="password"]').fill('real-password-123');await normal.locator('form').getByRole('button',{name:'Log in',exact:true}).click();await wait(normal);assert.ok((await normal.locator('body').innerText()).includes('Real recruiter'));
 assert.deepEqual(issues,[]);
 writeFileSync(join(output,'browser-report.json'),JSON.stringify({visualChecks:report,browserErrors:issues,workflowChecks:'passed'},null,2));
 console.log(JSON.stringify({visualChecks:report,workflowChecks:'passed',browserErrors:issues},null,2));
 await browser.close();browser=null;
 } finally {if(browser)await browser.close();if(server)await stop();rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
