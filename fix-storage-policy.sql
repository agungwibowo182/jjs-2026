-- Jalankan file KECIL ini saja (bukan supabase-schema.sql lagi) untuk
-- memperbaiki policy Storage supaya menunjuk ke bucket "jjs-2026".
-- Aman dijalankan berkali-kali, tidak akan error "already exists".

drop policy if exists "Publik boleh lihat lampiran" on storage.objects;
drop policy if exists "Hanya admin login boleh unggah lampiran" on storage.objects;
drop policy if exists "Hanya admin login boleh hapus lampiran" on storage.objects;

create policy "Publik boleh lihat lampiran" on storage.objects
  for select
  using (bucket_id = 'jjs-2026');

create policy "Hanya admin login boleh unggah lampiran" on storage.objects
  for insert
  with check (bucket_id = 'jjs-2026' and auth.role() = 'authenticated');

create policy "Hanya admin login boleh hapus lampiran" on storage.objects
  for delete
  using (bucket_id = 'jjs-2026' and auth.role() = 'authenticated');
