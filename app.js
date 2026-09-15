/* Jalan-Jalan Saans 2026 - app logic
   Data disimpan di Supabase (tabel app_state, kolom data jsonb).
   Siapa saja bisa baca (SELECT), hanya admin yang login lewat Supabase Auth
   yang bisa menyimpan perubahan (lihat supabase-schema.sql untuk aturan aksesnya).

   Seluruh isi file ini dibungkus dalam satu fungsi (IIFE) supaya aman
   dijalankan berkali-kali di halaman yang sama tanpa error "already been
   declared" -- ini bisa terjadi kalau ada tool auto-reload (mis. VS Code
   Live Server) yang menyuntik ulang skrip ini saat file disimpan, tanpa
   me-refresh seluruh halaman. */
(function(){

// Nama bucket Supabase Storage tempat foto lampiran disimpan.
// Harus sama persis dengan nama bucket di Dashboard -> Storage.
const STORAGE_BUCKET = 'jjs-2026';

let supabase = null;
let bootError = null;
try {
  if(!window.supabase){
    throw new Error('Skrip Supabase dari CDN (cdn.jsdelivr.net) gagal dimuat. Cek koneksi internet, atau apakah ada ad-blocker / firewall kantor yang memblokir domain itu.');
  }
  if(!window.CONFIG || !window.CONFIG.SUPABASE_URL || window.CONFIG.SUPABASE_URL.indexOf('xxxx') !== -1 || !window.CONFIG.SUPABASE_ANON_KEY || window.CONFIG.SUPABASE_ANON_KEY.indexOf('isi-anon-key') !== -1){
    throw new Error('config.js belum diisi dengan SUPABASE_URL / SUPABASE_ANON_KEY project Anda.');
  }
  supabase = window.supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY);
} catch(e){
  bootError = e.message;
}
const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

let state = null;
let session = null;
let loadError = null;
const ui = { activeTab: sessionStorage.getItem('jjs_tab') || 'ringkasan', loginOpen: false, forms: {}, lightbox: null, busy: false };

function fmtRp(n){
  n = Math.round(Number(n) || 0);
  const neg = n < 0; n = Math.abs(n);
  const s = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + "Rp" + s;
}
function fmtDate(iso){
  if(!iso) return "-";
  const p = iso.split("-"); if(p.length < 3) return iso;
  return parseInt(p[2],10) + " " + MONTHS[parseInt(p[1],10)-1] + " " + p[0];
}
function esc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

function toast(msg){
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._h);
  toast._h = setTimeout(() => { t.hidden = true; }, 3500);
}

const TABS = [
  {key:'ringkasan', label:'Ringkasan'},
  {key:'finansial', label:'Finansial'},
  {key:'lampiran', label:'Lampiran Finansial'},
  {key:'anggaran', label:'Anggaran Biaya'},
  {key:'rundown', label:'Rundown Acara'},
  {key:'panitia', label:'Susunan Panitia'}
];

// ---------- boot ----------
async function boot(){
  const { data: { session: s } } = await supabase.auth.getSession();
  session = s;
  supabase.auth.onAuthStateChange((_event, s2) => { session = s2; render(); });

  const { data, error } = await supabase.from('app_state').select('data').eq('id','main').single();
  if(error){ loadError = error.message; render(); return; }
  state = data.data;
  render();

  supabase.channel('app_state_live')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_state', filter: 'id=eq.main' }, payload => {
      state = payload.new.data;
      render();
    })
    .subscribe();
}

// ---------- persistence ----------
async function persist(){
  ui.busy = true; render();
  const { error } = await supabase.from('app_state').update({ data: state, updated_at: new Date().toISOString() }).eq('id','main');
  ui.busy = false;
  if(error){
    toast('Gagal menyimpan: ' + error.message);
  }
  render();
}
function commit(mutator){
  mutator(state);
  render();
  persist();
}

// ---------- derived ----------
function totalMasuk(){ return state.finansial.reduce((a,r) => a + (r.tipe==='keluar' ? 0 : Number(r.jumlah||0)), 0); }
function totalKeluar(){ return state.finansial.reduce((a,r) => a + (r.tipe==='keluar' ? Number(r.jumlah||0) : 0), 0); }
function anggaranTotal(){
  return state.anggaran.items.reduce((a,it) => {
    const h = Number(it.harga||0), j = Number(it.jumlah||0);
    return a + (h && j ? h*j : 0);
  }, 0);
}
function targetPerOrang(){ return Number(state.anggaran.targetBiaya||0) + Number(state.anggaran.targetTambahan||0); }
function sortedFinansial(){
  const arr = state.finansial.slice().sort((a,b) => (a.tanggal||'') < (b.tanggal||'') ? -1 : ((a.tanggal||'') > (b.tanggal||'') ? 1 : 0));
  let run = 0;
  return arr.map(r => { run += (r.tipe==='keluar' ? -Number(r.jumlah||0) : Number(r.jumlah||0)); return Object.assign({}, r, {saldo: run}); });
}

// ---------- render ----------
function render(){
  const root = document.getElementById('app');
  if(loadError){
    root.innerHTML = `<div class="wrap"><p class="loading">Gagal memuat: ${esc(loadError)}</p></div>`;
    return;
  }
  if(!state){
    root.innerHTML = `<div class="wrap"><p class="loading">Memuat data...</p></div>`;
    return;
  }
  root.innerHTML = `
    <div class="wrap">
      ${renderHero()}
      <nav class="tabs">${TABS.map(t => `<button class="tabbtn ${ui.activeTab===t.key?'active':''}" data-tab="${t.key}">${t.label}</button>`).join('')}</nav>
      <main class="tabpanels">
        ${panel('ringkasan', renderRingkasan)}
        ${panel('finansial', renderFinansial)}
        ${panel('lampiran', renderLampiran)}
        ${panel('anggaran', renderAnggaran)}
        ${panel('rundown', renderRundown)}
        ${panel('panitia', renderPanitia)}
      </main>
    </div>
    <footer class="hint">Jalan-Jalan Saans 2026 &middot; ${session ? 'Mode admin aktif — perubahan tersimpan untuk semua orang.' : 'Mode lihat &mdash; hanya seksi keuangan yang bisa mengubah data.'}</footer>
    ${ui.lightbox ? `<div class="lightbox" id="lightbox"><button class="close" data-close-lightbox>&times;</button><img src="${ui.lightbox}"></div>` : ''}
    <div id="toast" class="toast" hidden></div>
  `;
  attachEvents();
  updateCountdown();
}
function panel(key, fn){
  return `<section class="panel ${ui.activeTab===key?'show':''}" data-panel="${key}">${fn()}</section>`;
}

function renderHero(){
  return `<header class="hero">
    <div class="hero-content">
      <div class="hero-top">
        <div>
          <h1>${esc(state.susunan.judul)}</h1>
          <div class="tagline">"${esc(state.susunan.tema)}"</div>
          <div class="chips">
            <span class="chip">${esc(state.susunan.tanggal)}</span>
            <span class="chip">${esc(state.susunan.tempat)}</span>
          </div>
        </div>
        <div class="adminzone">
          ${session
            ? `<span class="admin-pill">Mode Admin</span><button class="btn btn-on-dark btn-sm" data-action="logout">Keluar</button>`
            : `<button class="btn btn-on-dark" data-action="toggle-login">Masuk sebagai Admin</button>
               ${ui.loginOpen ? `<form class="loginbox on-dark" data-action="login">
                    <input type="email" name="email" placeholder="Email admin" autocomplete="username" required>
                    <input type="password" name="password" placeholder="Kata sandi" autocomplete="current-password" required>
                    <button class="btn btn-primary btn-sm" type="submit">Masuk</button>
                  </form>` : ''}`
          }
        </div>
      </div>
      <div class="countdown">
        <span class="cd-label">Countdown ke Hari-H</span>
        <div class="cd-tiles" id="cd-tiles-wrap">
          <div class="cd-tile"><span id="cd-days">00</span><small>Hari</small></div>
          <div class="cd-sep">:</div>
          <div class="cd-tile"><span id="cd-hours">00</span><small>Jam</small></div>
          <div class="cd-sep">:</div>
          <div class="cd-tile"><span id="cd-min">00</span><small>Menit</small></div>
          <div class="cd-sep">:</div>
          <div class="cd-tile"><span id="cd-sec">00</span><small>Detik</small></div>
        </div>
      </div>
    </div>
  </header>`;
}

const COUNTDOWN_TARGET = new Date('2026-11-01T06:00:00+07:00');
function updateCountdown(){
  const wrap = document.getElementById('cd-tiles-wrap');
  if(!wrap) return;
  const diff = COUNTDOWN_TARGET.getTime() - Date.now();
  if(diff <= 0){
    wrap.outerHTML = '<span class="cd-done">Hari-H sudah tiba — selamat jalan-jalan! 🏕️</span>';
    return;
  }
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
  set('cd-days', String(d));
  set('cd-hours', String(h).padStart(2,'0'));
  set('cd-min', String(m).padStart(2,'0'));
  set('cd-sec', String(s).padStart(2,'0'));
}

// ---------- Ringkasan ----------
const ICONS = {
  wallet: '<svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v3"/><path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2Z"/><circle cx="17" cy="14" r="1"/></svg>',
  target: '<svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor" stroke="none"/></svg>',
  trendUp: '<svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 16 9 10 13 14 21 6"/><polyline points="15 6 21 6 21 12"/></svg>',
  trendDown: '<svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 8 9 14 13 10 21 18"/><polyline points="21 12 21 18 15 18"/></svg>',
  users: '<svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 8.2a3 3 0 1 1 0 6"/><path d="M21.5 20c0-2.8-2-5.1-4.7-5.8"/></svg>'
};

function renderRingkasan(){
  const masuk = totalMasuk(), keb = anggaranTotal(), sisa = keb - masuk, target = targetPerOrang();
  const pct = keb > 0 ? Math.min(100, Math.round(masuk/keb*100)) : 0;
  const recent = sortedFinansial().slice(-5).reverse();
  const pesertaRows = state.peserta.map((p,i) => {
    const status = p.dibayar >= target ? 'good' : (p.dibayar > 0 ? 'warn' : 'bad');
    const label = p.dibayar >= target ? 'Lunas' : (p.dibayar > 0 ? 'Kurang ' + fmtRp(target-p.dibayar) : 'Belum bayar');
    return `<tr>
      <td>${i+1}</td><td>${esc(p.nama)}</td><td class="num">${fmtRp(p.dibayar)}</td>
      <td><span class="badge ${status}">${label}</span></td>
      ${session ? `<td class="rowactions"><button class="btn btn-sm" data-edit="peserta:${i}">Ubah</button><button class="btn btn-sm btn-danger" data-del="peserta:${i}">Hapus</button></td>` : ''}
    </tr>`;
  }).join('');

  return `<div class="section-head"><h2>Ringkasan</h2><span class="muted">Target iuran: ${fmtRp(target)}/orang</span></div>
  <div class="stats">
    <div class="stat">${ICONS.wallet}<div class="label">Total Terkumpul</div><div class="value good">${fmtRp(masuk)}</div></div>
    <div class="stat">${ICONS.target}<div class="label">Kebutuhan Anggaran</div><div class="value">${fmtRp(keb)}</div></div>
    <div class="stat">${sisa>0?ICONS.trendDown:ICONS.trendUp}<div class="label">${sisa>0?'Masih Kurang':'Surplus'}</div><div class="value ${sisa>0?'bad':'good'}">${fmtRp(Math.abs(sisa))}</div></div>
    <div class="stat">${ICONS.users}<div class="label">Peserta Terdaftar</div><div class="value">${state.peserta.length} orang</div></div>
  </div>
  <div class="progress"><i style="width:${pct}%"></i></div>
  <p class="muted" style="margin-top:6px;">${pct}% dari kebutuhan anggaran sudah terkumpul.</p>

  <div class="section-head" style="margin-top:26px;"><h2 style="font-size:1.05rem;">Status Iuran Peserta</h2>
    ${session ? `<button class="btn btn-sm" data-toggle-form="peserta">+ Tambah Peserta</button>` : ''}</div>
  ${formHtml('peserta', [
    {name:'nama', label:'Nama', type:'text', required:true},
    {name:'dibayar', label:'Sudah Dibayar (Rp)', type:'number', required:true}
  ])}
  ${pesertaRows ? `<div class="tablewrap"><table><thead><tr><th>No</th><th>Nama</th><th>Dibayar</th><th>Status</th>${session?'<th></th>':''}</tr></thead><tbody>${pesertaRows}</tbody></table></div>` : '<p class="empty">Belum ada peserta.</p>'}

  <div class="section-head" style="margin-top:26px;"><h2 style="font-size:1.05rem;">Transaksi Terakhir</h2></div>
  ${recent.length ? `<div class="tablewrap"><table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Nominal</th></tr></thead><tbody>${
    recent.map(r => `<tr><td>${fmtDate(r.tanggal)}</td><td>${esc(r.jenis)}</td><td class="num">${r.tipe==='keluar'?'-':'+'}${fmtRp(r.jumlah)}</td></tr>`).join('')
  }</tbody></table></div>` : '<p class="empty">Belum ada transaksi.</p>'}`;
}

// ---------- Finansial ----------
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
function renderFinansial(){
  const rows = sortedFinansial();
  const pageSize = ui.finansialPageSize || 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  if(!ui.finansialPage) ui.finansialPage = 1;
  if(ui.finansialPage > totalPages) ui.finansialPage = totalPages;
  const startIdx = (ui.finansialPage - 1) * pageSize;
  const pageRows = rows.slice(startIdx, startIdx + pageSize);

  const body = pageRows.map((r,i) => {
    const idx = state.finansial.findIndex(x => x.id === r.id);
    return `<tr>
      <td>${startIdx + i + 1}</td><td>${fmtDate(r.tanggal)}</td><td>${esc(r.jenis)}</td>
      <td class="num">${r.tipe==='masuk' ? fmtRp(r.jumlah) : '-'}</td>
      <td class="num">${r.tipe==='keluar' ? fmtRp(r.jumlah) : '-'}</td>
      <td class="num">${fmtRp(r.saldo)}</td>
      <td>${esc(r.metode||'-')}</td>
      ${session ? `<td class="rowactions"><button class="btn btn-sm" data-edit="finansial:${idx}">Ubah</button><button class="btn btn-sm btn-danger" data-del="finansial:${idx}">Hapus</button></td>` : ''}
    </tr>`;
  }).join('');

  const pager = rows.length ? `<div class="pager">
    <div class="pager-size">
      <label for="finansial-pagesize">Baris/halaman</label>
      <select id="finansial-pagesize" data-pagesize="finansial">
        ${PAGE_SIZE_OPTIONS.map(n => `<option value="${n}" ${pageSize===n?'selected':''}>${n}</option>`).join('')}
      </select>
    </div>
    <div class="pager-nav">
      <button type="button" class="btn btn-sm" data-page="finansial:prev" ${ui.finansialPage<=1?'disabled':''}>&lsaquo; Sebelumnya</button>
      <span class="pager-info">Halaman ${ui.finansialPage} dari ${totalPages} &middot; ${rows.length} transaksi</span>
      <button type="button" class="btn btn-sm" data-page="finansial:next" ${ui.finansialPage>=totalPages?'disabled':''}>Berikutnya &rsaquo;</button>
    </div>
  </div>` : '';

  return `<div class="section-head"><h2>Finansial</h2>
    ${session ? `<button class="btn btn-primary btn-sm" data-toggle-form="finansial">+ Tambah Transaksi</button>` : '<span class="muted">Catatan kapan &amp; bagaimana dana ditransfer</span>'}</div>
  ${formHtml('finansial', [
    {name:'tanggal', label:'Tanggal', type:'date', required:true},
    {name:'jenis', label:'Jenis / Keperluan', type:'text', required:true, placeholder:'mis. Cicilan 4 Rara'},
    {name:'tipe', label:'Tipe', type:'select', options:[['masuk','Uang Masuk'],['keluar','Uang Keluar']], required:true},
    {name:'jumlah', label:'Nominal (Rp)', type:'number', required:true},
    {name:'metode', label:'Metode / Keterangan', type:'text', placeholder:'mis. Transfer ke DANA via BCA'}
  ])}
  ${body ? `<div class="tablewrap"><table><thead><tr><th>No</th><th>Tanggal</th><th>Jenis</th><th>Masuk</th><th>Keluar</th><th>Saldo</th><th>Metode/Ket</th>${session?'<th></th>':''}</tr></thead><tbody>${body}</tbody></table></div>` : '<p class="empty">Belum ada transaksi tercatat.</p>'}
  ${pager}`;
}

// ---------- Lampiran ----------
function renderLampiran(){
  const cards = state.lampiran.map((l, idx) => `<div class="card-photo">
    <img src="${l.url}" data-zoom="${idx}" alt="${esc(l.judul)}">
    <div class="meta"><div class="t">${esc(l.judul)}</div><div class="d">${fmtDate(l.tanggal)}</div>
    ${l.keterangan ? `<div class="k">${esc(l.keterangan)}</div>` : ''}</div>
    ${session ? `<div class="actions"><button class="btn btn-sm btn-danger" data-del="lampiran:${idx}">Hapus</button></div>` : ''}
  </div>`).join('');
  return `<div class="section-head"><h2>Lampiran Finansial</h2>
    ${session ? `<button class="btn btn-primary btn-sm" data-toggle-form="lampiran">+ Tambah Lampiran</button>` : '<span class="muted">Bukti transfer &amp; kwitansi</span>'}</div>
  ${formHtml('lampiran', [
    {name:'judul', label:'Judul', type:'text', required:true, placeholder:'mis. Kwitansi DP Villa'},
    {name:'tanggal', label:'Tanggal', type:'date', required:true},
    {name:'foto', label:'Foto / Scan', type:'file'},
    {name:'keterangan', label:'Keterangan', type:'textarea'}
  ])}
  ${cards ? `<div class="gallery">${cards}</div>` : '<p class="empty">Belum ada lampiran diunggah.</p>'}`;
}

// ---------- Anggaran ----------
function renderAnggaran(){
  const total = anggaranTotal(), masuk = totalMasuk(), sisa = masuk - total;
  const rows = state.anggaran.items.map((it, idx) => {
    const h = Number(it.harga||0), j = Number(it.jumlah||0);
    const t = h && j ? h*j : 0;
    return `<tr>
      <td>${idx+1}</td><td>${esc(it.item)}</td>
      <td class="num">${it.harga ? fmtRp(it.harga) : '<span class="muted">TBD</span>'}</td>
      <td class="num">${it.jumlah || '<span class="muted">-</span>'}</td>
      <td class="num">${t ? fmtRp(t) : '-'}</td>
      <td>${esc(it.keterangan||'-')}</td>
      ${session ? `<td class="rowactions"><button class="btn btn-sm" data-edit="anggaran:${idx}">Ubah</button><button class="btn btn-sm btn-danger" data-del="anggaran:${idx}">Hapus</button></td>` : ''}
    </tr>`;
  }).join('');
  const notes = state.anggaran.catatan.map((n, idx) => `<li>${esc(n)}${session ? ` <button class="btn btn-sm btn-ghost" data-del="catatan:${idx}">hapus</button>` : ''}</li>`).join('');
  return `<div class="section-head"><h2>Anggaran Biaya</h2>
    ${session ? `<button class="btn btn-primary btn-sm" data-toggle-form="anggaran">+ Tambah Item</button>` : '<span class="muted">Rincian budget pengeluaran</span>'}</div>
  <div class="stats stats-3">
    <div class="stat"><div class="label">Target Iuran / Orang</div><div class="value">${fmtRp(targetPerOrang())}</div>
      ${session ? `<button class="btn btn-sm btn-ghost" style="margin-top:6px;" data-toggle-form="target">Ubah target</button>` : ''}</div>
    <div class="stat"><div class="label">Grand Total Anggaran</div><div class="value">${fmtRp(total)}</div></div>
    <div class="stat"><div class="label">${sisa<0?'Kekurangan Dana':'Sisa Dana'}</div><div class="value ${sisa<0?'bad':'good'}">${fmtRp(Math.abs(sisa))}</div></div>
  </div>
  ${formHtml('target', [
    {name:'targetBiaya', label:'Biaya per Orang (Rp)', type:'number', required:true},
    {name:'targetTambahan', label:'Tambahan Biaya per Orang (Rp)', type:'number'}
  ])}
  ${formHtml('anggaran', [
    {name:'item', label:'Item', type:'text', required:true},
    {name:'harga', label:'Harga Satuan (Rp)', type:'number'},
    {name:'jumlah', label:'Jumlah', type:'number'},
    {name:'keterangan', label:'Keterangan', type:'text'}
  ])}
  ${rows ? `<div class="tablewrap"><table><thead><tr><th>No</th><th>Item</th><th>Harga</th><th>Jumlah</th><th>Total</th><th>Keterangan</th>${session?'<th></th>':''}</tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="empty">Belum ada item anggaran.</p>'}
  <div class="notecard"><h3>Catatan</h3>
    ${notes ? `<ol>${notes}</ol>` : '<p class="empty">Tidak ada catatan.</p>'}
    ${session ? formHtml('catatan', [{name:'teks', label:'Catatan baru', type:'text', required:true}]) + `<button class="btn btn-sm" data-toggle-form="catatan">+ Tambah Catatan</button>` : ''}
  </div>`;
}

// ---------- Rundown ----------
function renderDayList(day, key){
  return day.map((it, idx) => `<li><span class="t">${esc(it.waktu)}</span><span class="k">${esc(it.kegiatan)}
    ${session ? ` <button class="btn btn-sm btn-ghost" data-edit="${key}:${idx}">ubah</button><button class="btn btn-sm btn-ghost" data-del="${key}:${idx}">hapus</button>` : ''}
  </span></li>`).join('');
}
function renderRundown(){
  const games = state.rundown.games.map((g, idx) => `<tr><td>${idx+1}</td><td>${esc(g.jenis)}</td><td>${esc(g.keterangan||'Detail belum diisi')}</td>
    ${session ? `<td class="rowactions"><button class="btn btn-sm" data-edit="games:${idx}">Ubah</button><button class="btn btn-sm btn-danger" data-del="games:${idx}">Hapus</button></td>` : ''}
  </tr>`).join('');
  return `<div class="section-head"><h2>Rundown Acara</h2><span class="muted">${esc(state.susunan.tanggal)}</span></div>
  <div class="schedule">
    <div class="day"><h3>Hari 1 &ndash; ${esc(state.rundown.hari1Label)}</h3>
      ${session ? formHtml('hari1', [{name:'waktu',label:'Waktu',type:'text',required:true},{name:'kegiatan',label:'Kegiatan',type:'text',required:true}]) : ''}
      <ul>${renderDayList(state.rundown.hari1,'hari1')}</ul>
      ${session ? `<button class="btn btn-sm" data-toggle-form="hari1">+ Tambah Kegiatan</button>` : ''}
    </div>
    <div class="day"><h3>Hari 2 &ndash; ${esc(state.rundown.hari2Label)}</h3>
      ${session ? formHtml('hari2', [{name:'waktu',label:'Waktu',type:'text',required:true},{name:'kegiatan',label:'Kegiatan',type:'text',required:true}]) : ''}
      <ul>${renderDayList(state.rundown.hari2,'hari2')}</ul>
      ${session ? `<button class="btn btn-sm" data-toggle-form="hari2">+ Tambah Kegiatan</button>` : ''}
    </div>
  </div>
  <div class="section-head" style="margin-top:26px;"><h2 style="font-size:1.05rem;">Daftar Games</h2>
    ${session ? `<button class="btn btn-sm" data-toggle-form="games">+ Tambah Game</button>` : ''}</div>
  ${formHtml('games', [{name:'jenis',label:'Nama Game',type:'text',required:true},{name:'keterangan',label:'Keterangan',type:'text'}])}
  ${games ? `<div class="tablewrap"><table><thead><tr><th>No</th><th>Jenis</th><th>Keterangan</th>${session?'<th></th>':''}</tr></thead><tbody>${games}</tbody></table></div>` : '<p class="empty">Belum ada game tercatat.</p>'}`;
}

// ---------- Panitia ----------
function renderPanitia(){
  const rows = state.susunan.panitia.map((p, idx) => `<tr><td>${esc(p.jabatan)}</td><td>${p.nama ? esc(p.nama) : '<span class="muted">belum diisi</span>'}</td><td>${esc(p.peran)}</td>
    ${session ? `<td class="rowactions"><button class="btn btn-sm" data-edit="panitia:${idx}">Ubah</button><button class="btn btn-sm btn-danger" data-del="panitia:${idx}">Hapus</button></td>` : ''}
  </tr>`).join('');
  return `<div class="section-head"><h2>Susunan Panitia</h2>
    ${session ? `<button class="btn btn-primary btn-sm" data-toggle-form="panitia">+ Tambah Peran</button>` : ''}</div>
  ${session ? formHtml('info', [
      {name:'tema', label:'Tema', type:'text', required:true},
      {name:'tanggal', label:'Tanggal', type:'text', required:true},
      {name:'tempat', label:'Tempat', type:'text', required:true}
    ]) + `<button class="btn btn-sm" data-toggle-form="info">Ubah info acara</button>` : ''}
  ${formHtml('panitia', [
    {name:'jabatan', label:'Jabatan', type:'text', required:true},
    {name:'nama', label:'Nama', type:'text'},
    {name:'peran', label:'Peran Singkat', type:'text'}
  ])}
  <div class="tablewrap"><table><thead><tr><th>Jabatan</th><th>Nama</th><th>Peran Singkat</th>${session?'<th></th>':''}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ---------- generic inline form ----------
function formHtml(section, fields){
  const f = ui.forms[section];
  if(!f || !f.open) return '';
  const vals = f.values || {};
  const isEdit = f.editIndex !== null && f.editIndex !== undefined;
  const inputs = fields.map(fl => {
    const v = vals[fl.name] != null ? vals[fl.name] : '';
    let input;
    if(fl.type === 'select'){
      input = `<select name="${fl.name}">${fl.options.map(o => `<option value="${o[0]}" ${String(v)===o[0]?'selected':''}>${o[1]}</option>`).join('')}</select>`;
    } else if(fl.type === 'textarea'){
      input = `<textarea name="${fl.name}">${esc(v)}</textarea>`;
    } else if(fl.type === 'file'){
      input = `<input type="file" name="${fl.name}" accept="image/*">`;
    } else {
      input = `<input type="${fl.type}" name="${fl.name}" value="${esc(v)}" placeholder="${esc(fl.placeholder||'')}" ${fl.required?'required':''}>`;
    }
    return `<div><label>${fl.label}</label>${input}</div>`;
  }).join('');
  return `<form class="inlineform" data-form="${section}">${inputs}
    <div class="formbar">
      <button type="submit" class="btn btn-primary btn-sm" ${ui.busy?'disabled':''}>${ui.busy ? 'Menyimpan...' : (isEdit?'Simpan Perubahan':'Simpan')}</button>
      <button type="button" class="btn btn-ghost btn-sm" data-cancel-form="${section}">Batal</button>
    </div></form>`;
}
function openForm(section, values, editIndex){
  ui.forms[section] = { open: true, values: values || {}, editIndex: editIndex === undefined ? null : editIndex };
  render();
  const formEl = document.querySelector(`[data-form="${section}"]`);
  if(formEl){ const first = formEl.querySelector('input,select,textarea'); if(first) first.focus(); }
}
function closeForm(section){ ui.forms[section] = { open: false, values: {}, editIndex: null }; render(); }

async function fileToCompressed(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1400;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.78);
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function uploadPhoto(file){
  const blob = await fileToCompressed(file);
  const path = `${Date.now()}_${Math.random().toString(36).slice(2,8)}.jpg`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
  if(error){ toast('Gagal unggah foto: ' + error.message); return null; }
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ---------- events ----------
function attachEvents(){
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      ui.activeTab = btn.getAttribute('data-tab');
      sessionStorage.setItem('jjs_tab', ui.activeTab);
      render();
    });
  });

  document.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [section, dir] = btn.getAttribute('data-page').split(':');
      const key = section + 'Page';
      ui[key] = (ui[key] || 1) + (dir === 'next' ? 1 : -1);
      render();
    });
  });
  document.querySelectorAll('[data-pagesize]').forEach(sel => {
    sel.addEventListener('change', () => {
      const section = sel.getAttribute('data-pagesize');
      ui[section + 'PageSize'] = parseInt(sel.value, 10);
      ui[section + 'Page'] = 1;
      render();
    });
  });

  const loginToggle = document.querySelector('[data-action="toggle-login"]');
  if(loginToggle) loginToggle.addEventListener('click', () => { ui.loginOpen = !ui.loginOpen; render(); });

  const loginForm = document.querySelector('[data-action="login"]');
  if(loginForm) loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const email = e.target.email.value, password = e.target.password.value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if(error){ toast('Login gagal: ' + error.message); } else { ui.loginOpen = false; toast('Berhasil masuk sebagai admin.'); render(); }
  });

  const logoutBtn = document.querySelector('[data-action="logout"]');
  if(logoutBtn) logoutBtn.addEventListener('click', async () => { await supabase.auth.signOut(); render(); });

  document.querySelectorAll('[data-toggle-form]').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.getAttribute('data-toggle-form');
      const isOpen = ui.forms[section] && ui.forms[section].open;
      if(isOpen) closeForm(section); else openForm(section, defaultsFor(section));
    });
  });
  document.querySelectorAll('[data-cancel-form]').forEach(btn => {
    btn.addEventListener('click', () => closeForm(btn.getAttribute('data-cancel-form')));
  });
  document.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [section, idxStr] = btn.getAttribute('data-edit').split(':');
      openForm(section, valuesFor(section, parseInt(idxStr,10)), parseInt(idxStr,10));
    });
  });
  document.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [section, idxStr] = btn.getAttribute('data-del').split(':');
      if(!confirm('Hapus data ini?')) return;
      commit(s => removeAt(s, section, parseInt(idxStr,10)));
    });
  });

  document.querySelectorAll('form[data-form]').forEach(form => {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const section = form.getAttribute('data-form');
      const data = {};
      form.querySelectorAll('input,select,textarea').forEach(el => { if(el.type !== 'file') data[el.name] = el.value; });
      const fileInput = form.querySelector('input[type="file"]');
      const f = ui.forms[section];
      const editIndex = f ? f.editIndex : null;
      if(fileInput && fileInput.files && fileInput.files[0]){
        ui.busy = true; render();
        const url = await uploadPhoto(fileInput.files[0]);
        ui.busy = false;
        if(url) data.url = url;
        finalizeSubmit(section, data, editIndex);
      } else {
        finalizeSubmit(section, data, editIndex);
      }
    });
  });

  document.querySelectorAll('[data-zoom]').forEach(img => {
    img.addEventListener('click', () => { ui.lightbox = state.lampiran[parseInt(img.getAttribute('data-zoom'),10)].url; render(); });
  });
  const closeLb = document.querySelector('[data-close-lightbox]');
  if(closeLb) closeLb.addEventListener('click', () => { ui.lightbox = null; render(); });
  const lb = document.getElementById('lightbox');
  if(lb) lb.addEventListener('click', e => { if(e.target === lb){ ui.lightbox = null; render(); } });
}

function defaultsFor(section){
  if(section === 'target') return { targetBiaya: state.anggaran.targetBiaya, targetTambahan: state.anggaran.targetTambahan };
  if(section === 'info') return { tema: state.susunan.tema, tanggal: state.susunan.tanggal, tempat: state.susunan.tempat };
  return {};
}
function valuesFor(section, idx){
  if(section === 'finansial') return state.finansial[idx];
  if(section === 'lampiran') return state.lampiran[idx];
  if(section === 'anggaran') return state.anggaran.items[idx];
  if(section === 'peserta') return state.peserta[idx];
  if(section === 'hari1') return state.rundown.hari1[idx];
  if(section === 'hari2') return state.rundown.hari2[idx];
  if(section === 'games') return state.rundown.games[idx];
  if(section === 'panitia') return state.susunan.panitia[idx];
  return {};
}
function removeAt(s, section, idx){
  if(section === 'finansial') s.finansial.splice(idx,1);
  else if(section === 'lampiran') s.lampiran.splice(idx,1);
  else if(section === 'anggaran') s.anggaran.items.splice(idx,1);
  else if(section === 'peserta') s.peserta.splice(idx,1);
  else if(section === 'hari1') s.rundown.hari1.splice(idx,1);
  else if(section === 'hari2') s.rundown.hari2.splice(idx,1);
  else if(section === 'games') s.rundown.games.splice(idx,1);
  else if(section === 'panitia') s.susunan.panitia.splice(idx,1);
  else if(section === 'catatan') s.anggaran.catatan.splice(idx,1);
}

function finalizeSubmit(section, data, editIndex){
  commit(s => {
    if(section === 'finansial'){
      data.jumlah = Number(data.jumlah||0);
      if(editIndex != null) Object.assign(s.finansial[editIndex], data, { id: s.finansial[editIndex].id });
      else { data.id = uid(); s.finansial.push(data); }
    } else if(section === 'lampiran'){
      if(editIndex != null){ const old = s.lampiran[editIndex]; Object.assign(old, data); if(!data.url) data.url = old.url; }
      else { if(!data.url){ toast('Pilih foto terlebih dahulu.'); return; } s.lampiran.push(data); }
    } else if(section === 'anggaran'){
      data.harga = data.harga ? Number(data.harga) : null;
      data.jumlah = data.jumlah ? Number(data.jumlah) : null;
      if(editIndex != null) Object.assign(s.anggaran.items[editIndex], data);
      else s.anggaran.items.push(data);
    } else if(section === 'target'){
      s.anggaran.targetBiaya = Number(data.targetBiaya||0);
      s.anggaran.targetTambahan = Number(data.targetTambahan||0);
    } else if(section === 'catatan'){
      s.anggaran.catatan.push(data.teks);
    } else if(section === 'peserta'){
      data.dibayar = Number(data.dibayar||0);
      if(editIndex != null) Object.assign(s.peserta[editIndex], data);
      else s.peserta.push(data);
    } else if(section === 'hari1' || section === 'hari2'){
      const list = section === 'hari1' ? s.rundown.hari1 : s.rundown.hari2;
      if(editIndex != null) Object.assign(list[editIndex], data); else list.push(data);
    } else if(section === 'games'){
      if(editIndex != null) Object.assign(s.rundown.games[editIndex], data); else s.rundown.games.push(data);
    } else if(section === 'panitia'){
      if(editIndex != null) Object.assign(s.susunan.panitia[editIndex], data); else s.susunan.panitia.push(data);
    } else if(section === 'info'){
      s.susunan.tema = data.tema; s.susunan.tanggal = data.tanggal; s.susunan.tempat = data.tempat;
    }
    closeForm(section);
  });
}

setInterval(updateCountdown, 1000);

if(bootError){
  loadError = bootError;
  render();
} else {
  boot();
}

})();
