/* FITMAX admin dashboard — Supabase auth + admin_* RPCs (server checks admin on every call). */
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true } });
const $app = document.getElementById('app');
const $dlg = document.getElementById('dlg');
const MONTHS = [3, 6, 9, 12];
const KIND = { premium: 'משתמש (אפליקציה מלאה)', trainer: 'מאמן (לוח מאמן Pro)' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const date = (iso) => (iso ? new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' }) : '—');
const ago = (iso) => {
  if (!iso) return '—';
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
  return d <= 0 ? 'היום' : d === 1 ? 'אתמול' : `לפני ${d} ימים`;
};
const ERR = {
  not_admin: 'אין לחשבון הזה הרשאת ניהול',
  bad_input: 'ערכים לא תקינים',
};
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 2600);
}
async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) {
    const key = Object.keys(ERR).find((k) => error.message.includes(k));
    throw new Error(key ? ERR[key] : error.message);
  }
  return data;
}
const run = (fn) => fn().catch((e) => toast('⚠️ ' + e.message));

let state = { tab: 'overview', user: null, search: '', page: 0 };

/* ───────── Auth ───────── */
async function boot() {
  const { data } = await sb.auth.getSession();
  state.user = data.session?.user ?? null;
  if (!state.user) return renderLogin();
  try {
    const ok = await rpc('is_admin');
    if (!ok) return renderDenied();
  } catch (e) {
    return renderDenied(e.message);
  }
  render();
}
sb.auth.onAuthStateChange((_e, session) => {
  if ((session?.user?.id ?? null) !== (state.user?.id ?? null)) boot();
});

function renderLogin() {
  $app.innerHTML = `<div class="center">
    <img src="logo.png" alt="FITMAX" style="height:56px">
    <h1 style="margin:0">ניהול FITMAX</h1>
    <p class="muted" style="margin:0">כניסה למנהלים בלבד</p>
    <button class="gbtn" id="g">
      <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
      כניסה עם Google
    </button>
  </div>`;
  document.getElementById('g').onclick = () => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
}
function renderDenied(msg) {
  $app.innerHTML = `<div class="center"><h2>אין הרשאת ניהול</h2><p class="muted">${esc(state.user?.email)}${msg ? ' · ' + esc(msg) : ''}</p><button class="btn sec" id="out">התנתקות</button></div>`;
  document.getElementById('out').onclick = () => sb.auth.signOut();
}

/* ───────── Shell ───────── */
const TABS = [
  ['overview', 'סקירה'],
  ['users', 'משתמשים'],
  ['trainers', 'מאמנים'],
  ['coupons', 'קופונים'],
  ['beta', 'בודקים'],
  ['settings', 'הגדרות'],
];
function render() {
  $app.innerHTML = `
    <header>
      <img src="logo.png" alt="FITMAX">
      <strong style="font-size:18px">ניהול</strong>
      <div class="who">${esc(state.user.email)} <button class="btn sec sm" id="out">התנתקות</button></div>
    </header>
    <nav>${TABS.map(([k, l]) => `<button data-tab="${k}" class="${state.tab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>
    <main id="main"><div class="muted">טוען…</div></main>`;
  document.getElementById('out').onclick = () => sb.auth.signOut();
  $app.querySelectorAll('nav button').forEach((b) => (b.onclick = () => ((state.tab = b.dataset.tab), render())));
  run(VIEWS[state.tab]);
}
const $main = () => document.getElementById('main');

/* ───────── Overview ───────── */
async function overview() {
  const s = await rpc('admin_stats');
  const tiles = [
    ['משתמשים רשומים', s.users],
    ['סיימו הרשמה', s.onboarded],
    ['פעילים ב-7 ימים', s.active7],
    ['חדשים ב-7 ימים', s.new7],
    ['מאמנים', s.trainers],
    ['מתאמנים מחוברים למאמן', s.trainees],
    ['גישת משתמש פעילה (קופון/מתנה)', s.premium_active],
    ['גישת מאמן פעילה', s.trainer_active],
    ['פניות AI היום', s.ai_today],
    ['קופונים זמינים', s.coupons_active],
    ['מימושי קופונים', s.redemptions],
  ];
  $main().innerHTML = `<div class="grid">${tiles.map(([l, n]) => `<div class="card stat"><div class="n">${Number(n).toLocaleString('he-IL')}</div><div class="l">${l}</div></div>`).join('')}</div>`;
}

/* ───────── Users ───────── */
async function users() {
  const limit = 50;
  const rows = await rpc('admin_users', { p_search: state.search, p_limit: limit, p_offset: state.page * limit });
  const total = rows[0]?.total ?? 0;
  $main().innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <label style="flex:1;min-width:220px">חיפוש לפי אימייל או שם<input id="q" value="${esc(state.search)}" placeholder="למשל: gmail או רון"></label>
      <button class="btn sec" id="go">חיפוש</button>
      <span class="muted">${Number(total).toLocaleString('he-IL')} משתמשים</span>
    </div>
    <div class="card table-wrap"><table>
      <thead><tr><th>משתמש</th><th>נרשם</th><th>פעיל</th><th>גישה</th><th>מאמן</th><th>AI היום</th><th></th></tr></thead>
      <tbody>${rows
        .map(
          (u) => `<tr>
        <td><div><strong>${esc(u.name || '—')}</strong></div><div class="muted mono" style="font-size:12px">${esc(u.email)}</div></td>
        <td>${date(u.created_at)}</td>
        <td>${ago(u.last_active)}${u.onboarded ? '' : ' <span class="pill">לא סיים הרשמה</span>'}</td>
        <td class="actions">
          ${u.vip ? '<span class="pill gold">VIP</span>' : ''}
          ${u.premium_until ? `<span class="pill ok">חינם עד ${date(u.premium_until)}</span>` : ''}
          ${u.trainer_until ? `<span class="pill red">מאמן Pro עד ${date(u.trainer_until)}</span>` : ''}
          ${!u.vip && !u.premium_until && !u.trainer_until ? '<span class="muted">רגיל</span>' : ''}
        </td>
        <td>${u.is_trainer ? `<span class="pill red">מאמן · <span class="mono">${esc(u.trainer_code)}</span></span>` : u.coach_name ? `מתאמן של ${esc(u.coach_name)}` : '—'}</td>
        <td>${u.ai_today}</td>
        <td><button class="btn sec sm" data-user="${u.id}">ניהול</button></td>
      </tr>`
        )
        .join('')}</tbody></table>
      ${rows.length ? '' : '<p class="muted">לא נמצאו משתמשים</p>'}
    </div>
    <div class="row" style="margin-top:12px;justify-content:center">
      <button class="btn sec sm" id="prev" ${state.page ? '' : 'disabled'}>הקודם</button>
      <span class="muted">עמוד ${state.page + 1}</span>
      <button class="btn sec sm" id="next" ${(state.page + 1) * limit < total ? '' : 'disabled'}>הבא</button>
    </div>`;
  const search = () => ((state.search = document.getElementById('q').value.trim()), (state.page = 0), run(users));
  document.getElementById('go').onclick = search;
  document.getElementById('q').onkeydown = (e) => e.key === 'Enter' && search();
  document.getElementById('prev').onclick = () => (state.page--, run(users));
  document.getElementById('next').onclick = () => (state.page++, run(users));
  $main().querySelectorAll('[data-user]').forEach((b) => (b.onclick = () => manageUser(rows.find((r) => r.id === b.dataset.user))));
}

function monthsSelect(id) {
  return `<select id="${id}">${MONTHS.map((m) => `<option value="${m}">${m} חודשים</option>`).join('')}</select>`;
}
function manageUser(u) {
  $dlg.innerHTML = `
    <h2>${esc(u.name || u.email)}</h2>
    <p class="muted mono" style="margin-top:-6px">${esc(u.email)}</p>
    <div class="card" style="margin-bottom:12px">
      <strong>גישה חינם לאפליקציה</strong>
      <p class="muted" style="margin:4px 0 10px">${u.premium_until ? `פעיל עד ${date(u.premium_until)} (הארכה נוספת מתווספת לתאריך הזה)` : 'אין כרגע'}</p>
      <div class="row">${monthsSelect('pm')}<button class="btn" id="gp">הענקה</button>${u.premium_until ? '<button class="btn sec" id="rp">ביטול</button>' : ''}</div>
    </div>
    <div class="card" style="margin-bottom:12px">
      <strong>חשבון מאמן Pro חינם</strong>
      <p class="muted" style="margin:4px 0 10px">${u.trainer_until ? `פעיל עד ${date(u.trainer_until)}` : 'אין כרגע'} · המתאמנים של מאמן פעיל משתמשים בחינם</p>
      <div class="row">${monthsSelect('tm')}<button class="btn" id="gt">הענקה</button>${u.trainer_until ? '<button class="btn sec" id="rt">ביטול</button>' : ''}</div>
    </div>
    <div class="card switch">
      <div style="flex:1"><strong>VIP</strong><div class="muted">גישה מלאה ללא הגבלת זמן + בלי מכסת AI יומית</div></div>
      <button class="btn ${u.vip ? 'sec' : ''}" id="vip">${u.vip ? 'הסרת VIP' : 'הפיכה ל-VIP'}</button>
    </div>
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn sec" id="close">סגירה</button></div>`;
  $dlg.showModal();
  const done = (msg) => {
    $dlg.close();
    toast(msg);
    run(users);
  };
  document.getElementById('close').onclick = () => $dlg.close();
  document.getElementById('gp').onclick = () => run(async () => done(`✓ גישה עד ${date(await rpc('admin_grant', { p_user: u.id, p_kind: 'premium', p_months: +document.getElementById('pm').value }))}`));
  document.getElementById('gt').onclick = () => run(async () => done(`✓ מאמן Pro עד ${date(await rpc('admin_grant', { p_user: u.id, p_kind: 'trainer', p_months: +document.getElementById('tm').value }))}`));
  document.getElementById('rp')?.addEventListener('click', () => run(async () => (await rpc('admin_revoke', { p_user: u.id, p_kind: 'premium' }), done('הגישה בוטלה'))));
  document.getElementById('rt')?.addEventListener('click', () => run(async () => (await rpc('admin_revoke', { p_user: u.id, p_kind: 'trainer' }), done('גישת המאמן בוטלה'))));
  document.getElementById('vip').onclick = () => run(async () => (await rpc('admin_set_vip', { p_user: u.id, p_on: !u.vip }), done(u.vip ? 'VIP הוסר' : '✓ VIP')));
}

/* ───────── Trainers ───────── */
async function trainers() {
  const rows = await rpc('admin_trainers');
  const TIER = { free: 'ללא חבילה', trainer: 'מאמן', trainer_pro: 'מאמן Pro' };
  $main().innerHTML = `<div class="card table-wrap"><table>
    <thead><tr><th>מאמן</th><th>קוד הצטרפות</th><th>חבילה</th><th>מתאמנים</th><th>הצטרף</th><th></th></tr></thead>
    <tbody>${rows
      .map(
        (t) => `<tr>
      <td><strong>${esc(t.display_name)}</strong><div class="muted mono" style="font-size:12px">${esc(t.email)}</div></td>
      <td><span class="mono">${esc(t.invite_code)}</span></td>
      <td><span class="pill ${t.effective_tier === 'free' ? '' : 'red'}">${TIER[t.effective_tier]}</span>${t.trainer_until ? ` <span class="muted">עד ${date(t.trainer_until)}</span>` : ''}</td>
      <td>${t.trainees} / ${t.seat_limit || '—'}</td>
      <td>${date(t.created_at)}</td>
      <td class="actions">${MONTHS.map((m) => `<button class="btn sec sm" data-t="${t.user_id}" data-m="${m}">+${m} ח׳</button>`).join('')}</td>
    </tr>`
      )
      .join('')}</tbody></table>
    ${rows.length ? '' : '<p class="muted">עוד אין מאמנים. מאמן נוצר כשמשתמש לוחץ באפליקציה על "אני מאמן כושר".</p>'}
  </div>`;
  $main().querySelectorAll('[data-t]').forEach(
    (b) => (b.onclick = () => run(async () => {
      const until = await rpc('admin_grant', { p_user: b.dataset.t, p_kind: 'trainer', p_months: +b.dataset.m });
      toast(`✓ מאמן Pro עד ${date(until)}`);
      run(trainers);
    }))
  );
}

/* ───────── Coupons ───────── */
async function coupons() {
  const rows = await rpc('admin_coupons');
  $main().innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <h2>יצירת קופונים</h2>
      <div class="row">
        <label>סוג<select id="kind"><option value="premium">${KIND.premium}</option><option value="trainer">${KIND.trainer}</option></select></label>
        <label>משך חינם${monthsSelect('months')}</label>
        <label>אופן שימוש<select id="mode">
          <option value="single">קודים אישיים — כל קוד פעם אחת (מומלץ)</option>
          <option value="shared">קוד אחד משותף — עם מכסת מימושים</option>
        </select></label>
        <label id="countL">כמה קודים<input id="count" type="number" min="1" max="500" value="20" style="width:90px"></label>
        <label id="maxL" hidden>מקסימום מימושים<input id="max" type="number" min="1" value="30" style="width:110px"></label>
        <label>קידומת (לא חובה)<input id="prefix" placeholder="WINGATE" style="width:130px"></label>
        <label>בתוקף עד (לא חובה)<input id="exp" type="date"></label>
        <label style="flex:1;min-width:180px">הערה<input id="note" placeholder="למשל: קורס מדריכים וינגייט"></label>
        <button class="btn" id="create">יצירה</button>
      </div>
      <p class="muted" style="margin:10px 0 0;font-size:13px">כל חשבון יכול לממש רק קופון אחד מכל סוג. קוד משותף נעצר אוטומטית כשמגיעים למכסה.</p>
    </div>
    <div class="card table-wrap"><table>
      <thead><tr><th>קוד</th><th>סוג</th><th>משך</th><th>מימושים</th><th>תוקף</th><th>הערה</th><th>סטטוס</th><th></th></tr></thead>
      <tbody>${rows
        .map((c) => {
          const expired = c.expires_at && new Date(c.expires_at) < new Date();
          const used = c.redeemed >= c.max_redemptions;
          const status = !c.active ? '<span class="pill">מושבת</span>' : expired ? '<span class="pill">פג תוקף</span>' : used ? '<span class="pill">נוצל</span>' : '<span class="pill ok">פעיל</span>';
          return `<tr>
          <td><span class="mono">${esc(c.code)}</span> <button class="btn sec sm" data-copy="${esc(c.code)}">העתקה</button></td>
          <td>${c.kind === 'trainer' ? '<span class="pill red">מאמן</span>' : '<span class="pill">משתמש</span>'}</td>
          <td>${c.months} ח׳</td>
          <td>${c.redeemed} / ${c.max_redemptions}</td>
          <td>${c.expires_at ? date(c.expires_at) : '—'}</td>
          <td class="muted">${esc(c.note || '')}</td>
          <td>${status}</td>
          <td class="actions">
            ${c.redeemed ? `<button class="btn sec sm" data-who="${esc(c.code)}">מי מימש</button>` : ''}
            <button class="btn sec sm" data-toggle="${esc(c.code)}" data-active="${c.active}">${c.active ? 'השבתה' : 'הפעלה'}</button>
          </td>
        </tr>`;
        })
        .join('')}</tbody></table>
      ${rows.length ? '' : '<p class="muted">עוד אין קופונים</p>'}
    </div>`;

  const mode = document.getElementById('mode');
  mode.onchange = () => {
    const shared = mode.value === 'shared';
    document.getElementById('countL').hidden = shared;
    document.getElementById('maxL').hidden = !shared;
  };
  document.getElementById('create').onclick = () =>
    run(async () => {
      const shared = mode.value === 'shared';
      const exp = document.getElementById('exp').value;
      const created = await rpc('admin_create_coupons', {
        p_kind: document.getElementById('kind').value,
        p_months: +document.getElementById('months').value,
        p_count: shared ? 1 : Math.max(1, Math.min(500, +document.getElementById('count').value || 1)),
        p_max_redemptions: shared ? Math.max(1, +document.getElementById('max').value || 1) : 1,
        p_expires_at: exp ? new Date(exp + 'T23:59:59').toISOString() : null,
        p_note: document.getElementById('note').value,
        p_prefix: document.getElementById('prefix').value,
      });
      showCodes(created);
      run(coupons);
    });
  $main().querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => navigator.clipboard.writeText(b.dataset.copy).then(() => toast('הקוד הועתק'))));
  $main().querySelectorAll('[data-toggle]').forEach(
    (b) => (b.onclick = () => run(async () => {
      await rpc('admin_set_coupon_active', { p_code: b.dataset.toggle, p_active: b.dataset.active !== 'true' });
      run(coupons);
    }))
  );
  $main().querySelectorAll('[data-who]').forEach(
    (b) => (b.onclick = () => run(async () => {
      const list = await rpc('admin_coupon_redemptions', { p_code: b.dataset.who });
      $dlg.innerHTML = `<h2>מימושים · <span class="mono">${esc(b.dataset.who)}</span></h2>
        <div class="codes">${list.map((r) => `${esc(r.name || '—')} · <span class="mono">${esc(r.email)}</span> · ${date(r.redeemed_at)}`).join('<br>')}</div>
        <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn sec" onclick="document.getElementById('dlg').close()">סגירה</button></div>`;
      $dlg.showModal();
    }))
  );
}
function showCodes(list) {
  const text = list.map((c) => c.code).join('\n');
  $dlg.innerHTML = `<h2>נוצרו ${list.length} קופונים ✓</h2>
    <p class="muted">${KIND[list[0].kind]} · ${list[0].months} חודשים חינם</p>
    <div class="codes mono">${list.map((c) => esc(c.code)).join('<br>')}</div>
    <div class="row" style="margin-top:14px;justify-content:flex-end">
      <button class="btn" id="copyAll">העתקת כל הקודים</button>
      <button class="btn sec" id="csv">הורדת CSV</button>
      <button class="btn sec" onclick="document.getElementById('dlg').close()">סגירה</button>
    </div>`;
  $dlg.showModal();
  document.getElementById('copyAll').onclick = () => navigator.clipboard.writeText(text).then(() => toast('כל הקודים הועתקו'));
  document.getElementById('csv').onclick = () => {
    const csv = '﻿קוד,סוג,חודשים\n' + list.map((c) => `${c.code},${c.kind === 'trainer' ? 'מאמן' : 'משתמש'},${c.months}`).join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `fitmax-coupons-${Date.now()}.csv` });
    a.click();
  };
}

/* ───────── Settings ───────── */
async function settings() {
  const { data, error } = await sb.from('app_config').select('key,value');
  if (error) throw error;
  const cfg = Object.fromEntries(data.map((r) => [r.key, r.value]));
  const lim = cfg.trainer_limits || {};
  $main().innerHTML = `
    <div class="card switch" style="margin-bottom:12px">
      <div style="flex:1"><strong>תקופת חינם לכולם</strong><div class="muted">כשפעיל — אין מסך תשלום לאף משתמש</div></div>
      <button class="btn ${cfg.free_mode ? '' : 'sec'}" id="free">${cfg.free_mode ? 'פעיל · לכיבוי' : 'כבוי · להפעלה'}</button>
    </div>
    <div class="card" style="margin-bottom:12px">
      <strong>מכסת פניות AI ביום למשתמש</strong>
      <div class="row" style="margin-top:10px"><input id="ai" type="number" min="1" max="100" value="${Number(cfg.ai_daily_limit ?? 5)}" style="width:100px"><button class="btn" id="saveAi">שמירה</button></div>
      <p class="muted" style="margin:8px 0 0;font-size:13px">משתמשי VIP ללא הגבלה.</p>
    </div>
    <div class="card">
      <strong>מקסימום מתאמנים למאמן</strong>
      <div class="row" style="margin-top:10px">
        <label>מאמן<input id="l1" type="number" min="1" value="${lim.trainer ?? 15}" style="width:90px"></label>
        <label>מאמן Pro<input id="l2" type="number" min="1" value="${lim.trainer_pro ?? 50}" style="width:90px"></label>
        <label>בתקופת חינם<input id="l3" type="number" min="1" value="${lim.free_mode ?? 50}" style="width:90px"></label>
        <button class="btn" id="saveLim">שמירה</button>
      </div>
    </div>`;
  document.getElementById('free').onclick = () => run(async () => (await rpc('admin_set_config', { p_key: 'free_mode', p_value: !cfg.free_mode }), toast('נשמר'), run(settings)));
  document.getElementById('saveAi').onclick = () => run(async () => (await rpc('admin_set_config', { p_key: 'ai_daily_limit', p_value: Math.max(1, +document.getElementById('ai').value || 5) }), toast('נשמר')));
  document.getElementById('saveLim').onclick = () =>
    run(async () => {
      await rpc('admin_set_config', { p_key: 'trainer_limits', p_value: { trainer: +document.getElementById('l1').value, trainer_pro: +document.getElementById('l2').value, free_mode: +document.getElementById('l3').value } });
      toast('נשמר');
    });
}

/* ───────── Beta testers (Google Play closed testing) ───────── */
const BETA_PAGE = 'https://ronosvaro-tech.github.io/fitmax/beta/';
const WA_TEXT =
  '💪 אנחנו משיקים את FITMAX, אפליקציית אימונים ותזונה בעברית עם מאמן AI אישי.\n' +
  'לפני העלייה לחנות אנחנו מחפשים בודקים ראשונים עם טלפון אנדרואיד: גישה מלאה בחינם, בתמורה לשימוש של שבועיים ופידבק.\n' +
  'להרשמה (30 שניות): ' +
  BETA_PAGE;

async function copy(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    prompt('העתקה ידנית:', text);
  }
}

async function beta() {
  const [rows, cfgRes] = await Promise.all([rpc('admin_beta_signups'), sb.from('app_config').select('value').eq('key', 'beta_join_url').maybeSingle()]);
  const joinUrl = typeof cfgRes.data?.value === 'string' ? cfgRes.data.value : '';
  const pending = rows.filter((r) => !r.added_to_play);
  const added = rows.length - pending.length;
  $main().innerHTML = `
    <div class="grid" style="margin-bottom:12px">
      <div class="card stat"><div class="n">${rows.length}</div><div class="l">נרשמו</div></div>
      <div class="card stat"><div class="n">${added}</div><div class="l">נוספו ל-Google Play</div></div>
      <div class="card stat"><div class="n" style="color:${pending.length ? 'var(--gold)' : 'inherit'}">${pending.length}</div><div class="l">ממתינים להוספה</div></div>
      <div class="card stat"><div class="n">${Math.max(0, 12 - added)}</div><div class="l">חסרים למינימום של 12</div></div>
    </div>

    <div class="card" style="margin-bottom:12px">
      <strong>1 · שליחה בוואטסאפ</strong>
      <div class="codes" style="margin-top:10px;white-space:pre-wrap">${esc(WA_TEXT)}</div>
      <div class="actions" style="margin-top:10px">
        <button class="btn" id="copyWa">העתקת ההודעה</button>
        <a class="btn sec" style="text-decoration:none" href="https://wa.me/?text=${encodeURIComponent(WA_TEXT)}" target="_blank" rel="noopener">שליחה בוואטסאפ</a>
        <a class="btn sec" style="text-decoration:none" href="${BETA_PAGE}" target="_blank" rel="noopener">צפייה בדף ההרשמה</a>
      </div>
    </div>

    <div class="card" style="margin-bottom:12px">
      <strong>2 · הוספה ל-Google Play</strong>
      <p class="muted" style="margin:6px 0 10px;font-size:13px">Play Console ← Test and release ← Closed testing ← Testers ← רשימת המיילים ← להדביק. אחרי השמירה שם, ללחוץ כאן "סימון הממתינים כנוספו".</p>
      <div class="actions">
        <button class="btn" id="copyPending" ${pending.length ? '' : 'disabled'}>העתקת ${pending.length} הממתינים</button>
        <button class="btn sec" id="markAdded" ${pending.length ? '' : 'disabled'}>סימון הממתינים כנוספו</button>
        <button class="btn sec" id="copyAll" ${rows.length ? '' : 'disabled'}>העתקת כל ${rows.length} המיילים</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:12px">
      <strong>3 · קישור ההצטרפות מ-Google Play</strong>
      <p class="muted" style="margin:6px 0 10px;font-size:13px">מופיע ב-Closed testing ← Testers ← "Join on the web" אחרי שגוגל מאשרת את הגרסה. ברגע שנשמר, הנרשמים רואים אותו בדף ההרשמה.</p>
      <div class="row">
        <input id="joinUrl" class="mono" style="flex:1;min-width:260px" placeholder="https://play.google.com/apps/testing/com.fitmaxfitness.app" value="${esc(joinUrl)}">
        <button class="btn" id="saveJoin">שמירה</button>
      </div>
    </div>

    <div class="card">
      <strong>נרשמים</strong>
      <div class="table-wrap" style="margin-top:10px">
        <table>
          <thead><tr><th>שם</th><th>אימייל</th><th>נרשם</th><th>סטטוס</th><th></th></tr></thead>
          <tbody>${
            rows
              .map(
                (r) => `<tr>
            <td>${esc(r.name)}</td>
            <td class="mono">${esc(r.email)}</td>
            <td>${ago(r.created_at)}</td>
            <td>${r.added_to_play ? '<span class="pill ok">נוסף ל-Play</span>' : '<span class="pill gold">ממתין</span>'}</td>
            <td class="actions">
              <button class="btn sec sm" data-toggle="${r.id}" data-added="${r.added_to_play}">${r.added_to_play ? 'החזרה לממתין' : 'סימון כנוסף'}</button>
              <button class="btn sec sm" data-del="${r.id}" data-email="${esc(r.email)}">מחיקה</button>
            </td>
          </tr>`
              )
              .join('') || '<tr><td colspan="5" class="muted">עוד אין נרשמים</td></tr>'
          }</tbody>
        </table>
      </div>
    </div>`;

  document.getElementById('copyWa').onclick = () => copy(WA_TEXT, 'ההודעה הועתקה');
  document.getElementById('copyPending').onclick = () => copy(pending.map((r) => r.email).join(', '), `${pending.length} מיילים הועתקו`);
  document.getElementById('copyAll').onclick = () => copy(rows.map((r) => r.email).join(', '), `${rows.length} מיילים הועתקו`);
  document.getElementById('markAdded').onclick = () =>
    run(async () => (await rpc('admin_set_beta_added', { p_ids: pending.map((r) => r.id), p_added: true }), toast('סומנו כנוספו'), run(beta)));
  document.getElementById('saveJoin').onclick = () =>
    run(async () => {
      const v = document.getElementById('joinUrl').value.trim();
      if (v && !/^https:\/\//.test(v)) throw new Error('הקישור חייב להתחיל ב-https://');
      await rpc('admin_set_config', { p_key: 'beta_join_url', p_value: v || null });
      toast('נשמר');
    });
  $main()
    .querySelectorAll('[data-toggle]')
    .forEach((b) => (b.onclick = () => run(async () => (await rpc('admin_set_beta_added', { p_ids: [+b.dataset.toggle], p_added: b.dataset.added !== 'true' }), run(beta)))));
  $main()
    .querySelectorAll('[data-del]')
    .forEach(
      (b) =>
        (b.onclick = () => {
          if (!confirm('למחוק את ' + b.dataset.email + ' מרשימת הנרשמים?')) return;
          run(async () => (await rpc('admin_delete_beta', { p_id: +b.dataset.del }), toast('נמחק'), run(beta)));
        })
    );
}

const VIEWS = { overview, users, trainers, coupons, beta, settings };
boot();
