// tmp/demos/cigar-quarterly/repro.mjs
//
// 9-beat Brando-narrated walkthrough of Metabase Slides: cold open →
// create deck → generate from FY26 Q4 dashboard → walk slides → drill NJ →
// closing endorsement.
//
// Run order: setup-metabase.sh → tts.mjs → this → stitch.py → mux.sh.

import { chromium } from "playwright";
import { writeFileSync, readFileSync, renameSync } from "fs";
import {
  installCursor,
  attachCursorHelpers,
} from "../../../.claude/skills/metabase-feature-demo/references/cursor-overlay.mjs";
import { CIGAR_CURSOR_PNG_B64 } from "./cursor-asset.mjs";

// Sopranos Tony cigar cursor — 128x128 PNG embedded as data URI, rendered
// at 48x48 in the overlay. Anchor is roughly the cigar tip (upper-left in
// the source image); tune anchorX/Y if click registration feels off.
const CIGAR_CURSOR = {
  width: 48,
  height: 48,
  anchorX: 10,
  anchorY: 10,
  useCurrentColor: false,
  svg:
    '<svg width="48" height="48" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">' +
      `<image href="data:image/png;base64,${CIGAR_CURSOR_PNG_B64}" width="128" height="128"/>` +
    '</svg>',
};
import { workspace } from "../../../.claude/skills/metabase-feature-demo/references/workspace.mjs";

const ws = workspace().ensure();
const BASE_URL = process.env.MB_URL || "http://localhost:3040";
const CREDENTIALS = {
  username: process.env.MB_USERNAME || "ngoc@slides.local",
  password: process.env.MB_PASSWORD || "slides12345!ABC",
};

const MODAL_PROMPT =
  "Quarterly sit-down for the family. Walk us through where the money came from — revenue trend, top earners, which territories delivered. Then tell us where we're going next year. Plain talk. Keep it tight.";
const DASHBOARD_NAME = "FY26 Q4 Board Review";

const CUES = JSON.parse(readFileSync(ws.cues, "utf8"));
if (CUES.some((c) => c.durationMs == null)) {
  console.error(`cues.json missing durationMs — run tts.mjs first`);
  process.exit(1);
}
const TAIL_MS = 500;

async function login() {
  const res = await fetch(`${BASE_URL}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(CREDENTIALS),
  });
  if (!res.ok) throw new Error(`login failed (${res.status}): ${await res.text()}`);
  return (await res.json()).id;
}

const t0 = Date.now();
const cuesOut = [];
const cue = (text) => cuesOut.push({ ms: Date.now() - t0, text });
const msToTs = (ms) => {
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}.${String(ms % 1000).padStart(3, "0")}`;
};

async function main() {
  const sessionId = await login();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: ws.root, size: { width: 1280, height: 800 } },
  });
  await context.addCookies([
    { name: "metabase.SESSION", value: sessionId, domain: "localhost", path: "/" },
    { name: "metabase.SEEN_ALERT_SPLASH", value: "true", domain: "localhost", path: "/" },
  ]);
  await installCursor(context, { icon: CIGAR_CURSOR });
  const page = await context.newPage();
  const { initPosition, demoClick } = attachCursorHelpers(page);

  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(30000);
  const pause = (ms) => page.waitForTimeout(ms);

  let cueIdx = 0;
  // beat(actionFn, preActionFn?) — preActionFn runs BEFORE the cue timestamp
  // is marked, so visual changes (slide transitions, navigation) settle
  // before the voice cue starts. The voice then narrates *over* a settled
  // screen rather than the transition animation.
  async function beat(actionFn, preActionFn = null) {
    const c = CUES[cueIdx++];
    if (!c) throw new Error(`Ran past cues.json (have ${CUES.length}, asked for ${cueIdx})`);
    if (preActionFn) await preActionFn();
    const start = Date.now();
    cue(c.text);
    await actionFn();
    const elapsed = Date.now() - start;
    const remaining = c.durationMs + TAIL_MS - elapsed;
    if (remaining > 0) await pause(remaining);
  }

  // ─── BEAT 1 — Cold open over /slides browse ─────────────────────────────
  await beat(async () => {
    await page.goto(`${BASE_URL}/slides`, { waitUntil: "domcontentloaded" });
    await page.locator("h1").filter({ hasText: /^Slides$/i }).waitFor({ state: "visible" });
    await initPosition();
  });

  // ─── BEAT 2 — Create new deck, click Generate in header ────────────────
  await beat(async () => {
    await demoClick(page.locator("a", { hasText: /^New deck$/i }).first(), { label: "New deck" });
    // Editor opens at /slides/:id — wait for the header Generate button
    await page.waitForURL(/\/slides\/\d+(\b|\?|#)/, { timeout: 30_000 });
    const genBtn = page.locator("button", { hasText: /^Generate$/i }).first();
    await genBtn.waitFor({ state: "visible" });
    await demoClick(genBtn, { label: "Generate" });
    // Modal opens
    await page.getByRole("dialog").waitFor({ state: "visible" });
  });

  // ─── BEAT 3 — Type prompt, pick dashboard, click Generate ──────────────
  await beat(async () => {
    const dialog = page.getByRole("dialog");
    const promptArea = dialog.locator("textarea").first();
    await promptArea.waitFor({ state: "visible" });
    await promptArea.click();
    await promptArea.pressSequentially(MODAL_PROMPT, { delay: 18 });

    const search = dialog.locator('input[placeholder*="Search" i]').first();
    await search.click();
    await search.pressSequentially("FY26 Q4", { delay: 30 });
    // Wait for search results
    const dashItem = page.getByRole("button", { name: new RegExp(DASHBOARD_NAME, "i") })
      .or(page.locator("button", { hasText: DASHBOARD_NAME }))
      .first();
    await dashItem.waitFor({ state: "visible", timeout: 8_000 });
    await demoClick(dashItem, { label: "Pick dashboard" });

    // The modal's Generate button (filled, with sparkles icon)
    const genBtnInModal = page.getByRole("dialog").locator("button", { hasText: /^Generate$/i }).first();
    await demoClick(genBtnInModal, { label: "Generate deck" });
  });

  // ─── BEAT 4 — Wait for AI generation, narration covers ─────────────────
  await beat(async () => {
    // Narration plays while the streaming agent log runs.
    // We also need the dwell to last long enough for the deck to materialize —
    // the modal auto-closes ~600ms after "done". Wait for the dialog to detach.
    await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 180_000 });
  });

  // ─── BEAT 5 — Click Present → first content slide (revenue) ────────────
  // Pre-action: click Present and advance to slide 2. Voice cue starts only
  // once the revenue slide is on screen.
  await beat(async () => {
    // dwell only
  }, async () => {
    const presentBtn = page.locator("button, a").filter({ hasText: /^Present$/i }).first();
    await presentBtn.waitFor({ state: "visible", timeout: 15_000 });
    await demoClick(presentBtn, { label: "Present" });
    await page.waitForURL(/\/slides\/.+\/present/, { timeout: 15_000 });
    await page.keyboard.press("ArrowRight");
    await pause(800);
  });

  // ─── BEAT 6 — Advance to top SKUs slide ────────────────────────────────
  await beat(async () => {
    // dwell only
  }, async () => {
    await page.keyboard.press("ArrowRight");
    await pause(800);
  });

  // ─── BEAT 7 — Advance to regional slide → DRILL into NJ ────────────────
  // Pre-action lands us on the regional slide; the drill click happens during
  // the cue so the action is visible while the narration plays.
  await beat(async () => {
    // Best-effort drill into NJ. Non-blocking: if the chart doesn't expose a
    // visible NJ label or the drill menu doesn't appear, we still show the
    // slide and let the narration carry the beat.
    try {
      const njLabel = page.getByText(/^NJ$/).first();
      await njLabel.waitFor({ state: "visible", timeout: 4_000 });
      const box = await njLabel.boundingBox();
      if (box) {
        const x = box.x + box.width / 2;
        const y = box.y - 120;
        await page.mouse.move(x, y);
        await pause(300);
        await page.mouse.click(x, y);
        const drill = page.getByRole("menuitem", { name: /^=$|filter|see this|breakout/i }).first()
          .or(page.locator("[data-testid=drill-through-button]").first());
        if (await drill.isVisible().catch(() => false)) {
          await drill.click();
        }
      }
    } catch (e) {
      console.log("Beat 7 drill skipped:", e.message);
    }
  }, async () => {
    await page.keyboard.press("ArrowRight");
    await pause(1200);
  });

  // ─── BEAT 8 — Advance to Sicily projection ─────────────────────────────
  await beat(async () => {
    // dwell only
  }, async () => {
    await page.keyboard.press("ArrowRight");
    await pause(800);
  });

  // ─── BEAT 9 — Closing endorsement, hold on final slide ─────────────────
  await beat(async () => {
    // No action — dwell on whatever slide is showing.
  });

  // ─── Finalize ───────────────────────────────────────────────────────────
  await context.close();
  const video = page.video();
  const videoPath = video ? await video.path() : null;
  await browser.close();

  if (videoPath) {
    renameSync(videoPath, ws.webm);
    console.log("Video:", ws.webm);
  }

  const videoEndMs = Date.now() - t0;
  const lines = ["WEBVTT", ""];
  for (let i = 0; i < cuesOut.length; i++) {
    lines.push(
      String(i + 1),
      `${msToTs(cuesOut[i].ms)} --> ${msToTs(cuesOut[i + 1]?.ms ?? videoEndMs)}`,
      cuesOut[i].text,
      "",
    );
  }
  writeFileSync(ws.vtt, lines.join("\n"));
  writeFileSync(ws.cuesOut, JSON.stringify(cuesOut, null, 2));
  console.log("Total runtime:", Math.round(videoEndMs / 1000), "s");
}

main().catch((e) => { console.error("Demo failed:", e); process.exit(1); });
