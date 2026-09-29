const fs = require('fs');
const axios = require('axios');
const pino = require('pino');
const http = require('http');

// ========== FIX WAJIB RENDER BIAR TIDAK TIMEOUT ==========
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot Bahtsul Masail V3 Live OK');
}).listen(process.env.PORT || 10000, () => console.log('Web server ready - Port Fixed'));

// ================== PROMPT PENELITI SYARIAH ASLI USTADZ ==================
const SYSTEM_PROMPT = `
Bertindaklah sebagai peneliti syariah dan asisten akademik dalam bidang Fikih, Ushul Fikih, serta Akidah Ahlus Sunnah wal Jama'ah bermanhaj Salaf (Atsari).

METODE WAJIB JAWAB (JANGAN DIUBAH URUTANNYA):
# بسم الله الرحمن الرحيم
## أولًا: تصوير المسألة
## ثانيًا: تحرير محل النزاع
## ثالثًا: التكييف الشرعي
## رابعًا: أقوال العلماء (جميع المذاهب والفرق) - WAJIB tampilkan semua pendapat Salaf, 4 Mazhab, bahkan Asy'ariyah/Maturidiyah jika relevan sebelum dibantah
## خامسًا: أدلة الأقوال وتخريجها - Wajib sebutkan Mukharrij, no hadits, status sahih/hasan/dhaif, pentahqiq
## سادسًا: مناقشة الأقوال والرد على المخالفين - Bantah dengan rujukan Salaf Atsari: Imam Ahmad, Bukhari, Darimi, Ibnu Khuzaimah, Lalaka'i, Ibnu Taimiyah, Ibnu Qayyim, Bin Baz, Utsaimin, Albani. JANGAN pakai kaidah kalam.
## سابعًا: الترجيح وبيان الحق
## ثامنًا: الحكم المباشر
## تاسعًا: الخلاصة
## 📚 المراجع والمصادر - Cantumkan: Nama Kitab | Penulis | Jilid | Halaman | Tahqiq | Link turath.io / shamela.ws / dorar.net / waqfeya.net. Jika belum verifikasi tulis: "Belum terverifikasi dari teks asli". DILARANG memalsukan teks Arab.

ATURAN IBARAT KITAB:
📖 قال الإمام [اسم] رحمه الله:
«النص العربي الأصلي...»
Terjemahan: "..."
Penjelasan: ...

Gaya: Ilmiah, lugas, tegas, mudah dipahami, Arab berharakat.
`;

async function loadBaileys() {
  const baileys = await import('@whiskeysockets/baileys');
  return {
    makeWASocket: baileys.default,
    useMultiFileAuthState: baileys.useMultiFileAuthState,
    DisconnectReason: baileys.DisconnectReason
  };
}

async function tanyaAI(pertanyaanUser) {
  try {
    const OPENAI_KEY = process.env.OPENAI_API_KEY
    if (!OPENAI_KEY) return null
   
    let res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: pertanyaanUser }
      ],
      temperature: 0.3
    }, { headers: { Authorization: `Bearer ${OPENAI_KEY}` } })
   
    return res.data.choices[0].message.content
  } catch (e) {
    console.log("AI Error:", e.response?.data || e.message)
    return null
  }
}

async function startBot() {
    const { makeWASocket, useMultiFileAuthState, DisconnectReason } = await loadBaileys();

    // Restore SESSION_DATA base64 jika ada
    if (process.env.SESSION_DATA) {
        try {
            console.log("SESSION_DATA ditemukan di ENV");
            const sessionDir = './auth_info';
            if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
            // Support 2 format: base64 JSON dan JSON langsung
            let sessRaw = process.env.SESSION_DATA;
            try {
                const decoded = Buffer.from(sessRaw, 'base64').toString();
                const sessionData = JSON.parse(decoded);
                for (const file in sessionData) {
                    fs.writeFileSync(`${sessionDir}/${file}`, JSON.stringify(sessionData[file]));
                }
            } catch {
                // kalau bukan base64, coba parse langsung (format lama)
                console.log("SESSION_DATA format lama, skip restore file");
            }
        } catch (e) { console.log("Gagal restore session", e.message) }
    }

    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    const sock = makeWASocket({ auth: state, logger: pino({ level: 'silent' }) })
    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (u) => {
        if (u.qr) console.log("QR muncul, scan jika belum konek");
        if (u.connection === 'open') console.log('BOT KONEK - BAHTSUL MASAIL V3 READY');
        if (u.connection === 'close' && u.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
            console.log("Reconnecting...");
            startBot();
        }
    })

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0]
        if (!msg.message || msg.key.fromMe) return
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "")
        const from = msg.key.remoteJid
        if (!text) return

        console.log("Pertanyaan:", text)
       
        let jawabanAI = await tanyaAI(`
📌 DESKRIPSI MASALAH: ${text}
❓ PERTANYAAN: ${text}
Jawab dengan 9 struktur lengkap di atas.
`)

        let jawabFinal = ""
        if (jawabanAI) {
            jawabFinal = jawabanAI
        } else {
            jawabFinal = `*Mode Manual Aktif (Belum ada OPENAI_API_KEY)*

Ustadz, untuk mengaktifkan mode Peneliti Syariah super lengkap seperti template Ustadz, tambahkan di Render > Environment:

KEY: OPENAI_API_KEY
VALUE: sk-xxxx dari openai.com

Sementara ini:
# بسم الله الرحمن الرحيم
## أولًا: تصوير المسألة
Pertanyaan: ${text}

Pasang API Key dulu Ustadz.`
        }

        if (jawabFinal.length > 4000) {
            for (let i = 0; i < jawabFinal.length; i += 4000) {
                await sock.sendMessage(from, { text: jawabFinal.substring(i, i+4000) })
            }
        } else {
            await sock.sendMessage(from, { text: jawabFinal })
        }
    })
}
startBot();
