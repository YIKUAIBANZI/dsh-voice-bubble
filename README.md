# dsh-voice-bubble — DSH 语音气泡 / Voice Message Bubbles for DeepSeek Harness

> 让 DeepSeek Harness（DSH）在对话里直接发语音消息：微信式气泡、点击播放、显示时长、一键「转文字」。
> WeChat-style voice messages inside the DeepSeek Harness chat — send_voice TTS tool, inline audio player, duration and transcript.

[![dsh.so](https://cdn.dsh.so/badge/dsh-voice-bubble.svg)](https://www.dsh.so/artifact/dsh-voice-bubble/?ref=badge)
[![license](https://img.shields.io/github/license/YIKUAIBANZI/dsh-voice-bubble)](./LICENSE)

**关键词 / Keywords：** DSH 语音、语音气泡、语音消息、发语音、文字转语音、TTS、语音回复、AI 语音、微信语音气泡、语音播放器 · voice message, voice bubble, text-to-speech, TTS, speech synthesis, audio player, AI voice reply, WeChat-style chat, DeepSeek Harness plugin, dsh plugin

---

## 这是什么

`dsh-voice-bubble` 是一个 DeepSeek Harness（DSH）插件。装上之后，AI 可以在聊天里**直接发一条语音消息**——就像微信的语音气泡：点一下播放、显示秒数、旁边有「转文字」。

它解决的是 DSH 原生聊天的一个空白：消息渲染块只有 text / image / file / table，**没有 audio**，模型想「开口说话」只能丢一个 mp3 文件让用户下载。这个插件把「生成语音 → 渲染气泡 → 播放」整条链路补齐了。

### 适合谁 / When to use

- 你想要 AI **用语音回你**，而不是每次打字（voice reply / 语音回复）
- 你在做陪伴型、角色型 agent，需要**有人味的声音**（AI companion / persona voice）
- 你想让 DSH 里的 TTS 结果**直接可听**，而不是每次去文件夹里找 mp3
- 你需要**转文字**兜底：听不清的时候一键看原文（transcript / 语音转文字）

## 功能

- 🔊 **语音气泡**：微信风格浅蓝气泡 + 小尾巴，宽度随时长变化
- ▶️ **点击播放/暂停**：播放时声波柱跳动，进度从左往右推进
- ⏱️ **时长显示**：8″ 这样的秒数，来自 ffprobe 实测
- 📝 **转文字**：气泡旁一键展开/收起原文
- 🤖 **模型工具** `send_voice(text, timbre?)`：模型主动调用即可发语音
- 🗣️ **多音色**：edge-tts（晓伊/晓晓/云希/云扬）、macOS say、ElevenLabs（BYOK）
- 🔒 **最小暴露**：媒体路由只放行插件自己生成的 mp3，需要 DSH 登录态

## 安装

### 方式一：从 GitHub 安装（推荐）

在 DSH「插件 → 添加插件」里填：

```
github:YIKUAIBANZI/dsh-voice-bubble
```

或命令行：

```bash
dsh plugin --profile web add github:YIKUAIBANZI/dsh-voice-bubble
```

装完**重启 DSH**（客户端代码在启动时打包，不重启看不到气泡）。

### 方式二：本地路径

```bash
git clone https://github.com/YIKUAIBANZI/dsh-voice-bubble.git
```

DSH「添加插件」里填克隆下来的**绝对路径**，安装后重启。

## 使用

对 AI 说：

> 用语音回我 / 发条语音 / 念给我听 / 用声音说

AI 会调用 `send_voice`，气泡出现在回复下方。

也可以让模型自己决定什么时候开口——比如在长任务完成、或者它想主动说点什么的时候。

## 音色

### 默认：edge-tts（免费、无需 key）

装了 `edge-tts` 就用 `zh-CN-XiaoyiNeural`（晓伊，年轻俏皮）；没装则回退 macOS 自带的 `Tingting`（婷婷）。

```bash
pip3 install --user edge-tts
# 或
python3 -m venv .venv && .venv/bin/pip install edge-tts
```

`timbre` 参数可选：`xiaoyi`（默认）、`xiaoxiao`（温柔）、`yunxi`（清朗男声）、`yunyang`（播音男声）。

### ElevenLabs（BYOK，音质最好）

在 `~/.dsh/voice-bubble/config.json` 里填自己的 key 和音色 ID：

```json
{
  "provider": "elevenlabs",
  "elevenlabsKey": "你的_API_KEY",
  "voiceId": "你的音色_ID"
}
```

改完不用重启，下一条语音就生效；失败会自动回退 edge-tts / say。

## 常见问题（FAQ）

**Q：DSH 怎么发语音？**
A：装这个插件，然后对 AI 说「用语音回我」。它会把文字合成语音，以气泡形式发到对话里。

**Q：怎么让 AI 回复自动带声音？**
A：这个插件是「按需发语音」；如果你想要每条回复都朗读，可以再配一个 read-aloud 类插件（如 dsh-voice-mode、dsh-chatvoice）。

**Q：支持 English / other languages?**
A：TTS 本身支持多语言（edge-tts / ElevenLabs），气泡 UI 目前是中文文案，但语音内容不限语言。

**Q：声音能换成我自己的吗？**
A：可以。ElevenLabs 支持 voice design 或克隆，把 voiceId 填进配置即可；注意使用他人声音前要获得授权。

**Q：音频存在哪？**
A：`~/.dsh/voice-bubble/`，只保留本地，不上传；媒体路由只服务这个目录下的 mp3。

## 工作原理

| 层 | 干什么 |
|---|---|
| Host 工具 `send_voice(text)` | 调 TTS 合成 mp3，写入 `deliverables/presented`，附带 `voice/duration/transcript` |
| 媒体路由 `/dsh-voice-bubble/media` | 登录态校验 + HTTP Range，只放行 `~/.dsh/voice-bubble/` 下的 mp3 |
| 客户端 `turnTail` 槽 | 在最终回复正下方渲染语音气泡，播放/进度/转文字都在这里 |

## 已知限制

- 桌面版若从 `dsh-app://` 加载页面，相对路径的音频请求可能被自定协议拦住；遇到的话反馈一下，我加直连路由。
- `say` 回退音色比较机械，建议装 edge-tts。
- 气泡只挂在「这一轮新生成」的语音上；历史气泡刷新后仍在（事件持久化）。

## License

MIT © YIKUAIBANZI
