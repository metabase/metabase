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
| 3 | `tests/dashboard-parameters.spec.ts` (2989) | **Mid-investigation of a suspected product bug** — see below. |
| 4 | `tests/metrics-explorer.spec.ts` (2560) | Partially verified; was re-running "Entry points" after a fresh backend rendered correctly. |
| 5 | `tests/dashboard-filters-reproductions-1.spec.ts` (2745) | **DONE — verified and landed.** 33 pass / 7 skipped, clean under `--repeat-each=2`. Not WIP; leave alone. |
| 6 | `tests/dashboard-core.spec.ts` (2131) | **DONE — verified and landed.** 45 passed / 1 skipped (`@skip` upstream), clean under `--repeat-each=2`. Two port defects found and fixed (one root cause: `saveDashboard` racing an unanchored card-add — now a PORTING.md gotcha). No product bug: a test-side wait fixes both, and a Cypress cross-check on :4106 passed both (⚠️ that cross-check ran in Electron — it predates the `--browser chrome` rule; not load-bearing, but re-run before citing). See `findings-inbox/dashboard-core.md`. Not WIP; leave alone. |
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

**2. `dashboard-parameters` suspected product bug (unverified).**
The agent observed `query_metadata` containing field 61 while the parameter's
value options came back empty, and was about to cross-check against the
original Cypress spec when it died. Either a real bug or a port artifact —
the Cypress cross-check is the deciding step, and it was never run.

> **Before running that cross-check, read the new PORTING.md note.** The
> #2/#22 re-verification showed the Cypress-vs-slot-backend cross-check is
> invalid on a busy box: Cypress does *not* re-point the shared `e2e/tmp` H2
> sample DB (our harness does, after every restore), so it 500s whenever a
> sibling slot backend holds the file lock. Quiesce the box or check
> `details.db` / `site-url` / `lsof` first, and run with `--browser chrome`.
> "Value options came back empty" is also the same *shape* of observation that
> #2 died on — check whether the FE derives the options before calling it a bug.

**3. `dashboard-filters-reproductions-1` — 6 fixmes with no root cause.**
The port is landed and verified, and the *original Cypress spec* run against
the same backend fails the same 6 tests at the same assertions — so the port is
faithful and something real is behind them. Snapshot staleness is ruled out
(snapshot Jul 17 > latest migration Jul 15), but the cause is not established,
and both harnesses shared one source-mode backend + rspack server, so a common
environmental cause isn't excluded. **Decider**: if CI's Cypress leg is green on
this spec, the delta is environmental; if red, it's a pre-existing regression.

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
4. Take the two open threads above (jar-mode repro for native-subquery; Cypress
   cross-check for dashboard-parameters) — both are candidate dividends and
   both are one concrete step from an answer.
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
