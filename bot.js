const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const axios = require('axios')
const pino = require('pino')

// ================== PROMPT PENELITI SYARIAH ==================
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

async function tanyaAI(pertanyaanUser) {
  try {
    const OPENAI_KEY = process.env.OPENAI_API_KEY
    if (!OPENAI_KEY) return null // kalau tidak ada key, pakai mode manual
   
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
    console.log("AI Error:", e.message)
    return null
  }
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    // Ambil session dari ENV kalau ada (biar tidak pairing ulang)
    if (process.env.SESSION_DATA) {
        try {
            const sess = JSON.parse(process.env.SESSION_DATA)
            // Simpan ke file auth_info/creds.json secara manual sudah di-handle Render
            console.log("SESSION_DATA ditemukan")
        } catch {}
    }
   
    const sock = makeWASocket({ auth: state, logger: pino({ level: 'silent' }) })
    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (u) => {
        if (u.connection === 'open') console.log('BOT KONEK - BAHTSUL MASAIL V3 READY')
        if (u.connection === 'close' && u.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) startBot()
    })

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0]
        if (!msg.message || msg.key.fromMe) return
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "")
        const from = msg.key.remoteJid
        if (!text) return

        console.log("Pertanyaan:", text)
       
        // Coba jawab pakai AI model Bahtsul Masail
        let jawabanAI = await tanyaAI(`
📌 DESKRIPSI MASALAH: ${text}
❓ PERTANYAAN: ${text}
Jawab dengan 9 struktur lengkap di atas.
`)

        let jawabFinal = ""
        if (jawabanAI) {
            jawabFinal = jawabanAI
        } else {
            // Fallback kalau belum ada OPENAI_API_KEY - mode manual
            jawabFinal = `*Mode Manual Aktif (Belum ada OPENAI_API_KEY)*

Ustadz, untuk mengaktifkan mode Peneliti Syariah super lengkap seperti template Ustadz, tambahkan di Render > Environment:

KEY: OPENAI_API_KEY
VALUE: sk-xxxx dari openai.com

Sementara ini saya jawab manual:

# بسم الله الرحمن الرحيم
## أولًا: تصوير المسألة
Pertanyaan: ${text}

Bot akan menjawab dengan metode Bahtsul Masail lengkap setelah API Key dipasang.

Silakan pasang API Key dulu Ustadz.`
        }

        // Potong pesan WA max 4000 karakter per bubble
        if (jawabFinal.length > 4000) {
            for (let i = 0; i < jawabFinal.length; i += 4000) {
                await sock.sendMessage(from, { text: jawabFinal.substring(i, i+4000) })
            }
        } else {
            await sock.sendMessage(from, { text: jawabFinal })
        }
    })
}
startBot()
