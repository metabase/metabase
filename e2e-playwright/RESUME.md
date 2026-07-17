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
| 1 | `tests/click-behavior.spec.ts` (2786) | Verification run in progress; result never seen. |
| 2 | `tests/dashboard-reproductions.spec.ts` (2438) | First chunk running; unverified. |
| 3 | `tests/dashboard-parameters.spec.ts` (2989) | **DONE — verified and landed.** 43/43 on the CI uberjar, clean under `--repeat-each=2` (86/86). Source is `dashboard-filters/parameters.cy.spec.js` (not `dashboard-parameters.cy.spec.js` — no such file). The suspected product bug is **disproven**: see open thread #2. Needed one helper fix (`undo` → newest toast); the spec itself was already correct. |
| 4 | `tests/metrics-explorer.spec.ts` (2560) | Partially verified; was re-running "Entry points" after a fresh backend rendered correctly. |
| 5 | `tests/dashboard-filters-reproductions-1.spec.ts` (2745) | **DONE — verified and landed.** 33 pass / 7 skipped, clean under `--repeat-each=2`. Not WIP; leave alone. |
| 6 | `tests/dashboard-core.spec.ts` (2131) | **Full file green (45 passed / 1 skipped `@skip` upstream), one flake open.** Two port defects found and fixed (one root cause: `saveDashboard` racing an unanchored card-add — now a PORTING.md gotcha). No product bug: a test-side wait fixes both, and a Cypress cross-check on :4106 passed both (⚠️ Electron, predates the `--browser chrome` rule — re-run before citing). **Open (needs a decision, not a fix):** `--repeat-each=2` (89 passed / 1 failed / 2 skipped) caught `auto-scrolling to a dashcard via a url hash param` (:1318); measured **3 fail / 2 pass over 5 runs on a quiet box**. Cause is app-side: `DashCard` scrolls once in `useMount` and clears the `scrollTo` hash immediately, so any later remount/reflow loses the scroll and nothing re-scrolls. Left unmodified and unskipped on purpose — the port's `toBeInViewport()` is *stronger* than Cypress's `should("be.visible")` (which ignores scroll position), so weakening it makes the test vacuous and a `toPass` retry would mask the very behaviour under test. Not claimed as a product bug (fidelity bar not met). See `findings-inbox/dashboard-core.md`. |
| 7 | `tests/documents-comments.spec.ts` (2009) | Typechecks; never run. |
| 8 | `tests/interactive-embedding.spec.ts` (2624) | **Spec was mid-write — likely incomplete.** Check it parses before running. |
| 9 | `tests/documents.spec.ts` (2241) | Written; never run, never typechecked. |

Their new helper modules are equally unverified: `support/click-behavior.ts`,
`dashboard-core.ts`, `dashboard-parameters.ts`, `dashboard-repros.ts`,
`documents-core.ts`, `documents.ts`, `filters-repros.ts`,
`interactive-embedding.ts`, `metrics-explorer.ts`.

### Debris to delete

`repro1.png`, `scratch-repro2.ts`, `tests/zz-scratch-fixme.spec.ts` — agent
scratch files, not part of the port.

## Two open threads worth picking up

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

**3. `dashboard-filters-reproductions-1` — 6 fixmes with no root cause.**
The port is landed and verified, and the *original Cypress spec* run against
the same backend fails the same 6 tests at the same assertions — so the port is
faithful and something real is behind them. Snapshot staleness is ruled out
(snapshot Jul 17 > latest migration Jul 15), but the cause is not established,
and both harnesses shared one source-mode backend + rspack server, so a common
environmental cause isn't excluded. **Decider**: if CI's Cypress leg is green on
this spec, the delta is environmental; if red, it's a pre-existing regression.

> **⚠️ Re-read this thread in light of open thread #2 (settled 2026-07-18).**
> "The port is faithful **and** something real is behind them" does not follow —
> that inference is exactly what #2 falsified. Both harnesses here shared one
> source-mode backend *and one rspack hot bundle*, and in #2 that bundle
> produced a failure in **both** harnesses for a test that passes on the jar.
> These 6 fixmes rest on the same argument and are now **unsupported**.
> **Cheaper, stronger decider than waiting on CI**: re-run the 6 against the CI
> uberjar (`JAR_PATH=…`, ~2 min/spec — recipe in PORTING.md). Do that before any
> of them is cited as a product finding, and un-fixme whatever passes.
> Note `21528` ("FK-remapped field values missing from a parameter dropdown") is
> suspiciously close in shape to #2's own symptom.

> **Named candidate for that "common environmental cause"**: the shared
> `e2e/tmp` H2 sample-DB lock and the snapshot-pinned `site-url` (see
> PORTING.md). Here *both* harnesses failed, which fits a shared backend whose
> sample DB was contended — unlike #22, where only Cypress failed because the
> Playwright harness re-points and Cypress doesn't. Cheap check before the CI
> decider: re-run on a quiesced box with nothing else on 41xx/:4000.

Also unfinished: the w2-only SCIM test failure (`admin-authentication.spec.ts`
"setup and manage scim feature", died in 20ms, passed on w1) looked like
teardown noise. Watch whether it recurs.

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
4. ~~Cypress cross-check for dashboard-parameters~~ — **done**; not a bug
   (open thread #2, now closed). The live follow-up is thread #3: re-run
   `dashboard-filters-reproductions-1`'s 6 fixmes against the CI uberjar, since
   #2 showed their justification doesn't hold. Highest-value open item — it
   decides whether we have any product-bug dividends left at all.
5. Then resume the dispatch loop from QUEUE.md as described in PORTING.md.

## How to verify a spec (the loop every agent runs)

```bash
cd /Users/fraser/Documents/code/metabase/e2e-playwright
PW_PER_WORKER_BACKEND=1 PW_KEEP_SLOT_BACKENDS=1 PW_SLOT_OFFSET=<slot> \
  PW_ACTION_TIMEOUT=30000 bunx playwright test <spec> --trace=off
```

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
