# DIGIBAHAS — versi berfungsi

Versi ini mengubah prototipe HTML menjadi aplikasi full-stack dan Progressive Web App (PWA):

- **Progressive Web App (PWA)**:
  - Dapat di-install langsung ke homescreen/desktop (tombol "Pasang Aplikasi" & Web App Manifest).
  - Service Worker (`sw.js`) dengan strategi Stale-While-Revalidate untuk aset statis dan Network-First untuk navigasi.
  - Halaman fallback saat offline (`offline.html`) dan indikator status koneksi otomatis.
  - Set icon lengkap (SVG, 192x192, 512x512, dan maskable 512x512).
  - Shortcut langsung ke Tanya AI, KBBI, dan Jurnal.
- Login/daftar akun dengan password di-hash.
- Session memakai HttpOnly cookie + JWT.
- Jurnal tersimpan per pengguna di SQLite.
- Riwayat percakapan AI tersimpan per pengguna.
- AI tidak lagi dipanggil langsung dari browser; API key tetap di server.
- Chat memakai OpenAI Responses API & Google Gemini API.
- KBBI punya endpoint internal dan fallback ke KBBI Daring resmi.
- Sumber KBBI bisa diganti dengan provider/API yang memiliki izin.

## Menjalankan

1. Install Node.js 22+.
2. Buka folder proyek.
3. Jalankan:
   `npm install`
4. Salin `.env.example` menjadi `.env`.
5. Isi:
   - `JWT_SECRET`
   - `OPENAI_API_KEY` atau `GEMINI_API_KEY`
6. Jalankan:
   `npm start`
7. Buka `http://localhost:3000`.

## Pengujian PWA

Jalankan test suite otomatis:
```bash
npm test
```

## KBBI

Untuk data KBBI yang sangat luas, jangan menyalin seluruh isi KBBI resmi ke frontend tanpa memastikan hak penggunaan datanya.

Tanpa provider KBBI, aplikasi tetap bekerja dan tombol hasil pencarian mengarah ke entri KBBI Daring resmi.

Jika kamu punya provider/dataset KBBI yang penggunaannya sah, isi `KBBI_API_BASE` dan, jika diperlukan, `KBBI_API_KEY`. Endpoint normalizer di `server.js` dapat disesuaikan dengan format JSON provider.

## Produksi

Sebelum dipublikasikan:
- gunakan HTTPS (wajib untuk Service Worker PWA di luar localhost);
- gunakan `JWT_SECRET` acak dan panjang;
- batasi ukuran/rate request;
- tambahkan rate limit untuk `/api/chat`;
- gunakan PostgreSQL/Supabase bila trafik sudah besar;
- tambahkan email verification/reset password;
- gunakan provider KBBI yang lisensinya jelas.
