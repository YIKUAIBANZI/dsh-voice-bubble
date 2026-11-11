/**
 * dsh-voice-bubble — 在 DSH 对话里发「语音消息」。
 *
 * 数据流：
 *   send_voice(text)  →  本地 TTS / ElevenLabs 合成 mp3
 *                     →  写进 deliverables/presented（带 voice/duration/transcript 字段）
 *                     →  客户端 turnTail 槽把它画成微信式语音气泡
 *                     →  /dsh-voice-bubble/media 路由（登录态 + Range）供应音频
 *
 * 除了 node 内置模块不依赖任何包，方便「添加插件」里填本地路径直接 link。
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileP = promisify(execFile)

export const name = 'voice-bubble'
export const inject = ['tools', 'webServer', 'sessionProjections']

const PKG = '@yikuaibanz1/dsh-voice-bubble'
const ROUTE = '/dsh-voice-bubble/media'
const CACHE_DIR = process.env.DSH_VOICE_DIR || path.join(os.homedir(), '.dsh', 'voice-bubble')
const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i

const DEFAULT_SAY_VOICE = process.env.DSH_VOICE_SAY || 'Tingting'
const DEFAULT_EDGE_VOICE = 'zh-CN-XiaoyiNeural'
const EDGE_PRESETS = {
  xiaoyi: 'zh-CN-XiaoyiNeural',
  xiaoxiao: 'zh-CN-XiaoxiaoNeural',
  yunxi: 'zh-CN-YunxiNeural',
  yunyang: 'zh-CN-YunyangNeural',
}
const DEFAULT_ELEVEN_VOICE = process.env.ELEVENLABS_VOICE_ID || ''
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY || ''

// ── 工具 schema 小工具 ─────────────────────────────────────────────

function specToJsonSchema(spec) {
  const properties = {}
  const required = []
  for (const [key, node] of Object.entries(spec)) {
    const { required: isRequired, ...rest } = node
    properties[key] = rest
    if (isRequired) required.push(key)
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}) }
}

function defineTool(options) {
  return {
    name: options.name,
    description: options.description,
    parameters: specToJsonSchema(options.parameters),
    output: options.output,
    execute: options.execute,
  }
}

// ── 合成 ───────────────────────────────────────────────────────────

async function ensureCache() {
  await fsp.mkdir(CACHE_DIR, { recursive: true })
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function probeDuration(file) {
  try {
    const { stdout } = await execFileP('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file,
    ])
    return Number(String(stdout).trim()) || 0
  } catch {
    return 0
  }
}

async function loadConfig() {
  try {
    const raw = await fsp.readFile(path.join(CACHE_DIR, 'config.json'), 'utf8')
    const cfg = JSON.parse(raw)
    return cfg && typeof cfg === 'object' ? cfg : {}
  } catch {
    return {}
  }
}

async function synthSay(text, voice) {
  await ensureCache()
  const id = newId()
  const aiff = path.join(CACHE_DIR, `${id}.aiff`)
  const mp3 = path.join(CACHE_DIR, `${id}.mp3`)
  try {
    await execFileP('say', ['-v', voice, '-r', '190', '-o', aiff, text], { timeout: 120_000 })
    await execFileP('ffmpeg', [
      '-y', '-v', 'error', '-i', aiff,
      '-codec:a', 'libmp3lame', '-b:a', '96k', '-ar', '44100', mp3,
    ], { timeout: 60_000 })
  } finally {
    await fsp.unlink(aiff).catch(() => {})
  }
  return { file: mp3, duration: await probeDuration(mp3), provider: 'say' }
}

/** edge-tts：优先用插件目录里的 .venv，其次 PATH 上的 edge-tts，都没有就抛错回退 say */
function edgeBinary() {
  if (process.env.DSH_EDGE_TTS_BIN) return process.env.DSH_EDGE_TTS_BIN
  const local = path.join(PLUGIN_DIR, '.venv', 'bin', 'edge-tts')
  try {
    fs.accessSync(local, fs.constants.X_OK)
    return local
  } catch {
    return 'edge-tts'
  }
}

async function synthEdge(text, voice, rate, pitch) {
  await ensureCache()
  const id = newId()
  const mp3 = path.join(CACHE_DIR, `${id}.mp3`)
  await execFileP(edgeBinary(), [
    '--voice', voice,
    '--rate', rate || '+6%',
    '--pitch', pitch || '+10Hz',
    '--text', text,
    '--write-media', mp3,
  ], { timeout: 120_000 })
  return { file: mp3, duration: await probeDuration(mp3), provider: 'edge-tts' }
}

async function synthEleven(text, voiceId, key) {
  if (!key) throw new Error('没有配置 ElevenLabs API key')
  await ensureCache()
  const id = newId()
  const mp3 = path.join(CACHE_DIR, `${id}.mp3`)
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ text, model_id: 'eleven_v4' }),
    },
  )
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`ElevenLabs 合成失败（HTTP ${res.status}）：${detail.slice(0, 300)}`)
  }
  await fsp.writeFile(mp3, Buffer.from(await res.arrayBuffer()))
  return { file: mp3, duration: await probeDuration(mp3), provider: 'elevenlabs' }
}

async function synthesize(text, timbre) {
  const cfg = await loadConfig()
  const key = cfg.elevenlabsKey || ELEVEN_KEY
  const voiceId = cfg.voiceId || DEFAULT_ELEVEN_VOICE
  const sayVoice = cfg.sayVoice || DEFAULT_SAY_VOICE
  const forced = String(cfg.provider || process.env.DSH_VOICE_TTS || 'edge').toLowerCase()
  const edgeVoice = (timbre && (EDGE_PRESETS[timbre] || timbre)) || cfg.edgeVoice || DEFAULT_EDGE_VOICE

  if (forced === 'elevenlabs' || (forced === 'auto' && key)) {
    try {
      return await synthEleven(text, voiceId, key)
    } catch (error) {
      try { process.stderr.write(`[voice-bubble] ElevenLabs 失败，回退 edge：${error.message}\n`) } catch { /* ignore */ }
    }
  }
  if (forced !== 'say') {
    try {
      return await synthEdge(text, edgeVoice, cfg.edgeRate, cfg.edgePitch)
    } catch (error) {
      try { process.stderr.write(`[voice-bubble] edge-tts 失败，回退 say：${error.message}\n`) } catch { /* ignore */ }
    }
  }
  return synthSay(text, sayVoice)
}

// ── 路由鉴权与音频服务 ─────────────────────────────────────────────

function ownOrigin(ctx) {
  try { return new URL(ctx.webServer.getOrigin()).origin } catch { return '' }
}

function fenceOk(req, origin) {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const o = req.headers.origin
  if (o === undefined) return true
  try { return new URL(o).origin === origin } catch { return false }
}

async function serveMedia(ctx, req, res) {
  const origin = ownOrigin(ctx)
  const host = String(req.headers.host || '')
  const hostOk = LOOPBACK.test(host) || (origin && host === new URL(origin).host)
  if (!hostOk) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('forbidden'); return }

  const conn = (() => { try { return ctx.get('connection') } catch { return null } })()
  if (conn && typeof conn.requestRejection === 'function') {
    const rejected = conn.requestRejection(req)
    if (rejected) {
      res.writeHead(rejected === 401 ? 401 : 403, { 'Content-Type': 'text/plain' })
      res.end(rejected === 401 ? 'unauthorized' : 'forbidden')
      return
    }
  } else if (!fenceOk(req, origin)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('forbidden'); return
  }

  const url = new URL(req.url, 'http://127.0.0.1')
  const p = url.searchParams.get('p') || ''
  let real, st
  try {
    real = await fsp.realpath(p)
    st = await fsp.stat(real)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return
  }
  const inside = real === CACHE_DIR || real.startsWith(CACHE_DIR + path.sep)
  if (!inside || !st.isFile() || !/\.(mp3|m4a)$/i.test(real)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('forbidden'); return
  }

  const total = st.size
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim())
  const headers = {
    'Content-Type': 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  }
  let start = 0
  let end = total - 1
  let code = 200
  if (range && total > 0) {
    const [, s, e] = range
    if (s === '' && e === '') { /* 多段不管 */ } else if (s === '') {
      const n = Number(e); start = Math.max(0, total - n); end = total - 1; code = 206
    } else {
      start = Number(s); end = e === '' ? total - 1 : Math.min(Number(e), total - 1)
      if (start >= total) {
        res.writeHead(416, { 'Content-Range': `bytes */${total}` }); res.end(); return
      }
      code = 206
    }
    headers['Content-Range'] = `bytes ${start}-${end}/${total}`
  }
  headers['Content-Length'] = String(end - start + 1)
  res.writeHead(code, headers)
  if (req.method === 'HEAD') { res.end(); return }
  fs.createReadStream(real, { start, end })
    .on('error', () => { try { res.destroy() } catch { /* ignore */ } })
    .pipe(res)
}

// ── 插件入口 ───────────────────────────────────────────────────────

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE,
    handler: (req, res) => { void serveMedia(ctx, req, res) },
  }), 'voice-bubble: media route')

  const tool = defineTool({
    name: 'send_voice',
    description:
      '用语音说一段话：把文字合成语音，在对话里以语音消息气泡的形式发给用户（可点播放、可转文字）。' +
      '用户说「用语音回我」「发条语音」「念给我听」或者你想用声音表达情绪时调用。' +
      '文本要口语化、第一人称、简短（一两句话），不要写 emoji、颜文字、Markdown 或括号说明。' +
      '中文为主；时长控制在 15 秒内。',
    parameters: {
      text: {
        type: 'string',
        required: true,
        description: '要说的文字，口语化第一人称，例如「主人，我在呢，今天也一起加油。」',
      },
      timbre: {
        type: 'string',
        description: '可选音色：xiaoyi（默认，年轻俏皮）、xiaoxiao（温柔）、yunxi（清朗男声）、yunyang（播音男声）',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string' },
          duration: { type: 'number' },
          file: { type: 'string' },
        },
        required: ['text'],
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(args, exec) {
      const text = String(args.text || '').trim()
      if (!text) throw new Error('text 不能为空')
      const { file, duration, provider } = await synthesize(text, args.timbre)

      const agent = exec && exec.agent
      const session = agent && agent.session
      try {
        if (session && ctx.sessionProjections && typeof session.append === 'function') {
          const boundary = ctx.sessionProjections.stateOf(session, 'turnBoundary')
          if (boundary && Number.isInteger(boundary.lastTurn)) {
            session.append('deliverables/presented', {
              turn: boundary.lastTurn,
              callId: (exec && exec.callId) || 'send_voice',
              files: [{
                path: file,
                description: '🎙️ 语音',
                voice: true,
                duration: Math.round(duration * 10) / 10,
                transcript: text,
              }],
            })
          }
        }
      } catch { /* 呈现失败不影响语音本身 */ }

      return {
        text: `🎙️ 语音已发送（${duration.toFixed(1)} 秒，${provider}）`,
        duration: Math.round(duration * 10) / 10,
        file,
      }
    },
  })

  ctx.tools.register(tool)
}
