# dashboard-walkthrough

A Claude Code skill that records a **narrated walkthrough video of a running web dashboard** — 1080p MP4 with neural-TTS voiceover, a soft cursor overlay, identity and section chips, and a phone-view segment.

You write a scene list (what to show, what to say). The engine handles cursor movement, highlight rings, TTS, timing, and the H.264 encode.

## Install

Project-level (recommended — scoped to one workspace):

```bash
git clone https://github.com/HusainZSabir53/dashboard-walkthrough .claude/skills/dashboard-walkthrough
cd .claude/skills/dashboard-walkthrough/lib && npm install && npx playwright install chromium
```

Global (every project):

```bash
git clone https://github.com/HusainZSabir53/dashboard-walkthrough ~/.claude/skills/dashboard-walkthrough
cd ~/.claude/skills/dashboard-walkthrough/lib && npm install && npx playwright install chromium
```

Requires Node 18+. TTS uses the free Microsoft Edge neural voices (network needed at synthesis time, no key).

## Use

In Claude Code: *"make a walkthrough video of this dashboard"* — the skill triggers on walkthrough / demo video / product tour / screen recording / handover video.

Or drive it directly:

```bash
node walkthrough/<app>.cjs --rehearse   # dry run: verifies every selector, no video, no TTS
node walkthrough/<app>.cjs              # synthesise narration, record, mux, encode
```

See [SKILL.md](SKILL.md) for the four-phase process, scene format, driver API, and the gotchas learned the hard way. [templates/scenes.example.js](templates/scenes.example.js) is a starter scene list.

## Layout

```
SKILL.md                    process + house style + gotchas
lib/walkthrough.js          engine: overlay, driver, TTS, mux
lib/package.json            playwright · msedge-tts · ffmpeg-static · ffprobe-static
templates/scenes.example.js starter scenes
```
