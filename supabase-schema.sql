-- =========================================================
-- Jalan-Jalan Saans 2026 - Supabase setup
-- Jalankan SEMUA isi file ini di: Supabase Dashboard
-- -> SQL Editor -> New query -> tempel semua isi file ini -> Run
-- File ini AMAN dijalankan berkali-kali (tidak akan error "already exists").
-- =========================================================

-- 1) Tabel penyimpanan data (satu baris berisi seluruh isi website)
create table if not exists app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- 2) Aktifkan Row Level Security supaya aturan akses di bawah berlaku
alter table app_state enable row level security;

-- 3) Siapa saja (termasuk yang belum login) boleh MEMBACA data
drop policy if exists "Publik boleh baca" on app_state;
create policy "Publik boleh baca" on app_state
  for select
  using (true);

-- 4) Hanya admin yang SUDAH LOGIN (lewat Supabase Auth) boleh MENGUBAH data
drop policy if exists "Hanya admin login boleh update" on app_state;
create policy "Hanya admin login boleh update" on app_state
  for update
  using (auth.role() = 'authenticated');

-- 5) Aktifkan realtime supaya perubahan admin langsung muncul di layar semua orang
-- (kalau tabelnya sudah pernah ditambahkan sebelumnya, baris ini akan error
--  "already member of publication" -- itu tandanya sudah aktif, abaikan saja)
alter publication supabase_realtime add table app_state;

-- 6) Masukkan data awal (dari Excel "Jalan-jalan Saans 2026.xlsx")
insert into app_state (id, data)
values ('main', '{"finansial": [{"id": "seed1", "tanggal": "2026-07-01", "jenis": "Cicilan 1 Rara", "tipe": "masuk", "jumlah": 125000, "metode": "Transfer ke DANA via BCA"}, {"id": "seed2", "tanggal": "2026-07-01", "jenis": "Cicilan 1 Ucer", "tipe": "masuk", "jumlah": 100000, "metode": "Transfer ke DANA via BCA"}, {"id": "seed3", "tanggal": "2026-07-04", "jenis": "Cicilan 1 Agung", "tipe": "masuk", "jumlah": 100000, "metode": "Transfer ke DANA via BCA"}, {"id": "seed4", "tanggal": "2026-07-04", "jenis": "Cicilan 1 Laela", "tipe": "masuk", "jumlah": 125000, "metode": "Transfer ke DANA via BCA"}, {"id": "seed5", "tanggal": "2026-07-29", "jenis": "Cicilan 1 Liani", "tipe": "masuk", "jumlah": 200000, "metode": "Transfer ke DANA via SHOPEE"}, {"id": "seed6", "tanggal": "2026-08-04", "jenis": "Cicilan 1 Fikri", "tipe": "masuk", "jumlah": 300000, "metode": "Transfer ke DANA via BCA"}, {"id": "seed7", "tanggal": "2026-08-04", "jenis": "Cicilan 2 Rara", "tipe": "masuk", "jumlah": 100000, "metode": "Transfer ke DANA via BCA"}, {"id": "seed8", "tanggal": "2026-08-04", "jenis": "Cicilan 2 Ucer", "tipe": "masuk", "jumlah": 125000, "metode": "Transfer ke DANA via BCA"}, {"id": "seed9", "tanggal": "2026-08-23", "jenis": "Cicilan 2 Agung", "tipe": "masuk", "jumlah": 125000, "metode": "Transfer ke DANA via BCA"}, {"id": "seed10", "tanggal": "2026-08-23", "jenis": "Cicilan 2 Laela", "tipe": "masuk", "jumlah": 100000, "metode": "Transfer ke DANA via BCA"}, {"id": "seed11", "tanggal": "2026-08-28", "jenis": "Cicilan 1 Utay", "tipe": "masuk", "jumlah": 100000, "metode": "Transfer ke DANA via BCA"}, {"id": "seed12", "tanggal": "2026-08-28", "jenis": "Cicilan 1 Jays", "tipe": "masuk", "jumlah": 150000, "metode": "Transfer ke DANA via BCA"}, {"id": "seed13", "tanggal": "2026-08-31", "jenis": "Cicilan 2 Liani", "tipe": "masuk", "jumlah": 250000, "metode": ""}, {"id": "seed14", "tanggal": "2026-08-31", "jenis": "Cicilan 1 Najwa", "tipe": "masuk", "jumlah": 100000, "metode": ""}, {"id": "seed15", "tanggal": "2026-09-01", "jenis": "Cicilan 3 Rara", "tipe": "masuk", "jumlah": 125000, "metode": "Transfer ke DANA via BCA"}, {"id": "seed16", "tanggal": "2026-09-01", "jenis": "Cicilan 3 Ucer", "tipe": "masuk", "jumlah": 100000, "metode": "Transfer ke DANA via BCA"}, {"id": "seed17", "tanggal": "2026-09-01", "jenis": "Cicilan 1 Dian", "tipe": "masuk", "jumlah": 200000, "metode": ""}, {"id": "seed18", "tanggal": "2026-09-02", "jenis": "Cicilan 2 Jays", "tipe": "masuk", "jumlah": 150000, "metode": "Transfer ke DANA via BCA"}, {"id": "seed19", "tanggal": "2026-09-02", "jenis": "Cicilan 2 Utay", "tipe": "masuk", "jumlah": 100000, "metode": "Transfer ke DANA via BCA"}, {"id": "seed20", "tanggal": "2026-09-11", "jenis": "Cicilan 1 Haikal", "tipe": "masuk", "jumlah": 150000, "metode": "Transfer ke DANA via BCA"}, {"id": "seed21", "tanggal": "2026-09-14", "jenis": "Cicilan 2 Fikri", "tipe": "masuk", "jumlah": 150000, "metode": "Transfer ke DANA via BCA"}], "lampiran": [], "anggaran": {"items": [{"item": "Villa", "harga": 2000000, "jumlah": 1, "keterangan": "DP Rp1.000.000, sisa Rp1.000.000"}, {"item": "Bus", "harga": 2000000, "jumlah": 1, "keterangan": ""}, {"item": "Catering/org", "harga": 100000, "jumlah": null, "keterangan": "Jumlah menunggu konfirmasi peserta"}, {"item": "Gas/Galon", "harga": null, "jumlah": null, "keterangan": "Harga belum ditentukan"}, {"item": "Parkir Bus", "harga": 100000, "jumlah": 1, "keterangan": ""}, {"item": "Tip Kang Villa", "harga": 100000, "jumlah": 1, "keterangan": ""}], "catatan": ["Fasilitas: Kamar 4 (kamar mandi di masing-masing kamar, 1 di kolam renang, 1 kamar mandi ada pemanas), Karaoke, Wifi, Kolam renang indoor, halaman, alat masak.", "Galon air dan gas cuma dapat 1x, sisanya beli sendiri (bisa nitip penjaga villa).", "Untuk arang beli sendiri (bisa nitip penjaga villa).", "Parkir mobil pribadi di depan villa; infokan jika sudah dekat agar tidak kena biaya pengawalan.", "Parkir Bus di luar villa, biaya Rp100.000 dan pengawalan (sudah diatur oleh pihak Bus, jadi Rp2 juta terima beres)."], "targetBiaya": 450000, "targetTambahan": 25000}, "peserta": [{"nama": "Mytan", "dibayar": 0}, {"nama": "Nomi", "dibayar": 0}, {"nama": "Ucer", "dibayar": 325000}, {"nama": "Rara", "dibayar": 350000}, {"nama": "Jays", "dibayar": 250000}, {"nama": "Utay", "dibayar": 250000}, {"nama": "Agung", "dibayar": 225000}, {"nama": "Laela", "dibayar": 225000}, {"nama": "Zulfi", "dibayar": 0}, {"nama": "Eva", "dibayar": 0}, {"nama": "Jodi", "dibayar": 0}, {"nama": "Bondan", "dibayar": 0}, {"nama": "Mas Lukis", "dibayar": 0}, {"nama": "Fikri", "dibayar": 450000}, {"nama": "Haikal", "dibayar": 150000}, {"nama": "Liani", "dibayar": 450000}, {"nama": "Najwa", "dibayar": 100000}, {"nama": "Dian", "dibayar": 200000}], "rundown": {"hari1Label": "Sabtu, 1 November", "hari2Label": "Minggu, 2 November", "hari1": [{"waktu": "06.00", "kegiatan": "GATHER AT EX:POM"}, {"waktu": "10.00", "kegiatan": "ARRIVE AT THE LOCATION"}, {"waktu": "10.00 - 13.00", "kegiatan": "FREE TIME + HAVE LUNCH"}, {"waktu": "13.00 - 15.00", "kegiatan": "FUN GAME 1"}, {"waktu": "15.00 - 17.00", "kegiatan": "FREE TIME"}, {"waktu": "17.00 - 18.00", "kegiatan": "SUNSET MOMENT"}, {"waktu": "18.00 - 19.00", "kegiatan": "FAMILY DINNER"}, {"waktu": "19.00 - 20.00", "kegiatan": "FUN GAME 2"}, {"waktu": "20.00 - 21.00", "kegiatan": "EXCHANGE GIFTS"}, {"waktu": "21.00 - selesai", "kegiatan": "FREE TIME, CLOSING EVENT & REST"}], "hari2": [{"waktu": "04.00 - 05.00", "kegiatan": "CONGREGATIONAL DAWN PRAYER"}, {"waktu": "05.00 - 07.00", "kegiatan": "FREE TIME & MORNING COFFEE"}, {"waktu": "07.00 - 08.00", "kegiatan": "BREAKFAST"}, {"waktu": "08.00 - 11.00", "kegiatan": "FREE TIME"}, {"waktu": "11.00 - 12.00", "kegiatan": "PREPARING TO GO HOME"}, {"waktu": "12.00 - 17.00", "kegiatan": "INITIAL GATHERING POINT EX:POM"}], "games": [{"jenis": "Fun Games 1", "keterangan": ""}, {"jenis": "Fun Games 2", "keterangan": ""}, {"jenis": "Fun Games 3", "keterangan": ""}]}, "susunan": {"judul": "Jalan-Jalan Saans 2026", "tema": "Bersama Sama-sama", "tanggal": "1-2 November 2026", "tempat": "Villa Demang Puncak, Bogor", "panitia": [{"jabatan": "Ketua & Bendahara", "nama": "", "peran": "Si penggerak utama, ngatur alur dan semangat; juga ngatur duit patungan, belanja, dan laporan akhir"}, {"jabatan": "Wakil Ketua", "nama": "", "peran": "Si tangan kanan yang sigap bantu di semua hal"}, {"jabatan": "Sekretaris & Seksi Transportasi-Akomodasi", "nama": "", "peran": "Jaga jadwal & komunikasi grup biar nggak chaos; atur mobil, bensin, rute, dan pembagian kamar"}, {"jabatan": "Seksi Acara & Games Master", "nama": "", "peran": "Bikin rundown, lomba lucu, dan vibe seru biar semua ketawa bareng"}, {"jabatan": "Seksi Logistik & Perlengkapan", "nama": "", "peran": "Urus sound, alat BBQ, banner, colokan, sampai galon air"}, {"jabatan": "Seksi Konsumsi / Chef Squad", "nama": "", "peran": "Urus makanan, minuman, kopi, mie instan, dan arang BBQ"}, {"jabatan": "Seksi Dokumentasi & Konten", "nama": "", "peran": "Abadikan semua momen, bikin after movie dan reels"}, {"jabatan": "Seksi Keamanan & Ketertiban", "nama": "", "peran": "Pastikan acara kondusif, jaga barang, dan ingatkan kalau ada yang kelewat seru"}]}}'::jsonb)
on conflict (id) do nothing;

-- =========================================================
-- 7) Storage bucket untuk foto kwitansi/bukti transfer.
--    Bucket yang dipakai bernama "jjs-2026" (nama bucket TIDAK BISA
--    diganti setelah dibuat di Supabase, jadi kode di app.js dan
--    policy di bawah ini sengaja disamakan ke nama itu). Kalau Anda
--    membuat bucket dengan nama lain, ganti 'jjs-2026' di 3 policy
--    di bawah ini DAN nilai STORAGE_BUCKET di baris atas app.js.
-- =========================================================

drop policy if exists "Publik boleh lihat lampiran" on storage.objects;
create policy "Publik boleh lihat lampiran" on storage.objects
  for select
  using (bucket_id = 'jjs-2026');

drop policy if exists "Hanya admin login boleh unggah lampiran" on storage.objects;
create policy "Hanya admin login boleh unggah lampiran" on storage.objects
  for insert
  with check (bucket_id = 'jjs-2026' and auth.role() = 'authenticated');

drop policy if exists "Hanya admin login boleh hapus lampiran" on storage.objects;
create policy "Hanya admin login boleh hapus lampiran" on storage.objects
  for delete
  using (bucket_id = 'jjs-2026' and auth.role() = 'authenticated');
