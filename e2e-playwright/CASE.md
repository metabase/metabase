# The case for migrating e2e from Cypress to Playwright

A 5-minute read. Written from a spike that has now ported **all 414 specs
(~5,100 tests)** and runs them in 50-way sharded CI against the production
uberjar. Full detail and evidence live in [FINDINGS.md](./FINDINGS.md); this is
the argument.

## Bottom line

It works, on the real thing. The ports run against the **exact same backend and
state machinery** as Cypress — the same `/api/testing/snapshot|restore`
endpoints, the same `e2e/snapshots/`, the same cached sessions. Nothing
backend-side changed. It runs across a 50-way shard on standard
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
up in CI. Sharding composes on top (`--shard` × `--workers`), so total parallelism is
machines × workers, not machines alone. Honest cap: each worker needs its own
JVM+DB, so in-job workers are RAM-bound — the win is real but bounded by runner
size.

**Measured at full scale (50 shards, whole suite, FINDINGS #214):** wall clock
**19 min**, against **384 min** of sequential Cypress spec time for the same
specs.

**On execution time we are at parity, not faster — and the first number we
published was wrong.** Summing Playwright's per-test durations gave "1.71×
slower", but that duration is *wall time*: with 2 workers on one runner each test
spends ~40% of it descheduled, so the sum double-counts overlapping periods while
Cypress's per-spec figures are strictly sequential. A controlled A/B on the same
commit, restricted to the 371 specs green in both runs:

| | total | vs Cypress |
| --- | --- | --- |
| `workers=2` | 579.2 min | 1.51× |
| **`workers=1`** | **412.1 min** | **1.07×** |
| Cypress | 384.0 min | — |

So: **comparable work per test, far better wall clock.** The claim is
parallelism, not raw speed — and we corrected our own headline rather than ship
the flattering version.

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
- **Strict mode + de-vacuoused assertions**: see the register below.

## 3b. Defects found in the EXISTING Cypress suite

The systematic audit the suite has never had. Mutation-testing every port —
break something the test claims to check, and it must go red — surfaced **~30
defects in the current suite**. Each has a finding number and a measurement; no
entry is here on suspicion.

**Assertions that cannot fail** (largest class): all 8 absence assertions in
`custom-elements-api` (#73); a vacuous 403 across an **18-invocation permission
matrix** (#20); an invalid-file check whose query is `LIKE '%undefined_%'` and
can never match (#132); `.Icon-gear` which **matches nothing anywhere**,
including as admin (#206); `should("have.value","on")` on a checkbox, where
`"on"` is the HTML default and doesn't track checkedness (#127); **~2/3 of
`#15170`'s body** proven non-load-bearing (#165); a helper passing on an **empty
result set**, since `[].every(...)` is `true` (#202); and a test **whose entire
subject can be deleted** without turning it red (#76).

**No assertion at all**: `data-studio-library` (#63); `#68378` ends on a Save
click (#175); callback-scoped assertions that never enforce (#37).

**Testing behaviour that no longer exists**: `dependency-checks` (#158) — the
commit disabling that flow **deleted 145 lines from that very spec**, leaving
only the negative half of a pair, plus the endpoints it called.

**Silent skips — green runs that executed nothing**: maildev 3.x disabling
**every** email test (#67); **~20 of ~50** `*-writable` specs carrying no
`@external` tag, so "untagged" never meant "needs no container" (#123); and 18
tests gated for a container they never touch (#149).

**Races upstream survives by luck**: `waitForSyncToFinish` is very nearly a bare
`cy.wait(500)`, because `initial_sync_status` is a *first-ever-sync* marker
already true when the test body calls it (#196); upstream's comment *"all tests
can run independently"* is false as written (#187); four persistence assertions
that don't verify persistence, in a race **Cypress shares** (#168).

**Wrong bytes**: upstream's CSV assertions inspect the wrong ones (#77).

**Honest scoping, because this list is only useful if it survives scrutiny.**
This is *not* "the Cypress suite is broken" — most entries are single assertions
inside tests that also contain load-bearing ones, and roughly half would let a
real regression through today. The worked example is #218: we first called a
sandboxing helper "the primary evidence across the sandboxing specs", then
measured and found **13 of its 14 call sites already carry an adjacent row-count
guard**. One is genuinely exposed. The scoped version is what's recorded.

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

- **The port is complete: 414/414 specs, queue empty.** What remains is not
  porting but hardening — a tail of CI-only failures (timing-sensitive, and they
  do not reproduce on a developer machine ~5× faster than a runner).
- **`resetWritableDb` was never ported until late**, so warehouse state
  accumulated across runs (#157). Fixed; it cleared the largest failure cluster.
- **The `@external` tagging convention has drifted** (#123) — the gate-off
  control, not the tag, is the only trustworthy signal that a spec really ran.
- A few **infra follow-ups**: a viewport-fidelity gap (720 vs Cypress's 800), a
  transient `bun install` flake, and a snapshot-as-artifact optimization to cut
  per-shard setup time.
- **Component tests, host-app, and cross-version** suites were out of scope.
- The single biggest lesson — *the local dev bundle and the CI artifact can
  behave differently* — cuts both ways: it's why verification must run against
  the uberjar, and it's baked into the harness now.
