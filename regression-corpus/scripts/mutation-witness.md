# Mutation-witness guard

**Problem it solves.** When an e2e repro is the *only* oracle (the ~1,000 e2e-only population),
running it against a bug-reintroduced branch is ambiguous:

- e2e **fails** on the mutant → the repro is load-bearing (it catches the bug). Unambiguous.
- e2e **passes** on the mutant → *either* the repro is **vacuous/zombie** (cull it) *or* the
  reconstruction **failed to actually reintroduce the bug**. We cannot tell which from the e2e alone.

**The guard.** Never trust a passing e2e as "vacuous" unless an **independent witness** proves the
mutation changed observable behavior. A witness is any check *separate from the e2e's assertions*
that is GREEN on clean HEAD and RED on the mutant:

- Preferred: a minimal **jest assertion at the mutation site** — evaluate the mutated function on
  representative inputs and assert `output_mutant !== output_clean` (hole-closer discipline, one
  assertion). Runs in seconds via `test-unit-keep-cljs`, no CI.
- Fallback: a REPL/node eval of the exported function, or a DOM/state snapshot diff at the repro's
  key step (clean vs mutant) showing a real delta.

**Decision table** (per e2e-only mutant):

| e2e on mutant | witness on mutant | verdict |
|---|---|---|
| fails | (not needed) | repro **load-bearing** — keep, or replace with the witness unit test |
| passes | fails (behavior changed) | repro **VACUOUS** → cull (bug is real, e2e just doesn't see it) |
| passes | cannot be produced | **reconstruction unconfirmed** → withhold; do not count the e2e either way |

**Who writes the witness.** For e2e-only bugs there is no shipped unit test, so the reconstruction
agent authors the witness as part of reconstruction — the same skill as the FE hole-closers. If the
agent cannot make a witness fail, that is itself the signal that the bug was not reintroduced (or is
not unit-observable), and the mutant is discarded rather than scored.

**Validated on the pilot's 3 "misses"** (25614, 31662, 39993): each e2e passed on the mutant, but
its unit witness failed (`1 / 34 / 9` tests red) — confirming the mutation was live and the e2e is
genuinely insensitive to that regression. Evidence: `regression-corpus/evidence/e2e-oracle-pilot.jsonl`.
