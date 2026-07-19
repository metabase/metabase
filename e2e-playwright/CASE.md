# The case for migrating e2e from Cypress to Playwright

A 5-minute read. Written from a spike that ported **68 specs (~915 tests)** and
runs them green in sharded CI against the production uberjar. Full detail and
evidence live in [FINDINGS.md](./FINDINGS.md); this is the argument.

## Bottom line

It works, on the real thing. The ports run against the **exact same backend and
state machinery** as Cypress — the same `/api/testing/snapshot|restore`
endpoints, the same `e2e/snapshots/`, the same cached sessions. Nothing
backend-side changed. The suite is green across a 4-way shard on standard
4vCPU/16GB CI runners, built from the same EE uberjar we ship.

The honest headline is **not** a bug count (see "Credibility" below). It's four
capability differences, each of which Cypress cannot match without changing
tools:

## 1. In-job parallelism Cypress can't do

Sharding across machines is *not* the differentiator — Cypress does that fine
(Cypress Cloud `--parallel`, or a manual spec-split across a CI matrix, which we
already run). The difference is **within a single job**: Cypress runs specs
serially — one browser, one spec at a time — so you scale it only by adding more
machines. Playwright runs multiple **worker processes in parallel inside one
job**, each with its **own isolated Metabase backend** (own port, app DB,
sample-DB copy, site-url). We solved the hard parts — H2 file locking,
plugin-extraction races, nREPL clashes, cold-boot query failures — and it holds
up in CI. Measured on the standard runner: 2 workers ≈ 1.27× wall-clock / ~1.4×
throughput **on the same machine Cypress uses at 1×**, with more headroom on
bigger runners. Sharding then composes on top (`--shard` × `--workers`), so total
parallelism is machines × workers, not machines alone. Honest cap: each worker
needs its own JVM+DB, so in-job workers are RAM-bound — the win is real but
bounded by runner size.

## 2. A class of bug Cypress cannot see

Porting exposed a real, user-reachable bug that the **Cypress suite is blind to
by construction** (FINDINGS #1): in full-app embedding, a user who arrow-keys to
a search result and presses Enter lands on `/search` instead of their result,
because two handlers race on the Enter keypress. Playwright's input (a real
keydown→keypress→keyup) hits it; Cypress's `realPress` delivers the char event
delayed, so its equivalent test *passes* and the bug stays invisible. Verified
on the production uberjar, same backend, same Chrome — only the input model
differs. Input-timing races are a whole category Playwright can catch here and
Cypress cannot.

## 3. Tests that actually test more

- **Real downloads**: the Cypress originals intercept export requests and
  redirect the response away — no file ever lands. The ports complete real
  downloads and parse the xlsx/csv (real row-count assertions).
- **Real iframes**: full-app embedding runs in an actual `<iframe>` like a
  customer site, instead of Cypress faking it by deleting `window.Cypress`.
- **Strict mode + de-vacuoused assertions**: porting surfaced numerous upstream
  assertions that could never fail — callbacks that never run, `.should()` on
  multi-element sets that pass if *any* match, a resize test asserting the
  opposite of the app's behaviour and passing by accident. The ports make these
  real.

## 4. Less framework machinery

No `cypress-real-events` (native CDP input covers typing/hover/keyboard — and it
retires the exact plugin behind the pinned-Chrome-headless failures). No pinned
browser (Playwright ships versioned browsers; the "tests break on Chrome vN"
migrations go away). Traces instead of videos for failure triage.

## Credibility: we tried to disprove our own findings

This is the part worth trusting. The spike initially flagged **7 product-bug
candidates**. Re-checked rigorously against the CI uberjar (not the local dev
bundle) with Chrome cross-checks, **6 did not survive and were retracted** —
they were local-environment artifacts or measurement mistakes, not app bugs. We
kept the **one** that reproduced. That discipline is now the default workflow
(verify on the artifact CI ships, not the dev server), and it's the reason the
remaining claim is solid. A migration pitch that inflates its bug count is easy;
this one deliberately doesn't.

## Cost

Low and predictable. Fix rate converged to **0–2 small fixes per spec**, each
surfaced immediately by strict mode or a timeout on the first run — nothing
silently wrong found later. The recurring fixes are codified in
[PORTING.md](./PORTING.md), so each wave is cheaper than the last. Large specs
(2,000–3,000 lines) port faithfully; the state layer is reused untouched.

## What's left / honest caveats

- **346 specs (~173K lines) remain** — this is a spike, not a finished
  migration. The playbook and per-worker/sharding infra are built; it's now
  mechanical.
- A few **infra follow-ups**: a viewport-fidelity gap (720 vs Cypress's 800), a
  transient `bun install` flake, and a snapshot-as-artifact optimization to cut
  per-shard setup time.
- **Component tests, host-app, and cross-version** suites were out of scope.
- The single biggest lesson — *the local dev bundle and the CI artifact can
  behave differently* — cuts both ways: it's why verification must run against
  the uberjar, and it's baked into the harness now.
