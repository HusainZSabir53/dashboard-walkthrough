---
name: dashboard-walkthrough
description: Record a narrated dashboard walkthrough video (1080p MP4, neural TTS voiceover, cursor overlay, section chips, phone-view segment). Use when the user asks for a walkthrough, demo video, product tour, screen recording, or handover video of a web dashboard or admin app.
---

# Dashboard Walkthrough Video

Produces a **1920x1080 30fps MP4 with spoken narration** — a section-by-section tour of a
running web app, in the house style below.

You write a **scene list**. The engine handles cursor, chips, TTS, timing and encoding.

## House style (derived from the reference demo)

| Element | Spec |
| --- | --- |
| Canvas | 1920x1080, 30fps, H.264 + AAC |
| Cursor | Soft grey translucent dot, glides to targets, shrinks on click |
| Highlight | Blue focus ring on whatever the cursor lands on |
| Bottom-left chip | Fixed identity — `App Name · Role` — never changes |
| Bottom-right chip | Current section, changes per scene, acts as the caption |
| Narration | One spoken line per scene; the scene holds until the line finishes |
| Arc | Entry → each section in nav order → phone view → exit |

The bottom-right chip is the caption track. If a viewer mutes the video, those chips
alone should still explain the tour.

## Process

Four phases. Do not skip to recording.

### 1. Discover

The app must be **running** first. Confirm the URL responds and that its data
source is up (API, DB, whatever it reads) — a walkthrough of empty states is worthless.

Then dump what is actually on each page, per route:

```js
await page.evaluate(() => [...document.querySelectorAll('nav a, button, [role="tab"], h1, h2')]
  .filter(el => el.offsetParent).map(el => el.tagName + ' :: ' + el.textContent.trim().slice(0, 45)));
```

Record the real nav labels, tab names, and headings. Never guess selectors.
Prefer `getByRole` / `:has-text()` over CSS chains that break on re-render.

### 2. Write scenes

A scene is data. `say` is the narration, `chip` is the caption, `do` drives the page:

```js
{
  chip: 'Overview',
  say: 'The overview opens on headline metrics for the selected period.',
  goto: '/',
  do: async (w) => { await w.pan('[data-testid="kpi-card"]', 4); },
}
```

Scene fields: `chip`, `say`, `goto`, `phone` (true/false), `pause` (extra seconds), `do`.

Driver (`w`) methods: `goto` `chip` `move` `click` `type` `pan` `scroll` `phone` `wait` `page`.

**Narration rules**
- One idea per scene, 12-30 spoken words. Longer lines make the scene drag.
- Say what the viewer is *looking at* and why it matters — not what you are clicking.
  Good: "Top movers ranks sectors by quarter-on-quarter change."
  Bad: "Now I click on the top movers tab."
- Spell out abbreviations the voice would mangle: `QoQ` → "quarter on quarter".
- Numbers read better as words when approximate: "about four thousand".

**Pacing** is automatic: a scene stays on screen for the length of its own narration.
To linger after the voice stops, add `pause: 2`.

### 3. Rehearse

```bash
node walkthrough/<app>.js --rehearse
```

No video, no TTS, no network cost — it runs every scene and reports each selector that
did not resolve. **Fix every warning before recording.** Silent selector failures are the
main way these recordings come out broken.

Exit code is non-zero if any scene threw.

### 4. Record

```bash
node walkthrough/<app>.js
```

Synthesises narration, records, then muxes each clip at the offset its scene actually
started — so audio stays aligned even when a step ran long. Prints the final duration.

## Runner template

```js
const { runWalkthrough } = require(require('path').join(__dirname,
  '../../.claude/skills/dashboard-walkthrough/skills/dashboard-walkthrough/lib/walkthrough.js'));

runWalkthrough({
  baseUrl: 'http://localhost:8080',
  out: 'walkthrough.mp4',
  identity: 'My Dashboard · Analyst',
  voice: 'en-US-AriaNeural',   // en-GB-RyanNeural, en-US-GuyNeural, en-IN-NeerjaNeural
  rate: '-8%',                 // slower than default reads as more deliberate
  scenes: require('./scenes.js'),
}).catch((e) => { console.error(e); process.exit(1); });
```

See `templates/scenes.example.js` for a full scene list.

## First run

Nothing to install by hand. The engine carries its own Playwright, ffmpeg and TTS; on the
first `runWalkthrough` call it runs `npm install` and fetches Chromium itself (a minute or
two, once). To do it ahead of time instead:

```bash
cd <skill>/lib && npm install && npx playwright install chromium
```

## Gotchas

- **`"type": "module"` projects**: name your runner and scenes `.cjs`, not `.js`, or Node
  rejects `require`. Most Vite apps set this.
- **`:has-text()` is a Playwright selector, not CSS** — putting it in `addStyleTag` silently
  invalidates the whole rule. Hide things by text with `page.evaluate`, not a stylesheet.
- **Prefer in-app nav clicks over `goto`** after the first load. In an SPA a click keeps the
  overlays and any injected styles alive; `goto` reloads and white-flashes.
- **Overlays vanish on hard navigation** — the engine re-injects via `addInitScript`, but if
  the app does a full page reload mid-scene, call `w.chip(...)` again after it.
- **Skip buttons that call an LLM** ("Interpret", "Ask for a recommendation") — they are slow
  and can fail mid-take. Narrate that the feature exists and move the cursor to it instead.
- **Phone view is top-left, not centred.** Playwright anchors the page at the top-left of the
  fixed video canvas and pads the rest grey; it scales down only when the viewport is *larger*
  than the canvas, and it never centres. So `phone: true` gives a narrow strip in the corner
  against a grey field, with the chips cramped inside that strip. Verified across 430x932,
  480x1080 and 760x1700. Either accept that look, drop the phone scene, or post-process:
  split the phone window out, `crop` the used region, `scale` and `pad` it centred, then
  concat. Do not promise a centred phone shot without doing that last step.
- **`pan()` skips anything below the fold** — `scroll()` first, then pan.
- **TTS needs network** (Microsoft Edge voice endpoint). It is free and keyless, but offline
  runs will fail at the synthesis step, before the browser opens.
- **Long videos**: ~12 minutes encodes in a couple of minutes at `preset medium`. Budget for it.
- Keep the raw `.walkthrough/audio/` clips if you plan to re-cut; the `raw/` webm is deleted
  after a successful mux.
