'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const FFMPEG = require('ffmpeg-static');
const FFPROBE = require('ffprobe-static').path;

const DESKTOP = { width: 1920, height: 1080 };
const PHONE = { width: 430, height: 932 };

function probeDuration(file) {
  const out = execFileSync(FFPROBE, [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', file,
  ]).toString().trim();
  return parseFloat(out);
}

// Narration is synthesised before the browser opens so each scene knows how long
// it must stay on screen. Video pacing follows audio, never the other way round.
// One connection per clip. Reusing a single socket across a whole script fails
// partway through with an opaque "Connect Error", losing the batch.
async function speak(sceneDir, text, { voice, rate, pitch }) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioFilePath } = await tts.toFile(sceneDir, text, { rate, pitch });
      return audioFilePath;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  throw new Error('TTS failed after 4 attempts: ' + (lastErr && (lastErr.message || lastErr)));
}

async function synthesise(scenes, dir, opts) {
  for (const [i, scene] of scenes.entries()) {
    if (!scene.say) { scene.audio = null; scene.speech = 0; continue; }
    const sceneDir = path.join(dir, 's' + String(i).padStart(2, '0'));
    fs.mkdirSync(sceneDir, { recursive: true });
    scene.audio = await speak(sceneDir, scene.say, opts);
    scene.speech = probeDuration(scene.audio);
    console.log('  voiced [' + i + '] ' + scene.speech.toFixed(1) + 's  ' + (scene.chip || ''));
  }
}

// Cursor dot, identity chip and section chip are injected via addInitScript so
// they survive every navigation without being re-applied by hand.
//
// Init scripts run at document_start, where document.documentElement is still
// null - touching the DOM at that point throws and the whole overlay silently
// never installs. So: publish window.__wt first, do every DOM write inside
// mount(), and let mount() be re-entrant.
function installOverlay(identity) {
  const STYLE = [
    '#wt-cursor{position:fixed;z-index:2147483647;pointer-events:none;width:22px;height:22px;',
    'margin:-11px 0 0 -11px;border-radius:50%;background:rgba(90,90,90,.62);',
    'box-shadow:0 0 0 1px rgba(255,255,255,.5),0 2px 6px rgba(0,0,0,.3);',
    'transition:left .09s linear,top .09s linear,transform .12s ease;left:-100px;top:-100px}',
    '#wt-cursor.wt-down{transform:scale(.68);background:rgba(40,40,40,.78)}',
    '.wt-chip{position:fixed;bottom:14px;z-index:2147483646;pointer-events:none;',
    'background:rgba(38,38,40,.82);color:#fff;padding:5px 12px;border-radius:6px;',
    'font:500 15px/1.35 -apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:.2px}',
    '#wt-identity{left:14px}',
    '#wt-section{right:14px;transition:opacity .25s}',
    '.wt-ring{outline:2px solid rgba(37,99,235,.9)!important;outline-offset:2px!important;border-radius:4px}',
  ].join('');

  var pending = '';

  function mount() {
    var root = document.documentElement;
    if (!root || !document.body) return false;
    if (!document.getElementById('wt-style')) {
      var css = document.createElement('style');
      css.id = 'wt-style';
      css.textContent = STYLE;
      root.appendChild(css);
    }
    if (!document.getElementById('wt-cursor')) {
      var c = document.createElement('div');
      c.id = 'wt-cursor';
      root.appendChild(c);
    }
    var mk = function (id, text) {
      var el = document.getElementById(id);
      if (!el) {
        el = document.createElement('div');
        el.id = id;
        el.className = 'wt-chip';
        root.appendChild(el);
      }
      if (text !== undefined) el.textContent = text;
      return el;
    };
    mk('wt-identity', identity);
    var sec = mk('wt-section');
    sec.style.opacity = pending ? '1' : '0';
    if (pending) sec.textContent = pending;
    return true;
  }

  window.__wt = {
    mount: mount,
    chip: function (t) {
      pending = t || '';
      mount();
    },
    ring: function (on) {
      var prev = document.querySelectorAll('.wt-ring');
      for (var i = 0; i < prev.length; i++) prev[i].classList.remove('wt-ring');
      if (on) on.classList.add('wt-ring');
    },
  };

  addEventListener('mousemove', function (e) {
    var c = document.getElementById('wt-cursor');
    if (!c) { if (!mount()) return; c = document.getElementById('wt-cursor'); }
    if (c) { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }
  }, true);
  addEventListener('mousedown', function () {
    var c = document.getElementById('wt-cursor'); if (c) c.classList.add('wt-down');
  }, true);
  addEventListener('mouseup', function () {
    var c = document.getElementById('wt-cursor'); if (c) c.classList.remove('wt-down');
  }, true);

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mount);
  else mount();
}

function makeDriver(page, state) {
  const loc = (t) => (typeof t === 'string' ? page.locator(t).first() : t);
  const remount = () => page.evaluate(() => window.__wt && window.__wt.mount()).catch(() => {});

  const api = {
    page,
    wait: (ms) => page.waitForTimeout(ms),

    async goto(url) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
      await remount();
      if (state.chip) await api.chip(state.chip);
    },

    // A missing overlay must be loud. Swallowing it once cost a whole recording
    // that came out with no chips, no cursor and no highlight rings.
    async chip(text) {
      state.chip = text;
      const ok = await page.evaluate((t) => {
        if (!window.__wt) return false;
        window.__wt.chip(t);
        return !!document.getElementById('wt-section');
      }, text).catch(() => false);
      if (!ok && !state.warnedOverlay) {
        state.warnedOverlay = true;
        console.warn('  ! OVERLAY NOT INSTALLED - chips, cursor and rings will be missing');
      }
      return ok;
    },

    // Cursor always travels to a target; it never teleports.
    async move(target, label) {
      const el = loc(target);
      if (!(await el.isVisible().catch(() => false))) {
        console.warn('  ! move skipped, not visible: ' + (label || target));
        return false;
      }
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(220);
      const box = await el.boundingBox();
      if (!box) return false;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 22 });
      await el.evaluate((n) => window.__wt && window.__wt.ring(n)).catch(() => {});
      await page.waitForTimeout(320);
      return true;
    },

    async click(target, label) {
      if (!(await api.move(target, label))) return false;
      await loc(target).click({ timeout: 8000 })
        .catch((e) => console.warn('  ! click failed: ' + (label || target) + ' - ' + e.message));
      await page.waitForTimeout(700);
      await remount();
      return true;
    },

    async type(target, text, label) {
      if (!(await api.move(target, label))) return false;
      const el = loc(target);
      await el.click().catch(() => {});
      await el.fill('').catch(() => {});
      await el.pressSequentially(text, { delay: 38 });
      await page.waitForTimeout(400);
      return true;
    },

    // Sweeps the cursor across a row of cards so the eye is led through the page.
    async pan(selector, max = 5) {
      const els = await page.locator(selector).all();
      for (const el of els.slice(0, max)) {
        const box = await el.boundingBox().catch(() => null);
        if (!box || box.y > state.viewport.height - 40) continue;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 16 });
        await el.evaluate((n) => window.__wt && window.__wt.ring(n)).catch(() => {});
        await page.waitForTimeout(650);
      }
      await page.evaluate(() => window.__wt && window.__wt.ring(null)).catch(() => {});
    },

    async scroll(y) {
      await page.evaluate((top) => window.scrollTo({ top, behavior: 'smooth' }), y);
      await page.waitForTimeout(1200);
    },

    async phone(on = true) {
      state.viewport = on ? PHONE : state.desktop;
      await page.setViewportSize(state.viewport);
      await page.waitForTimeout(900);
      await remount();
      if (state.chip) await api.chip(state.chip);
    },
  };
  return api;
}

// Places every clip at the offset its scene actually started at, so narration
// stays aligned even when a step ran long.
function mux(webm, scenes, marks, out, tail) {
  const voiced = scenes.map((s, i) => ({ s, at: marks[i] })).filter((x) => x.s.audio);
  const args = ['-y', '-i', webm];
  voiced.forEach((v) => args.push('-i', v.s.audio));

  let filter = '[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,'
    + 'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x1a1a1a,fps=30,format=yuv420p[v]';

  if (voiced.length) {
    voiced.forEach((v, i) => {
      const ms = Math.max(0, Math.round(v.at * 1000));
      filter += ';[' + (i + 1) + ':a]adelay=' + ms + '|' + ms + '[a' + i + ']';
    });
    filter += ';' + voiced.map((_, i) => '[a' + i + ']').join('')
      + 'amix=inputs=' + voiced.length + ':normalize=0:dropout_transition=0[a]';
  }

  args.push('-filter_complex', filter, '-map', '[v]');
  if (voiced.length) args.push('-map', '[a]', '-c:a', 'aac', '-b:a', '160k');
  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '21',
    '-movflags', '+faststart', '-t', String(tail), out);

  execFileSync(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

async function runWalkthrough(config) {
  const {
    baseUrl, out, scenes,
    identity = 'Dashboard',
    voice = 'en-US-AriaNeural',
    rate = '-8%', pitch = '+0Hz',
    viewport = DESKTOP,
    workDir = path.join(process.cwd(), '.walkthrough'),
    rehearse = process.argv.includes('--rehearse'),
    headless = true,
  } = config;

  fs.mkdirSync(workDir, { recursive: true });
  const videoDir = path.join(workDir, 'raw');

  if (!rehearse) {
    console.log('Synthesising narration...');
    await synthesise(scenes, path.join(workDir, 'audio'), { voice, rate, pitch });
  }

  const browser = await chromium.launch({ headless, args: ['--force-device-scale-factor=1'] });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    ...(rehearse ? {} : { recordVideo: { dir: videoDir, size: viewport } }),
  });
  await context.addInitScript(installOverlay, identity);

  const page = await context.newPage();
  const state = { chip: '', viewport, desktop: viewport };
  const w = makeDriver(page, state);

  const marks = [];
  const t0 = Date.now();
  let failures = 0;

  try {
    for (const [i, scene] of scenes.entries()) {
      marks[i] = (Date.now() - t0) / 1000;
      console.log('[' + i + '] ' + (scene.chip || '(no chip)')
        + (rehearse ? '' : '  @' + marks[i].toFixed(1) + 's'));

      if (scene.chip) await w.chip(scene.chip);
      if (scene.goto) await w.goto(baseUrl.replace(/\/$/, '') + scene.goto);
      if (scene.phone !== undefined) await w.phone(scene.phone);

      if (scene.do) {
        try { await scene.do(w); }
        catch (e) { failures++; console.error('  ! scene ' + i + ' failed: ' + e.message); }
      }

      if (rehearse) continue;

      // Hold the frame until the voice line has finished, plus a beat to breathe.
      const elapsed = (Date.now() - t0) / 1000 - marks[i];
      const hold = scene.speech + (scene.pause !== undefined ? scene.pause : 0.7) - elapsed;
      if (hold > 0) await page.waitForTimeout(hold * 1000);
    }
  } finally {
    const total = (Date.now() - t0) / 1000;
    if (!rehearse) await page.waitForTimeout(1200);
    const video = rehearse ? null : page.video();
    const src = video ? await video.path() : null;
    await context.close();
    await browser.close();

    if (rehearse) {
      console.log(failures ? '\nREHEARSAL FAILED - ' + failures + ' scene(s) errored' : '\nREHEARSAL PASSED');
      process.exitCode = failures ? 1 : 0;
    } else {
      console.log('\nEncoding ' + out + ' ...');
      mux(src, scenes, marks, out, total + 1.6);
      fs.rmSync(videoDir, { recursive: true, force: true });
      console.log('Done: ' + out + '  (' + probeDuration(out).toFixed(1) + 's, '
        + failures + ' scene failure(s))');
    }
  }
}

module.exports = { runWalkthrough, DESKTOP, PHONE };
