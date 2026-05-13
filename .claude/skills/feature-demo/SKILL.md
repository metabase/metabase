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
**Voice:** af_bella   <!-- optional; pydub-compatible kokoro voice id -->

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
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIDEO_DIR = join(__dirname, "demo-videos");
const BASE_URL = process.env.MB_URL || "http://localhost:3000";
const CREDENTIALS = { username: "test@test.com", password: "TestPass123!" };

mkdirSync(VIDEO_DIR, { recursive: true });

// ── Helpers ────────────────────────────────────────────────────────────────

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

// Visible cursor overlay — injected into every page. Tracks page.mouse events
// and Playwright-dispatched clicks, so the cursor shows up in the .webm.
async function installCursor(page) {
  await page.addInitScript(() => {
    const dot = document.createElement("div");
    Object.assign(dot.style, {
      position: "fixed", top: "0", left: "0", width: "20px", height: "20px",
      borderRadius: "50%", background: "rgba(0,150,255,0.55)",
      border: "2px solid rgba(255,255,255,0.9)", boxShadow: "0 0 6px rgba(0,0,0,0.4)",
      pointerEvents: "none", zIndex: "2147483647", transform: "translate(-50%,-50%)",
      transition: "transform 60ms linear",
    });
    const ready = () => {
      if (!document.body) return setTimeout(ready, 10);
      document.body.appendChild(dot);
      window.addEventListener("mousemove", (e) => {
        dot.style.left = e.clientX + "px";
        dot.style.top = e.clientY + "px";
      }, true);
    };
    ready();
  });
}

// Smooth mouse-move + click. Interpolates from current pointer to target's
// center so the cursor visibly travels (instead of teleporting).
async function humanClick(page, locator, { steps = 25, settle = 250 } = {}) {
  await locator.waitFor({ state: "visible", timeout: 10000 });
  const box = await locator.boundingBox();
  if (!box) { await locator.click(); return; }
  const tx = box.x + box.width / 2;
  const ty = box.y + box.height / 2;
  await page.mouse.move(tx, ty, { steps });
  await page.waitForTimeout(settle);
  await locator.click();
}

// Cue recorder — wall-clock offsets, written out as WebVTT after the run.
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

  // Browser + video, slowMo for human pacing
  const browser = await chromium.launch({ headless: true, slowMo: 250 });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 800 } },
  });
  await context.addCookies([
    { name: "metabase.SESSION", value: sessionId, domain: "localhost", path: "/" },
    { name: "metabase.SEEN_ALERT_SPLASH", value: "true", domain: "localhost", path: "/" },
  ]);
  const page = await context.newPage();
  await installCursor(page);
  const pause = (ms = 2000) => page.waitForTimeout(ms);

  // ── DEMO BEATS — generate from storyboard ─────────────────────────────────

  // Example beat. Each one: cue() first, then the action, then a settle pause.
  cue("Open the Introspector. Four tiles surface broken, stale, unreferenced, and healthy content.");
  await page.goto(`${BASE_URL}/admin/introspector`);
  await page.waitForLoadState("networkidle");
  await pause(2500);

  cue("Click the Stale pill to isolate cards that haven't been viewed in over a year.");
  await humanClick(page, page.getByText("Stale").first());
  await pause(2000);

  // … add more beats here …

  // ─────────────────────────────────────────────────────────────────────────

  // Finalize video
  await context.close();
  const video = page.video();
  const videoPath = video ? await video.path() : null;
  await browser.close();

  // Rename to a stable filename
  if (videoPath) {
    const final = join(VIDEO_DIR, "feature.webm");
    await import("fs").then(({ renameSync }) => renameSync(videoPath, final));
    console.log("Video:", final);
  }

  // Write WebVTT (TTS input)
  const lines = ["WEBVTT", ""];
  for (let i = 0; i < cues.length; i++) {
    const start = msToTs(cues[i].ms);
    const end = msToTs(cues[i + 1]?.ms ?? cues[i].ms + 3000);
    lines.push(String(i + 1), `${start} --> ${end}`, cues[i].text, "");
  }
  writeFileSync(join(VIDEO_DIR, "feature.vtt"), lines.join("\n"));
  // Also emit a cues JSON for the stitcher (easier to parse than VTT)
  writeFileSync(join(VIDEO_DIR, "feature.cues.json"), JSON.stringify(cues, null, 2));
  console.log("VTT:", join(VIDEO_DIR, "feature.vtt"));
}

main().catch((e) => { console.error("Demo failed:", e); process.exit(1); });
```

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

**Reference audio:** the cloned voice. Record a 5–10 second WAV of yourself reading anything (a sentence from a book is fine) and save to `~/tmp/voice-ref.wav`. The skill picks it up automatically. Override path with `REPLICATE_TTS_REF_AUDIO=/path/to/sample.wav`.

```bash
# One-time: record a reference sample with macOS's QuickTime, Voice Memos, or sox
# Aim for ~5-10s of clean speech, 22kHz+, mono
ls ~/tmp/voice-ref.wav || echo "Record a 5-10s WAV at ~/tmp/voice-ref.wav"
```

**Alternative models** (override with `REPLICATE_TTS_MODEL=owner/name`):
- `minimax/speech-2.8-hd` — proprietary, also great quality, similar 5s cloning, 32+ languages
- `elevenlabs/v3` — best multilingual (70+ languages), proprietary, pricier
- `lucataco/xtts-v2` — older but proven, multilingual
- `jaaari/kokoro-82m` — preset voices only (no cloning), but fastest/cheapest if you don't need a personal voice

Write `tmp/tts.mjs`:

```javascript
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const TOKEN = process.env.REPLICATE_API_TOKEN;
if (!TOKEN) { console.error("REPLICATE_API_TOKEN not set"); process.exit(1); }

const MODEL = process.env.REPLICATE_TTS_MODEL || "resemble-ai/chatterbox";
const REF_PATH = process.env.REPLICATE_TTS_REF_AUDIO || join(homedir(), "tmp/voice-ref.wav");

// Voice cloning models need a reference audio file. Encode as data URI.
let refAudio = null;
if (MODEL === "resemble-ai/chatterbox" || MODEL.includes("xtts") || MODEL.includes("minimax")) {
  if (!existsSync(REF_PATH)) {
    console.error(`Reference audio not found at ${REF_PATH}.`);
    console.error("Record a 5-10s WAV of your voice and save it there, or set REPLICATE_TTS_REF_AUDIO.");
    process.exit(1);
  }
  const buf = readFileSync(REF_PATH);
  refAudio = `data:audio/wav;base64,${buf.toString("base64")}`;
}

// Per-model input shape. Add new model keys here.
function buildInput(text) {
  if (MODEL === "resemble-ai/chatterbox") {
    return { prompt: text, audio_prompt: refAudio, exaggeration: 0.5, cfg_weight: 0.5 };
  }
  if (MODEL.includes("xtts")) {
    return { text, speaker: refAudio, language: "en" };
  }
  if (MODEL.includes("minimax")) {
    return { text, voice_clone_audio: refAudio };
  }
  // Preset-voice models (kokoro, etc.)
  const VOICE = process.env.REPLICATE_TTS_VOICE || "af_bella";
  return { text, voice: VOICE };
}

const cues = JSON.parse(readFileSync("tmp/demo-videos/feature.cues.json", "utf8"));
const AUDIO_DIR = "tmp/audio";
mkdirSync(AUDIO_DIR, { recursive: true });

async function ttsOne(text, idx) {
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

  const audioUrl = Array.isArray(final.output) ? final.output[0] : final.output;
  const audioRes = await fetch(audioUrl);
  const buf = Buffer.from(await audioRes.arrayBuffer());
  const path = join(AUDIO_DIR, `clip-${idx + 1}.wav`);
  writeFileSync(path, buf);
  return path;
}

// Run in parallel — typical demo is 5-8 cues, all done in ~15s
const paths = await Promise.all(cues.map((c, i) => ttsOne(c.text, i)));
console.log("Clips:", paths);
```

```bash
node tmp/tts.mjs
```

**Retry on 429/5xx:** wrap `ttsOne` with three-attempt exponential backoff (1s, 3s, 9s). If all three fail for a cue, fall back to `say -o tmp/audio/clip-N.aiff …` (macOS) + convert with `ffmpeg`, and log a warning so the user knows that clip is mixed-quality.

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

(Same as PR #7's `playwright-demo` skill — re-use these locators inside `humanClick` calls.)

### Overflow menu
The "..." label is a unicode ellipsis. Use a regex:
```javascript
await humanClick(page, page.getByLabel(/Move, trash, and more/));
```

### Buttons with variable text
```javascript
const save = page
  .getByRole("button", { name: /save/i })
  .or(page.getByRole("button", { name: /done/i }))
  .or(page.getByRole("button", { name: /create/i }))
  .first();
await humanClick(page, save);
```

### Wait for navigation / async load
```javascript
await page.waitForLoadState("networkidle");
await pause(2000);  // small extra for animations
```

### Admin pages with row-level menus
```javascript
const row = page.locator("tr", { hasText: "Item Name" });
const menu = row.locator('[data-testid="entity-item-actions-trigger"]')
  .or(row.getByRole("button").first());
await humanClick(page, menu);
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
