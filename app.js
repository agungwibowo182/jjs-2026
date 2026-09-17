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
const MONTHS_BY_LANG = {
  id: ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"],
  en: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
  ar: ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"]
};

let state = null;
let session = null;
let loadError = null;
const ui = { activeTab: sessionStorage.getItem('jjs_tab') || 'ringkasan', lang: localStorage.getItem('jjs_lang') || 'id', langMenuOpen: false, loginOpen: false, forms: {}, lightboxImages: null, lightboxIndex: 0, busy: false, feedbackDraft: { nama: '', pesan: '' } };

function fmtRp(n){
  n = Math.round(Number(n) || 0);
  const neg = n < 0; n = Math.abs(n);
  const s = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + "Rp" + s;
}
function fmtDate(iso){
  if(!iso) return "-";
  const p = iso.split("-"); if(p.length < 3) return iso;
  const months = MONTHS_BY_LANG[ui.lang] || MONTHS_BY_LANG.id;
  return parseInt(p[2],10) + " " + months[parseInt(p[1],10)-1] + " " + p[0];
}
function fmtDateTime(iso){
  if(!iso) return "-";
  const d = new Date(iso);
  if(isNaN(d.getTime())) return iso;
  const months = MONTHS_BY_LANG[ui.lang] || MONTHS_BY_LANG.id;
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear() + ", " + hh + ":" + mm;
}
function esc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

// ---------- i18n ----------
const I18N = {
  tab_ringkasan: {id:'Ringkasan', en:'Summary', ar:'ملخص'},
  tab_galeri: {id:'Galeri', en:'Gallery', ar:'معرض الصور'},
  tab_finansial: {id:'Finansial', en:'Finance', ar:'المالية'},
  tab_lampiran: {id:'Lampiran Finansial', en:'Financial Attachments', ar:'المرفقات المالية'},
  tab_anggaran: {id:'Anggaran Biaya', en:'Budget', ar:'الميزانية'},
  tab_rundown: {id:'Rundown Acara', en:'Event Schedule', ar:'جدول الفعالية'},
  tab_panitia: {id:'Susunan Panitia', en:'Committee', ar:'تشكيل اللجنة'},
  tab_kritik: {id:'Kritik & Saran', en:'Feedback', ar:'الآراء والاقتراحات'},

  loading_data: {id:'Memuat data...', en:'Loading data...', ar:'جارٍ تحميل البيانات...'},
  loaderror_prefix: {id:'Gagal memuat: {msg}', en:'Failed to load: {msg}', ar:'فشل التحميل: {msg}'},

  footer_admin: {id:'Mode admin aktif — perubahan tersimpan untuk semua orang.', en:'Admin mode active — changes are saved for everyone.', ar:'وضع الإدارة نشط — تُحفظ التغييرات للجميع.'},
  footer_view: {id:'Mode lihat — hanya seksi keuangan yang bisa mengubah data.', en:'View mode — only the finance team can edit data.', ar:'وضع العرض — يمكن لقسم المالية فقط تعديل البيانات.'},

  hero_online: {id:'orang online', en:'people online', ar:'متصل الآن'},
  hero_admin_mode: {id:'Mode Admin', en:'Admin Mode', ar:'وضع الإدارة'},
  hero_logout: {id:'Keluar', en:'Log out', ar:'تسجيل الخروج'},
  hero_login_cta: {id:'Masuk sebagai Admin', en:'Log in as Admin', ar:'الدخول كمسؤول'},
  hero_email_placeholder: {id:'Email admin', en:'Admin email', ar:'البريد الإلكتروني للمسؤول'},
  hero_password_placeholder: {id:'Kata sandi', en:'Password', ar:'كلمة المرور'},
  hero_login_submit: {id:'Masuk', en:'Log in', ar:'دخول'},

  countdown_label: {id:'Countdown ke Hari-H', en:'Countdown to the Big Day', ar:'العد التنازلي ليوم الفعالية'},
  countdown_days: {id:'Hari', en:'Days', ar:'يوم'},
  countdown_hours: {id:'Jam', en:'Hours', ar:'ساعة'},
  countdown_min: {id:'Menit', en:'Min', ar:'دقيقة'},
  countdown_sec: {id:'Detik', en:'Sec', ar:'ثانية'},
  countdown_done: {id:'Hari-H sudah tiba — selamat jalan-jalan! 🏕️', en:'The big day has arrived — happy travels! 🏕️', ar:'لقد حان اليوم المنتظر — رحلة سعيدة! 🏕️'},

  common_save: {id:'Simpan', en:'Save', ar:'حفظ'},
  common_save_changes: {id:'Simpan Perubahan', en:'Save Changes', ar:'حفظ التغييرات'},
  common_saving: {id:'Menyimpan...', en:'Saving...', ar:'جارٍ الحفظ...'},
  common_cancel: {id:'Batal', en:'Cancel', ar:'إلغاء'},
  common_edit: {id:'Ubah', en:'Edit', ar:'تعديل'},
  common_delete: {id:'Hapus', en:'Delete', ar:'حذف'},
  confirm_hapus_data: {id:'Hapus data ini?', en:'Delete this entry?', ar:'هل تريد حذف هذا العنصر؟'},

  ringkasan_title: {id:'Ringkasan', en:'Summary', ar:'ملخص'},
  ringkasan_target: {id:'Target iuran: {rp}/orang', en:'Dues target: {rp}/person', ar:'هدف الاشتراك: {rp}/شخص'},
  stat_total_masuk: {id:'Total Dana Masuk', en:'Total Funds In', ar:'إجمالي الأموال الواردة'},
  stat_total_keluar: {id:'Total Dana Keluar', en:'Total Funds Out', ar:'إجمالي الأموال الصادرة'},
  stat_saldo_kas: {id:'Saldo Kas Saat Ini', en:'Current Cash Balance', ar:'الرصيد النقدي الحالي'},
  stat_kebutuhan: {id:'Kebutuhan Anggaran', en:'Budget Needed', ar:'الميزانية المطلوبة'},
  stat_masih_kurang: {id:'Masih Kurang', en:'Still Short', ar:'لا يزال ناقصًا'},
  stat_surplus: {id:'Surplus', en:'Surplus', ar:'فائض'},
  stat_peserta: {id:'Peserta Terdaftar', en:'Registered Participants', ar:'المشاركون المسجلون'},
  orang: {id:'orang', en:'people', ar:'شخص'},
  progress_note: {id:'{pct}% dari kebutuhan anggaran sudah terkumpul · saldo kas di atas sudah memperhitungkan dana yang telah dikeluarkan.', en:'{pct}% of the required budget has been collected · the cash balance above already accounts for funds spent.', ar:'تم جمع {pct}% من الميزانية المطلوبة · الرصيد النقدي أعلاه يأخذ بعين الاعتبار الأموال التي تم إنفاقها.'},

  paycard_title: {id:'Cicilan via Transfer ke DANA', en:'Installments via Transfer to DANA', ar:'الأقساط عبر التحويل إلى DANA'},
  paycard_copy: {id:'Salin', en:'Copy', ar:'نسخ'},
  paycard_copy_title: {id:'Salin nomor', en:'Copy number', ar:'نسخ الرقم'},
  paycard_an: {id:'a.n.', en:'on behalf of', ar:'باسم'},

  status_iuran_title: {id:'Status Iuran Peserta', en:'Participant Payment Status', ar:'حالة سداد المشاركين'},
  btn_tambah_peserta: {id:'+ Tambah Peserta', en:'+ Add Participant', ar:'+ إضافة مشارك'},
  status_semua: {id:'Semua', en:'All', ar:'الكل'},
  status_belum: {id:'Belum Bayar', en:'Unpaid', ar:'لم يدفع'},
  status_kurang: {id:'Kurang', en:'Partial', ar:'ناقص'},
  status_lunas: {id:'Lunas', en:'Paid', ar:'مدفوع بالكامل'},
  search_peserta_placeholder: {id:'Cari nama peserta...', en:'Search participant name...', ar:'ابحث عن اسم المشارك...'},
  btn_bersihkan: {id:'Bersihkan', en:'Clear', ar:'مسح'},
  label_nama: {id:'Nama', en:'Name', ar:'الاسم'},
  label_dibayar: {id:'Sudah Dibayar (Rp)', en:'Amount Paid (Rp)', ar:'المبلغ المدفوع (روبية)'},
  th_no: {id:'No', en:'No', ar:'الرقم'},
  th_nama: {id:'Nama', en:'Name', ar:'الاسم'},
  th_dibayar: {id:'Dibayar', en:'Paid', ar:'المدفوع'},
  th_status: {id:'Status', en:'Status', ar:'الحالة'},
  empty_peserta: {id:'Belum ada peserta.', en:'No participants yet.', ar:'لا يوجد مشاركون بعد.'},
  empty_peserta_filtered: {id:'Tidak ada peserta yang cocok dengan filter ini.', en:'No participants match this filter.', ar:'لا يوجد مشاركون يطابقون هذا الفلتر.'},
  status_label_lunas: {id:'Lunas', en:'Paid', ar:'مدفوع بالكامل'},
  status_label_belum: {id:'Belum bayar', en:'Not paid yet', ar:'لم يدفع بعد'},
  status_label_kurang: {id:'Kurang', en:'Short by', ar:'ناقص'},

  transaksi_terakhir_title: {id:'Transaksi Terakhir', en:'Recent Transactions', ar:'أحدث المعاملات'},
  th_tanggal: {id:'Tanggal', en:'Date', ar:'التاريخ'},
  th_jenis: {id:'Jenis', en:'Type', ar:'النوع'},
  th_nominal: {id:'Nominal', en:'Amount', ar:'المبلغ'},
  empty_transaksi: {id:'Belum ada transaksi.', en:'No transactions yet.', ar:'لا توجد معاملات بعد.'},

  galeri_title: {id:'Galeri', en:'Gallery', ar:'معرض الصور'},
  galeri_subtitle: {id:'Fasilitas Villa Demang Puncak', en:'Villa Demang Puncak Facilities', ar:'مرافق فيلا ديمانج بونشاك'},
  video_unsupported: {id:'Browser Anda tidak mendukung pemutaran video.', en:'Your browser does not support video playback.', ar:'متصفحك لا يدعم تشغيل الفيديو.'},
  video_caption: {id:'Cuplikan suasana Villa Demang — kredit @puncakmediabogor', en:'A glimpse of Villa Demang — credit @puncakmediabogor', ar:'لمحة من أجواء فيلا ديمانج — من حساب @puncakmediabogor'},

  finansial_title: {id:'Finansial', en:'Finance', ar:'المالية'},
  finansial_subtitle: {id:'Catatan kapan & bagaimana dana ditransfer', en:'Record of when & how funds were transferred', ar:'سجل بموعد وطريقة تحويل الأموال'},
  btn_export_excel: {id:'Export Excel', en:'Export to Excel', ar:'تصدير إلى إكسل'},
  btn_tambah_transaksi: {id:'+ Tambah Transaksi', en:'+ Add Transaction', ar:'+ إضافة معاملة'},
  label_tanggal: {id:'Tanggal', en:'Date', ar:'التاريخ'},
  label_jenis_keperluan: {id:'Jenis / Keperluan', en:'Type / Purpose', ar:'النوع / الغرض'},
  ph_jenis_keperluan: {id:'mis. Cicilan 4 Rara', en:'e.g. Installment 4 Rara', ar:'مثال: القسط 4 رارا'},
  label_tipe: {id:'Tipe', en:'Type', ar:'النوع'},
  opt_uang_masuk: {id:'Uang Masuk', en:'Money In', ar:'أموال واردة'},
  opt_uang_keluar: {id:'Uang Keluar', en:'Money Out', ar:'أموال صادرة'},
  label_nominal: {id:'Nominal (Rp)', en:'Amount (Rp)', ar:'المبلغ (روبية)'},
  label_metode: {id:'Metode / Keterangan', en:'Method / Note', ar:'الطريقة / الملاحظة'},
  ph_metode: {id:'mis. Transfer ke DANA via BCA', en:'e.g. Transfer to DANA via BCA', ar:'مثال: تحويل إلى DANA عبر BCA'},
  search_finansial_placeholder: {id:'Cari jenis atau metode/keterangan...', en:'Search type or method/note...', ar:'ابحث حسب النوع أو الطريقة/الملاحظة...'},
  filter_summary: {id:'{n} transaksi cocok · total {rp}', en:'{n} matching transactions · total {rp}', ar:'{n} معاملة مطابقة · الإجمالي {rp}'},
  th_masuk: {id:'Masuk', en:'In', ar:'وارد'},
  th_keluar: {id:'Keluar', en:'Out', ar:'صادر'},
  th_saldo: {id:'Saldo', en:'Balance', ar:'الرصيد'},
  th_metode_ket: {id:'Metode/Ket', en:'Method/Note', ar:'الطريقة/الملاحظة'},
  empty_finansial: {id:'Belum ada transaksi tercatat.', en:'No transactions recorded yet.', ar:'لا توجد معاملات مسجلة بعد.'},
  empty_finansial_filtered: {id:'Tidak ada transaksi yang cocok dengan filter ini.', en:'No transactions match this filter.', ar:'لا توجد معاملات تطابق هذا الفلتر.'},
  pager_baris: {id:'Baris/halaman', en:'Rows/page', ar:'صفوف/صفحة'},
  pager_prev: {id:'‹ Sebelumnya', en:'‹ Previous', ar:'‹ السابق'},
  pager_next: {id:'Berikutnya ›', en:'Next ›', ar:'التالي ›'},
  pager_info: {id:'Halaman {page} dari {total} · {n} transaksi', en:'Page {page} of {total} · {n} transactions', ar:'صفحة {page} من {total} · {n} معاملة'},

  lampiran_title: {id:'Lampiran Finansial', en:'Financial Attachments', ar:'المرفقات المالية'},
  lampiran_subtitle: {id:'Bukti transfer & kwitansi', en:'Transfer proofs & receipts', ar:'إثباتات التحويل والإيصالات'},
  btn_tambah_lampiran: {id:'+ Tambah Lampiran', en:'+ Add Attachment', ar:'+ إضافة مرفق'},
  label_judul: {id:'Judul', en:'Title', ar:'العنوان'},
  ph_judul: {id:'mis. Kwitansi DP Villa', en:'e.g. Villa Down Payment Receipt', ar:'مثال: إيصال دفعة الفيلا'},
  label_foto: {id:'Foto / Scan', en:'Photo / Scan', ar:'صورة / مسح ضوئي'},
  label_keterangan: {id:'Keterangan', en:'Note', ar:'ملاحظة'},
  empty_lampiran: {id:'Belum ada lampiran diunggah.', en:'No attachments uploaded yet.', ar:'لم يتم رفع أي مرفقات بعد.'},

  anggaran_title: {id:'Anggaran Biaya', en:'Budget', ar:'الميزانية'},
  anggaran_subtitle: {id:'Rincian budget pengeluaran', en:'Expense budget breakdown', ar:'تفاصيل ميزانية المصروفات'},
  btn_tambah_item: {id:'+ Tambah Item', en:'+ Add Item', ar:'+ إضافة عنصر'},
  stat_target_iuran: {id:'Target Iuran / Orang', en:'Dues Target / Person', ar:'هدف الاشتراك / شخص'},
  btn_ubah_target: {id:'Ubah target', en:'Edit target', ar:'تعديل الهدف'},
  stat_grand_total: {id:'Grand Total Anggaran', en:'Grand Total Budget', ar:'إجمالي الميزانية'},
  stat_kekurangan: {id:'Kekurangan Dana', en:'Funding Shortfall', ar:'عجز التمويل'},
  stat_sisa_dana: {id:'Sisa Dana', en:'Remaining Funds', ar:'الأموال المتبقية'},
  label_biaya_per_orang: {id:'Biaya per Orang (Rp)', en:'Cost per Person (Rp)', ar:'التكلفة للشخص (روبية)'},
  label_tambahan_biaya: {id:'Tambahan Biaya per Orang (Rp)', en:'Extra Cost per Person (Rp)', ar:'تكلفة إضافية للشخص (روبية)'},
  label_item: {id:'Item', en:'Item', ar:'العنصر'},
  label_harga_satuan: {id:'Harga Satuan (Rp)', en:'Unit Price (Rp)', ar:'سعر الوحدة (روبية)'},
  label_jumlah: {id:'Jumlah', en:'Qty', ar:'الكمية'},
  th_item: {id:'Item', en:'Item', ar:'العنصر'},
  th_harga: {id:'Harga', en:'Price', ar:'السعر'},
  th_jumlah: {id:'Jumlah', en:'Qty', ar:'الكمية'},
  th_total: {id:'Total', en:'Total', ar:'الإجمالي'},
  th_keterangan: {id:'Keterangan', en:'Note', ar:'ملاحظة'},
  empty_anggaran: {id:'Belum ada item anggaran.', en:'No budget items yet.', ar:'لا توجد عناصر ميزانية بعد.'},
  catatan_title: {id:'Catatan', en:'Notes', ar:'ملاحظات'},
  label_catatan_baru: {id:'Catatan baru', en:'New note', ar:'ملاحظة جديدة'},
  btn_tambah_catatan: {id:'+ Tambah Catatan', en:'+ Add Note', ar:'+ إضافة ملاحظة'},
  empty_catatan: {id:'Tidak ada catatan.', en:'No notes.', ar:'لا توجد ملاحظات.'},

  rundown_title: {id:'Rundown Acara', en:'Event Schedule', ar:'جدول الفعالية'},
  btn_ubah_label_hari: {id:'Ubah label hari', en:'Edit day labels', ar:'تعديل تسميات الأيام'},
  label_hari1: {id:'Label Hari 1', en:'Day 1 Label', ar:'تسمية اليوم الأول'},
  label_hari2: {id:'Label Hari 2', en:'Day 2 Label', ar:'تسمية اليوم الثاني'},
  ph_hari1: {id:'mis. Minggu, 1 November', en:'e.g. Sunday, Nov 1', ar:'مثال: الأحد، 1 نوفمبر'},
  ph_hari2: {id:'mis. Senin, 2 November', en:'e.g. Monday, Nov 2', ar:'مثال: الإثنين، 2 نوفمبر'},
  hari1_prefix: {id:'Hari 1', en:'Day 1', ar:'اليوم الأول'},
  hari2_prefix: {id:'Hari 2', en:'Day 2', ar:'اليوم الثاني'},
  label_waktu: {id:'Waktu', en:'Time', ar:'الوقت'},
  label_kegiatan: {id:'Kegiatan', en:'Activity', ar:'النشاط'},
  btn_tambah_kegiatan: {id:'+ Tambah Kegiatan', en:'+ Add Activity', ar:'+ إضافة نشاط'},
  daftar_games_title: {id:'Daftar Games', en:'Games List', ar:'قائمة الألعاب'},
  btn_tambah_game: {id:'+ Tambah Game', en:'+ Add Game', ar:'+ إضافة لعبة'},
  label_nama_game: {id:'Nama Game', en:'Game Name', ar:'اسم اللعبة'},
  empty_games: {id:'Belum ada game tercatat.', en:'No games recorded yet.', ar:'لا توجد ألعاب مسجلة بعد.'},
  detail_belum_diisi: {id:'Detail belum diisi', en:'Details not filled in yet', ar:'لم تُضف التفاصيل بعد'},

  panitia_title: {id:'Susunan Panitia', en:'Committee', ar:'تشكيل اللجنة'},
  btn_tambah_peran: {id:'+ Tambah Peran', en:'+ Add Role', ar:'+ إضافة دور'},
  btn_ubah_info_acara: {id:'Ubah info acara', en:'Edit event info', ar:'تعديل معلومات الفعالية'},
  label_tema: {id:'Tema', en:'Theme', ar:'الموضوع'},
  label_tempat: {id:'Tempat', en:'Location', ar:'المكان'},
  label_jabatan: {id:'Jabatan', en:'Position', ar:'المنصب'},
  label_peran_singkat: {id:'Peran Singkat', en:'Brief Role', ar:'دور مختصر'},
  th_jabatan: {id:'Jabatan', en:'Position', ar:'المنصب'},
  th_peran_singkat: {id:'Peran Singkat', en:'Brief Role', ar:'دور مختصر'},
  belum_diisi: {id:'belum diisi', en:'not filled in', ar:'لم يُحدد بعد'},

  kritik_title: {id:'Kritik & Saran', en:'Feedback', ar:'الآراء والاقتراحات'},
  kritik_subtitle: {id:'Boleh diisi siapa saja, nama opsional', en:'Anyone can post, name optional', ar:'يمكن لأي شخص الكتابة، والاسم اختياري'},
  label_nama_opsional: {id:'Nama (opsional)', en:'Name (optional)', ar:'الاسم (اختياري)'},
  label_kritik_saran: {id:'Kritik / Saran', en:'Feedback / Suggestion', ar:'ملاحظة / اقتراح'},
  ph_kritik_saran: {id:'Tulis kritik atau saran Anda di sini...', en:'Write your feedback or suggestion here...', ar:'اكتب ملاحظتك أو اقتراحك هنا...'},
  btn_kirim: {id:'Kirim', en:'Send', ar:'إرسال'},
  sending: {id:'Mengirim...', en:'Sending...', ar:'جارٍ الإرسال...'},
  anonim: {id:'Anonim', en:'Anonymous', ar:'مجهول'},
  empty_kritik: {id:'Belum ada kritik/saran. Jadilah yang pertama menulis!', en:'No feedback yet. Be the first to write one!', ar:'لا توجد ملاحظات بعد. كن أول من يكتب!'},

  lb_prev: {id:'Sebelumnya', en:'Previous', ar:'السابق'},
  lb_next: {id:'Berikutnya', en:'Next', ar:'التالي'},

  toast_login_gagal: {id:'Login gagal: {msg}', en:'Login failed: {msg}', ar:'فشل تسجيل الدخول: {msg}'},
  toast_login_sukses: {id:'Berhasil masuk sebagai admin.', en:'Successfully logged in as admin.', ar:'تم تسجيل الدخول كمسؤول بنجاح.'},
  toast_export_gagal_lib: {id:'Gagal export: pustaka Excel belum termuat. Cek koneksi internet lalu coba lagi.', en:'Export failed: the Excel library has not loaded. Check your internet connection and try again.', ar:'فشل التصدير: لم يتم تحميل مكتبة إكسل بعد. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.'},
  toast_export_kosong: {id:'Tidak ada transaksi untuk diexport.', en:'No transactions to export.', ar:'لا توجد معاملات للتصدير.'},
  toast_upload_gagal: {id:'Gagal unggah foto: {msg}', en:'Failed to upload photo: {msg}', ar:'فشل رفع الصورة: {msg}'},
  toast_simpan_gagal: {id:'Gagal menyimpan: {msg}', en:'Failed to save: {msg}', ar:'فشل الحفظ: {msg}'},
  toast_pilih_foto: {id:'Pilih foto terlebih dahulu.', en:'Please choose a photo first.', ar:'يرجى اختيار صورة أولاً.'},
  toast_salin_sukses: {id:'Nomor disalin: {text}', en:'Number copied: {text}', ar:'تم نسخ الرقم: {text}'},
  toast_salin_gagal: {id:'Gagal menyalin otomatis, salin manual: {text}', en:'Auto-copy failed, please copy manually: {text}', ar:'فشل النسخ التلقائي، يرجى النسخ يدويًا: {text}'},
  toast_kirim_gagal: {id:'Gagal mengirim: {msg}', en:'Failed to send: {msg}', ar:'فشل الإرسال: {msg}'},
  toast_kirim_sukses: {id:'Terkirim, terima kasih!', en:'Sent, thank you!', ar:'تم الإرسال، شكرًا لك!'},
  toast_hapus_gagal: {id:'Gagal menghapus: {msg}', en:'Failed to delete: {msg}', ar:'فشل الحذف: {msg}'},
  confirm_hapus_kritik: {id:'Hapus kritik/saran ini?', en:'Delete this feedback?', ar:'هل تريد حذف هذه الملاحظة؟'}
};
function t(key, vars){
  const entry = I18N[key];
  let str = entry ? (entry[ui.lang] || entry.id || key) : key;
  if(vars){ Object.keys(vars).forEach(k => { str = str.split('{'+k+'}').join(vars[k]); }); }
  return str;
}
const LANG_FLAGS = {
  id: '<svg viewBox="0 0 24 18" width="24" height="18"><rect width="24" height="9" fill="#E4312B"/><rect y="9" width="24" height="9" fill="#FFFFFF"/></svg>',
  en: '<svg viewBox="0 0 24 18" width="24" height="18"><rect width="24" height="18" fill="#00247D"/><path d="M0,0 L24,18 M24,0 L0,18" stroke="#FFFFFF" stroke-width="4"/><path d="M0,0 L24,18 M24,0 L0,18" stroke="#CF142B" stroke-width="1.6"/><path d="M12,0 V18 M0,9 H24" stroke="#FFFFFF" stroke-width="6"/><path d="M12,0 V18 M0,9 H24" stroke="#CF142B" stroke-width="3.2"/></svg>',
  ar: '<svg viewBox="0 0 24 18" width="24" height="18"><rect width="24" height="18" fill="#006C35"/><rect x="3" y="13" width="14" height="1.6" rx="0.8" fill="#FFFFFF"/><path d="M17,13 L19.5,13.8 L17,14.6 Z" fill="#FFFFFF"/></svg>'
};
const LANG_NAMES = { id:'Bahasa Indonesia', en:'English', ar:'العربية' };
function setLang(lang){
  ui.langMenuOpen = false;
  if(lang !== ui.lang){
    ui.lang = lang;
    try{ localStorage.setItem('jjs_lang', lang); }catch(e){}
  }
  render();
}
function applyLangAttrs(){
  document.documentElement.lang = ui.lang;
  document.documentElement.dir = ui.lang === 'ar' ? 'rtl' : 'ltr';
}

function toast(msg){
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._h);
  toast._h = setTimeout(() => { t.hidden = true; }, 3500);
}

const TABS = [
  {key:'ringkasan'}, {key:'galeri'}, {key:'finansial'}, {key:'lampiran'},
  {key:'anggaran'}, {key:'rundown'}, {key:'panitia'}, {key:'kritik'}
];

let feedbackList = [];

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

  const { data: fb, error: fbErr } = await supabase.from('feedback').select('*').order('created_at', { ascending: false });
  if(!fbErr){ feedbackList = fb; render(); }

  supabase.channel('feedback_live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feedback' }, payload => {
      if(feedbackList.some(f => f.id === payload.new.id)) return;
      feedbackList = [payload.new, ...feedbackList];
      render();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'feedback' }, payload => {
      feedbackList = feedbackList.filter(f => f.id !== payload.old.id);
      render();
    })
    .subscribe();

  const presenceKey = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const presenceChannel = supabase.channel('site-presence', { config: { presence: { key: presenceKey } } });
  presenceChannel.on('presence', { event: 'sync' }, () => {
    onlineCount = Object.keys(presenceChannel.presenceState()).length;
    updateOnlineBadge();
  });
  presenceChannel.subscribe(async status => {
    if(status === 'SUBSCRIBED') await presenceChannel.track({ online_at: Date.now() });
  });
}

let onlineCount = 1;
function updateOnlineBadge(){
  const el = document.getElementById('online-count');
  if(el) el.textContent = onlineCount + ' ' + t('hero_online');
}

// ---------- persistence ----------
async function persist(){
  ui.busy = true; render();
  const { error } = await supabase.from('app_state').update({ data: state, updated_at: new Date().toISOString() }).eq('id','main');
  ui.busy = false;
  if(error){
    toast(t('toast_simpan_gagal',{msg:error.message}));
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
function filteredFinansialRows(){
  const allRows = sortedFinansial();
  const typeFilter = ui.finansialTypeFilter || 'semua';
  const searchText = (ui.finansialFilter || '').trim().toLowerCase();
  const typeCounts = {
    semua: allRows.length,
    masuk: allRows.filter(r => r.tipe !== 'keluar').length,
    keluar: allRows.filter(r => r.tipe === 'keluar').length
  };
  let rows = allRows;
  if(typeFilter !== 'semua') rows = rows.filter(r => (typeFilter === 'keluar' ? r.tipe === 'keluar' : r.tipe !== 'keluar'));
  if(searchText) rows = rows.filter(r => (r.jenis||'').toLowerCase().includes(searchText) || (r.metode||'').toLowerCase().includes(searchText));
  const filteredTotal = rows.reduce((a,r) => a + Number(r.jumlah||0), 0);
  return { allRows, rows, typeFilter, searchText, typeCounts, filteredTotal };
}

// ---------- render ----------
function render(){
  applyLangAttrs();
  const root = document.getElementById('app');
  if(loadError){
    root.innerHTML = `<div class="wrap"><p class="loading">${t('loaderror_prefix',{msg:esc(loadError)})}</p></div>`;
    return;
  }
  if(!state){
    root.innerHTML = `<div class="wrap"><p class="loading">${t('loading_data')}</p></div>`;
    return;
  }
  const active = document.activeElement;
  const focusId = (active && active.id) ? active.id : null;
  const selStart = (active && typeof active.selectionStart === 'number') ? active.selectionStart : null;
  const selEnd = (active && typeof active.selectionEnd === 'number') ? active.selectionEnd : null;
  root.innerHTML = `
    <div class="wrap">
      ${renderHero()}
      <nav class="tabs">${TABS.map(tab => `<button class="tabbtn ${ui.activeTab===tab.key?'active':''}" data-tab="${tab.key}">${t('tab_'+tab.key)}</button>`).join('')}</nav>
      <main class="tabpanels">
        ${panel('ringkasan', renderRingkasan)}
        ${panel('galeri', renderGaleri)}
        ${panel('finansial', renderFinansial)}
        ${panel('lampiran', renderLampiran)}
        ${panel('anggaran', renderAnggaran)}
        ${panel('rundown', renderRundown)}
        ${panel('panitia', renderPanitia)}
        ${panel('kritik', renderKritikSaran)}
      </main>
    </div>
    <footer class="hint">Jalan-Jalan Saans 2026 &middot; ${session ? t('footer_admin') : t('footer_view')}</footer>
    ${renderLightbox()}
    <div id="toast" class="toast" hidden></div>
  `;
  attachEvents();
  updateCountdown();
  if(focusId){
    const el = document.getElementById(focusId);
    if(el && typeof el.focus === 'function'){
      el.focus();
      if(selStart !== null && el.setSelectionRange){ try{ el.setSelectionRange(selStart, selEnd); }catch(e){} }
    }
  }
}
function panel(key, fn){
  return `<section class="panel ${ui.activeTab===key?'show':''}" data-panel="${key}">${fn()}</section>`;
}
function renderLightbox(){
  if(!ui.lightboxImages || !ui.lightboxImages.length) return '';
  const total = ui.lightboxImages.length;
  const cur = ui.lightboxImages[ui.lightboxIndex];
  return `<div class="lightbox" id="lightbox">
    <button class="close" data-close-lightbox>&times;</button>
    ${total > 1 ? `<button class="lb-nav lb-prev" data-lb-nav="-1" aria-label="${t('lb_prev')}">&lsaquo;</button>` : ''}
    <figure class="lb-figure">
      <img src="${cur.src}" alt="${esc(cur.alt||'')}">
      ${cur.alt ? `<figcaption>${esc(cur.alt)}</figcaption>` : ''}
    </figure>
    ${total > 1 ? `<button class="lb-nav lb-next" data-lb-nav="1" aria-label="${t('lb_next')}">&rsaquo;</button>` : ''}
    ${total > 1 ? `<div class="lb-counter">${ui.lightboxIndex+1} / ${total}</div>` : ''}
  </div>`;
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
            <span class="chip online-chip"><span class="online-dot"></span><span id="online-count">${onlineCount} ${t('hero_online')}</span></span>
          </div>
        </div>
        <div class="adminzone">
          <div class="lang-switch">
            <button type="button" class="lang-trigger" data-action="toggle-lang-menu" aria-haspopup="true" aria-expanded="${ui.langMenuOpen}">
              <span class="lang-flag">${LANG_FLAGS[ui.lang]}</span>
              <svg class="lang-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="10" height="10"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            ${ui.langMenuOpen ? `<div class="lang-menu" role="menu">
              ${['id','en','ar'].map(l => `<button type="button" class="lang-option ${ui.lang===l?'active':''}" data-lang="${l}" role="menuitem">
                <span class="lang-flag">${LANG_FLAGS[l]}</span><span class="lang-name">${LANG_NAMES[l]}</span>${ui.lang===l ? '<span class="lang-check">&check;</span>' : ''}
              </button>`).join('')}
            </div>` : ''}
          </div>
          ${session
            ? `<span class="admin-pill">${t('hero_admin_mode')}</span><button class="btn btn-on-dark btn-sm" data-action="logout">${t('hero_logout')}</button>`
            : `<button class="btn btn-on-dark" data-action="toggle-login">${t('hero_login_cta')}</button>
               ${ui.loginOpen ? `<form class="loginbox on-dark" data-action="login">
                    <input type="email" name="email" placeholder="${t('hero_email_placeholder')}" autocomplete="username" required>
                    <input type="password" name="password" placeholder="${t('hero_password_placeholder')}" autocomplete="current-password" required>
                    <button class="btn btn-primary btn-sm" type="submit">${t('hero_login_submit')}</button>
                  </form>` : ''}`
          }
        </div>
      </div>
      <div class="countdown">
        <span class="cd-label">${t('countdown_label')}</span>
        <div class="cd-tiles" id="cd-tiles-wrap">
          <div class="cd-tile"><span id="cd-days">00</span><small>${t('countdown_days')}</small></div>
          <div class="cd-sep">:</div>
          <div class="cd-tile"><span id="cd-hours">00</span><small>${t('countdown_hours')}</small></div>
          <div class="cd-sep">:</div>
          <div class="cd-tile"><span id="cd-min">00</span><small>${t('countdown_min')}</small></div>
          <div class="cd-sep">:</div>
          <div class="cd-tile"><span id="cd-sec">00</span><small>${t('countdown_sec')}</small></div>
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
    wrap.outerHTML = `<span class="cd-done">${t('countdown_done')}</span>`;
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
  users: '<svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 8.2a3 3 0 1 1 0 6"/><path d="M21.5 20c0-2.8-2-5.1-4.7-5.8"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 19h16"/></svg>',
  outflow: '<svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M9 7h8v8"/></svg>',
  scale: '<svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 7h14"/><path d="M5 7 2.5 13a2.5 2.5 0 0 0 5 0Z"/><path d="M19 7l-2.5 6a2.5 2.5 0 0 0 5 0Z"/></svg>'
};

const PAYMENT_INFO = {
  nama: 'SRI LAELA WULAN SARI NENGSIH',
  rekening: [
    {bank:'VA BCA', nomor:'3901-085881677897'},
    {bank:'VA MANDIRI', nomor:'89508-085881677897'},
    {bank:'VA BRI', nomor:'88810-085881677897'},
    {bank:'VA BNI', nomor:'8881-085881677897'},
    {bank:'VA CIMB', nomor:'8059-085881677897'}
  ]
};
function renderPayCard(){
  const rows = PAYMENT_INFO.rekening.map(r => `<div class="pay-row">
    <span class="pay-bank">${esc(r.bank)}</span>
    <span class="pay-num mono">${esc(r.nomor)}</span>
    <button type="button" class="btn btn-sm btn-ghost pay-copy" data-copy-text="${esc(r.nomor)}" title="${t('paycard_copy_title')}">${ICONS.copy} ${t('paycard_copy')}</button>
  </div>`).join('');
  return `<div class="paycard">
    <h3>${t('paycard_title')}</h3>
    <div class="pay-grid">${rows}</div>
    <p class="pay-name">${t('paycard_an')} <strong>${esc(PAYMENT_INFO.nama)}</strong></p>
  </div>`;
}

function renderRingkasan(){
  const masuk = totalMasuk(), keluar = totalKeluar(), saldoKas = masuk - keluar;
  const keb = anggaranTotal(), sisa = keb - masuk, target = targetPerOrang();
  const pct = keb > 0 ? Math.min(100, Math.round(masuk/keb*100)) : 0;
  const recent = sortedFinansial().slice(-5).reverse();
  const filterText = (ui.pesertaFilter || '').trim().toLowerCase();
  const statusFilter = ui.pesertaStatusFilter || 'semua';
  const pesertaWithStatus = state.peserta.map(p => ({
    p,
    status: p.dibayar >= target ? 'lunas' : (p.dibayar > 0 ? 'kurang' : 'belum')
  }));
  const statusCounts = {
    semua: pesertaWithStatus.length,
    lunas: pesertaWithStatus.filter(x => x.status === 'lunas').length,
    kurang: pesertaWithStatus.filter(x => x.status === 'kurang').length,
    belum: pesertaWithStatus.filter(x => x.status === 'belum').length
  };
  let visiblePeserta = pesertaWithStatus;
  if(statusFilter !== 'semua') visiblePeserta = visiblePeserta.filter(x => x.status === statusFilter);
  if(filterText) visiblePeserta = visiblePeserta.filter(x => x.p.nama.toLowerCase().includes(filterText));
  const STATUS_BADGE = { lunas: 'good', kurang: 'warn', belum: 'bad' };
  const pesertaRows = visiblePeserta.map(({ p, status }) => {
    const idx = state.peserta.indexOf(p);
    const label = status === 'lunas' ? t('status_label_lunas') : (status === 'kurang' ? t('status_label_kurang') + ' ' + fmtRp(target - p.dibayar) : t('status_label_belum'));
    return `<tr>
      <td>${idx+1}</td><td>${esc(p.nama)}</td><td class="num">${fmtRp(p.dibayar)}</td>
      <td><span class="badge ${STATUS_BADGE[status]}">${label}</span></td>
      ${session ? `<td class="rowactions"><button class="btn btn-sm" data-edit="peserta:${idx}">${t('common_edit')}</button><button class="btn btn-sm btn-danger" data-del="peserta:${idx}">${t('common_delete')}</button></td>` : ''}
    </tr>`;
  }).join('');
  const STATUS_LABELS = { semua: t('status_semua'), belum: t('status_belum'), kurang: t('status_kurang'), lunas: t('status_lunas') };
  const statusChips = ['semua','belum','kurang','lunas'].map(key => `<button type="button" class="filter-chip ${statusFilter===key?'active':''}" data-status-filter="${key}">${STATUS_LABELS[key]} (${statusCounts[key]})</button>`).join('');

  return `<div class="section-head"><h2>${t('ringkasan_title')}</h2><span class="muted">${t('ringkasan_target',{rp:fmtRp(target)})}</span></div>
  <div class="stats stats-3">
    <div class="stat">${ICONS.wallet}<div class="label">${t('stat_total_masuk')}</div><div class="value good">${fmtRp(masuk)}</div></div>
    <div class="stat">${ICONS.outflow}<div class="label">${t('stat_total_keluar')}</div><div class="value bad">${fmtRp(keluar)}</div></div>
    <div class="stat">${ICONS.scale}<div class="label">${t('stat_saldo_kas')}</div><div class="value ${saldoKas>=0?'good':'bad'}">${fmtRp(saldoKas)}</div></div>
    <div class="stat">${ICONS.target}<div class="label">${t('stat_kebutuhan')}</div><div class="value">${fmtRp(keb)}</div></div>
    <div class="stat">${sisa>0?ICONS.trendDown:ICONS.trendUp}<div class="label">${sisa>0?t('stat_masih_kurang'):t('stat_surplus')}</div><div class="value ${sisa>0?'bad':'good'}">${fmtRp(Math.abs(sisa))}</div></div>
    <div class="stat">${ICONS.users}<div class="label">${t('stat_peserta')}</div><div class="value">${state.peserta.length} ${t('orang')}</div></div>
  </div>
  <div class="progress"><i style="width:${pct}%"></i></div>
  <p class="muted" style="margin-top:6px;">${t('progress_note',{pct})}</p>

  ${renderPayCard()}

  <div class="section-head" style="margin-top:26px;"><h2 style="font-size:1.05rem;">${t('status_iuran_title')}</h2>
    ${session ? `<button class="btn btn-sm" data-toggle-form="peserta">${t('btn_tambah_peserta')}</button>` : ''}</div>
  <div class="status-filter">${statusChips}</div>
  <div class="search-box">
    <input type="search" id="peserta-filter" placeholder="${t('search_peserta_placeholder')}" value="${esc(ui.pesertaFilter || '')}">
    ${filterText ? `<button type="button" class="btn btn-sm btn-ghost" data-action="clear-peserta-filter">${t('btn_bersihkan')}</button>` : ''}
  </div>
  ${formHtml('peserta', [
    {name:'nama', label:t('label_nama'), type:'text', required:true},
    {name:'dibayar', label:t('label_dibayar'), type:'number', required:true}
  ])}
  ${pesertaRows ? `<div class="tablewrap"><table><thead><tr><th>${t('th_no')}</th><th>${t('th_nama')}</th><th>${t('th_dibayar')}</th><th>${t('th_status')}</th>${session?'<th></th>':''}</tr></thead><tbody>${pesertaRows}</tbody></table></div>`
    : (state.peserta.length === 0 ? `<p class="empty">${t('empty_peserta')}</p>` : `<p class="empty">${t('empty_peserta_filtered')}</p>`)}

  <div class="section-head" style="margin-top:26px;"><h2 style="font-size:1.05rem;">${t('transaksi_terakhir_title')}</h2></div>
  ${recent.length ? `<div class="tablewrap"><table><thead><tr><th>${t('th_tanggal')}</th><th>${t('th_jenis')}</th><th>${t('th_nominal')}</th></tr></thead><tbody>${
    recent.map(r => `<tr><td>${fmtDate(r.tanggal)}</td><td>${esc(r.jenis)}</td><td class="num">${r.tipe==='keluar'?'-':'+'}${fmtRp(r.jumlah)}</td></tr>`).join('')
  }</tbody></table></div>` : `<p class="empty">${t('empty_transaksi')}</p>`}`;
}

// ---------- Finansial ----------
// ---------- Galeri ----------
const GALERI_PHOTOS = [
  {file:'demang1.jpg', caption:'Villa Demang Puncak'},
  {file:'Livingroom.jpg', caption:'Ruang Keluarga'},
  {file:'Kamar_tidur.jpg', caption:'Kamar Tidur'},
  {file:'Kamar_Mandi.jpg', caption:'Kamar Mandi'},
  {file:'Kitchen_Set.jpg', caption:'Dapur / Kitchen Set'},
  {file:'Entertainment_area.jpg', caption:'Ruang Hiburan'},
  {file:'chill_Area.jpg', caption:'Area Santai'},
  {file:'Barak_Area.jpg', caption:'Area Barak'},
  {file:'gazebo.jpg', caption:'Gazebo'},
  {file:'api_unggun.jpg', caption:'Area Api Unggun'},
  {file:'private_pool.jpg', caption:'Kolam Renang Pribadi'},
  {file:'lapangan.jpg', caption:'Lapangan'},
  {file:'halaman.jpg', caption:'Halaman'}
];
function renderGaleri(){
  const cards = GALERI_PHOTOS.map(p => {
    const src = 'galley/' + p.file;
    return `<div class="card-photo">
      <img src="${src}" data-zoom-src="${src}" alt="${esc(p.caption)}" loading="lazy">
      <div class="meta"><div class="t">${esc(p.caption)}</div></div>
    </div>`;
  }).join('');
  return `<div class="section-head"><h2>${t('galeri_title')}</h2><span class="muted">${t('galeri_subtitle')}</span></div>
  <div class="video-feature">
    <video controls playsinline preload="metadata" poster="galley/villa_demang_poster.jpg">
      <source src="galley/villa_demang_video.mp4" type="video/mp4">
      ${t('video_unsupported')}
    </video>
    <p class="cap">${t('video_caption')}</p>
  </div>
  <div class="gallery">${cards}</div>`;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
function renderFinansial(){
  const { allRows, rows, typeFilter, searchText, typeCounts, filteredTotal } = filteredFinansialRows();
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
      ${session ? `<td class="rowactions"><button class="btn btn-sm" data-edit="finansial:${idx}">${t('common_edit')}</button><button class="btn btn-sm btn-danger" data-del="finansial:${idx}">${t('common_delete')}</button></td>` : ''}
    </tr>`;
  }).join('');

  const pager = rows.length ? `<div class="pager">
    <div class="pager-size">
      <label for="finansial-pagesize">${t('pager_baris')}</label>
      <select id="finansial-pagesize" data-pagesize="finansial">
        ${PAGE_SIZE_OPTIONS.map(n => `<option value="${n}" ${pageSize===n?'selected':''}>${n}</option>`).join('')}
      </select>
    </div>
    <div class="pager-nav">
      <button type="button" class="btn btn-sm" data-page="finansial:prev" ${ui.finansialPage<=1?'disabled':''}>${t('pager_prev')}</button>
      <span class="pager-info">${t('pager_info',{page:ui.finansialPage,total:totalPages,n:rows.length})}</span>
      <button type="button" class="btn btn-sm" data-page="finansial:next" ${ui.finansialPage>=totalPages?'disabled':''}>${t('pager_next')}</button>
    </div>
  </div>` : '';

  const TYPE_LABELS = { semua: t('status_semua'), masuk: t('opt_uang_masuk'), keluar: t('opt_uang_keluar') };
  const typeChips = ['semua','masuk','keluar'].map(key => `<button type="button" class="filter-chip ${typeFilter===key?'active':''}" data-finansial-type-filter="${key}">${TYPE_LABELS[key]} (${typeCounts[key]})</button>`).join('');
  const filterSummary = (typeFilter !== 'semua' || searchText) ? `<p class="muted" style="margin:4px 0 12px;">${t('filter_summary',{n:rows.length, rp:fmtRp(filteredTotal)})}</p>` : '';

  return `<div class="section-head"><h2>${t('finansial_title')}</h2>
    <div class="section-head-actions">
      <button type="button" class="btn btn-sm" data-action="export-finansial-excel">${ICONS.download} ${t('btn_export_excel')}</button>
      ${session ? `<button class="btn btn-primary btn-sm" data-toggle-form="finansial">${t('btn_tambah_transaksi')}</button>` : `<span class="muted">${t('finansial_subtitle')}</span>`}
    </div>
  </div>
  ${formHtml('finansial', [
    {name:'tanggal', label:t('label_tanggal'), type:'date', required:true},
    {name:'jenis', label:t('label_jenis_keperluan'), type:'text', required:true, placeholder:t('ph_jenis_keperluan')},
    {name:'tipe', label:t('label_tipe'), type:'select', options:[['masuk',t('opt_uang_masuk')],['keluar',t('opt_uang_keluar')]], required:true},
    {name:'jumlah', label:t('label_nominal'), type:'number', required:true},
    {name:'metode', label:t('label_metode'), type:'text', placeholder:t('ph_metode')}
  ])}
  <div class="status-filter">${typeChips}</div>
  <div class="search-box">
    <input type="search" id="finansial-filter" placeholder="${t('search_finansial_placeholder')}" value="${esc(ui.finansialFilter || '')}">
    ${searchText ? `<button type="button" class="btn btn-sm btn-ghost" data-action="clear-finansial-filter">${t('btn_bersihkan')}</button>` : ''}
  </div>
  ${filterSummary}
  ${body ? `<div class="tablewrap"><table><thead><tr><th>${t('th_no')}</th><th>${t('th_tanggal')}</th><th>${t('th_jenis')}</th><th>${t('th_masuk')}</th><th>${t('th_keluar')}</th><th>${t('th_saldo')}</th><th>${t('th_metode_ket')}</th>${session?'<th></th>':''}</tr></thead><tbody>${body}</tbody></table></div>` : (allRows.length === 0 ? `<p class="empty">${t('empty_finansial')}</p>` : `<p class="empty">${t('empty_finansial_filtered')}</p>`)}
  ${pager}`;
}

function exportFinansialExcel(){
  if(!window.XLSX){ toast(t('toast_export_gagal_lib')); return; }
  const { rows } = filteredFinansialRows();
  if(!rows.length){ toast(t('toast_export_kosong')); return; }
  const data = rows.map((r,i) => ({
    [t('th_no')]: i + 1,
    [t('th_tanggal')]: r.tanggal || '',
    [t('th_jenis')]: r.jenis || '',
    [t('th_masuk')]: r.tipe === 'masuk' ? Number(r.jumlah||0) : '',
    [t('th_keluar')]: r.tipe === 'keluar' ? Number(r.jumlah||0) : '',
    [t('th_saldo')]: Number(r.saldo||0),
    [t('th_metode_ket')]: r.metode || ''
  }));
  const sheet = XLSX.utils.json_to_sheet(data);
  sheet['!cols'] = [{wch:4},{wch:12},{wch:28},{wch:14},{wch:14},{wch:14},{wch:32}];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, t('finansial_title'));
  const stamp = new Date().toISOString().slice(0,10);
  XLSX.writeFile(book, `Finansial JJS 2026 - ${stamp}.xlsx`);
}

// ---------- Lampiran ----------
function renderLampiran(){
  const cards = state.lampiran.map((l, idx) => `<div class="card-photo">
    <img src="${l.url}" data-zoom-src="${l.url}" alt="${esc(l.judul)}">
    <div class="meta"><div class="t">${esc(l.judul)}</div><div class="d">${fmtDate(l.tanggal)}</div>
    ${l.keterangan ? `<div class="k">${esc(l.keterangan)}</div>` : ''}</div>
    ${session ? `<div class="actions"><button class="btn btn-sm btn-danger" data-del="lampiran:${idx}">${t('common_delete')}</button></div>` : ''}
  </div>`).join('');
  return `<div class="section-head"><h2>${t('lampiran_title')}</h2>
    ${session ? `<button class="btn btn-primary btn-sm" data-toggle-form="lampiran">${t('btn_tambah_lampiran')}</button>` : `<span class="muted">${t('lampiran_subtitle')}</span>`}</div>
  ${formHtml('lampiran', [
    {name:'judul', label:t('label_judul'), type:'text', required:true, placeholder:t('ph_judul')},
    {name:'tanggal', label:t('label_tanggal'), type:'date', required:true},
    {name:'foto', label:t('label_foto'), type:'file'},
    {name:'keterangan', label:t('label_keterangan'), type:'textarea'}
  ])}
  ${cards ? `<div class="gallery">${cards}</div>` : `<p class="empty">${t('empty_lampiran')}</p>`}`;
}

// ---------- Anggaran ----------
function renderAnggaran(){
  const total = anggaranTotal(), masuk = totalMasuk(), sisa = masuk - total;
  const rows = state.anggaran.items.map((it, idx) => {
    const h = Number(it.harga||0), j = Number(it.jumlah||0);
    const lineTotal = h && j ? h*j : 0;
    return `<tr>
      <td>${idx+1}</td><td>${esc(it.item)}</td>
      <td class="num">${it.harga ? fmtRp(it.harga) : '<span class="muted">TBD</span>'}</td>
      <td class="num">${it.jumlah || '<span class="muted">-</span>'}</td>
      <td class="num">${lineTotal ? fmtRp(lineTotal) : '-'}</td>
      <td>${esc(it.keterangan||'-')}</td>
      ${session ? `<td class="rowactions"><button class="btn btn-sm" data-edit="anggaran:${idx}">${t('common_edit')}</button><button class="btn btn-sm btn-danger" data-del="anggaran:${idx}">${t('common_delete')}</button></td>` : ''}
    </tr>`;
  }).join('');
  const notes = state.anggaran.catatan.map((n, idx) => `<li>${esc(n)}${session ? ` <button class="btn btn-sm btn-ghost" data-edit="catatan:${idx}">${t('common_edit')}</button><button class="btn btn-sm btn-ghost" data-del="catatan:${idx}">${t('common_delete')}</button>` : ''}</li>`).join('');
  return `<div class="section-head"><h2>${t('anggaran_title')}</h2>
    ${session ? `<button class="btn btn-primary btn-sm" data-toggle-form="anggaran">${t('btn_tambah_item')}</button>` : `<span class="muted">${t('anggaran_subtitle')}</span>`}</div>
  <div class="stats stats-3">
    <div class="stat"><div class="label">${t('stat_target_iuran')}</div><div class="value">${fmtRp(targetPerOrang())}</div>
      ${session ? `<button class="btn btn-sm btn-ghost" style="margin-top:6px;" data-toggle-form="target">${t('btn_ubah_target')}</button>` : ''}</div>
    <div class="stat"><div class="label">${t('stat_grand_total')}</div><div class="value">${fmtRp(total)}</div></div>
    <div class="stat"><div class="label">${sisa<0?t('stat_kekurangan'):t('stat_sisa_dana')}</div><div class="value ${sisa<0?'bad':'good'}">${fmtRp(Math.abs(sisa))}</div></div>
  </div>
  ${formHtml('target', [
    {name:'targetBiaya', label:t('label_biaya_per_orang'), type:'number', required:true},
    {name:'targetTambahan', label:t('label_tambahan_biaya'), type:'number'}
  ])}
  ${formHtml('anggaran', [
    {name:'item', label:t('label_item'), type:'text', required:true},
    {name:'harga', label:t('label_harga_satuan'), type:'number'},
    {name:'jumlah', label:t('label_jumlah'), type:'number'},
    {name:'keterangan', label:t('label_keterangan'), type:'text'}
  ])}
  ${rows ? `<div class="tablewrap"><table><thead><tr><th>${t('th_no')}</th><th>${t('th_item')}</th><th>${t('th_harga')}</th><th>${t('th_jumlah')}</th><th>${t('th_total')}</th><th>${t('th_keterangan')}</th>${session?'<th></th>':''}</tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="empty">${t('empty_anggaran')}</p>`}
  <div class="notecard"><h3>${t('catatan_title')}</h3>
    ${notes ? `<ol>${notes}</ol>` : `<p class="empty">${t('empty_catatan')}</p>`}
    ${session ? formHtml('catatan', [{name:'teks', label:t('label_catatan_baru'), type:'text', required:true}]) + `<button class="btn btn-sm" data-toggle-form="catatan">${t('btn_tambah_catatan')}</button>` : ''}
  </div>`;
}

// ---------- Rundown ----------
function renderDayList(day, key){
  return day.map((it, idx) => `<li><span class="t">${esc(it.waktu)}</span><span class="k">${esc(it.kegiatan)}
    ${session ? ` <button class="btn btn-sm btn-ghost" data-edit="${key}:${idx}">${t('common_edit')}</button><button class="btn btn-sm btn-ghost" data-del="${key}:${idx}">${t('common_delete')}</button>` : ''}
  </span></li>`).join('');
}
function renderRundown(){
  const games = state.rundown.games.map((g, idx) => `<tr><td>${idx+1}</td><td>${esc(g.jenis)}</td><td>${esc(g.keterangan||t('detail_belum_diisi'))}</td>
    ${session ? `<td class="rowactions"><button class="btn btn-sm" data-edit="games:${idx}">${t('common_edit')}</button><button class="btn btn-sm btn-danger" data-del="games:${idx}">${t('common_delete')}</button></td>` : ''}
  </tr>`).join('');
  return `<div class="section-head"><h2>${t('rundown_title')}</h2><span class="muted">${esc(state.susunan.tanggal)}</span></div>
  ${session ? `<button class="btn btn-sm btn-ghost" data-toggle-form="harilabel">${t('btn_ubah_label_hari')}</button>` : ''}
  ${formHtml('harilabel', [
    {name:'hari1Label', label:t('label_hari1'), type:'text', required:true, placeholder:t('ph_hari1')},
    {name:'hari2Label', label:t('label_hari2'), type:'text', required:true, placeholder:t('ph_hari2')}
  ])}
  <div class="schedule">
    <div class="day"><h3>${t('hari1_prefix')} &ndash; ${esc(state.rundown.hari1Label)}</h3>
      ${session ? formHtml('hari1', [{name:'waktu',label:t('label_waktu'),type:'text',required:true},{name:'kegiatan',label:t('label_kegiatan'),type:'text',required:true}]) : ''}
      <ul>${renderDayList(state.rundown.hari1,'hari1')}</ul>
      ${session ? `<button class="btn btn-sm" data-toggle-form="hari1">${t('btn_tambah_kegiatan')}</button>` : ''}
    </div>
    <div class="day"><h3>${t('hari2_prefix')} &ndash; ${esc(state.rundown.hari2Label)}</h3>
      ${session ? formHtml('hari2', [{name:'waktu',label:t('label_waktu'),type:'text',required:true},{name:'kegiatan',label:t('label_kegiatan'),type:'text',required:true}]) : ''}
      <ul>${renderDayList(state.rundown.hari2,'hari2')}</ul>
      ${session ? `<button class="btn btn-sm" data-toggle-form="hari2">${t('btn_tambah_kegiatan')}</button>` : ''}
    </div>
  </div>
  <div class="section-head" style="margin-top:26px;"><h2 style="font-size:1.05rem;">${t('daftar_games_title')}</h2>
    ${session ? `<button class="btn btn-sm" data-toggle-form="games">${t('btn_tambah_game')}</button>` : ''}</div>
  ${formHtml('games', [{name:'jenis',label:t('label_nama_game'),type:'text',required:true},{name:'keterangan',label:t('label_keterangan'),type:'text'}])}
  ${games ? `<div class="tablewrap"><table><thead><tr><th>${t('th_no')}</th><th>${t('th_jenis')}</th><th>${t('th_keterangan')}</th>${session?'<th></th>':''}</tr></thead><tbody>${games}</tbody></table></div>` : `<p class="empty">${t('empty_games')}</p>`}`;
}

// ---------- Panitia ----------
function renderPanitia(){
  const rows = state.susunan.panitia.map((p, idx) => `<tr><td>${esc(p.jabatan)}</td><td>${p.nama ? esc(p.nama) : `<span class="muted">${t('belum_diisi')}</span>`}</td><td>${esc(p.peran)}</td>
    ${session ? `<td class="rowactions"><button class="btn btn-sm" data-edit="panitia:${idx}">${t('common_edit')}</button><button class="btn btn-sm btn-danger" data-del="panitia:${idx}">${t('common_delete')}</button></td>` : ''}
  </tr>`).join('');
  return `<div class="section-head"><h2>${t('panitia_title')}</h2>
    ${session ? `<button class="btn btn-primary btn-sm" data-toggle-form="panitia">${t('btn_tambah_peran')}</button>` : ''}</div>
  ${session ? formHtml('info', [
      {name:'tema', label:t('label_tema'), type:'text', required:true},
      {name:'tanggal', label:t('label_tanggal'), type:'text', required:true},
      {name:'tempat', label:t('label_tempat'), type:'text', required:true}
    ]) + `<button class="btn btn-sm" data-toggle-form="info">${t('btn_ubah_info_acara')}</button>` : ''}
  ${formHtml('panitia', [
    {name:'jabatan', label:t('label_jabatan'), type:'text', required:true},
    {name:'nama', label:t('label_nama'), type:'text'},
    {name:'peran', label:t('label_peran_singkat'), type:'text'}
  ])}
  <div class="tablewrap"><table><thead><tr><th>${t('th_jabatan')}</th><th>${t('th_nama')}</th><th>${t('th_peran_singkat')}</th>${session?'<th></th>':''}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ---------- Kritik & Saran ----------
function renderKritikSaran(){
  const items = feedbackList.map(f => `<div class="feedback-item">
    <div class="fb-head">
      <span class="fb-nama">${esc(f.nama && f.nama.trim() ? f.nama : t('anonim'))}</span>
      <span class="fb-time">${fmtDateTime(f.created_at)}</span>
    </div>
    <p class="fb-pesan">${esc(f.pesan)}</p>
    ${session ? `<button type="button" class="btn btn-sm btn-danger" data-del-feedback="${f.id}">${t('common_delete')}</button>` : ''}
  </div>`).join('');

  return `<div class="section-head"><h2>${t('kritik_title')}</h2><span class="muted">${t('kritik_subtitle')}</span></div>
  <form class="inlineform" id="feedback-form">
    <div><label>${t('label_nama_opsional')}</label><input type="text" id="feedback-nama" name="nama" value="${esc(ui.feedbackDraft.nama)}" placeholder="${t('label_nama')}" maxlength="60"></div>
    <div class="full"><label>${t('label_kritik_saran')}</label><textarea id="feedback-pesan" name="pesan" required maxlength="2000" placeholder="${t('ph_kritik_saran')}">${esc(ui.feedbackDraft.pesan)}</textarea></div>
    <div class="formbar"><button type="submit" class="btn btn-primary btn-sm">${t('btn_kirim')}</button></div>
  </form>
  ${items ? `<div class="feedback-list">${items}</div>` : `<p class="empty">${t('empty_kritik')}</p>`}`;
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
      <button type="submit" class="btn btn-primary btn-sm" ${ui.busy?'disabled':''}>${ui.busy ? t('common_saving') : (isEdit?t('common_save_changes'):t('common_save'))}</button>
      <button type="button" class="btn btn-ghost btn-sm" data-cancel-form="${section}">${t('common_cancel')}</button>
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
  if(error){ toast(t('toast_upload_gagal',{msg:error.message})); return null; }
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
      const activeBtn = document.querySelector('.tabbtn.active');
      if(activeBtn) activeBtn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
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
    if(error){ toast(t('toast_login_gagal',{msg:error.message})); } else { ui.loginOpen = false; toast(t('toast_login_sukses')); render(); }
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
      if(!confirm(t('confirm_hapus_data'))) return;
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

  document.querySelectorAll('[data-zoom-src]').forEach(img => {
    img.addEventListener('click', () => {
      const gallery = img.closest('.gallery');
      const siblings = gallery ? Array.from(gallery.querySelectorAll('[data-zoom-src]')) : [img];
      ui.lightboxImages = siblings.map(el => ({ src: el.getAttribute('data-zoom-src'), alt: el.getAttribute('alt') }));
      ui.lightboxIndex = siblings.indexOf(img);
      render();
    });
  });
  const closeLb = document.querySelector('[data-close-lightbox]');
  if(closeLb) closeLb.addEventListener('click', () => { ui.lightboxImages = null; render(); });
  const lb = document.getElementById('lightbox');
  if(lb) lb.addEventListener('click', e => { if(e.target === lb){ ui.lightboxImages = null; render(); } });
  document.querySelectorAll('[data-lb-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const total = ui.lightboxImages.length;
      const dir = parseInt(btn.getAttribute('data-lb-nav'), 10);
      ui.lightboxIndex = (ui.lightboxIndex + dir + total) % total;
      render();
    });
  });

  const pesertaFilter = document.getElementById('peserta-filter');
  if(pesertaFilter) pesertaFilter.addEventListener('input', () => {
    ui.pesertaFilter = pesertaFilter.value;
    render();
  });
  const clearFilterBtn = document.querySelector('[data-action="clear-peserta-filter"]');
  if(clearFilterBtn) clearFilterBtn.addEventListener('click', () => { ui.pesertaFilter = ''; render(); });
  document.querySelectorAll('[data-status-filter]').forEach(btn => {
    btn.addEventListener('click', () => { ui.pesertaStatusFilter = btn.getAttribute('data-status-filter'); render(); });
  });

  const finansialFilter = document.getElementById('finansial-filter');
  if(finansialFilter) finansialFilter.addEventListener('input', () => {
    ui.finansialFilter = finansialFilter.value;
    ui.finansialPage = 1;
    render();
  });
  const clearFinansialFilterBtn = document.querySelector('[data-action="clear-finansial-filter"]');
  if(clearFinansialFilterBtn) clearFinansialFilterBtn.addEventListener('click', () => { ui.finansialFilter = ''; ui.finansialPage = 1; render(); });
  document.querySelectorAll('[data-finansial-type-filter]').forEach(btn => {
    btn.addEventListener('click', () => { ui.finansialTypeFilter = btn.getAttribute('data-finansial-type-filter'); ui.finansialPage = 1; render(); });
  });
  const exportFinansialBtn = document.querySelector('[data-action="export-finansial-excel"]');
  if(exportFinansialBtn) exportFinansialBtn.addEventListener('click', exportFinansialExcel);

  const feedbackNama = document.getElementById('feedback-nama');
  if(feedbackNama) feedbackNama.addEventListener('input', () => { ui.feedbackDraft.nama = feedbackNama.value; });
  const feedbackPesan = document.getElementById('feedback-pesan');
  if(feedbackPesan) feedbackPesan.addEventListener('input', () => { ui.feedbackDraft.pesan = feedbackPesan.value; });

  const feedbackForm = document.getElementById('feedback-form');
  if(feedbackForm) feedbackForm.addEventListener('submit', async e => {
    e.preventDefault();
    const nama = feedbackForm.nama.value.trim();
    const pesan = feedbackForm.pesan.value.trim();
    if(!pesan) return;
    const submitBtn = feedbackForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = t('sending');
    const { data, error } = await supabase.from('feedback').insert({ nama: nama || null, pesan }).select().single();
    if(error){
      submitBtn.disabled = false;
      submitBtn.textContent = t('btn_kirim');
      toast(t('toast_kirim_gagal',{msg:error.message}));
      return;
    }
    if(!feedbackList.some(f => f.id === data.id)) feedbackList = [data, ...feedbackList];
    ui.feedbackDraft = { nama: '', pesan: '' };
    toast(t('toast_kirim_sukses'));
    render();
  });
  document.querySelectorAll('[data-del-feedback]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if(!confirm(t('confirm_hapus_kritik'))) return;
      const id = btn.getAttribute('data-del-feedback');
      const { error } = await supabase.from('feedback').delete().eq('id', id);
      if(error){ toast(t('toast_hapus_gagal',{msg:error.message})); return; }
      feedbackList = feedbackList.filter(f => f.id !== id);
      render();
    });
  });

  document.querySelectorAll('[data-copy-text]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const text = btn.getAttribute('data-copy-text');
      try{
        await navigator.clipboard.writeText(text);
        toast(t('toast_salin_sukses',{text}));
      }catch(e){
        toast(t('toast_salin_gagal',{text}));
      }
    });
  });
}

function defaultsFor(section){
  if(section === 'target') return { targetBiaya: state.anggaran.targetBiaya, targetTambahan: state.anggaran.targetTambahan };
  if(section === 'info') return { tema: state.susunan.tema, tanggal: state.susunan.tanggal, tempat: state.susunan.tempat };
  if(section === 'harilabel') return { hari1Label: state.rundown.hari1Label, hari2Label: state.rundown.hari2Label };
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
  if(section === 'catatan') return { teks: state.anggaran.catatan[idx] };
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
      else { if(!data.url){ toast(t('toast_pilih_foto')); return; } s.lampiran.push(data); }
    } else if(section === 'anggaran'){
      data.harga = data.harga ? Number(data.harga) : null;
      data.jumlah = data.jumlah ? Number(data.jumlah) : null;
      if(editIndex != null) Object.assign(s.anggaran.items[editIndex], data);
      else s.anggaran.items.push(data);
    } else if(section === 'target'){
      s.anggaran.targetBiaya = Number(data.targetBiaya||0);
      s.anggaran.targetTambahan = Number(data.targetTambahan||0);
    } else if(section === 'catatan'){
      if(editIndex != null) s.anggaran.catatan[editIndex] = data.teks;
      else s.anggaran.catatan.push(data.teks);
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
    } else if(section === 'harilabel'){
      s.rundown.hari1Label = data.hari1Label; s.rundown.hari2Label = data.hari2Label;
    }
    closeForm(section);
  });
}

document.addEventListener('click', e => {
  const toggleBtn = e.target.closest('[data-action="toggle-lang-menu"]');
  if(toggleBtn){ ui.langMenuOpen = !ui.langMenuOpen; render(); return; }
  const optionBtn = e.target.closest('[data-lang]');
  if(optionBtn){ setLang(optionBtn.getAttribute('data-lang')); return; }
  if(ui.langMenuOpen && !e.target.closest('.lang-switch')){ ui.langMenuOpen = false; render(); }
});

document.addEventListener('keydown', e => {
  if(!ui.lightboxImages) return;
  if(e.key === 'Escape'){ ui.lightboxImages = null; render(); }
  else if(e.key === 'ArrowLeft'){ ui.lightboxIndex = (ui.lightboxIndex - 1 + ui.lightboxImages.length) % ui.lightboxImages.length; render(); }
  else if(e.key === 'ArrowRight'){ ui.lightboxIndex = (ui.lightboxIndex + 1) % ui.lightboxImages.length; render(); }
});

setInterval(updateCountdown, 1000);

if(bootError){
  loadError = bootError;
  render();
} else {
  boot();
}

})();
