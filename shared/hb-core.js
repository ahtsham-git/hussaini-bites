/* hb-core.js: small runtime shared by the customer app, the POS and the dashboard.
   Keys: only the PUBLIC anon key may live in config.js. Never put a service_role key in any file in this project. */
window.HB=(function(){
 const C=Object.assign({backend:'supabase',supabase:{url:'',anonKey:''},branch:'darman',app:'app',demoSpeed:30,demoAutoAccept:false,demoScript:'../shared/hb-demo.js',dashboardOrigin:''},window.HB_CONFIG||{});
 const esc=s=>String(s==null?'':s).replace(/[&<>"'`]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c]));
 /* a picture address that is safe inside CSS url('') and src="": https, inline image or blob only, no quotes/brackets/spaces */
 const url=u=>typeof u==='string'&&u.length<2048&&/^(https:\/\/|data:image\/|blob:)/.test(u)&&!/["'()\s\\<>]/.test(u)?u:'';
 const money=n=>'Rs. '+Number(n||0).toLocaleString('en-PK');
 const PKT=5*3600e3;   /* Pakistan time is UTC+5, no daylight saving */
 const pktDay=(d=new Date())=>new Date(+d+PKT).toISOString().slice(0,10);
 const dayStart=s=>new Date(Date.parse(s+'T00:00:00Z')-PKT);   /* "2026-11-09" -> instant when that Pakistan day starts */
 const addDays=(s,n)=>new Date(Date.parse(s+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
 const loadScript=src=>new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>no(Error('Could not load '+src));document.head.appendChild(s)});
 let _sb;
 function sb(){return _sb||(_sb=(async()=>{
  if(C.backend==='demo'){if(!window.HB_DEMO)await loadScript(C.demoScript);return window.HB_DEMO.createClient({app:C.app,speed:C.demoSpeed,autoAccept:C.demoAutoAccept})}
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(C.supabase.url||'')||!C.supabase.anonKey)throw Error('Backend not configured: fill config.js');
  const m=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  /* each app keeps its own login, so a staff login can never leak into the customer app on the same website */
  return m.createClient(C.supabase.url,C.supabase.anonKey,{auth:{persistSession:true,autoRefreshToken:true,storageKey:'hb-auth-'+C.app}})})()),_sb}
 /* realtime: one channel, changes are batched, and after a dropped connection the data is reloaded */
 function rt(tables,filter,fn,wait=350){let ch,tm,dead=0,first=1;const run=()=>{clearTimeout(tm);tm=setTimeout(fn,wait)};
  sb().then(c=>{if(dead)return;ch=c.channel('hb'+Math.random().toString(36).slice(2));[].concat(tables).forEach(t=>ch.on('postgres_changes',{event:'*',schema:'public',table:t,...(filter?{filter}:{})},run));
   ch.subscribe(s=>{if(s==='SUBSCRIBED'){if(!first)run();first=0}})}).catch(()=>{});
  const vis=()=>document.visibilityState==='visible'&&run();document.addEventListener('visibilitychange',vis);
  return()=>{dead=1;clearTimeout(tm);document.removeEventListener('visibilitychange',vis);ch&&sb().then(c=>c.removeChannel(ch))}}
 /* offline queue: work is saved on the device and sent as soon as the internet is back. Items that the server refuses are moved to a "dead" list. */
 function outbox(name,handler){const K='hb_ob_'+C.app+'_'+name,rd=k=>{try{return JSON.parse(localStorage.getItem(k))||[]}catch{return[]}},wr=(k,a)=>{try{localStorage.setItem(k,JSON.stringify(a))}catch{}};let busy=0;
  async function flush(){if(busy)return;busy=1;try{const q=rd(K);while(q.length){try{await handler(q[0])}catch(e){if(!e||!e.permanent){return}const d=rd(K+'_dead');d.push({item:q[0],error:String(e.message||e).slice(0,200),at:Date.now()});wr(K+'_dead',d.slice(-50))}q.shift();wr(K,q)}}finally{busy=0}}
  addEventListener('online',flush);setInterval(flush,30000);
  return{push:x=>{const q=rd(K);q.push(x);wr(K,q);flush()},size:()=>rd(K).length,dead:()=>rd(K+'_dead').length,flush}}
 const NET=/fetch|network|failed to|timeout|offline|load failed/i;
 /* turn a database error into {message, permanent}: network problems are retried, everything else is final */
 function fail(error){const m=error&&error.message||String(error);const e=new Error(m);e.permanent=!NET.test(m);e.code=error&&error.code;return e}
 async function rpc(name,args){const c=await sb();const r=await c.rpc(name,args);if(r.error)throw fail(r.error);return r.data}
 async function signIn(email,password){const c=await sb();const r=await c.auth.signInWithPassword({email:String(email).trim(),password});if(r.error)throw Error(/invalid|credentials/i.test(r.error.message)?'Wrong email or password':'Sign-in failed. Try again.');return r.data.user}
 async function signOut(){const c=await sb();await c.auth.signOut()}
 /* the signed-in staff member (role + branch), or null when the account is not staff */
 async function staff(){const c=await sb(),{data}=await c.auth.getSession();const u=data&&data.session&&data.session.user;if(!u)return null;
  const r=await c.from('staff').select('role,branch,display_name,is_active').eq('user_id',u.id).maybeSingle();if(r.error||!r.data||!r.data.is_active)return null;
  return{id:u.id,email:u.email,role:r.data.role,branch:r.data.branch||null,name:r.data.display_name||u.email}}
 return{config:C,esc,url,money,pktDay,dayStart,addDays,sb,rt,outbox,fail,rpc,signIn,signOut,staff}})();
