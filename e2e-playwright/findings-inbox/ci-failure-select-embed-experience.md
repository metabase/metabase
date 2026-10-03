# CI failure: `select-embed-experience` — "should show a fake loading indicator in embed preview"

CI run 29715675294 (`52e783505d6`), shard s16: 1 failed / 174 passed. Failed on the
retry too. Passed locally.

```
Error: expect(locator).toBeVisible() failed
Locator: locator('#iframe-embed-container').getByTestId('preview-loading-indicator')
Timeout: 20000ms / Error: element(s) not found
  at tests/sdk-embed-setup-select-embed-experience.spec.ts:296
```

## Root cause

**The transient-state problem of FINDINGS #54, confirmed by measurement — but the
sub-variant matters: the state was not missed inside a poll gap, it was already
over before the first poll.**

The mechanism, read from source and then verified:

- `EmbedPreviewLoadingOverlay` (`frontend/src/metabase/embedding/embedding-iframe-sdk-setup/components/EmbedPreviewLoadingOverlay.tsx`)
  renders iff `SdkIframeEmbedPreviewInner`'s `isLoading` is true. `isLoading` is
  set `true` when the embed element ref attaches (preview mount, i.e. modal
  open) and cleared by the element's `ready` event.
- `ready` is emitted in `frontend/src/metabase/embedding/embedding-iframe-sdk/embed.ts`
  on the iframe's `metabase.embed.iframeReady` postMessage — the same handler
  that stamps `data-iframe-loaded`. So the overlay's lifetime is exactly
  "modal open → embed iframe app booted", and the test's own
  `loadedPreviewIframe` assertion is the *other side* of the same transition.
- Between the modal opening and the assertion starting, the test runs
  `embedModalEnableEmbedding` (a visibility check plus a card-count probe).
  Nothing synchronises those against the iframe boot. It is an uncontrolled race.

**Evidence it is this and not "the indicator never mounts on CI":** the run's
`error-context.md` (from the `playwright-report-s16` artifact) shows, at the
moment of failure, the wizard fully rendered — auth radiogroup, appearance
section, `Get code`, `Publish` — with a `- iframe` node present in the dialog and
**no overlay**. The preview had loaded. So the indicator mounted and cleared;
it was not absent. This reconciles with the sibling
`sdk-embed-setup-user-settings-persistence` port's M3b/M5 mutation probes.

**Direct local reproduction of the CI red.** CI's failing test took 31.8s, i.e.
~11s of pre-assertion work before the 20s timeout began; locally the whole test
takes ~2s. Injecting `await page.waitForTimeout(10_000)` after
`embedModalEnableEmbedding` — emulating CI's slower pre-assertion phase and
nothing else — reproduces the failure exactly, on the CI uberjar, at 31.2s with
the identical `element(s) not found` message. That converts the CI-only failure
into a measured one.

## What I did NOT establish

I did not explain **why the ratio flips on CI**. On a contended 4vCPU runner with
`--workers=2 --fully-parallel`, both the pre-assertion Playwright actions and the
iframe boot should slow down; the failure requires the *actions* to slow down
more than the *boot*. Plausible stories exist (asset caching, JS parse vs.
round-trip latency) but I measured none of them. Recorded as unexplained. It does
not affect the fix, which removes the ratio from the equation entirely.

## The fix

Hold the embed iframe's document request open until the test explicitly releases
it, then assert. The window becomes deterministic:

```ts
let releaseEmbedIframe!: () => void;
let heldEmbedIframeRequests = 0;
const embedIframeHeld = new Promise<void>((resolve) => { releaseEmbedIframe = resolve; });
await page.route("**/embed/sdk/v1?**", async (route) => {
  heldEmbedIframeRequests += 1;
  await embedIframeHeld;
  await route.continue();
});
// … open modal, enable embedding …
await expect(indicator).toBeVisible({ timeout: 20_000 });
expect(heldEmbedIframeRequests).toBeGreaterThan(0);
releaseEmbedIframe();
await expect(loadedPreviewIframe(page)).toHaveCount(1, { timeout: 20_000 });
await expect(page.getByTestId("preview-loading-indicator")).toHaveCount(0);
```

Spec-local. No shared support module touched — in particular `embedPreview`'s
gate in `support/sdk-embed-setup-select-embed-options.ts` is untouched, so the
eleven specs depending on it are unaffected.

**The assertion got stronger, not weaker.** Before, `toBeVisible` could only
catch a flicker whose cause was unconstrained. Now the visibility assertion runs
while `ready` provably cannot have fired, so it asserts the overlay is shown
*because* the preview has not loaded; and the closing `toHaveCount(0)` runs only
after a release we control, so it asserts the clear is *caused by* the load
rather than merely following it.

### Why not the alternatives

- **Fixed `setTimeout` hold (#54's exact recipe).** Rejected. #54's window is
  short and the assertion follows immediately; here ~11s of unbounded,
  contention-dependent pre-assertion work elapses first, so any constant is a
  new race with a new magic number. Same failure mode #43 warns about.
- **Arm the wait before the trigger (rule 2), i.e. start `waitFor` before
  `openEmbedJsModal`.** Cheaper and would probably work, but it is still a race —
  it shortens the exposure rather than removing it, and it cannot assert *why*
  the indicator is up. Rejected in favour of the deterministic version.
- **Weaken to `toHaveCount(0)`-only / `test.fixme`.** Not needed; the state is
  genuinely observable once controlled.

### Guard against silent no-op

`expect(heldEmbedIframeRequests).toBeGreaterThan(0)` is deliberate. If
`EMBEDDING_ROUTE` (`embed/sdk/v1`) ever moves, the `page.route` glob would match
nothing, the hold would evaporate, and the test would quietly revert to the race
it exists to remove. This makes that failure loud.

## Verified locally

All runs on the **exact CI uberjar** — artifact
`metabase-ee-52e783505d63…-uberjar`, `COMMIT-ID a8959de5` (the merge commit; per
FINDINGS #79 that is not the same code as our branch's local jar) — booted on
slot 5 / port 4105.

| Run | Result |
| --- | --- |
| Unfixed + 10s CI-emulating probe, CI jar | **RED**, 31.2s, identical error (reproduces CI) |
| Fixed + same 10s probe, CI jar, `--repeat-each=2` | **GREEN** 2/2, 12.6s each |
| Fixed, whole spec, CI jar | **GREEN** 8 passed / 2 skipped |
| Fixed, whole spec, CI jar, `--repeat-each=2` | **GREEN** 16 passed / 4 skipped |
| Fixed, single test, stale local jar, `--repeat-each=2` | **GREEN** 2/2 |
| `bunx tsc --noEmit` | clean |

Mutation checks (both kill, so the fix is not scaffolding that passes itself):

- **Remove `releaseEmbedIframe()`** → fails at `loadedPreviewIframe … toHaveCount(1)`.
  Proves the hold really holds the right request, and that the visibility
  assertion above it passed *because* the iframe had not loaded.
- **Point the visibility assertion at a bogus testid** → fails with
  `element(s) not found`. Proves it is not matching something incidental.

Correction worth recording: my first pass at this table was wrong. The slot-5
backend was already running (`PW_KEEP_SLOT_BACKENDS=1`) and reported
`backend on :4105 (reused)`, which silently **ignored `JAR_PATH`** — those runs
were on the stale local jar, not the CI jar. I killed the backend and redid every
load-bearing run, confirming via `ps` that the process was on the CI jar path.
Anyone reusing this technique should check the jar in `ps`, not just the env var.

No Cypress cross-check was run (it would `H.restore()` the shared `e2e/tmp` H2
file and break sibling slots).

## What stays unproven until CI runs

- **Local green does not prove CI green.** Local was `--workers=1` on an idle
  box; CI is `--workers=2 --fully-parallel` on a contended 4vCPU runner. What
  local *does* prove is stronger than usual here: the fix contains no timeout,
  sleep, or timing constant, so contention has nothing to widen. The hold is
  released by the test itself, so the observability of the state is independent
  of machine speed. The residual risk is not the race — it is whether
  `page.route` interception of the iframe document behaves identically under
  CI's parallelism, which I cannot test locally.
- The 10s probe is a *model* of CI's slow pre-assertion phase, not CI itself. It
  reproduces the same error on the same artifact, which is strong, but it is
  still an emulation.
- The unexplained item above (why the actions/boot ratio inverts on CI) remains
  open. I chose not to invent a mechanism for it.
