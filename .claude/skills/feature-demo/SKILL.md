---
name: feature-demo
description: Record a single-branch Playwright walkthrough of a Metabase feature with synthesized voiceover. Use when the user asks to "record a demo", "make a walkthrough", "record a feature demo", or similar for the feature on the current branch. NOT for before/after bug demos (use playwright-demo for that).
---

# Feature demo with voiceover

Record one continuous walkthrough of a feature on the current branch and produce an `.mp4` with synthesized voiceover. The flow is five phases: **discover → storyboard → record → voiceover → mux**. The user reviews the storyboard once (≈30s); everything else runs autonomously.

---

## Prerequisites check

Run these first. Anything missing → fix per the section below.

```bash
# Core (same as the bug-demo skill)
java -version 2>&1 | head -1
clojure --version 2>&1
bun --version
node --version
ls tmp/node_modules/playwright >/dev/null 2>&1   && echo "playwright: ok"            || echo "playwright: MISSING"
ls resources/frontend_client/app/dist/*.js >/dev/null 2>&1 && echo "frontend build: ok" || echo "frontend build: MISSING (run 'bun run build')"
ls e2e/snapshots/demo_clean.sql >/dev/null 2>&1  && echo "snapshot: ok"               || echo "snapshot: MISSING"

# Feature-demo specific
command -v ffmpeg >/dev/null                      && echo "ffmpeg: ok"                 || echo "ffmpeg: MISSING (brew install ffmpeg)"
python3 -c "import pydub" 2>/dev/null             && echo "pydub: ok"                  || echo "pydub: MISSING (pip3 install pydub)"
[[ -n "$REPLICATE_API_TOKEN" ]]                   && echo "replicate token: ok"        || echo "replicate token: MISSING (export REPLICATE_API_TOKEN=…)"
ls "${REPLICATE_TTS_REF_AUDIO:-$HOME/tmp/voice-ref.wav}" >/dev/null 2>&1 && echo "voice ref: ok" || echo "voice ref: MISSING (record a 5-10s WAV at ~/tmp/voice-ref.wav)"
```

### Fix missing prerequisites

```bash
# Playwright in tmp/
cd tmp && npm init -y && npm install playwright && npx playwright install chromium && cd ..

# Static frontend
bun run build

# Clean snapshot — same procedure as the bug-demo skill (clojure -M:run:e2e, log in,
# clean cards/notifications, kill BE, truncate task_history via H2 JDBC, restart,
# POST /api/testing/snapshot/demo-clean). See `playwright-demo` skill if you need details.

# ffmpeg + pydub
brew install ffmpeg
pip3 install pydub

# Replicate token — sign up at replicate.com, set in your shell rc
export REPLICATE_API_TOKEN=r8_...

# Voice reference for cloning — one-time. ~12s of clean natural speech, mono 22kHz.
# Use any mic (built-in is fine; external mic gives better clone quality).
# See Phase 4 → "Reference audio" for format details and tuning knobs.
mkdir -p ~/tmp
sox -d -r 22050 -c 1 ~/tmp/voice-ref.wav trim 0 12     # macOS: brew install sox
```

### Optional: EE tokens

If the feature is enterprise-only (sandboxing, audit, transforms, embedding, etc.):

```bash
source ~/tmp/load-ee-tokens.sh
export MB_PREMIUM_EMBEDDING_TOKEN="$CYPRESS_MB_ALL_FEATURES_TOKEN"
```

---

## Phase 1 — Discover

Read what changed on this branch. No boot, no files written.

```bash
git rev-parse --abbrev-ref HEAD                    # current branch
git diff master...HEAD --stat                       # changed files
git log master..HEAD --oneline                      # commit titles
gh pr view --json title,body 2>/dev/null || true    # PR description if any
```

Then grep the diff for signals worth showing:
- **New routes:** added lines containing `defendpoint` (backend) or `<Route path=` (FE)
- **New top-level pages/modals:** added files matching `*Page.tsx`, `*Modal.tsx`, `*View.tsx`
- **New admin entries:** added lines in `AdminNavbar`, `admin/app/components/AdminApp`, or plugin nav files

Also look at: any spec/design doc the user has on the branch (often under `docs/superpowers/specs/`) and any project memory note. These usually contain the elevator pitch in plain English — quote from them in narration.

Keep the discovery summary in conversation context. Don't write a file.

---

## Phase 2 — Storyboard

Draft `tmp/demo-storyboard.md` from the discovery. Keep it small — 5–8 beats max. Each beat is one action + one sentence of narration written the way a presenter speaks.

**Template to emit:**

```markdown
# Feature demo storyboard

**Title:** <short feature name>
**Output:** tmp/demo-videos/feature.mp4
**Boot mode:** e2e
**EE tokens needed:** <yes|no>
**Voice ref:** ~/tmp/voice-ref.wav   <!-- optional; overrides REPLICATE_TTS_REF_AUDIO -->
**Voice tuning:** exaggeration=0.5 cfg_weight=0.5 temperature=0.8 seed=0   <!-- optional; Chatterbox knobs -->

## Beats

1. **<short action> → <optional route>**
   <one sentence of narration, written as voiceover copy>

2. **<short action>**
   <narration>

…
```

Narration tone — borrow PR #7's rule of thumb. Each cue is voiceover copy, not a test step:

| Bad (test step)             | Good (narration)                                                                |
|-----------------------------|---------------------------------------------------------------------------------|
| `Click Stale pill`          | `Click the Stale pill to isolate cards that haven't been viewed in over a year.` |
| `Switch to Transforms tab`  | `Transforms get the same four tiles — Broken, Stale, Unreferenced, Healthy.`     |
| `Hover row`                 | `This transform is broken because its target table was dropped.`                 |

Keep each cue under ~15 words (≈ 4 seconds of speech) so it fits inside its segment.

After writing the file, **stop and tell the user**:

> "Storyboard drafted at `tmp/demo-storyboard.md`. Open it, tweak any beat (delete, reorder, reword narration), save, and tell me to continue."

Wait for the user's go-ahead. They can hand-edit any narration line or drop/reorder beats. Phase 3 reads the file fresh; never cache it.

---

## Phase 3 — Record

### Boot Metabase (skip if already running)

```bash
lsof -ti :3000 | xargs kill -9 2>/dev/null; sleep 3
clojure -M:run:e2e &
until curl -sf http://localhost:3000/api/health > /dev/null; do sleep 5; done
```

Use `:run:e2e` (NOT `:dev`). `e2e` serves the prebuilt static frontend from `resources/frontend_client/` and skips Malli — same as the bug-demo skill.

### Generate `tmp/demo-repro.mjs`

Translate each storyboard beat into Playwright actions. Inject the cursor + smooth-movement helpers at the top of the script. Use the cue() pattern from PR #7's `playwright-demo` skill (`cue(text)` records wall-clock offset right before the action it describes).

**Full script template** — copy this and fill in the beats:

```javascript
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, renameSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  installCursor,
  attachCursorHelpers,
  ICONS,
} from "../.claude/skills/feature-demo/references/cursor-overlay.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIDEO_DIR = join(__dirname, "demo-videos");
const BASE_URL = process.env.MB_URL || "http://localhost:3000";
const CREDENTIALS = { username: "test@test.com", password: "TestPass123!" };

mkdirSync(VIDEO_DIR, { recursive: true });

// ── API helpers ────────────────────────────────────────────────────────────

async function api(sessionId, method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(sessionId && { "X-Metabase-Session": sessionId }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && method !== "DELETE") {
    throw new Error(`API ${method} ${path} failed (${res.status}): ${await res.text()}`);
  }
  if (res.status === 204 || method === "DELETE") return null;
  return res.json();
}

async function login() {
  const res = await fetch(`${BASE_URL}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(CREDENTIALS),
  });
  return (await res.json()).id;
}

// ── Cue recorder — wall-clock offsets for the WebVTT/JSON output ──────────

const t0 = Date.now();
const cues = [];
const cue = (text) => cues.push({ ms: Date.now() - t0, text });

const msToTs = (ms) => {
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  const fff = String(ms % 1000).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${fff}`;
};

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // Reset state
  let sessionId = await login();
  await api(sessionId, "POST", "/api/testing/restore/demo-clean");
  sessionId = await login();
  const user = await api(sessionId, "GET", "/api/user/current");

  // Dismiss modals
  try { await api(sessionId, "PUT", `/api/user/${user.id}/modal/qbnewb`); } catch {}

  // Fake SMTP so alert/notification UIs render
  for (const [key, value] of Object.entries({
    "email-smtp-host": "localhost", "email-smtp-port": "1025",
    "email-smtp-security": "none", "email-from-address": "mailer@metabase.test",
    "email-from-name": "Metabase",
  })) {
    await api(sessionId, "PUT", `/api/setting/${key}`, { value });
  }

  // Browser + video
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 800 } },
  });
  await context.addCookies([
    { name: "metabase.SESSION", value: sessionId, domain: "localhost", path: "/" },
    { name: "metabase.SEEN_ALERT_SPLASH", value: "true", domain: "localhost", path: "/" },
  ]);
  await installCursor(context, { icon: ICONS.metabase });
  const page = await context.newPage();
  const { initPosition, demoClick, demoHover, pan } = attachCursorHelpers(page);

  // Bound waits so any unintentionally-slow operation fails fast instead
  // of silently inflating the recording.
  page.setDefaultTimeout(4000);
  page.setDefaultNavigationTimeout(10000);
  // `pause` takes an explicit ms — call sites should make the dwell visible.
  // For "wait for the system" use waitForResponse / waitFor (see "Waits vs. dwells").
  const pause = (ms) => page.waitForTimeout(ms);

  // ── DEMO BEATS — generate from storyboard ─────────────────────────────────

  // Example beat. Each one: cue() first, then wait-for-system, then demoClick/Hover,
  // then a short dwell so the viewer registers the result.
  cue("Open the Introspector. Four tiles surface broken, stale, unreferenced, and healthy content.");
  await page.goto(`${BASE_URL}/admin/introspector`, { waitUntil: "domcontentloaded" });
  await page.locator("tbody tr").first().waitFor({ state: "visible" });
  await initPosition();              // seed cursor at viewport center
  await pause(1200);                 // dwell — let viewer take in the StatStrip + first rows

  cue("Click the Stale pill to isolate cards that haven't been viewed in over a year.");
  const refreshed = page.waitForResponse(
    (r) => /\/api\/ee\/introspector\/content\/cards/.test(r.url()) && r.ok(),
  );
  await demoClick(
    page.locator("label").filter({ hasText: /^Stale$/ }).first(),
    { label: "Stale" },
  );
  await refreshed;
  await pause(1200);                 // dwell — let viewer see the refreshed totals

  // … add more beats here …

  // ─────────────────────────────────────────────────────────────────────────

  // Finalize video
  await context.close();
  const video = page.video();
  const videoPath = video ? await video.path() : null;
  await browser.close();

  // Rename to a stable filename
  if (videoPath) {
    const finalPath = join(VIDEO_DIR, "feature.webm");
    renameSync(videoPath, finalPath);
    console.log("Video:", finalPath);
  }

  // Write WebVTT (sidecar) and cues JSON (TTS input)
  const lines = ["WEBVTT", ""];
  for (let i = 0; i < cues.length; i++) {
    const start = msToTs(cues[i].ms);
    const end = msToTs(cues[i + 1]?.ms ?? cues[i].ms + 3000);
    lines.push(String(i + 1), `${start} --> ${end}`, cues[i].text, "");
  }
  writeFileSync(join(VIDEO_DIR, "feature.vtt"), lines.join("\n"));
  writeFileSync(join(VIDEO_DIR, "feature.cues.json"), JSON.stringify(cues, null, 2));
  console.log("VTT:", join(VIDEO_DIR, "feature.vtt"));
}

main().catch((e) => { console.error("Demo failed:", e); process.exit(1); });
```

### Waits vs. dwells — keep them separate

Two things take time in a demo script, and conflating them is the single most common source of dead frames in the recording:

| Kind | Purpose | Tool |
|---|---|---|
| **Wait** | The system must finish doing something before the script proceeds — a filter request must return, a modal must mount, a menu animation must complete. | `page.waitForResponse(/specific-endpoint/)` (preferred when the action fires an identifiable API call), `locator.waitFor({ state: "visible" })` (preferred when there's an identifiable DOM landmark), `page.waitForLoadState("networkidle")` (fallback only — stalls on apps with telemetry/heartbeat traffic) |
| **Dwell** | The viewer must see the result for long enough to register it — a tooltip, a stack trace, a state change. | `pause(N)` with an N that matches "how long should this stay on screen" |

If a step needs both, do them in order: wait for the system, *then* dwell for the viewer. **Don't stack `networkidle + pause(2000)`** — that's two waits doubling the dead time without buying anything.

Two consequences for how to use `pause`:
- Make it take an explicit argument — `pause(800)`, not `pause()` — so the dwell duration is always visible at the call site. The script template above uses `const pause = (ms) => page.waitForTimeout(ms);` (no default).
- A `pause` should only appear when there's something specific you want the viewer to register. If you wrote one because "things might not be ready yet," that's a wait — use one of the wait helpers instead.

**Prefer `waitForResponse` whenever the action fires a single identifiable API call** (filter change, tab switch, search, save). It returns the instant the response lands, with no telemetry-induced variance.

```js
// Before — networkidle waits for traffic to fully quiet, then a hardcoded
// dwell adds more on top. Double-counts the wait.
await page.getByRole("tab", { name: "Dashboards" }).click();
await page.waitForLoadState("networkidle");
await pause(2000);

// After — precise system-wait keyed to the action's actual API call,
// followed by a short, intentional viewer-dwell.
const dataLoaded = page.waitForResponse(
  (r) => /\/api\/.../.test(r.url()) && r.ok(),
);
await page.getByRole("tab", { name: "Dashboards" }).click();
await dataLoaded;
await pause(800);  // dwell — let viewer see the new tab's content
```

When you can't identify a specific endpoint, `locator.waitFor({ state: "visible" })` on a known landmark (a new row, a heading, a button) is the next-best signal. `networkidle` should be a last resort.

The `setDefaultTimeout(4000)` / `setDefaultNavigationTimeout(10000)` lines in the template matter for the same reason: without them, any unintentionally-slow wait inherits Playwright's 30s default and silently inflates the recording.

### About the cursor overlay

The `installCursor` / `attachCursorHelpers` imports come from `references/cursor-overlay.mjs` (a 325-line module shared with PR #7's `playwright-demo` skill — kept in sync by copy). It injects a synthetic cursor (plus click ripples, action-label captions, and an arc preview for long moves) into the page, then exposes `demoClick`, `demoHover`, and `pan` driver helpers that wrap Playwright's actions with a glide-to-target → dwell → label → act sequence.

**Helper API:**

- `demoClick(locator, { label, dwell })` — glides the cursor to the locator's center, shows a caption pill, dwells, then clicks. The press triggers a ripple animation.
- `demoHover(locator, { label, dwell })` — same but ends on hover (default dwell 1200ms so tooltips render).
- `pan(x, y)` — bare-mouse exploratory sweep without label or click. Good for showing off a header row or stat strip.
- `initPosition()` — call once after the first `page.goto` so the cursor + Playwright's mouse start at viewport center; otherwise the first move arcs from (0, 0).

**Icon options:**

| Setter | Look | When to use |
|---|---|---|
| `ICONS.metabase` (default) | 22-dot Metabase brand mark, blue | On-brand demos for internal/Metabase audiences |
| `ICONS.arrow` | Classic angled arrow, blue fill | External-audience demos or when the brand mark would distract |
| Custom `{ svg, anchorX, anchorY, useCurrentColor? }` | Your own SVG | `anchorX/Y` is the pixel offset to the visual click point |

```javascript
await installCursor(context, { icon: ICONS.arrow });
await installCursor(context, { icon: ICONS.metabase, color: "rgba(218, 32, 60, 0.95)" });
```

**Tuning knobs** (pass to `attachCursorHelpers`):

```javascript
const helpers = attachCursorHelpers(page, {
  startX: 720, startY: 450,    // initial cursor position
  arcThreshold: 250,           // px; long-move arc fires above this distance
  defaultDwell: 600,           // ms pause before click (after glide)
  defaultHoverDwell: 1200,     // ms to stay on a hovered element
  stepCount: 20,               // Playwright mouse-move steps per glide
});
```

Faster-paced demo → drop `defaultDwell` to ~400. More deliberate teaching style → bump to ~900.

### Run it

```bash
node tmp/demo-repro.mjs
```

### On failure

Don't auto-retry with different selectors — that hides real storyboard bugs. Capture the last cue, the failing line, and a screenshot. Ask the user:

1. Hand-edit `tmp/demo-repro.mjs` and rerun, or
2. Drop the failing beat from `tmp/demo-storyboard.md` and rerun, or
3. Abort.

Only one case retries automatically: backend died mid-run. Restart it and rerun the whole script.

---

## Phase 4 — Voiceover

Read `tmp/demo-videos/feature.cues.json`. For each cue, call Replicate to synthesize a `.wav`. Then overlay the clips onto a silent base track sized to the video.

### TTS via Replicate

**Default model:** `resemble-ai/chatterbox` — SOTA open-source voice cloning. Wins blind tests vs ElevenLabs 63% of the time for naturalness. Zero-shot cloning from ~5 seconds of reference audio. Emotion control. ~$0.0006/cue.

**Reference audio (the voice clone source):**
- Record a clean sample of yourself reading anything natural (a book paragraph works well).
- **Format:** WAV or MP3, mono, **22 kHz** sample rate or higher, **8–20 seconds** of speech.
- **Avoid:** background noise, music, multiple speakers, gaps of silence, breathy/whispered delivery — Chatterbox imitates whatever's in the sample.
- Save to `~/tmp/voice-ref.wav` (default) or set `REPLICATE_TTS_REF_AUDIO=/path/to/sample.wav`.

```bash
# Record with sox (recommended; fast + correct format out of the box):
brew install sox
sox -d -r 22050 -c 1 ~/tmp/voice-ref.wav trim 0 12

# Or QuickTime → New Audio Recording → save as .m4a → convert with ffmpeg:
ffmpeg -i ~/Desktop/sample.m4a -ar 22050 -ac 1 ~/tmp/voice-ref.wav
```

**Chatterbox tuning knobs** — defaults work for narration; tweak per recording via env vars or the storyboard:

| Knob | Range | Default | Effect |
|---|---|---|---|
| `REPLICATE_TTS_EXAGGERATION` | 0.25–2.0 | 0.5 | Higher = more dramatic delivery. >1.0 starts sounding theatrical. <0.4 is flat/monotone. |
| `REPLICATE_TTS_CFG_WEIGHT` | 0.2–1.0 | 0.5 | Higher = closer to the reference voice (less generic). Trade-off with naturalness. |
| `REPLICATE_TTS_TEMPERATURE` | 0.05–5.0 | 0.8 | Higher = more variation between cues. Lower = more consistent tone. |
| `REPLICATE_TTS_SEED` | int | 0 (random) | Set a fixed integer for reproducible output across runs. |

**Alternative models** (override with `REPLICATE_TTS_MODEL=owner/name`):
- `minimax/speech-2.8-hd` — proprietary, similar 5s cloning, 32+ languages
- `elevenlabs/v3` — best multilingual (70+ languages), proprietary, pricier
- `lucataco/xtts-v2` — older but proven, multilingual
- `jaaari/kokoro-82m` — preset voices only (no cloning), fastest/cheapest

### Quick voice preview

Before running the full demo, synthesize one short sample to confirm the clone sounds right. Cheap (~$0.001), takes ~5s.

Write `tmp/voice-preview.mjs`:

```javascript
import { writeFileSync, readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join, basename } from "path";

const TOKEN = process.env.REPLICATE_API_TOKEN;
if (!TOKEN) { console.error("REPLICATE_API_TOKEN not set"); process.exit(1); }

const REF_PATH = process.env.REPLICATE_TTS_REF_AUDIO || join(homedir(), "tmp/voice-ref.wav");
if (!existsSync(REF_PATH)) { console.error(`Reference not found: ${REF_PATH}`); process.exit(1); }

// 1. Upload reference WAV → Replicate file URL
const fd = new FormData();
fd.append("content", new Blob([readFileSync(REF_PATH)], { type: "audio/wav" }), basename(REF_PATH));
const up = await fetch("https://api.replicate.com/v1/files", {
  method: "POST", headers: { "Authorization": `Token ${TOKEN}` }, body: fd,
});
const upJson = await up.json();
const audioUrl = upJson.urls?.get;
if (!audioUrl) { console.error("Upload failed:", upJson); process.exit(1); }
console.log("Reference uploaded:", audioUrl);

// 2. Synthesize a sample line with the clone
const text = process.argv[2] || "Hi, this is a quick preview of my cloned voice for the demo.";
const res = await fetch("https://api.replicate.com/v1/models/resemble-ai/chatterbox/predictions", {
  method: "POST",
  headers: { "Authorization": `Token ${TOKEN}`, "Content-Type": "application/json", "Prefer": "wait" },
  body: JSON.stringify({ input: {
    prompt: text, audio_prompt: audioUrl,
    exaggeration: +(process.env.REPLICATE_TTS_EXAGGERATION ?? 0.5),
    cfg_weight:   +(process.env.REPLICATE_TTS_CFG_WEIGHT   ?? 0.5),
    temperature:  +(process.env.REPLICATE_TTS_TEMPERATURE  ?? 0.8),
  }}),
});
const pred = await res.json();
const outUrl = Array.isArray(pred.output) ? pred.output[0] : pred.output;
const buf = Buffer.from(await (await fetch(outUrl)).arrayBuffer());
writeFileSync("tmp/voice-preview.wav", buf);
console.log("Preview: tmp/voice-preview.wav");
```

```bash
node tmp/voice-preview.mjs                                # default sample line
node tmp/voice-preview.mjs "Today I'm walking through…"   # custom line
open tmp/voice-preview.wav                                # listen
```

If the preview sounds off:
- **Robotic / generic** → bump `REPLICATE_TTS_CFG_WEIGHT=0.7` (more reference-like)
- **Flat / monotone** → bump `REPLICATE_TTS_EXAGGERATION=0.7`
- **Inconsistent between runs** → drop `REPLICATE_TTS_TEMPERATURE=0.5` and set `REPLICATE_TTS_SEED=42`
- **Still wrong** → re-record the reference (longer sample, cleaner audio, more natural delivery)

### Full TTS run

Write `tmp/tts.mjs`:

```javascript
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";

const TOKEN = process.env.REPLICATE_API_TOKEN;
if (!TOKEN) { console.error("REPLICATE_API_TOKEN not set"); process.exit(1); }

const MODEL = process.env.REPLICATE_TTS_MODEL || "resemble-ai/chatterbox";
const REF_PATH = process.env.REPLICATE_TTS_REF_AUDIO || join(homedir(), "tmp/voice-ref.wav");

// Chatterbox knobs (env-overridable, storyboard-overridable upstream)
const KNOBS = {
  exaggeration: +(process.env.REPLICATE_TTS_EXAGGERATION ?? 0.5),
  cfg_weight:   +(process.env.REPLICATE_TTS_CFG_WEIGHT   ?? 0.5),
  temperature:  +(process.env.REPLICATE_TTS_TEMPERATURE  ?? 0.8),
  seed:         +(process.env.REPLICATE_TTS_SEED         ?? 0),
};

// Upload the reference WAV once → URL reused for all cues.
// More reliable than data-URI; faster (one small upload instead of N).
async function uploadReference(path) {
  if (!existsSync(path)) {
    console.error(`Reference audio not found at ${path}.`);
    console.error("Record a sample with `sox -d -r 22050 -c 1 ~/tmp/voice-ref.wav trim 0 12`.");
    process.exit(1);
  }
  const fd = new FormData();
  fd.append("content", new Blob([readFileSync(path)], { type: "audio/wav" }), basename(path));
  const res = await fetch("https://api.replicate.com/v1/files", {
    method: "POST", headers: { "Authorization": `Token ${TOKEN}` }, body: fd,
  });
  const j = await res.json();
  if (!j.urls?.get) throw new Error(`Reference upload failed: ${JSON.stringify(j)}`);
  return j.urls.get;
}

let audioUrl = null;
if (MODEL === "resemble-ai/chatterbox" || MODEL.includes("xtts") || MODEL.includes("minimax")) {
  audioUrl = await uploadReference(REF_PATH);
  console.log("Reference uploaded:", audioUrl);
}

// Per-model input shape. Add new model keys here.
function buildInput(text) {
  if (MODEL === "resemble-ai/chatterbox") {
    return { prompt: text, audio_prompt: audioUrl, ...KNOBS };
  }
  if (MODEL.includes("xtts"))   return { text, speaker: audioUrl, language: "en" };
  if (MODEL.includes("minimax")) return { text, voice_clone_audio: audioUrl };
  // Preset-voice models (kokoro, etc.)
  return { text, voice: process.env.REPLICATE_TTS_VOICE || "af_bella" };
}

const cues = JSON.parse(readFileSync("tmp/demo-videos/feature.cues.json", "utf8"));
const AUDIO_DIR = "tmp/audio";
mkdirSync(AUDIO_DIR, { recursive: true });

async function ttsOne(text, idx, attempt = 1) {
  try {
    const start = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
      method: "POST",
      headers: { "Authorization": `Token ${TOKEN}`, "Content-Type": "application/json", "Prefer": "wait" },
      body: JSON.stringify({ input: buildInput(text) }),
    });
    const pred = await start.json();
    if (pred.error) throw new Error(`TTS ${idx}: ${pred.error}`);

    let final = pred;
    while (final.status !== "succeeded" && final.status !== "failed") {
      await new Promise((r) => setTimeout(r, 1000));
      final = await (await fetch(final.urls.get, { headers: { "Authorization": `Token ${TOKEN}` } })).json();
    }
    if (final.status === "failed") throw new Error(`TTS ${idx} failed: ${final.error}`);

    const outUrl = Array.isArray(final.output) ? final.output[0] : final.output;
    const buf = Buffer.from(await (await fetch(outUrl)).arrayBuffer());
    const path = join(AUDIO_DIR, `clip-${idx + 1}.wav`);
    writeFileSync(path, buf);
    return path;
  } catch (e) {
    if (attempt < 3) {
      const wait = attempt === 1 ? 1000 : 3000;
      console.warn(`cue ${idx + 1} retry ${attempt}: ${e.message}`);
      await new Promise((r) => setTimeout(r, wait));
      return ttsOne(text, idx, attempt + 1);
    }
    throw e;
  }
}

// Run in parallel — typical demo is 5-8 cues, all done in ~15s
const paths = await Promise.all(cues.map((c, i) => ttsOne(c.text, i)));
console.log("Clips:", paths);
```

```bash
node tmp/tts.mjs
```

**Retry behavior is built in** — three attempts with 1s, 3s backoff. After three failures the script throws; if you want a graceful `say` fallback for individual cues, wrap the final `await Promise.all` to catch and substitute.

### Stitch with pydub

Write `tmp/stitch.py`:

```python
#!/usr/bin/env python3
import json, subprocess, sys
from pathlib import Path
from pydub import AudioSegment

CUES = json.loads(Path("tmp/demo-videos/feature.cues.json").read_text())
VIDEO = "tmp/demo-videos/feature.webm"
OUT = Path("tmp/audio/voiceover.wav")

# Video duration in ms (ffprobe)
out = subprocess.run(
    ["ffprobe", "-v", "error", "-show_entries", "format=duration",
     "-of", "default=noprint_wrappers=1:nokey=1", VIDEO],
    capture_output=True, text=True, check=True,
)
video_ms = int(float(out.stdout.strip()) * 1000)

track = AudioSegment.silent(duration=video_ms)

for i, c in enumerate(CUES, start=1):
    clip = AudioSegment.from_file(f"tmp/audio/clip-{i}.wav")
    gap = (CUES[i]["ms"] if i < len(CUES) else video_ms) - c["ms"]
    overrun = len(clip) - gap
    if overrun > 0:
        speed = len(clip) / gap
        if speed <= 1.15:
            clip = clip.speedup(playback_speed=speed, chunk_size=50, crossfade=25)
            print(f"cue {i}: sped up {speed:.2f}× to fit", file=sys.stderr)
        else:
            clip = clip[:gap]
            print(f"⚠️  cue {i}: clip {overrun}ms longer than gap; clipped. Shorten the cue text.",
                  file=sys.stderr)
    track = track.overlay(clip, position=c["ms"])

OUT.parent.mkdir(exist_ok=True)
track.export(OUT, format="wav")
print(f"Voiceover: {OUT}")
```

```bash
python3 tmp/stitch.py
```

---

## Phase 5 — Mux

```bash
ffmpeg -y -i tmp/demo-videos/feature.webm \
       -i tmp/audio/voiceover.wav \
       -c:v copy -c:a aac -shortest \
       tmp/demo-videos/feature.mp4
echo "Done: tmp/demo-videos/feature.mp4"
```

`-c:v copy` re-containerizes without re-encoding (≈1s). Audio gets transcoded to AAC for `.mp4` compatibility.

Open and play:

```bash
open tmp/demo-videos/feature.mp4
```

---

## Common Playwright patterns for Metabase

Re-use these inside `demoClick` / `demoHover` calls. Synced with PR #7's `playwright-demo` skill.

### Mantine Chip / filter pills
Mantine's `<Chip>` renders as a `<label>` wrapping a visually-hidden `<input type="checkbox|radio">`. `getByRole("checkbox", { name })` resolves the input — but the input has `display:none`, so Playwright refuses to click it. The label is the actual click surface:

```javascript
const chip = (name) =>
  page
    .locator("label")
    .filter({ hasText: new RegExp(`^${name}$`) })
    .first();

await demoClick(chip("Broken"), { label: "Broken" });
```

The exact-match regex matters because chips like `Broken` and `All flagged` may share substrings. Works for both Mantine variants — single-select `Chip.Group` (radio) and multi-select `Chip` (checkbox).

### Overflow menu (questions and dashboards)
The "..." label is a unicode ellipsis. Use a regex and wait for the Mantine menu to mount:
```javascript
await demoClick(page.getByLabel(/Move, trash, and more/), { label: "More actions" });
await page.getByRole("menu").waitFor({ state: "visible" });
```

### Buttons with variable text
```javascript
const save = page
  .getByRole("button", { name: /save/i })
  .or(page.getByRole("button", { name: /done/i }))
  .or(page.getByRole("button", { name: /create/i }))
  .first();
await save.waitFor({ state: "visible" });
await pause(600);  // dwell — viewer registers the populated modal
await demoClick(save, { label: "Save" });
```

### Admin pages with row-level menus
```javascript
await page.goto(`${BASE_URL}/trash`, { waitUntil: "domcontentloaded" });
const row = page.locator("tr", { hasText: "Item Name" });
await row.waitFor({ state: "visible" });   // wait for the specific row, not network-idle
const rowMenu = row.locator('[data-testid="entity-item-actions-trigger"]')
  .or(row.getByRole("button").first());
await demoClick(rowMenu, { label: "Row actions" });
```

### Wait for an action's API response
Best signal for filter changes, tab switches, saves — anything with a single identifiable endpoint:
```javascript
const refreshed = page.waitForResponse(
  (r) => /\/api\/ee\/introspector\/content\/cards/.test(r.url()) && r.ok(),
);
await demoClick(picker, { label: "1 year" });
await refreshed;
await pause(1200);  // dwell — viewer sees the new totals
```

---

## Useful API endpoints (for seeding before the demo)

| Action | Method | Endpoint |
|---|---|---|
| Login | POST | `/api/session` |
| Restore clean snapshot | POST | `/api/testing/restore/demo-clean` |
| Snapshot DB | POST | `/api/testing/snapshot/:name` |
| Current user | GET | `/api/user/current` |
| Dismiss onboarding | PUT | `/api/user/:id/modal/qbnewb` |
| Update setting | PUT | `/api/setting/:key` `{"value": "..."}` |
| Create card | POST | `/api/card` |
| Create dashboard | POST | `/api/dashboard` |
| Create alert/notification | POST | `/api/notification` |
| Activate premium token | PUT | `/api/setting/premium-embedding-token` |

---

## Failure handling — explicit

| Phase | Failure | Behavior |
|---|---|---|
| 1 Discover | No PR, no diff | Ask the user for a one-line description; storyboard from that |
| 2 Storyboard | User edits the file | Re-read fresh every Phase-3 entry |
| 3 Record | Playwright selector miss | Stop, capture screenshot + last cue, ask user (no silent retries) |
| 3 Record | Backend died | Auto-restart backend + restore snapshot + rerun |
| 4 TTS | Replicate 429 / 5xx | 3 retries with exp backoff, then `say` fallback + warning |
| 4 Stitch | Clip > gap | Speed up to 1.15×; past that, clip + warn |
| 5 Mux | `ffmpeg` missing | Block, point at prereqs |

---

## What this skill does NOT do

- **No before/after pair.** Use `playwright-demo` (PR #7) for bug-fix demos.
- **No on-screen captions / subtitle burn-in.** Voiceover audio only.
- **No re-recording loop.** One pass per invocation. User edits storyboard or `demo-repro.mjs` to iterate.
- **No OS-level cursor.** Cursor overlay only inside the page viewport.
- **No CI integration.** Local dev only.
