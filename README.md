# dashboard-walkthrough

A Claude Code skill that records a **narrated walkthrough video of a running web dashboard** — 1080p MP4 with neural-TTS voiceover, a soft cursor overlay, identity and section chips, and a phone-view segment.

You write a scene list (what to show, what to say). The engine handles cursor movement, highlight rings, TTS, timing, and the H.264 encode.

## Install

As a plugin (recommended):

```bash
claude plugin marketplace add HusainZSabir53/dashboard-walkthrough
claude plugin install dashboard-walkthrough
```

Or drop the skill folder into a project directly:

```bash
git clone https://github.com/HusainZSabir53/dashboard-walkthrough /tmp/dw
cp -r /tmp/dw/skills/dashboard-walkthrough .claude/skills/
```

Either way there is nothing else to set up: the engine installs its own Node dependencies
and downloads Chromium on first use. Requires Node 18+. TTS uses the free Microsoft Edge
neural voices (network needed at synthesis time, no key).

## Use

In Claude Code: *"make a walkthrough video of this dashboard"* — the skill triggers on walkthrough / demo video / product tour / screen recording / handover video.

Or drive it directly:

```bash
node walkthrough/<app>.cjs --rehearse   # dry run: verifies every selector, no video, no TTS
node walkthrough/<app>.cjs              # synthesise narration, record, mux, encode
```

See [SKILL.md](skills/dashboard-walkthrough/SKILL.md) for the four-phase process, scene format, driver API, and the gotchas learned the hard way. [templates/scenes.example.js](skills/dashboard-walkthrough/templates/scenes.example.js) is a starter scene list.

## Example: the first video it produced

A handover walkthrough of a government economic-intelligence dashboard (React/Vite front end, FastAPI + ClickHouse back end), recorded against live data on a local stack.

- **5 min 35 s**, 1920×1080, **29 scenes, one take, zero failures**
- Arc: sign-in → real-time invoice KPIs and top movers → sector and regional canvas → period/currency controls → macro baseline and indicator charts → scenario simulator (presets, manual shock inputs, impact tabs) → policy advisor with its 130-scheme incentive register → the built-in briefing assistant → appendix → profile → phone view → sign-out
- The **chatbot segment is a live round-trip**: the script opens the assistant, types a question, sends it, and holds until the streamed reply carries real figures, then narrates the sourced answer. The question was chosen so the backend answers it from a data tool rather than free-form prose — the take never depends on what an LLM might say.
- Narration: `en-GB-RyanNeural` at −6 %, roughly 10 s per scene. Each scene holds for exactly the length of its own line, so audio and picture stay aligned with no post-editing.

Everything that run taught is folded into [SKILL.md](skills/dashboard-walkthrough/SKILL.md): init scripts fire before `document.documentElement` exists, a shared TTS socket dies partway through a long script, `:has-text()` is not CSS, and phone view renders top-left rather than centred.

## Layout

```
.claude-plugin/plugin.json          plugin manifest
.claude-plugin/marketplace.json     lets this repo serve as its own marketplace
skills/dashboard-walkthrough/
  SKILL.md                          process + house style + gotchas
  lib/walkthrough.js                engine: overlay, driver, TTS, mux, self-bootstrap
  lib/package.json                  playwright · msedge-tts · ffmpeg-static · ffprobe-static
  templates/scenes.example.js       starter scenes
```

MIT — see [LICENSE](LICENSE).
