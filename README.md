# dsh-voice-bubble —— 在 DSH 对话里发语音气泡

微信式语音消息：**点一下播放、显示时长、旁边有「转文字」**。给 `小肥鱼` 准备的专属嗓子通道 ovo

## 它怎么工作

| 层 | 干什么 |
|---|---|
| Host 工具 `send_voice(text)` | 调 TTS 合成 mp3，写入 `deliverables/presented`，附带 `voice/duration/transcript` |
| 媒体路由 `/dsh-voice-bubble/media` | 登录态校验 + HTTP Range，只放行 `~/.dsh/voice-bubble/` 下的 mp3 |
| 客户端 `turnTail` 槽 | 在最终回复正下方渲染语音气泡，点播放/暂停，点「转文字」展开原文 |

## 安装

1. DSH 左下角 **插件** → **添加插件**
2. 填 GitHub 地址，或本地克隆后的绝对路径：

```
https://github.com/YIKUAIBANZI/dsh-voice-bubble
```

3. 安装后**重启 DSH**（客户端代码在启动时打包，不重启看不到气泡）

## 使用

对我直接说：

> 用语音回我 / 发条语音 / 念给我听

我就会调用 `send_voice`，气泡出现在回复下方。文字会先口语化再合成，时长控制在 15 秒内。

## 换声音

默认走 **edge-tts**（微软神经语音，免费、无需 key）：装了就用 `zh-CN-XiaoyiNeural`（晓伊，年轻俏皮），
`timbre` 参数可选 `xiaoyi` / `xiaoxiao`（晓晓，温柔）/ `yunxi` / `yunyang`。
没装 `edge-tts` 时自动回退 macOS 自带的 `Tingting`（婷婷）。

想让声音更自然，装一下 edge-tts（任选其一）：

```bash
pip3 install --user edge-tts
# 或者用插件目录里的 venv
python3 -m venv .venv && .venv/bin/pip install edge-tts
```


想换成 **小肥鱼 · 蓝汽水**（ElevenLabs，voice_id 填你自己的）：

```bash
mkdir -p ~/.dsh/voice-bubble
cat > ~/.dsh/voice-bubble/config.json <<'JSON'
{
  "provider": "elevenlabs",
  "elevenlabsKey": "你的_ELEVENLABS_API_KEY",
  "voiceId": "你的_ELEVENLABS_VOICE_ID"
}
JSON
```

API key 在 [elevenlabs.io](https://elevenlabs.io) → 头像 → API Keys 里创建。配置改完**不用重启**，下一次 `send_voice` 就生效；键失效会自动回退到婷婷。

更细的配置（`~/.dsh/voice-bubble/config.json`）：

```json
{
  "provider": "edge",
  "edgeVoice": "zh-CN-XiaoxiaoNeural",
  "edgeRate": "+4%",
  "edgePitch": "+8Hz",
  "sayVoice": "Tingting"
}
```

也可以只改本地声线，比如 `{"sayVoice": "Flo (中文（中国大陆）)"}`。

## 已知限制（第一版）

- 桌面版若从 `dsh-app://` 加载页面，相对路径的音频请求可能被自定协议拦住；到时候再加一条直连路由
- TTS 走 `say` 时 macOS 必须装了对应语音；没声音就先 `say -v Tingting -o /tmp/t.aiff 测试`
- 气泡只挂在「这一轮新生成」的语音上；刷新页面后历史气泡仍然在（事件持久化）

## 卸载

插件页移除本条，重启 DSH。`~/.dsh/voice-bubble/` 下的缓存可以手动删。
