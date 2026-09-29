const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys")
const P = require("pino")
const fs = require("fs")
const axios = require("axios")

const SHAMELA_MCP = "https://shamelaa.link/mcp/search"

async function cariSyamilah(query) {
  try {
    const res = await axios.post(SHAMELA_MCP, { query: query, limit: 3 }, { timeout: 20000 })
    return res.data
  } catch (e) { return null }
}

async function startBot() {
    // BIAR AWET: baca session dari ENV
    if (process.env.SESSION_DATA) {
        if (!fs.existsSync("auth_info")) fs.mkdirSync("auth_info")
        fs.writeFileSync("auth_info/creds.json", process.env.SESSION_DATA)
        console.log("Session dari ENV terpasang")
    }

    const { state, saveCreds } = await useMultiFileAuthState("auth_info")
    const sock = makeWASocket({ auth: state, logger: P({ level: "silent" }) })

    // PAIRING CODE 8 DIGIT (gratis simpel)
    if (!sock.authState.creds.registered) {
        const nomor = process.env.NOMOR_WA
        console.log("Menunggu nomor: " + nomor)
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(nomor)
                console.log(`\n\n====================\n🔑 KODE PAIRING: ${code}\n====================\n`)
                console.log("Cara pakai: WA > Titik 3 > Perangkat tertaut > Tautkan dengan nomor telepon > Masukkan kode\n")
            } catch (e) { console.log("Error pairing, tunggu 10 detik") }
        }, 4000)
    }

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", async (u) => {
        if (u.connection === "open") {
            console.log("✅ BOT KONEK!")
            console.log("PENTING: Copy isi file auth_info/creds.json ini ke ENV SESSION_DATA biar awet selamanya")
            try { console.log(fs.readFileSync("auth_info/creds.json","utf-8")) } catch(e){}
        }
    })

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0]
        if (!msg.message || msg.key.fromMe) return
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ""
        const jid = msg.key.remoteJid
        if (text.length < 3) return

        await sock.sendMessage(jid, { text: `⏳ Mencari di المكتبة الشاملة...\nKasus: ${text.slice(0,100)}` })

        let dataSyamilah = await cariSyamilah(text)
        let kutipan = ""
        if (dataSyamilah?.results) {
            dataSyamilah.results.forEach(r => {
                kutipan += `\n📖 ${r.kitab || ''} ${r.jilid||''}/${r.halaman||''}\n«${r.nass||r.text}»\nLink: ${r.link || 'https://shamela.ws'}\n`
            })
        } else { kutipan = "\nBelum terverifikasi dari teks asli Syamilah untuk query ini.\n" }

        let jawaban = `بسم الله الرحمن الرحيم
1. تصوير المسألة: ${text}
2. تحرير محل النزاع: ...
3. التكييف الشرعي: ...
4. أقوال العلماء: ${kutipan}
5. الأدلة (takhrij)
6. مناقشة الأقوال
7. الترجيح
8. الحكم
9. الخلاصة
10. 📚 المراجع: shamelaa.link/mcp`

        await sock.sendMessage(jid, { text: jawaban })
    })
}
startBot()
