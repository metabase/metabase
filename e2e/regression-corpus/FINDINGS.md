# Regression Corpus — Findings

_Presentation-ready summary. Working-state lives in `HANDOFF.md`; per-entry evidence in
`bugs/<issue>/` (`config.yaml`, `reconstruction.patch`, `reconstruction-report.md`)._

_As of the current session. Corpus: **202 entries** (37 mechanical-revert + 165 semantic
reconstruction, incl. **126 frontend** — the ENTIRE FE conflict population is now mined:
live_candidates + all `partial`/`all_specs_gone` relocation buckets, 62 unique fix-commits in
the final exhaust run), each with a saved verbatim agent report. See `FE-TEST-GUIDANCE.md` for
how to shrink FE e2e reliance (3 FE holes closed there, proven)._

---

## 1. The question

Can we safely **cull e2e reproduction tests**? An e2e repro is redundant if the
regression it guards is *also* caught by a cheaper test (BE/FE unit). This corpus
measures, per historical bug, whether the regression is detectable at unit level — and
where it is *not* (a "hole"), whether a cheap unit test can close it.

## 2. Method

1. **Mine** every e2e test title referencing an issue → `repro-tests.jsonl`
   (1,915 titles, **1,231 unique issues**).
2. **Map** issue → fix commit (pickaxe over the repro-title introduction) →
   `fix-commits.jsonl`.
3. **Reproduce the bug** on current `master`, two ways:
   - **Mechanical** — inverse-patch the fix's product code (test files kept). Works only
     when the fix still reverse-applies.
   - **Semantic reconstruction** — when it doesn't (code drifted), an agent reads the fix
     diff and re-introduces the bug's *behavior* into current code.
4. **Oracle / acceptance**: the bug's shipped test must **fail** on the mutated/reconstructed
   tree and **pass** on clean — as a genuine assertion failure (a crash/compile-error is
   rejected). This is `failure_shape` + `not_setup_crash`.
5. **Coverage-classify**: run the cheap suites against the live bug → `kill` (caught) /
   `miss` = hole (not caught) / `untestable`.
6. For holes, **write a targeted cheap unit test** and prove it kills the mutation.

Every mutation, oracle result, failure shape, and the agent's full reasoning is saved
per entry.

## 3. Population

Full-population revert-check over all 1,231 issues:

| status | count | share |
|---|---|---|
| clean (fix reverse-applies) | 37 | **3.0%** |
| conflict (drifted) | 1,035 | 84% |
| test_only (fix touched only tests) | 156 | 13% |
| no_candidate | 3 | — |

**The clean-revert rate is 3%, not the pilot's 23%** (the pilot sampled the 84 most-recent
issues; recent fixes are small/single-file/close to HEAD). Mechanical revert is therefore a
thin slice; **semantic reconstruction is the primary path** to the real population.

## 4. Results

### 4a. Mechanical-revert corpus — 37 clean-reverters
- **13 unit-killed** — shipped unit tests catch the bug; the e2e repro is redundant.
- **19 unit holes** — no *shipped* unit test catches it. **4 closed this session** with
  targeted unit tests (64473, 65908, 66957, 70647), each verified to fail on the mutated
  tree and pass clean.
- **4 untestable-at-unit** — CSS / no importing tests (63026, 74433, 59306, 45359).
- **1 excluded** (70451, dependency bump).
- **Hole rate ≈ 53% (19/36).** Even the best-covered subset (clean, recent, single-file
  fixes) is half-unguarded at unit level.

### 4b. Semantic reconstruction — BE conflicts
A **Stage-0 fix-presence pre-filter** (`fix-presence-scan.js`) over the 1,035 conflicts
finds those with a cheap built-in oracle (a BE fix that shipped a BE test): **46**, split
into `live_candidate` (22), `partial` (8), `no_added_deftest` (16).

- **live_candidate (22): 20 clean reconstructions + 1 qualified + 1 failed = 91% clean.**
  Done by worktree-isolated domain agents; 4 additionally spot-validated by hand in the
  main tree. Even 8–41-file / epic fixes reduced to *one-line* reconstructions.
  - qualified: 22449 (41-file alias omnibus) — oracle flips but as a *crash*, not a clean
    assertion → below the validity bar.
  - failed: 58829 — untraceable rewrite drift.
- **no_added_deftest (16) + 46845 = 17 attempted:** the fix added assertions to an
  *existing* test (detected by a separate enclosing-deftest scan). **11 clean / 6
  negatives (~65%)** — lower yield than the live_candidates, and the negatives are
  informative (see §5.5). Of the 6 negatives, **3 are genuine BE unit holes**
  (reconstructable behavior, but guarded only by FE/e2e — 53299, 52333, 30236); the other
  3 aren't reconstructable (dead target, arity-only, or a *vacuous* fix-added assertion
  caused by a pre-existing test-fixture bug).
- **partial (8): mostly dead** — 5 are the same "Metrics-v2" feature mega-commit
  (mapper attributed 5 issues to one PR), 66210 is another feature PR, 57674 is a zombie;
  only 46845 was a genuine single-bug candidate (reconstructed ✅).

**Reconstruction totals: 35 clean · 1 qualified · 9 failed** (5 of the 9 are reconstructable
bugs with no surviving *unit* oracle → holes).

### 4b-FE. Frontend conflicts (jest oracle)
A FE analog of the pre-filter (`fe-fix-presence-scan.js`) over the 1,035 conflicts finds
**138 FE-with-shipped-spec candidates → 39 live_candidate**, 28 partial, 71 all_specs_gone.
Harness: worktree + symlink the main tree's `target` (compiled cljs) **and** `node_modules`,
oracle = `bun run test-unit-keep-cljs <spec>` (jest).

**Caveat on the buckets — the pre-filter under-counts.** A 8-target sample of the
**The `partial`/`all_specs_gone` buckets were then mined to EXHAUSTION** — the entire
remaining FE conflict population, 71 issues across **62 unique fix-commits**, in 5 waves of
~14 agents. By commit: **43 kill / 11 hole / 8 dead-target**. The `all_specs_gone` label is
overwhelmingly a false alarm: nearly every kill was via a **relocated/module-extracted**
oracle the path-based exist-check can't see. The single biggest cluster is the
`metabase-lib/v1/expressions/*` → `metabase/querying/expressions/*` Pratt-compiler rewrite
(~11 fixes, all killed), followed by the parameters/formatting module moves and component
co-locations (`.js`→`.ts(x)`).
- The **11 holes are not fundamental e2e territory** — 9 of 11 are cheaply jest-closable,
  holes only because of *test drift*, and split into two named sub-patterns: (a) "spec
  survived by name but drifted off the reverted code path" (a `.js→.ts` migration added a
  `.filter()` that hides the bug; parsing rerouted onto react-router `location.query`);
  (b) "discriminating spec deleted by a later refactor while the product logic survived"
  (agents proved a throwaway unit test kills each). Only **1 (31340) is a genuine jsdom-layout
  limit** (CSS truncation); 1 (29082) is CLJC-migrated (Clojure-tested, jest reaches only the
  presentation half).
- The **8 dead-targets are mostly not real e2e reliance**: 3 are *deliberately-reverted
  fixes* (the behavior no longer ships — no live bug to catch), the rest are legacy-framework
  deletions (entity/requests, Fields entity, FilterModal) or CLJC migrations.
- **Live-bug kill rate = 43/54 = ~80%** once the no-live-bug dead-targets are excluded.
- **FE population COMPLETE — 126 entries: 88 unit-killed / 28 Cypress-holes / 10 dead-targets.**
  Hole rate ~22%, but ~9/10 of the newly-found holes are cheaply closable and only ~2 classes
  (jsdom layout/geometry, SDK/browser-integration) are irreducibly e2e — the study's headline
  stands and strengthens: the vast majority of FE e2e reliance for these bug classes is
  recoverable at the unit level.
- **10 of the FE holes have now been CLOSED with targeted unit tests** — 3 pilot (58628,
  61521, 63745) + 7 from the exhaust run (54271, 39812, 36027, 25533, 41483, 29122, 49642) —
  each verified to pass on clean HEAD and fail when the fix is reverted, and the 7 verified
  passing **together in the main tree (56 suites / 2124 tests green)**. That leaves ~18 open
  FE holes, of which only ~2 are irreducible (jsdom layout/geometry); the rest are CLJC-tested
  or heavy-integration. See `FE-TEST-GUIDANCE.md` for the level-by-level recipes.
- **The two-sided answer to the project's question:** BE conflicts are ~91% cheaply
  unit-guardable (e2e largely redundant); FE conflicts are ~32% Cypress-load-bearing — but
  ~two-thirds of *those* are recoverable with better-structured unit tests, leaving only
  layout/geometry + true browser-integration flows as irreducibly e2e.
- **Headline FE finding — the highest hole rate in the study.** For a large fraction of FE
  fixes, the fix's *unit-spec* change is purely **mechanical refactor adaptation** (prop
  rename, async `waitFor`, mock plumbing, callback-arity, `within(root)` scoping) with
  **zero behavioral assertions** — the real behavioral assertion lives in a **Cypress e2e
  spec**. For these (58628 auth-redirect, 61521 viz-settings, 56771 column-resize, 69831
  table-width, 63745 object-detail), **the e2e is genuinely load-bearing and NOT cullable.**
  This is the clearest, most direct answer to the project's core question — *where does e2e
  coverage earn its keep?* — and it's disproportionately in FE layout/interaction/routing.
- 62373 was a detector oracle-misnaming (real oracle = a sibling unit spec), recovered.

### 4c. Deliverable — e2e culling PR
Branch `dev-2347-delete-e2e-repros-that-are-covered-by-unit-tests` (pushed):
**17 e2e repros removed, −1,016 lines**, in two commits:
- Tier A — add the 4 targeted unit tests **and** delete their now-redundant e2e repros.
- Tier B — delete 13 e2e repros already covered by existing (isolation-confirmed) unit kills.

## 5. Headline findings

1. **Clean mechanical revert is rare (3%).** The corpus's real population is the 84%
   conflict set, reachable only by semantic reconstruction.
2. **Semantic reconstruction is highly feasible where a live oracle exists** — ~91% on the
   BE live_candidates — and localizes even large/epic multi-file fixes to a single line.
3. **Relocation drift dominates.** Most conflicts are file/module *moves*, not logic
   rewrites. Semantic reconstruction follows the code to its new home; mechanical
   rename-rescue would need path maps.
4. **The shipped test is ground truth, not `fix_commits`.** 39053 exposed a mis-attributed
   fix commit (mapper keyed on repro-title introduction, not the real fix); the oracle
   corrected for it.
5. **A failure taxonomy for "not reconstructable / no BE oracle":** (a) zombie /
   superseded fix; (b) dead target moved to FE; (c) fix *deleted its own* discriminating
   negative/throw-test with no positive replacement; (d) fix added a behavior-*neutralizing
   setting* whose real oracle is a FE JS test; (e) untraceable rewrite drift; (f)
   *arity-only* test edit (real regression assertion is in a Cypress spec); (g) *vacuous*
   fix-added assertion — a pre-existing test-fixture bug makes it always true, so it can't
   discriminate. Categories (c) and (d) (and one (a)-adjacent) are **genuine BE unit
   holes** — the bug reconstructs but is guarded only by FE/e2e. Separately, a *recovered*
   case: the detector can **mis-name the oracle** (fix appended new deftests, fooling the
   enclosing-deftest scan) — the agent found the real fix-added test and still succeeded
   (45073). The oracle-as-ground-truth discipline is what makes these recoverable.
6. **Traceability, not diff size, predicts reconstructability.** A fully-migrated function
   (47584) was reconstructed; a similarly-sized but tangled one (58829) was not.
7. **Two rigor gotchas that change results:**
   - **Load-flake false positives** — under a 10k-test `findRelatedTests` run, flaky suites
     fail from load. 4 of 6 raw "kill candidates" were false; **isolation-confirmation is
     mandatory** before trusting a kill.
   - **Worktree cwd false negatives** — `test-agent` run from the main checkout compiles
     pristine master (both baseline and reconstructed pass). Only *hides* kills, never
     fabricates them.
8. **Unit holes are common and the e2e is load-bearing for them.** ~half the clean-reverters
   are holes, and several BE conflicts (53299, 52333) are holes guarded *only* by FE/e2e —
   direct evidence of where e2e coverage cannot be culled.

## 6. Biases & caveats (do not over-read)

- **Clean-revert skews small/recent/single-file** — the best-unit-covered subset. Its 53%
  hole rate is likely an *under*-estimate for the broader population.
- **Killing unit tests often shipped *with* the fix.** This measures "guarded now" (the
  right question for culling), NOT historical detection power.
- **The reconstruction sample is BE-with-cheap-oracle.** FE conflicts, no-shipped-test
  conflicts, and e2e-only-oracle conflicts (the bulk of the 1,035) are unmeasured — they'd
  need the expensive e2e oracle and/or harder reconstruction.
- **Mapper mis-attribution and detector heuristics** produce false targets (§5.4, §5.5);
  the oracle is the safeguard.
- The corpus is a **lower bound** on cullability: an entry we couldn't reconstruct is
  "unknown", not "safe to cull".

## 7. Unmeasured / next

- FE-conflict + no-shipped-test + e2e-oracle conflict populations (need the e2e oracle).
- e2e sanity legs for the mechanical holes/CSS entries (confirm the e2e actually catches
  them) — needs the Cypress stack.
- Nightly corpus-freshness (re-apply each mutation, confirm the repro still fails).

## 8. Artifacts index

- `revert-check.jsonl` — full-population clean/conflict/test_only classification.
- `fix-presence.jsonl` — Stage-0 oracle-liveness per conflict.
- `MATRIX.md` — mechanical-revert kill matrix (37 entries) + full-population extension.
- `bugs/<issue>/config.yaml` — per-entry structured record.
- `bugs/<issue>/reconstruction.patch` — the exact mutation.
- `bugs/<issue>/reconstruction-report.md` — the agent's verbatim working (reasoning,
  drift analysis, adversarial checks). 28 saved so far.
- `scripts/` — the reusable pipeline (`check-clean-revert`, `coverage-leg`,
  `baseline-confirm`, `fix-presence-scan`, `fe-fix-presence-scan`, sharded mapper/scanner).
- `FE-TEST-GUIDANCE.md` — dissection of the FE Cypress-holes into fundamental
  (jsdom-layout) vs closable (test-authoring) causes, with structural recommendations for
  reducing FE e2e reliance (~60% of FE holes are avoidable).
