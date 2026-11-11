/**
 * dsh-voice-bubble 客户端 — 把这一轮的语音交付物画成微信式气泡。
 *
 *   conversation.chat.turnTail（链式槽）→ 在最终回复正下方插入语音气泡
 *
 * 气泡：微信风的浅蓝圆气泡 + 小尾巴；点按播放/暂停，
 * 播放时声波柱跳动、进度填充从右往左推进；旁边「转文字」。
 * 音频走宿主的 /dsh-voice-bubble/media（登录态 + Range）。
 */
window.__ModuleLoader__.load({
  id: '@yikuaibanz1/dsh-voice-bubble',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    let react = null
    try { react = require('react') } catch (_) { react = null }
    if (!react) {
      exports.apply = () => {}
      exports.inject = ['slots']
      return module.exports
    }

    const h = react.createElement
    const PKG = '@yikuaibanz1/dsh-voice-bubble'
    const ROUTE = '/dsh-voice-bubble/media'

    function installStyle() {
      if (typeof document === 'undefined') return
      if (document.getElementById('dsh-voice-bubble-style')) return
      const style = document.createElement('style')
      style.id = 'dsh-voice-bubble-style'
      style.textContent = `
        .vb-list { display: flex; flex-direction: column; align-items: flex-start; }

        .vb-stack {
          display: flex; flex-direction: column; align-items: flex-start; gap: 5px;
          margin: 10px 0 6px;
          animation: vb-in 0.22s ease both;
        }
        @keyframes vb-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }

        .vb-row { display: flex; align-items: center; gap: 4px; }

        /* —— 微信风浅蓝气泡 —— */
        .vb-bubble {
          position: relative; overflow: hidden;
          display: flex; align-items: center; gap: 10px;
          min-height: 32px; padding: 5px 13px;
          border-radius: 16px;
          background: linear-gradient(180deg, #dcebff 0%, #d5e6ff 100%);
          color: #16202c;
          border: 0;
          box-shadow: 0 1px 2px rgba(20, 40, 80, 0.06);
          cursor: pointer; user-select: none;
          transition: filter 0.15s ease, transform 0.12s ease;
        }
        .vb-bubble::before {
          content: ''; position: absolute; left: -6px; top: 10px;
          width: 0; height: 0;
          border-top: 6px solid transparent;
          border-bottom: 6px solid transparent;
          border-right: 7px solid #d5e6ff;
        }
        .vb-bubble:hover { filter: brightness(1.02); }
        .vb-bubble:active { transform: scale(0.985); }
        .vb-bubble:focus-visible { outline: 2px solid rgba(90, 140, 230, 0.6); outline-offset: 2px; }

        /* 播放进度：从右往左扫过来的浅色水层 */
        .vb-fill {
          position: absolute; left: 0; top: 0; bottom: 0;
          width: 0%;
          background: rgba(255, 255, 255, 0.55);
          transition: width 0.12s linear;
          pointer-events: none;
        }
        .vb-content { position: relative; display: flex; align-items: center; gap: 9px; min-width: 0; }

        .vb-wave { display: flex; align-items: center; gap: 2.5px; height: 13px; }
        .vb-wave i {
          display: block; width: 3px; height: 5px; border-radius: 2px;
          background: currentColor; opacity: 0.72;
          transition: height 0.15s ease;
        }
        .vb-playing .vb-wave i { animation: vb-bounce 0.9s ease-in-out infinite; }
        .vb-playing .vb-wave i:nth-child(2) { animation-delay: 0.15s; }
        .vb-playing .vb-wave i:nth-child(3) { animation-delay: 0.3s; }
        @keyframes vb-bounce {
          0%, 100% { height: 4px; opacity: 0.62; }
          50% { height: 13px; opacity: 1; }
        }

        .vb-dur { font-size: 12.5px; font-variant-numeric: tabular-nums; opacity: 0.8; }

        .vb-btn {
          font-size: 12px; line-height: 1; color: inherit; opacity: 0.58;
          background: transparent; border: 0; cursor: pointer;
          padding: 6px 8px; border-radius: 8px; white-space: nowrap;
          transition: background 0.15s ease, opacity 0.15s ease;
        }
        .vb-btn:hover { background: rgba(90, 140, 230, 0.12); opacity: 0.95; }

        /* 转文字：和气泡同风格的浅蓝，稍微浅一点 */
        .vb-text {
          max-width: 460px; margin: 1px 0 0 4px;
          padding: 7px 12px; border-radius: 14px;
          background: #eef4ff; color: #24303d;
          font-size: 13px; line-height: 1.65;
          white-space: pre-wrap; word-break: break-word;
          box-shadow: 0 1px 2px rgba(20, 40, 80, 0.04);
          animation: vb-fade-in 0.18s ease;
        }
        @keyframes vb-fade-in { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: none; } }

        .vb-hidden-audio { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

        @media (prefers-color-scheme: dark) {
          .vb-bubble { background: linear-gradient(180deg, #2b3f5c 0%, #26384f 100%); color: #e8f0ff; }
          .vb-bubble::before { border-right-color: #26384f; }
          .vb-text { background: #223247; color: #dfe8f6; }
          .vb-btn:hover { background: rgba(140, 180, 255, 0.14); }
        }
      `
      document.head.appendChild(style)
    }

    function durationLabel(sec) {
      const n = Number(sec)
      if (!Number.isFinite(n) || n <= 0) return ''
      return `${Math.round(n)}″`
    }

    function VoiceBubble(props) {
      const file = props.file || {}
      const [playing, setPlaying] = react.useState(false)
      const [open, setOpen] = react.useState(false)
      const [duration, setDuration] = react.useState(Number(file.duration) || 0)
      const [progress, setProgress] = react.useState(0)
      const audioRef = react.useRef(null)

      const path = String(file.path || '')
      const src = path ? ROUTE + '?p=' + encodeURIComponent(path) : ''
      const width = Math.max(100, Math.min(280, 70 + duration * 11))

      const toggle = () => {
        const el = audioRef.current
        if (!el) return
        if (el.paused) {
          el.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
        } else {
          el.pause()
          setPlaying(false)
        }
      }

      const onKeyDown = (event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault()
          toggle()
        }
      }

      return h(
        'div',
        { className: 'vb-stack' },
        h(
          'div',
          { className: 'vb-row' },
          h(
            'div',
            {
              className: 'vb-bubble' + (playing ? ' vb-playing' : ''),
              style: { width },
              role: 'button',
              tabIndex: 0,
              'aria-label': (playing ? '暂停语音' : '播放语音') + '，' + durationLabel(duration),
              onClick: toggle,
              onKeyDown,
            },
            h('span', { className: 'vb-fill', style: { width: `${Math.round(progress * 100)}%` } }),
            h(
              'span',
              { className: 'vb-content' },
              h(
                'span',
                { className: 'vb-wave', 'aria-hidden': 'true' },
                h('i', { key: 'a' }),
                h('i', { key: 'b' }),
                h('i', { key: 'c' }),
              ),
              h('span', { className: 'vb-dur' }, durationLabel(duration)),
            ),
          ),
          h(
            'div',
            { className: 'vb-side' },
            file.transcript
              ? h(
                  'button',
                  { className: 'vb-btn', type: 'button', onClick: () => setOpen((v) => !v) },
                  open ? '收起文字' : '转文字',
                )
              : null,
          ),
        ),
        h('audio', {
          ref: audioRef,
          src: src || undefined,
          preload: 'auto',
          className: 'vb-hidden-audio',
          onLoadedMetadata: (event) => {
            const d = event.currentTarget.duration
            if (Number.isFinite(d) && d > 0) setDuration(d)
          },
          onTimeUpdate: (event) => {
            const el = event.currentTarget
            if (Number.isFinite(el.duration) && el.duration > 0) setProgress(el.currentTime / el.duration)
          },
          onPlay: () => setPlaying(true),
          onPause: () => setPlaying(false),
          onEnded: (event) => {
            setPlaying(false)
            setProgress(0)
            try { event.currentTarget.currentTime = 0 } catch (_) {}
          },
        }),
        open && file.transcript
          ? h('div', { className: 'vb-text' }, String(file.transcript))
          : null,
      )
    }

    function TurnTail(props) {
      const turn = props.turn
      const data = turn && turn.data && typeof turn.data.get === 'function' ? turn.data : null
      if (!data) return null
      let files = []
      try {
        files = data.get('deliverables')?.presented ?? []
      } catch (_) {
        files = []
      }
      const seen = new Set()
      const voices = []
      for (const file of files) {
        if (!file || file.voice !== true) continue
        const p = String(file.path || '')
        if (!p || seen.has(p)) continue
        seen.add(p)
        voices.push(file)
      }
      if (!voices.length) return null
      return h(
        'div',
        { className: 'vb-list' },
        voices.map((file) => h(VoiceBubble, { key: String(file.path), file })),
      )
    }

    function apply(ctx) {
      if (!ctx || !ctx.slots) return
      installStyle()
      const register = () => ctx.slots.register(
        { name: 'conversation.chat.turnTail', id: PKG },
        (props) => h(TurnTail, props),
      )
      try {
        if (typeof ctx.slots.inject === 'function') {
          ctx.slots.inject('conversation.chat.turnTail', () => {
            try { register() } catch (error) { console.warn('[voice-bubble] turnTail 注册失败:', error) }
          })
        } else {
          register()
        }
      } catch (error) {
        console.warn('[voice-bubble] slots.inject 失败，改用直接注册:', error)
        try { register() } catch (inner) { console.warn('[voice-bubble] 直接注册失败:', inner) }
      }
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  },
})
