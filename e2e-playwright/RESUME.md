# Resume here

Written 2026-07-17 when the session ran out of model usage mid-wave. This is
the "you've been away" doc: current state, what's half-done, what to do first.
Read this, then PORTING.md (the playbook — rules, gotchas, environment facts).

## Where the work lives

- Branch `playwright-e2e-spike`, PR #77999. Spike package: `e2e-playwright/`.
- **Never** run `playwright`/`tsc` from the repo root — it scans the monorepo
  and OOMs node. Always `cd e2e-playwright` first.
- Local HEAD is ahead of `origin`. Everything below the "in flight" heading was
  uncommitted when the session ended; see the commit that added this file.

## Ground truth files

| File | What it is |
|---|---|
| `PORTING.md` | The playbook. Port rules, gotchas, env facts, dispatch process. Every gotcha we hit gets appended here — that loop is why later waves need fewer fixes. |
| `QUEUE.md` | Generated dispatch queue, largest specs first. 354 specs / ~192.5K lines remaining at last generation. Regenerate: `node scripts/build-queue.mjs`. |
| `PORTED.txt` | Ledger of source specs already ported. Feeds QUEUE generation. **Currently optimistic — see caveat below.** |
| `support/INDEX.md` | Generated helper catalog so agents don't re-grep. Regenerate: `node scripts/build-helper-index.mjs`. |
| `FINDINGS.md` | The case file — every migration dividend (product bugs, test-suite defects, infra discoveries). This is the artifact that makes the argument to colleagues. |
| `findings-inbox/` | Per-agent dividend drops, merged into FINDINGS.md at checkpoints. **Empty right now** — the agents died before writing their entries. |

### PORTED.txt caveat — fix this first

Lines under `# wave 9 in flight:` were added optimistically. Any spec there whose
port did not actually land must be removed, or QUEUE.md will skip real work.
Verify each against `tests/` and a green run before trusting it.

## In flight when usage ran out

Nine large specs were being ported concurrently, one agent per backend slot.
All agents died on a Fable 5 usage limit (see "Usage" below). The spec files are
**written but mostly unverified** — treat every one as WIP until it runs green.

| Slot | Spec file (lines) | State when the agent died |
|---|---|---|
| 1 | `tests/click-behavior.spec.ts` (2786) | **DONE — verified and landed.** **41 pass / 1 fixme on the CI uberjar**, clean under `--repeat-each=2` (82 passed / 2 skipped), tsc clean. Source `dashboard-cards/click-behavior.cy.spec.js` is in PORTED.txt; findings in `findings-inbox/click-behavior.md`. Two shared-helper changes: `saveDashboard` gained `awaitRequest` (`support/dashboard.ts`), and `openLegacyStaticEmbeddingModal` gained `activeTab` (`support/embedding.ts`) — both optional, backwards-compatible. **Dividend: two upstream tests assert an href the app never produces and pass anyway** (assertions inside `H.onNextAnchorClick` never enforce). The 1 fixme (33379) is blocked by thread #4's `MB_SITE_URL` pin — **see the trade-off table in the findings; it affects any spec that writes site-url.** Not WIP; leave alone. |
| 2 | `tests/dashboard-reproductions.spec.ts` (2438) | **DONE — verified and landed.** 40 pass / 1 skipped (`@skip` upstream) / **0 fixme**, on the **CI uberjar**, clean under `--repeat-each=2` (80/82). Source `dashboard/dashboard-reproductions.cy.spec.js` is in PORTED.txt; findings in `findings-inbox/dashboard-reproductions.md`. **Fixed a harness bug affecting every slot — see open thread #4 below (`MB_SITE_URL`).** A suspected product bug (12926) was **disproven by the jar** after Cypress had failed it identically — the fidelity cross-check alone did not catch it. Not WIP; leave alone. |
| 3 | `tests/dashboard-parameters.spec.ts` (2989) | **DONE — verified and landed.** 43/43 on the CI uberjar, clean under `--repeat-each=2` (86/86). Source is `dashboard-filters/parameters.cy.spec.js` (not `dashboard-parameters.cy.spec.js` — no such file). The suspected product bug is **disproven**: see open thread #2. Needed one helper fix (`undo` → newest toast); the spec itself was already correct. |
| 4 | `tests/metrics-explorer.spec.ts` (2560) | **DONE — verified and landed.** 46 pass / 0 skipped / 0 fixme, clean under `--repeat-each=2`. Not WIP; leave alone. |
| 5 | `tests/dashboard-filters-reproductions-1.spec.ts` (2745) | **DONE — verified and landed.** **39 pass / 1 skipped on the CI uberjar** (updated 2026-07-18: the 6 `test.fixme`s were re-enabled — they pass on the jar and were never product bugs; see thread #3). Only the upstream `@skip` remains. Note the 6 still fail on a local source-mode `--hot` backend — known artifact, CI is the gate. Not WIP; leave alone. |
| 6 | `tests/dashboard-core.spec.ts` (2131) | **Full file green (45 passed / 1 skipped `@skip` upstream), one flake open.** Two port defects found and fixed (one root cause: `saveDashboard` racing an unanchored card-add — now a PORTING.md gotcha). No product bug: a test-side wait fixes both, and a Cypress cross-check on :4106 passed both (⚠️ Electron, predates the `--browser chrome` rule — re-run before citing). **Open (needs a decision, not a fix):** `--repeat-each=2` (89 passed / 1 failed / 2 skipped) caught `auto-scrolling to a dashcard via a url hash param` (:1318); measured **3 fail / 2 pass over 5 runs on a quiet box**. Cause is app-side: `DashCard` scrolls once in `useMount` and clears the `scrollTo` hash immediately, so any later remount/reflow loses the scroll and nothing re-scrolls. Left unmodified and unskipped on purpose — the port's `toBeInViewport()` is *stronger* than Cypress's `should("be.visible")` (which ignores scroll position), so weakening it makes the test vacuous and a `toPass` retry would mask the very behaviour under test. Not claimed as a product bug (fidelity bar not met). See `findings-inbox/dashboard-core.md`. |
| 7 | `tests/documents-comments.spec.ts` (2009) | **DONE — verified and landed.** 47 pass / 1 skipped (the original's `it.skip`), clean under `--repeat-each=2`. In PORTED.txt; findings in `findings-inbox/documents-comments.md`. Not WIP; leave alone. |
| 8 | `tests/interactive-embedding.spec.ts` (2673) | **DONE — verified and landed.** 73 pass / 6 skipped (@external), clean under `--repeat-each=2`, tsc clean. The "mid-write" note was wrong: all 79 upstream tests were already there and typechecked. Not WIP; leave alone. Yielded 4 new PORTING gotchas + 2 infra dividends — see `findings-inbox/interactive-embedding.md`, and **the two config items below want an owner.** |
| 9 | `tests/documents.spec.ts` (2241) | **DONE — verified and landed.** 36 pass / 1 skipped on the CI uberjar, 72/2 under `--repeat-each=2`, tsc clean. Landed by the coordinator after the porting agent stalled twice on the stream watchdog mid-fix. Yielded a general gotcha (CSS-module class names are minified in the jar — never select on them; the class-substring selector was source-green and jar-red). See `findings-inbox/documents.md` §7. Not WIP; leave alone. |

Their new helper modules are equally unverified: `support/click-behavior.ts`,
`dashboard-core.ts`, `dashboard-parameters.ts`, `dashboard-repros.ts`,
`documents-core.ts`, `documents.ts`, `filters-repros.ts`,
`interactive-embedding.ts`. (`metrics-explorer.ts` is verified — slot 4.)

### Debris to delete

`repro1.png`, `scratch-repro2.ts`, `tests/zz-scratch-fixme.spec.ts` — agent
scratch files, not part of the port.

## Open threads worth picking up

**1. `native-subquery` autocomplete — SOLVED, and it retracted a finding.**
The wave-8 CI failure (run 29569211972, 373/374 both legs) turned out to be a
**port bug, not an app bug**: loading a card whose `{{#id}}` tag is unslugged
triggers `updateTemplateTagNames` to rewrite the query text, which leaves the
saved question *dirty*, so the QB runs it through `/api/dataset` and the
`POST /api/card/:id/query` that `visitQuestion` waits for never fires. The
Cypress original used a bare `cy.visit` with no wait, so only the port was
exposed. Fixed with `visitQuestionEitherEndpoint` (`support/native-extras.ts`);
verified 4/4 × 3 runs in jar mode.

**The same investigation retracted FINDINGS #24** — neither sub-claim
reproduces against the CI uberjar, and the previously-fixme'd test now passes
and is re-enabled. See the retraction note in FINDINGS.md and the evidence in
`findings-inbox/native-subquery-ci-failure.md`.

**CLOSED 2026-07-18 — #2 and #22 are also retracted.** The open action above
was carried out against the same jar (slot 11 / :4111). Neither survives:
`parameters: []` is a documented, deliberately-accommodated condition (both FE
and BE derive parameters from template-tags when it's empty — the backend
docstring literally says e2e tests are sloppy about this), the filters render,
and the query succeeds. The "Cypress fails identically" evidence turned out to
be **H2 sample-DB lock contention**: snapshots pin database 1 to the shared
`e2e/tmp` H2 file, our Playwright harness re-points it to a per-worker copy
after every restore and Cypress does not, so a Cypress cross-check run on this
multi-slot box 500s for reasons that have nothing to do with the app. There is
no product bug and no "load-path cluster". Evidence:
`findings-inbox/findings-2-22-reverification.md`.

**All three product-bug claims that rested on a `parameters: []` / load-path
observation (#2, #22, #24) are now retracted.** FINDINGS #1 and #3 are
untouched by this and remain the product-bug claims. Before adding another
"the Cypress original fails identically" finding, read the method note in
PORTING.md — that cross-check is only valid on a quiesced box.

**2. `dashboard-parameters` suspected product bug — CLOSED. Not a bug.**
Settled 2026-07-18. Full evidence: `findings-inbox/dashboard-parameters.md`.

Field 61 = `PRODUCTS.CATEGORY`, which pinned the claim to "should handle
mismatch between filter types (metabase#9299, metabase#16181)". The observation
is **real and reproducible** — on a *freshly booted* backend, `query_metadata`
delivers `fields: [61]` to the browser and the mapper still renders disabled
(`mappingOptions` empty). It is **not** staleness, and **not** a port artifact:
the unmodified Cypress original fails at the *same assertion* on the same
backend, in Chrome.

**But it passes on the CI uberjar**, with byte-equivalent backend payloads
(`fields: [61]`, same MBQL5 `dataset_query`, same `parameters: []`). The branch
touches no product code and only 2 unrelated FE commits landed on master since
the merge-base, so the FE *source* is identical between the two. The differing
variable is the **local rspack hot FE bundle** — environmental, local-only.

This closes the gap FINDINGS #24's retraction left open ("Not verified: the
source-mode side"). It also proves the fidelity cross-check does **not**
establish that a behaviour is real — both harnesses share the FE bundle. See
the corrected rule in PORTING.md. Dead ends already ruled out (don't re-chase):
the MBQL5 `dimension[1]` story (Lib converts to legacy refs first), stale CLJS
(the bundle *has* `ref->legacy-ref`), and `parameters: []` (normal; the jar
returns it too).

**3. `dashboard-filters-reproductions-1` — 6 fixmes. CLOSED 2026-07-18. Not bugs.**
All six **pass against the CI EE uberjar** (`751c2a98`, slot 11 / :4111): 6/6,
and 12/12 under `--repeat-each=2`. All six are **re-enabled**, and the full spec
was re-measured on the jar: **39 passed / 1 skipped** (the upstream `@skip`), up
from "33 pass / 7 skipped". Full evidence:
`findings-inbox/filters-repros-1-jar-recheck.md`.

The controlled comparison — same slot, same box, same spec, only the artifact
swapped:

| Artifact | Result |
|---|---|
| CI uberjar `751c2a9` + static FE assets | **6/6 pass** |
| Source-mode backend `6c67bb8` + rspack hot bundle | **6/6 fail**, at the original assertions |

So the 2026-07-17 observation was real; the **inference** from it was wrong. The
justification ("the original Cypress spec fails identically, so something real
is behind them") established *fidelity only* — both harnesses share one backend
and one FE bundle, which is exactly what thread #2 falsified. This is the
field-61 pattern reproduced on a second, independent spec, and it is now the
**fourth** claim of this shape to die (#2, #22, #24, and this). `21528` — flagged
here as "suspiciously close in shape to #2's symptom" — was indeed the same
thing.

**No product-bug dividends came out of this spec.** FINDINGS #1 and #3 remain
the only standing product-bug claims.

> **Not established** (don't over-quote this): the root cause. Jar mode swaps
> the backend artifact *and* the FE bundle together, so this run doesn't isolate
> which; #2's byte-equivalent-payload evidence points at the **hot bundle**, but
> that's a hypothesis. The rspack server had been up ~3h with HEAD moving under
> it, and PORTING.md already warns long-lived `--hot` builds degrade — the cheap
> unrun experiment is *restart rspack, re-test source mode*.
>
> **Consequence:** these 6 pass in CI (jar) and **fail on a local `--hot` run**.
> Same trade already accepted for #22/#24's re-enabled tests. Local red here is
> the known artifact, not a regression.

**4. Slot backends had the wrong `site-url` — FIXED 2026-07-18 (harness bug).**
Every per-worker backend restored `site-url = http://localhost:4000` from the
e2e snapshot (they were captured against the standard :4000 dev backend), and
`restore()` reinstated it per test. The frontend prefixes root-relative
navigation targets with site-url (`getWithSiteUrl` in `utils/dom.ts`, called by
`openUrl` in `visualizations/lib/open-url.ts:105`), so on a slot backend every
**click-behavior / drill-through** navigation left for **:4000** — a different
backend without the test's data. It fails *quietly*: the URL still matches
`/question`, so `toHaveURL(/\/question/)` passes and the test dies later on a
downstream assertion. All 4 of `dashboard-reproductions`' issue-17879 tests
failed this way (in **both** harnesses — the Cypress screenshot showed the
browser parked on `localhost:4000/question#…` reading "We're a little lost").

Fixed in `support/worker-backend.ts`: slot backends now boot with
`MB_SITE_URL=http://localhost:<port>`. Settings resolve env before the app DB,
so it survives `restore()` (a DB write would not). 17879 went **0/4 → 4/4**
(and from 30s timeouts to 5s each). Applies to source and jar mode alike — it's
a restored DB value, independent of the artifact.

> Scope: this is **not** the cause of threads #2/#3 (see #3 — those pass on the
> jar at :4111 with site-url untouched). `openUrl` targets get the prefix;
> react-router `Link` navigation doesn't. If you have a **landed port that was
> verified on a slot before this fix and had drill-through tests fixme'd**,
> it's worth a recheck.

> **Known side effect (found in slot 1, click-behavior).** Because env beats the
> app DB — the property that makes this survive `restore()` — a test that *writes*
> site-url is now **silently defeated**: the PUT reports success and the value
> does not change (measured on the jar: `https://…/subpath` requested,
> `http://localhost:4101` still returned). Any spec whose scenario is "site-url
> differs from the real origin" cannot run on a slot; click-behavior's
> metabase#33379 test is `test.fixme`'d for exactly this. The escape hatch, if
> another spec needs it, is a post-`restore()` `PUT /api/setting/site-url`
> instead of the env pin — same effect, one PUT per restore, but overridable.
> Slot 1 had built that variant independently and removed it in favour of this
> one; noting the trade-off rather than re-opening it. Trade-off table in
> `findings-inbox/click-behavior.md`.

Also unfinished: the w2-only SCIM test failure (`admin-authentication.spec.ts`
"setup and manage scim feature", died in 20ms, passed on w1) looked like
teardown noise. Watch whether it recurs.

## Outstanding work (as of 2026-07-18, end of the wave-9 session)

State: all nine wave-9 specs landed and pushed (origin `c6a1f19223d`); CI
switched from the workers `[1,2]` A/B to a **4-way spec shard** (workers=2 per
shard). Nothing is running. The items below are open and none is a regression
in landed code.

1. **`metrics-explorer.spec.ts` ECharts tooltip hover — FIXED 2026-07-18
   (pending CI confirmation).** Run 29616824640 shard s3 failed "should revert
   to formula text when custom name is cleared" on a `toBeVisible` timeout for
   `echarts-tooltip`. Root cause (from the s3 trace): the test does a one-shot
   `cartesianChartCircles.nth(4).hover()` right after a breakout, and on slower
   CI the chart is still animating its points into place — the hover lands on
   empty canvas, ECharts shows no tooltip, and nothing retriggers it. Passed
   locally only because the animation had settled by hover time. Fixed with
   `hoverChartPointForTooltip` (`support/metrics-explorer.ts`), a `toPass` retry
   that re-aims the hover until the tooltip is up; applied to all three
   identical hover sites (1123/1178/1219), not just the one that flaked.
   Verified locally 18/18 under `--repeat-each=3`. The assertion is unchanged —
   callers still check exact tooltip text. CI is the real repro (can't
   reproduce the 4vCPU timing locally), so confirm on the next sharded run.

2. **Per-worker backend died mid-run on shard s3 — infra flake.** Two
   `documents` tests failed in 2–3ms with `Worker 0/1 backend exited (code 0)`
   and **both passed on retry**, so Playwright's retry masked it — but a slot
   backend exiting cleanly (code 0) mid-run is not expected and could flake any
   spec. The `code 0` (graceful, not OOM's 137) is the puzzle. Needs the s3
   `backend.log` to diagnose. Left alone deliberately; retry is currently
   hiding it.

3. **Viewport drift — suite runs 1280×720, config says 1280×800.** FINDINGS
   #41. `devices["Desktop Chrome"]` at the project level shadows the top-level
   viewport; Cypress runs 800, so this is a real fidelity gap. Left at 720
   (internally consistent, matches what CI runs). Fixing it is a one-liner but
   moves ground under ~60 landed specs, so it needs a full-suite revalidation —
   do it as its own task, not mid-wave.

4. **The two surviving product-bug candidates (#1, #3) are NOT jar-verified.**
   Five bug claims were retracted this session; #1 (SearchBar Enter race) and #3
   (`restore()` killing the search index) have not been through the same jar +
   `--browser chrome` gauntlet. Until they have, they are unverified — do not
   cite them as confirmed. **This is the highest-value next step before taking
   the case to colleagues.**

5. **Sharding follow-ups.** The 4-way split is count/order-based, not
   duration-balanced, so a shard drawing several huge specs can run long; bump
   `SHARD_TOTAL` + the matrix list as spec count climbs, and consider a
   timings-balanced split. Bigger win when it's worth it: generate DB snapshots
   **once** and share them as an artifact, so each shard stops re-paying the
   ~13m Cypress snapshot run (each shard currently pays full setup).

## Usage — read before dispatching agents

The session died because **Fable 5 hit its usage limit** and every in-flight
agent inherited that model. Nine agents died mid-work, several minutes-to-hours
of work each, and none wrote its findings-inbox entry. When dispatching, pass
an explicit model to the Agent tool rather than inheriting, and prefer starting
a wave only when there's headroom to finish it.

## Suggested first moves

1. Delete the debris files listed above.
2. ~~Finish slot 6 (`dashboard-core`)~~ — **done**; verified green and landed.
3. Reconcile `PORTED.txt` against reality; regenerate QUEUE.md.
4. ~~Cypress cross-check for dashboard-parameters~~ (thread #2) and ~~re-run
   `dashboard-filters-reproductions-1`'s 6 fixmes against the CI uberjar~~
   (thread #3) — **both done; neither is a bug.** All 6 fixmes pass on the jar
   and are re-enabled. That answers "do we have any product-bug dividends left":
   **FINDINGS #1 and #3, and nothing else.** Every claim resting on "the Cypress
   original fails identically" is now retracted (#2, #22, #24, + these 6).
   The migration case should lean on the dividends that *did* survive —
   strengthened assertions, silently-vacuous upstream tests, infra findings —
   not on product bugs.
5. Then resume the dispatch loop from QUEUE.md as described in PORTING.md.

## How to verify a spec (the loop every agent runs)

```bash
cd /Users/fraser/Documents/code/metabase/e2e-playwright
JAR_PATH=$(git rev-parse --show-toplevel)/target/uberjar/metabase.jar \
  PW_PER_WORKER_BACKEND=1 PW_KEEP_SLOT_BACKENDS=1 PW_SLOT_OFFSET=<slot> \
  PW_ACTION_TIMEOUT=30000 bunx playwright test <spec> --trace=off
```

**Verify against the jar, not source mode** — it's what CI runs, it's 2-3×
faster per test, and source mode's rspack hot bundle has now manufactured five
false product-bug claims across four specs. Source mode is for debugging with
source maps. See PORTING.md's "Jar mode is the DEFAULT verification loop".

Slot N owns port 410N. Kill that port first if a kept backend mass-fails.
One runner at a time per backend; never touch port 4000 (the shared dev
backend). Confirm stability with `--repeat-each=2` before landing. Run
verification in the **foreground** — a backgrounded run leaves an agent waiting
on a notification it never receives, and the slot stalls silently.

## Local services the ports assume

Docker: `postgres-sample`, `mongo-sample`, `mysql-sample`, `maildev`
(:1025 SMTP / :1080 UI), `webhook-tester`. Compose file:
`e2e/test/scenarios/docker-compose.yml`. Premium tokens come from repo-root
`cypress.env.json` (the values in `.env` are stale — never print token values).

`snowplow-micro` (:9090) is now **also running** (`snowplow/docker-compose.yml`,
started during the documents-comments port and left up). The ports stub
snowplow, so they don't need it — but any **original Cypress spec whose
`beforeEach` calls `H.resetSnowplow()`** dies in `before each hook` in ~1s
without it, which matters for the fidelity cross-check.
