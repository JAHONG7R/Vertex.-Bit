(() => {
'use strict';
const STORAGE_KEY = 'vertex_growth_system_v3';
const OLD_KEYS = ['vertex_habit_tracker_v1', 'vertex-habit-tracker-v2'];
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const today = () => localDateString(new Date());
function localDateString(date){const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');return `${y}-${m}-${d}`;}
function parseDate(s){const [y,m,d]=String(s).split('-').map(Number);return new Date(y,(m||1)-1,d||1,12,0,0);}
function shiftDate(s,amount){const d=parseDate(s);d.setDate(d.getDate()+amount);return localDateString(d);}
function weekStart(s=today()){const d=parseDate(s);const mondayOffset=(d.getDay()+6)%7;d.setDate(d.getDate()-mondayOffset);return localDateString(d);}
function uid(){return (crypto?.randomUUID?.() || `v${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`);}
const CATEGORIES={focus:'Fokus',health:'Salomatlik',learning:'Ta’lim',mindset:'Tafakkur',recovery:'Dam olish',discipline:'Intizom'};
const CATEGORY_ICONS={focus:'◈',health:'✳',learning:'▤',mindset:'◎',recovery:'☾',discipline:'↗'};
const DAY_NAMES=['Du','Se','Cho','Pay','Ju','Shan','Yak'];
const DAY_LONG=['Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba','Yakshanba'];
const DEFAULT_STATE=()=>({version:3,userName:'Foydalanuvchi',habits:[],logs:[],tasks:[],settings:{focusMinutes:25,shortMinutes:5,longMinutes:15},pomodoro:{mode:'focus',sessions:0}});
let state=DEFAULT_STATE(), activePage='dashboard', activeFilter='all', showArchived=false, plannerDate=today();
let timerSeconds=25*60,timerInterval=null,timerRunning=false,toastTimeout=null;

function safeArray(v){return Array.isArray(v)?v:[];}
function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(parseDate(s).getTime());}
function normalizeCategory(c){return Object.hasOwn(CATEGORIES,c)?c:(c==='discipline'?'discipline':'focus');}
function normalizeHabit(h){
 const title=String(h.title??h.name??h.text??'').trim().slice(0,80);
 if(!title)return null;
 const target=Number(h.targetDays??h.target_days??h.frequency??h.daysPerWeek??5);
 return {id:String(h.id??uid()),title,category:normalizeCategory(h.category),targetDays:[3,5,6,7].includes(target)?target:5,isArchived:Boolean(h.isArchived??h.is_archived??h.archived),createdAt:validDate(h.createdAt)?h.createdAt:today()};
}
function normalizeState(raw){
 const next=DEFAULT_STATE();
 if(!raw||typeof raw!=='object')return next;
 next.userName=String(raw.userName??raw.profileName??raw.name??'Foydalanuvchi').slice(0,40)||'Foydalanuvchi';
 const sourceHabits=safeArray(raw.habits);
 next.habits=sourceHabits.map(normalizeHabit).filter(Boolean);
 const seen=new Set();
 const pushLog=(habitId,date)=>{
   const key=`${habitId}|${date}`;
   if(validDate(date)&&next.habits.some(h=>h.id===String(habitId))&&!seen.has(key)){next.logs.push({habitId:String(habitId),date});seen.add(key);}
 };
 if(Array.isArray(raw.logs)){
   raw.logs.forEach(log=>{
     const hid=log.habitId??log.habit_id??log.habitId;
     const date=log.date??log.completed_date??log.day;
     if(hid!=null)pushLog(hid,String(date??''));
   });
 } else if(raw.checks && typeof raw.checks==='object'){
   Object.entries(raw.checks).forEach(([key,value])=>{
     if(value!==true && value!==1 && value!=='true')return;
     const dateMatch=key.match(/\d{4}-\d{2}-\d{2}/);
     if(!dateMatch)return;
     const date=dateMatch[0];
     const hid=key.replace(date,'').replace(/[_|:/-]+$/,'').replace(/^[_|:/-]+/,'');
     let habit=next.habits.find(h=>h.id===hid);
     if(!habit){const reverse=key.slice(date.length).replace(/^[_|:/-]+/,'').replace(/[_|:/-]+$/,'');habit=next.habits.find(h=>h.id===reverse);}
     if(habit)pushLog(habit.id,date);
   });
 }
 next.tasks=safeArray(raw.tasks).map(t=>({
   id:String(t.id??uid()),title:String(t.title??t.name??t.text??'').trim().slice(0,120),
   date:validDate(t.date??t.dueDate??t.due_date)?String(t.date??t.dueDate??t.due_date):today(),
   done:Boolean(t.done??t.completed??t.is_done)
 })).filter(t=>t.title);
 const settings=raw.settings&&typeof raw.settings==='object'?raw.settings:{};
 next.settings={
   focusMinutes:clampInt(settings.focusMinutes??settings.focus??raw.focusMinutes,1,120,25),
   shortMinutes:clampInt(settings.shortMinutes??settings.shortBreakMinutes??5,1,30,5),
   longMinutes:clampInt(settings.longMinutes??settings.longBreakMinutes??15,1,60,15)
 };
 next.pomodoro={mode:'focus',sessions:Math.max(0,Number(raw.pomodoro?.sessions)||0)};
 return next;
}
function clampInt(v,min,max,fallback){const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,Math.round(n))):fallback;}
function migrateOldData(){
 for(const key of OLD_KEYS){
  try{
   const raw=localStorage.getItem(key);if(!raw)continue;
   const parsed=JSON.parse(raw);
   const converted=normalizeState(parsed);
   if(converted.habits.length||converted.logs.length||converted.tasks.length){
    state=converted;saveState();return true;
   }
  }catch(e){console.warn('Eski ma’lumotlarni ko‘chirish imkoni bo‘lmadi:',e);}
 }
 return false;
}
function loadState(){
 try{const raw=localStorage.getItem(STORAGE_KEY);if(raw)return normalizeState(JSON.parse(raw));}catch(e){console.warn('Saqlangan ma’lumotlarni o‘qib bo‘lmadi:',e);}
 state=DEFAULT_STATE();migrateOldData();return state;
}
function saveState(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch(e){notify('Ma’lumotni saqlab bo‘lmadi. Brauzer xotirasini tekshiring.');}}
function notify(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('show'),2800);}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function dateLabel(s,options={day:'numeric',month:'short'}){return parseDate(s).toLocaleDateString('uz-UZ',options);}
function isChecked(habitId,date){return state.logs.some(l=>l.habitId===habitId&&l.date===date);}
function toggleCheck(habitId,date){
 if(date>today()){notify('Kelajakdagi kunni belgilab bo‘lmaydi.');return;}
 const idx=state.logs.findIndex(l=>l.habitId===habitId&&l.date===date);
 if(idx>=0)state.logs.splice(idx,1);else state.logs.push({habitId,date});
 saveState();renderAll();
}
function getHabitLogs(habitId,from,to){return state.logs.filter(l=>l.habitId===habitId&&l.date>=from&&l.date<=to);}
function streakForHabit(habitId){
 let d=today(),count=0;
 if(!isChecked(habitId,d))d=shiftDate(d,-1);
 for(let i=0;i<500;i++){if(isChecked(habitId,d)){count++;d=shiftDate(d,-1);}else break;}
 return count;
}
function currentStreak(){
 let d=today(),count=0;
 const active=state.habits.filter(h=>!h.isArchived);
 const hasAny=date=>active.some(h=>isChecked(h.id,date));
 if(!hasAny(d))d=shiftDate(d,-1);
 for(let i=0;i<500;i++){if(hasAny(d)){count++;d=shiftDate(d,-1);}else break;}
 return count;
}
function xpTotal(){return state.logs.length*10;}
function activeHabits(){return state.habits.filter(h=>!h.isArchived);}
function doneCountOn(date){return activeHabits().filter(h=>isChecked(h.id,date)).length;}
function todayRate(){const habits=activeHabits();return habits.length?Math.round(doneCountOn(today())/habits.length*100):0;}
function rateForDays(days){
 const habits=activeHabits();if(!habits.length)return 0;
 const end=today(),start=shiftDate(end,-(days-1));
 let done=0;for(let d=start;d<=end;d=shiftDate(d,1))done+=habits.filter(h=>isChecked(h.id,d)).length;
 return Math.round(done/(habits.length*days)*100);
}
function weekDates(anchor=today()){const start=weekStart(anchor);return Array.from({length:7},(_,i)=>shiftDate(start,i));}
function categoryLabel(c){return CATEGORIES[c]||'Fokus';}
function goTo(page){
 if(!$('#page-'+page))return;
 activePage=page;
 $$('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${page}`));
 $$('.nav-item[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
 const names={dashboard:'UMUMIY KO‘RINISH',habits:'ODATLAR',planner:'REJALASHTIRUVCHI',pomodoro:'FOKUS TAYMERI',analytics:'TAHLIL',settings:'SOZLAMALAR'};
 $('#pageCrumb').textContent=names[page]||page.toUpperCase();
 $('#sidebar').classList.remove('open');
 if(page==='planner')renderPlanner();if(page==='pomodoro')renderTimer();if(page==='analytics')renderAnalytics();
}
function openModal(id){const el=$('#'+id);el.classList.remove('hidden');const input=$('input:not([type=hidden]),select',el);if(input)setTimeout(()=>input.focus(),30);}
function closeModals(){$$('.modal-backdrop').forEach(m=>m.classList.add('hidden'));}
function openHabitModal(habit=null){
 $('#habitForm').reset();$('#habitId').value=habit?.id||'';$('#habitTitle').value=habit?.title||'';
 $('#habitCategory').value=habit?.category||'focus';$('#habitTarget').value=String(habit?.targetDays||5);
 $('#habitModalTitle').textContent=habit?'Odatni tahrirlash':'Yangi odat';openModal('habitModalBackdrop');
}
function openTaskModal(){
 $('#taskForm').reset();$('#taskDateInput').value=plannerDate;openModal('taskModalBackdrop');
}
function addHabit(data){
 const habit={id:uid(),title:data.title.trim(),category:data.category,targetDays:Number(data.targetDays),isArchived:false,createdAt:today()};
 state.habits.unshift(habit);saveState();renderAll();notify('Yangi odat qo‘shildi.');
}
function updateHabit(id,data){
 const h=state.habits.find(h=>h.id===id);if(!h)return;
 h.title=data.title.trim();h.category=data.category;h.targetDays=Number(data.targetDays);saveState();renderAll();notify('Odat yangilandi.');
}
function deleteHabit(id){
 const h=state.habits.find(h=>h.id===id);if(!h)return;
 if(!confirm(`“${h.title}” odatini va uning belgilashlar tarixini o‘chirmoqchimisiz?`))return;
 state.habits=state.habits.filter(x=>x.id!==id);state.logs=state.logs.filter(l=>l.habitId!==id);saveState();renderAll();notify('Odat o‘chirildi.');
}
function archiveHabit(id){
 const h=state.habits.find(h=>h.id===id);if(!h)return;
 h.isArchived=!h.isArchived;saveState();renderAll();notify(h.isArchived?'Odat arxivlandi.':'Odat arxivdan qaytarildi.');
}
function renderHeader(){
 const d=parseDate(today());$('#todayLabel').textContent=d.toLocaleDateString('uz-UZ',{day:'numeric',month:'short',year:'numeric'}).toUpperCase();
 $('#footerDate').textContent=d.toLocaleDateString('uz-UZ',{weekday:'long',day:'numeric',month:'long'});
 const name=state.userName||'Foydalanuvchi';$('#sidebarName').textContent=name;$('#sidebarAvatar').textContent=(name.trim()[0]||'U').toUpperCase();$('#userNameInput').value=name;
 const hour=new Date().getHours();$('#greetingTitle').textContent=hour<12?'Xayrli tong, '+name+'!':hour<18?'Kuningiz samarali o‘tsin, '+name+'!':'Xayrli kech, '+name+'!';
}
function renderStats(){
 const active=activeHabits(),done=doneCountOn(today()),pct=todayRate(),xp=xpTotal(),level=Math.floor(xp/100)+1;
 $('#todayPercent').textContent=pct+'%';$('#todayDoneText').textContent=`${done} / ${active.length} bajarildi`;$('#todayProgress').style.width=pct+'%';
 $('#currentStreak').innerHTML=`${currentStreak()} <small>kun</small>`;$('#xpValue').innerHTML=`${xp} <small>XP</small>`;$('#levelLabel').textContent=`${level}-daraja · keyingi darajagacha ${100-(xp%100)} XP`;$('#levelProgress').style.width=(xp%100)+'%';
 const adherence=rateForDays(30);$('#adherenceValue').textContent=adherence+'%';$('#adherenceProgress').style.width=adherence+'%';
}
function renderWeekStrip(){
 const dates=weekDates();$('#weekStrip').innerHTML=dates.map((d,i)=>`<div class="week-day ${d===today()?'today':''} ${doneCountOn(d)>0?'done':''}"><span class="day-name">${DAY_NAMES[i]}</span><span class="day-num">${parseDate(d).getDate()}</span><span class="day-dot"></span></div>`).join('');
}
function renderDashboardHabits(){
 const habits=activeHabits().slice(0,5),box=$('#dashboardHabits');
 box.innerHTML=habits.map(h=>`<div class="habit-preview"><span class="habit-glyph">${CATEGORY_ICONS[h.category]||'◉'}</span><div class="habit-preview-info"><strong>${escapeHTML(h.title)}</strong><small>${escapeHTML(categoryLabel(h.category))} · ${streakForHabit(h.id)} kunlik seriya</small></div><button class="check-button ${isChecked(h.id,today())?'checked':''}" data-toggle-check="${escapeHTML(h.id)}" data-date="${today()}" aria-label="${isChecked(h.id,today())?'Bajarilmadi deb belgilash':'Bajarildi deb belgilash'}">${isChecked(h.id,today())?'✓':'○'}</button></div>`).join('');
 $('#dashboardEmpty').classList.toggle('hidden',habits.length>0);box.classList.toggle('hidden',habits.length===0);
}
function renderDashboardTasks(){
 const tasks=state.tasks.filter(t=>t.date===today()).sort((a,b)=>Number(a.done)-Number(b.done)).slice(0,4);
 $('#dashboardTasks').innerHTML=tasks.map(t=>`<div class="task-row"><button class="task-check ${t.done?'done':''}" data-toggle-task="${escapeHTML(t.id)}" aria-label="Vazifa holatini o‘zgartirish">${t.done?'✓':''}</button><span class="task-title ${t.done?'done':''}">${escapeHTML(t.title)}</span><span class="task-date">${t.done?'BAJARILDI':'BUGUN'}</span></div>`).join('');
 $('#dashboardTasksEmpty').classList.toggle('hidden',tasks.length>0);
}
function renderDashboard(){renderStats();renderWeekStrip();renderDashboardHabits();renderDashboardTasks();$('#dashTimer').textContent=formatTime(timerSeconds);$('#dashTimerMode').textContent=state.pomodoro.mode==='focus'?'FOCUS':state.pomodoro.mode==='short'?'SHORT BREAK':'LONG BREAK';}
function visibleHabits(){return state.habits.filter(h=>showArchived?h.isArchived:!h.isArchived).filter(h=>activeFilter==='all'||h.category===activeFilter);}
function renderHabits(){
 const habits=visibleHabits();$('#habitCount').textContent=`${habits.length} ta odat`;
 const tbody=$('#habitTableBody');
 tbody.innerHTML=habits.map(h=>{
  const start=weekStart(today()),days=Array.from({length:7},(_,i)=>shiftDate(start,i));
  const dayCells=days.map(d=>`<td><button class="habit-cell-check ${isChecked(h.id,d)?'checked':''}" data-toggle-check="${escapeHTML(h.id)}" data-date="${d}" ${d>today()||h.isArchived?'disabled':''} aria-label="${escapeHTML(h.title)} — ${d}: ${isChecked(h.id,d)?'bajarilgan':'bajarilmagan'}">${isChecked(h.id,d)?'✓':''}</button></td>`).join('');
  return `<tr><td class="habit-name-cell"><div class="habit-name-wrap"><span class="habit-glyph">${CATEGORY_ICONS[h.category]||'◉'}</span><div class="habit-name-text"><strong>${escapeHTML(h.title)}</strong><small>${escapeHTML(categoryLabel(h.category))} · haftasiga ${h.targetDays} kun${h.isArchived?' · arxiv':''}</small></div></div></td>${dayCells}<td class="streak-cell">↗ ${streakForHabit(h.id)}d</td><td><div class="row-actions"><button class="mini-action" data-edit-habit="${escapeHTML(h.id)}" title="Tahrirlash" aria-label="Tahrirlash">✎</button><button class="mini-action" data-archive-habit="${escapeHTML(h.id)}" title="${h.isArchived?'Arxivdan qaytarish':'Arxivlash'}" aria-label="${h.isArchived?'Arxivdan qaytarish':'Arxivlash'}">${h.isArchived?'↶':'▣'}</button><button class="mini-action danger" data-delete-habit="${escapeHTML(h.id)}" title="O‘chirish" aria-label="O‘chirish">×</button></div></td></tr>`;
 }).join('');
 $('#habitsEmpty').classList.toggle('hidden',habits.length>0);tbody.parentElement.classList.toggle('hidden',habits.length===0);
 $$('#categoryFilters .filter-chip').forEach(b=>b.classList.toggle('active',b.dataset.filter===activeFilter));
}
function renderPlanner(){
 $('#plannerDate').value=plannerDate;$('#plannerDateTitle').textContent=plannerDate===today()?'Bugungi vazifalar':dateLabel(plannerDate,{day:'numeric',month:'long',year:'numeric'})+' vazifalari';
 const tasks=state.tasks.filter(t=>t.date===plannerDate).sort((a,b)=>Number(a.done)-Number(b.done));
 const done=tasks.filter(t=>t.done).length,pct=tasks.length?Math.round(done/tasks.length*100):0;
 $('#taskTotal').textContent=tasks.length;$('#taskDone').textContent=done;$('#taskPercent').textContent=pct+'%';
 $('#plannerStatus').textContent=!tasks.length?'Boshlashga tayyor':pct===100?'Ajoyib! Hammasi bajarildi':`${tasks.length-done} ta vazifa qoldi`;
 $('#plannerTaskList').innerHTML=tasks.map(t=>`<div class="planner-task"><button class="task-check ${t.done?'done':''}" data-toggle-task="${escapeHTML(t.id)}" aria-label="Vazifa holatini o‘zgartirish">${t.done?'✓':''}</button><span class="task-title ${t.done?'done':''}">${escapeHTML(t.title)}</span><div class="task-actions"><button class="mini-action danger" data-delete-task="${escapeHTML(t.id)}" aria-label="Vazifani o‘chirish" title="O‘chirish">×</button></div></div>`).join('');
 $('#plannerEmpty').classList.toggle('hidden',tasks.length>0);$('#plannerTaskList').classList.toggle('hidden',tasks.length===0);
}
function formatTime(sec){const m=Math.floor(Math.max(0,sec)/60),s=Math.max(0,sec)%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}
function modeDuration(mode){return (mode==='short'?state.settings.shortMinutes:mode==='long'?state.settings.longMinutes:state.settings.focusMinutes)*60;}
function setTimerMode(mode){
 pauseTimer();state.pomodoro.mode=mode;timerSeconds=modeDuration(mode);saveState();renderTimer();renderDashboard();
}
function renderTimer(){
 const mode=state.pomodoro.mode;const labels={focus:['FOCUS SESSION','DIQQATNI JAMLANG'],short:['SHORT BREAK','DAM OLING'],long:['LONG BREAK','TO‘LIQ TIKLANING']};
 $('#timerModeLabel').textContent=labels[mode][0];$('#timerStatus').textContent=timerRunning?'SESSIYA DAVOM ETMOQDA':labels[mode][1];$('#mainTimer').textContent=formatTime(timerSeconds);$('#timerStart').innerHTML=timerRunning?'Ⅱ Pauza':'▶ Davom etish';$('#sessionCount').textContent=state.pomodoro.sessions;
 $$('#timerModes .timer-tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
 $('#timerRing').classList.toggle('running',timerRunning);
 const fraction=1-timerSeconds/modeDuration(mode);const degrees=Math.max(0,Math.min(360,fraction*360));$('#timerRing').style.background=`conic-gradient(var(--lime) ${degrees}deg,#323b28 ${degrees}deg 360deg)`;
}
function pauseTimer(){if(timerInterval){clearInterval(timerInterval);timerInterval=null;}timerRunning=false;}
function startTimer(){
 if(timerRunning){pauseTimer();renderTimer();return;}
 if(timerSeconds<=0)timerSeconds=modeDuration(state.pomodoro.mode);
 timerRunning=true;renderTimer();
 timerInterval=setInterval(()=>{
  timerSeconds--;
  if(timerSeconds<=0){
   timerSeconds=0;pauseTimer();
   if(state.pomodoro.mode==='focus'){state.pomodoro.sessions++;saveState();notify('Fokus sessiyasi tugadi. Tanaffus qilish vaqti!');}
   else notify('Tanaffus tugadi. Tayyor bo‘lsangiz, davom eting.');
   renderTimer();renderDashboard();return;
  }
  $('#mainTimer').textContent=formatTime(timerSeconds);$('#dashTimer').textContent=formatTime(timerSeconds);
  const fraction=1-timerSeconds/modeDuration(state.pomodoro.mode),deg=fraction*360;$('#timerRing').style.background=`conic-gradient(var(--lime) ${deg}deg,#323b28 ${deg}deg 360deg)`;
 },1000);
}
function resetTimer(){pauseTimer();timerSeconds=modeDuration(state.pomodoro.mode);renderTimer();renderDashboard();}
function renderAnalytics(){
 const week=rateForDays(7),month=rateForDays(30);$('#analyticsWeekRate').textContent=week+'%';$('#analyticsMonthRate').textContent=month+'%';$('#totalCompletions').textContent=state.logs.length;
 const active=activeHabits();let best=null;
 if(active.length){best=active.map(h=>{let n=0;for(let i=0;i<30;i++)if(isChecked(h.id,shiftDate(today(),-i)))n++;return {h,rate:Math.round(n/30*100),n};}).sort((a,b)=>b.rate-a.rate||b.n-a.n)[0];}
 $('#bestHabit').textContent=best&&best.n?best.h.title:'—';$('#bestHabitRate').textContent=best&&best.n?`${best.rate}% · oxirgi 30 kun`:'Hali yetarli ma’lumot yo‘q';
 const dates=Array.from({length:7},(_,i)=>shiftDate(today(),i-6));
 $('#weeklyChart').innerHTML=dates.map(d=>{const total=active.length,done=doneCountOn(d),pct=total?Math.round(done/total*100):0;return `<div class="bar-col ${d===today()?'today':''}"><span class="bar-value">${pct}%</span><div class="bar-track"><div class="bar-fill" style="height:${pct}%"></div></div><span class="bar-label">${DAY_NAMES[(parseDate(d).getDay()+6)%7]}</span></div>`;}).join('');
 if(!active.length){$('#insightTitle').textContent='Birinchi odatingizni yarating.';$('#insightText').textContent='Odatlar qo‘shilgach, bu sahifa bajarish ko‘rsatkichlari va foydali kuzatuvlarni ko‘rsatadi.';$('#nextStepText').textContent='Bitta sodda, o‘lchash mumkin bo‘lgan odat qo‘shing.';}
 else if(week>=70){$('#insightTitle').textContent='Siz yaxshi izchillik ko‘rsatyapsiz!';$('#insightText').textContent=`So‘nggi haftada odatlaringizning ${week}% ini bajardingiz. Shu ritmni saqlash uchun maqsadlarni real va barqaror tuting.`;$('#nextStepText').textContent='Hozirgi odatlarni davom ettiring; birdaniga ko‘p yangi maqsad qo‘shmang.';}
 else if(week>0){$('#insightTitle').textContent='Kichik qadamlar bilan davom eting.';$('#insightText').textContent=`Haftalik bajarish ko‘rsatkichi ${week}%. Qaysi kun yoki odat ko‘proq e’tibor talab qilayotganini kuzating.`;$('#nextStepText').textContent='Eng oson odatingizdan boshlang va uni har kuni belgilashga harakat qiling.';}
 else{$('#insightTitle').textContent='Bugun yangi boshlanish bo‘lishi mumkin.';$('#insightText').textContent='Hali bu haftada bajarilgan odat belgilanmagan. Bitta kichik harakat bilan boshlang.';$('#nextStepText').textContent='Birinchi odatingizni bugun bajaring va jadvalda belgilang.';}
 $('#categoryBreakdown').innerHTML=Object.entries(CATEGORIES).filter(([key])=>key!=='discipline'||state.habits.some(h=>h.category===key)).map(([key,label])=>{const hs=active.filter(h=>h.category===key);let n=0;for(const h of hs)for(let i=0;i<30;i++)if(isChecked(h.id,shiftDate(today(),-i)))n++;const possible=hs.length*30,rate=possible?Math.round(n/possible*100):0;return `<div class="category-item"><span class="category-name">${escapeHTML(label)}</span><strong>${rate}%</strong><small>${hs.length} ta odat · 30 kun</small><div class="progress-track"><div class="progress-fill" style="width:${rate}%"></div></div></div>`;}).join('');
}
function renderSettings(){ $('#userNameInput').value=state.userName;$('#focusMinutes').value=state.settings.focusMinutes;$('#shortMinutes').value=state.settings.shortMinutes;$('#longMinutes').value=state.settings.longMinutes; }
function renderAll(){renderHeader();renderStats();renderWeekStrip();renderDashboardHabits();renderDashboardTasks();renderHabits();renderPlanner();renderTimer();renderAnalytics();renderSettings();}
function exportData(){
 const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString(),app:'VERTEX Growth System'},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`vertex-backup-${today()}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);notify('Zaxira fayli tayyor.');
}
function importData(file){
 if(!file)return;if(file.size>2*1024*1024){notify('Fayl hajmi 2 MB dan kichik bo‘lishi kerak.');return;}
 const reader=new FileReader();reader.onload=()=>{
  try{const parsed=JSON.parse(String(reader.result));if(!parsed||typeof parsed!=='object'||!Array.isArray(parsed.habits))throw new Error('invalid');
   if(!confirm('Import qilingan ma’lumotlar hozirgi ma’lumotlaringizni almashtiradi. Davom etasizmi?'))return;
   state=normalizeState(parsed);saveState();renderAll();notify('Ma’lumotlar muvaffaqiyatli tiklandi.');
  }catch(e){notify('Fayl noto‘g‘ri yoki Vertex zaxira nusxasi emas.');}
 };reader.readAsText(file);
}
function resetAll(){
 if(!confirm('Barcha odatlar, tarix va vazifalarni o‘chirishni xohlaysizmi? Bu amalni ortga qaytarib bo‘lmaydi.'))return;
 pauseTimer();state=DEFAULT_STATE();timerSeconds=state.settings.focusMinutes*60;saveState();renderAll();goTo('dashboard');notify('Ish maydoni tozalandi.');
}
function bindEvents(){
 $$('.nav-item[data-page]').forEach(b=>b.addEventListener('click',()=>goTo(b.dataset.page)));
 $$('[data-goto]').forEach(b=>b.addEventListener('click',()=>goTo(b.dataset.goto)));
 $$('[data-action="add-habit"]').forEach(b=>b.addEventListener('click',()=>openHabitModal()));
 $$('[data-action="add-task"]').forEach(b=>b.addEventListener('click',openTaskModal));
 $('#quickSettings').addEventListener('click',()=>goTo('settings'));$('#topSettings').addEventListener('click',()=>goTo('settings'));
 $('#mobileMenu').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
 $('#showArchived').addEventListener('change',e=>{showArchived=e.target.checked;renderHabits();});
 $('#categoryFilters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;activeFilter=b.dataset.filter;renderHabits();});
 document.addEventListener('click',e=>{
  const toggle=e.target.closest('[data-toggle-check]');if(toggle){toggleCheck(toggle.dataset.toggleCheck,toggle.dataset.date);return;}
  const task=e.target.closest('[data-toggle-task]');if(task){const t=state.tasks.find(t=>t.id===task.dataset.toggleTask);if(t){t.done=!t.done;saveState();renderAll();}return;}
  const edit=e.target.closest('[data-edit-habit]');if(edit){openHabitModal(state.habits.find(h=>h.id===edit.dataset.editHabit));return;}
  const archive=e.target.closest('[data-archive-habit]');if(archive){archiveHabit(archive.dataset.archiveHabit);return;}
  const del=e.target.closest('[data-delete-habit]');if(del){deleteHabit(del.dataset.deleteHabit);return;}
  const delTask=e.target.closest('[data-delete-task]');if(delTask){const t=state.tasks.find(t=>t.id===delTask.dataset.deleteTask);if(t&&confirm(`“${t.title}” vazifasini o‘chirasizmi?`)){state.tasks=state.tasks.filter(x=>x.id!==t.id);saveState();renderAll();notify('Vazifa o‘chirildi.');}return;}
  if(e.target.closest('[data-close-modal]'))closeModals();
  if(e.target.classList.contains('modal-backdrop'))closeModals();
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModals();});
 $('#habitForm').addEventListener('submit',e=>{
  e.preventDefault();const data={title:$('#habitTitle').value.trim(),category:$('#habitCategory').value,targetDays:$('#habitTarget').value};
  if(!data.title)return;const id=$('#habitId').value;if(id)updateHabit(id,data);else addHabit(data);closeModals();
 });
 $('#taskForm').addEventListener('submit',e=>{
  e.preventDefault();const title=$('#taskTitleInput').value.trim(),date=$('#taskDateInput').value;if(!title||!validDate(date))return;
  state.tasks.push({id:uid(),title,date,done:false});plannerDate=date;saveState();renderAll();closeModals();goTo('planner');notify('Vazifa qo‘shildi.');
 });
 $('#plannerDate').addEventListener('change',e=>{if(validDate(e.target.value)){plannerDate=e.target.value;renderPlanner();}});
 $('#timerModes').addEventListener('click',e=>{const b=e.target.closest('[data-mode]');if(b)setTimerMode(b.dataset.mode);});
 $('#timerStart').addEventListener('click',startTimer);$('#timerReset').addEventListener('click',resetTimer);
 $('#profileForm').addEventListener('submit',e=>{e.preventDefault();state.userName=$('#userNameInput').value.trim().slice(0,40)||'Foydalanuvchi';saveState();renderHeader();notify('Profil saqlandi.');});
 $('#timerSettingsForm').addEventListener('submit',e=>{
  e.preventDefault();state.settings.focusMinutes=clampInt($('#focusMinutes').value,1,120,25);state.settings.shortMinutes=clampInt($('#shortMinutes').value,1,30,5);state.settings.longMinutes=clampInt($('#longMinutes').value,1,60,15);
  pauseTimer();timerSeconds=modeDuration(state.pomodoro.mode);saveState();renderTimer();renderDashboard();notify('Taymer sozlamalari saqlandi.');
 });
 $('#exportBtn').addEventListener('click',exportData);$('#importFile').addEventListener('change',e=>{importData(e.target.files[0]);e.target.value='';});$('#resetBtn').addEventListener('click',resetAll);
}
function init(){
 state=loadState();timerSeconds=modeDuration(state.pomodoro.mode);plannerDate=today();bindEvents();renderAll();
}
document.addEventListener('DOMContentLoaded',init);
})();
