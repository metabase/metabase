# Handoff — regression corpus session state (2026-07-08)

Read `README.md` first (pipeline design + entry schema). Memory file
`project_regression_corpus.md` (auto-memory) has the same key facts. This file is the
exact resume point.

## FIRST: crash recovery check

The coverage harness mutates the working tree and restores after each entry. If the
session died mid-entry the tree is left MUTATED. Check:

```bash
git status --porcelain | grep -v '^??'
```

If a product file is modified, find its patch and restore:
```bash
grep -l '<modified file path>' regression-corpus/bugs/*/inverse.patch
git apply regression-corpus/bugs/<issue>/inverse.patch   # forward apply = restore fix
```
(`frontend/src/metabase/visualizer/.../VizSettingsSidebar.tsx` → 61457,
`frontend/src/metabase/dashboard/actions/parameters.tsx` → 64368 — both hit before.)

## UPDATE (session 2): FRONTEND conflict reconstruction started

- `scripts/fe-fix-presence.js` → `fe-fix-presence.jsonl`: over the 1035 conflicts, fixes
  touching FE product (.ts/tsx/js/jsx, non-spec) AND shipping a FE unit spec = **138
  candidates**; **39 live_candidate** (all shipped specs still exist), 28 partial, 71
  all_specs_gone. (~37 fresh after removing BE-overlap like 39053/30236.)
- **FE HARNESS FIX (reusable):** jest in a worktree fails — `node_modules` resolves by
  walking up to the main tree, but the compiled cljs (`target/cljs_dev/`, git-ignored) is
  absent → "Could not locate module cljs/... Configuration error". FIX: from the worktree
  root, `ln -sfn /Users/fraser/Documents/code/metabase/target target` (read-only share of
  the main tree's cljs build; concurrent worktrees reading it is fine). Oracle =
  `bun run test-unit-keep-cljs <spec>` (jest). Same cwd gotcha applies (run from worktree
  root; if baseline AND reconstructed both pass → wrong cwd or missing symlink).
- FE batch-1 DONE (6): **4 unit-killed** (68285 65942 68574 62373) + **2 Cypress-guarded
  FE holes** (69831 63745). Harness worked (worktree + `target`+`node_modules` symlinks +
  jest). 62373 = detector named wrong oracle (designated spec edit was scaffolding; real
  assertion in a SIBLING spec) → re-derived by hand + validated (kill). FE FINDING: the
  two negatives are the FE analog of the BE deletion/neutralizing holes — the fix's
  *unit-spec* change was a mechanical refactor adaptation (prop rename / async waitFor)
  while the real behavioral assertion lives in a **Cypress e2e spec**. So e2e is genuinely
  load-bearing for FE layout/interaction bugs. Remaining FE live_candidates: ~31.
- FE batch-2 DONE (8): **5 kills** (54603 73448 46675 59984 47951) + **3 Cypress holes**
  (58628 61521 56771). FE OVERALL (14): **9 kills / 5 Cypress holes = ~36% hole rate** —
  the highest in the study. FE holes share one shape: the fix's unit-spec edit is
  mechanical (mock/arity/scoping/waitFor, 0 assertions) and the real assertion is a Cypress
  spec → e2e is load-bearing, NOT cullable. Remaining FE live_candidates: ~23.
- FE batch-3 DONE (8): **6 kills** (36788 51925 32963 34129 51020 33379) + 42049
  (dead-target: mechanism removed by #45180) + 51934 (Cypress hole). FE OVERALL (22):
  **15 kills / 6 Cypress-holes / 1 dead-target**. Remaining FE live_candidates: ~15.
- `FE-TEST-GUIDANCE.md` WRITTEN (answers "reduce FE e2e reliance"): 3 of 5 early holes are
  test-authoring gaps (closable now — missing state case / integration not asserted /
  tested-at-wrong-level), 2 are jsdom-layout limits (decision testable, pixels not). Recs:
  extract decision logic into pure fns/hooks; test at container level; cover off-happy-path
  states; split layout-trigger from pixels (mock getBoundingClientRect); types as complement.
  Offered to DEMONSTRATE by writing killing unit tests for the 3 closable holes (58628
  61521 63745) — same "hole -> cheap test" method as the 4 mechanical holes. NOT yet done.
- FE hole-closers DONE (demonstration): 58628 61521 63745 each closed with a targeted jest
  test (thunk / integration-point / container-level), applied to the working tree
  (uncommitted), `hole_closed` in each config, hole-closer-test.patch + report saved.
  FE-TEST-GUIDANCE.md upgraded to "Proven".
- FE recon batch-4 DONE (8): **5 kills** (28834 30680 32037 47757 64340) + 3 holes (43800
  cypress, 40435 fix-deleted-discriminating-test, 57557 cypress). FE OVERALL (30):
  **20 kills / 9 cypress-holes / 1 dead-target (~31% hole rate, steady across 4 batches)**.
  Remaining FE live_candidates: ~5 (69882 57113 54364 43799 40051).
- FE recon batch-5 (final, 5): **3 kills** (69882 54364 43799) + 2 cypress holes (57113
  40051). FE POPULATION EXHAUSTED (all 39 live_candidates done): **35 reconstructed = 23
  kills / 11 cypress-holes / 1 dead-target (~32% hole rate, steady across 5 batches)**.
- CORPUS: 111 entries (37 mechanical + 74 semantic: 54 clean / 1 qualified / 19 failed).
  72 reconstruction-report.md + 7 holes closed with tests (4 mechanical + 3 FE).
  WORKING TREE has 3 uncommitted FE hole-closer test files (deliverables).
- FE `partial`/`all_specs_gone` SAMPLE (8): **6 kills / 2 holes (~75%!)**. Kills 61013
  57381 54799 58231 55678 53595; holes 68819 52627 (both cypress, both closable). KEY:
  `all_specs_gone` is mostly spec RELOCATIONS (.js->.ts, .jsx->.tsx, frontend/test/ ->
  co-located) — the path-based fe-fix-presence exist-check UNDER-COUNTS; agents find the
  relocated oracle. So the reconstructable FE population is much bigger than 39. 53595 =
  relocated-but-assertion-dropped -> agent AUTHORED the discriminating test. 57381 = a
  LAYOUT (width) bug that was unit-killable via an extracted pure util (validates the
  guidance). Remaining in these buckets: ~18 partial (many dups/feature) + ~20
  all_specs_gone (live product) — high expected yield.
- FE `partial`/`all_specs_gone` BATCH-6 (12): **7 kills / 4 cypress-holes / 1 dead-target**.
  Kills 34382 45670 45638 45486 42948 37100 48712 — every one via a RELOCATED oracle the
  path-scan missed (.js->.ts renames, module extraction metabase-lib->metabase, hook refactor
  use-embed-font->use-set-embed-font, spec co-location). 48712 spot-validated in main tree
  (fails, reverts clean). Holes 50630 47097 34954 44637 — all genuine cypress-only (core fix
  in a selector/events with 0 jest coverage; shipped jest edits were flake-fix/mock-rename/
  arity, non-discriminating; verified by empirical over-revert tripping nothing). Dead 46714
  = code path + spec deleted by MBQL migration #50311. Confirms bucket yield holds at ~58%
  kill; the RELOCATION insight keeps paying off. Patches+reports+configs saved per entry.
- CORPUS: 131 entries (37 mechanical + 94 semantic: 67 clean / 1 qualified / 26 failed).
  FE 55: 36 kills / 17 cypress-holes / 2 dead-targets (~31% hole rate, steady across 6 batches).

## EXHAUST RUN (session, "exhaust the rest"): all remaining partial/all_specs_gone mined
- Ran the ENTIRE remaining `partial`+`all_specs_gone` FE population: 71 issues / **62 unique
  fix-commits** (deduped by commit), in 5 waves of ~14 worktree agents. Shared agent brief:
  `regression-corpus/scripts/fe-recon-instructions.md`. Per-entry patch+report+config saved.
- RESULT (by commit): **43 kill / 11 hole / 8 dead-target**. By issue: **52 kill / 11 hole /
  8 dead**. Spot-validated 48712(prev), 55686, 12578 in the main tree (fail on mutant, revert
  clean).
- The `all_specs_gone` label is overwhelmingly a FALSE ALARM: almost every kill was via a
  RELOCATED/module-extracted oracle the path-scan couldn't see. Dominant relocation clusters:
  (a) `metabase-lib/v1/expressions/*` → `metabase/querying/expressions/*` (Pratt-compiler
  rewrite) — 56152 56596 55686 55300 58230 53682 53527 49882 50925 49304 62987 all killed;
  (b) `metabase-lib/v1/parameters/*` / `metabase/lib/*` → `metabase/parameters|querying/*`
  (48524 52484 31662 45255 47570 66277/58556); (c) component co-locations & `.js→.ts(x)`.
- The 11 HOLES are NOT fundamental e2e territory — 9/11 are cheaply jest-closable and were
  only holes due to test drift, not layout. Sub-patterns worth the writeup:
  * "spec survived by NAME but drifted off the reverted code path" — 54271 (a `.js→.ts`
    migration silently added an `is Dayjs` `.filter()` that strips the leaked null before the
    assertion), 41483 (param parsing rerouted onto react-router `location.query`). Closable by
    restoring/adding a direct assertion.
  * "discriminating spec DELETED by a later refactor, product logic survives" — 39812, 36027,
    33208, 25533, 49642. Agent proved a throwaway unit test kills each.
  * Only 31340 is a genuine jsdom-LAYOUT limit (CSS truncation via Ellipsified — only a
    structural proxy is unit-testable); 29082 is CLJC-migrated (real logic in Clojure, jest
    can only cover the FE-presentation half).
- The 8 DEAD-TARGETS split into: legacy-framework deletions (entity/requests: 52411 31905;
  Fields entity: 34414; FilterModal: 54817), CLJC migration (52611 — FE type-checker moved to
  malli, not observable under keep-cljs), and **3 DELIBERATELY-REVERTED fixes** (49323 49577
  via the "FieldValuesWidget rollback to v50" #51183; 10493 via #44535 — the fix no longer
  ships, so there's NO live bug and it shouldn't count against e2e reliance).
- KEY NUMBERS: excluding the 8 dead-targets (no live bug to catch), the live-bug commit kill
  rate is **43/54 = 80%**, holes 11/54 = 20% and ~9/11 of those are cheaply unit-closable.
- CORPUS NOW: **202 entries** (37 mechanical + 165 semantic: 119 clean / 1 qualified / 45 failed).
  FE **126: 88 kills / 28 cypress-holes / 10 dead-targets**. FE hole rate ~22% but nearly all
  closable/non-fundamental; only ~2 (31340 layout, plus SDK/geometry class) are irreducibly e2e.

## HOLE-CLOSERS (session, "do 1"): 7 more cypress-holes closed with unit tests
- Wrote a targeted jest test for each cheaply-closable hole from the exhaust run: **54271
  39812 36027 25533 41483 29122 49642**. Each verified pass-on-clean-HEAD / fail-when-fix-
  reverted (clean value/DOM assertion), then applied to the WORKING TREE as deliverables.
  All 7 verified passing TOGETHER in the main tree: **56 suites / 2124 tests green**.
  Per-entry `hole-closer-test.patch` + `hole-closer-report.md` saved; configs marked
  `fe_unit: hole_closed`.
- Levels used (validates FE-TEST-GUIDANCE): pure-fn (54271 getXValues, 41483 parseHashOptions,
  29122 serializeDateParameterValue), reducer (39812 tablesReducer), settings-pipeline (36027
  getComputedSettingsForSeries), thunk (25533 setParameterValue), container-RTL (49642).
- TOTAL FE HOLES CLOSED THIS PROJECT: **10** (3 pilot 58628/61521/63745 + these 7).
- Working tree now carries 10 uncommitted FE hole-closer spec files (3 pilot + 7) — all
  deliverables, ready to commit; product code untouched (tests only).
- NOT closed (honest residue): 31340 (jsdom layout/CSS), 29082 & 52611 (CLJC — Clojure-tested),
  33208 & 40064 (heavy QB-store mocking / cljs-recompile needed, can't flip under keep-cljs).

## UPDATE (session 2): SEMANTIC-RECONSTRUCTION POC started (the 97% population)

- Mechanism VALIDATED end-to-end on 1 conflict (55687, "allow strings to isEmpty"):
  fix does NOT revert cleanly (schema.cljc drifted → registry `mr/def ::Emptyable`), but
  the bug was reconstructed by hand into current code (point is-empty/not-empty defclauses
  back at `[:ref ::FieldOrExpressionRef]`), and the SHIPPED BE test
  `emptyable-filter-test` is the oracle: passes 10/10 at HEAD, fails the 6 string cases on
  the reconstructed tree (right shape, not a crash). Restored clean.
- New schema for conflict entries: `mutation.kind: semantic` + `reconstruction.patch`
  (the by-hand mutation; base_sha-pinned) + `validation.oracle: {kind, test}` (use the
  cheapest oracle — a BE/unit test shipped WITH the fix beats standing up e2e).
- POC target selection: `revert-check.jsonl` status=conflict + product_files<=2, filtered
  to BE (.clj/.cljc) fixes that ALSO shipped a BE test = built-in oracle, no e2e stack.
  Found: 55687 (DONE), 57674 (conditional.cljc case/coalesce validation), 58829
  (resolve_joins.clj default fields). 68998 is e2e-only (no BE test) → needs stack.
- CAVEAT: 55687 was an EASY conflict (trivial 2-line semantic inverse). Real failure
  modes will surface on HARD conflicts (big drift, non-obvious semantics) — next.
- Serial only: these are widely-loaded core files; simultaneous reconstructions can
  cross-contaminate compilation. Restore via `git checkout -- <file>` (narrow, safe).

### Reconstruction BATCH 1 (5 targets, worktree-isolated subagents): 4/5 succeeded
- Method: one worktree-isolated agent per target (domain experts for lib/QP), each reads
  the fix diff, reconstructs the bug into current drifted code, validates the shipped
  oracle test flips (fail reconstructed / pass clean, as an assertion failure not a
  compile error), and does an adversarial self-check. Main tree never touched.
- SUCCESS (entry + reconstruction.patch + confidence): 35561 (fk-filter null guard,
  very_high), 38111 (types :Structured->:Text derive, high; file RELOCATED
  types.cljc->types/core.cljc), 67680 (HARD 3-file; localized to model-preserved-keys,
  very_high — best adversarial reasoning), 32126 (dashboard param-values fallback, high;
  file RELOCATED api/dashboard.clj->parameters/dashboard.clj).
- FAILURE (honest negative): 58829 — `join-field-refs` was FULLY REWRITTEN since the fix
  (rewrite-class drift); semantic mapping non-obvious, agent STALLED in REPL archaeology.
  Recorded status: reconstruction_failed rather than fabricate a plausible-but-wrong bug.
- KEY FINDINGS: (1) domain agents reliably localize the real change even in multi-file
  fixes and reason candidly about faithfulness (trust question looks tractable). (2) Most
  conflicts in this batch were SMALL fixes under HEAVY drift — 2/5 were pure file
  RELOCATIONS (module extraction), which semantic reconstruction handles naturally (agent
  follows the code) where mechanical rename-rescue needs path maps. (3) The one failure was
  REWRITE-class drift (function reimplemented) — that's the hard tail; flag such targets
  for a REPL-equipped retry or drop. (4) `failure_shape observed=true` now backed by a
  real reconstructed unit failure for each success.

### Reconstruction BATCH 2 (8 targets, worktree agents): 8/8 SUCCEEDED
- Targets: 47584 39053 62053 24223 31926 47172 61010 24018 — all reconstructed +
  oracle-validated, entries written (`kind: semantic` + reconstruction.patch). 31926
  ALSO spot-validated by me in the MAIN tree (patch → 1 fail / restore → 0). All patches
  captured with `git -C <worktree> diff` (apply cleanly to master).
- Running total across POC+B1+B2: **13 reconstructed / 14 attempted** live-BE conflicts
  (only 58829 failed — rewrite drift, stalled). ~93% on the cheap-oracle BE population.
- NEW FINDINGS:
  1. RELOCATION drift dominates (5–6 of 8 were pure file/module moves, e.g. api/search.clj
     ->search/impl.clj, pulse/parameters.clj->parameters/shared.cljc, models/user.clj->
     users/settings.clj). Semantic reconstruction follows the code; mechanical rename-rescue
     would need path maps.
  2. FIX MIS-ATTRIBUTION (39053): the mapper's fix_commit was WRONG — it keys on the commit
     that introduced the repro-test title (#38986, which only added the setting), not the
     real behavioral fix (#39269). The shipped-test oracle corrected for it. Implication:
     don't trust fix_commits blindly for conflicts; the oracle is the ground truth.
  3. Rewrite/migration drift is NOT uniformly fatal: 47584 (annotate-native-cols fully
     migrated into Lib) succeeded by TRACING the migration; 58829 failed only because the
     mapping was too tangled to trace in time. **Traceability, not diff size, predicts
     reconstructability.**
  4. **WORKTREE CWD GOTCHA (critical for scaling BE validation):** `./bin/test-agent` must
     be run with cwd = the worktree root. Run from the main checkout it compiles pristine
     master -> baseline AND reconstructed both pass -> FALSE NEGATIVE (missed kill). This
     is why 47172 thrashed (200 tool calls). Note: this gotcha only hides kills, never
     fabricates them, so all reported reconstructed-FAILs are trustworthy.
### Reconstruction BATCH 3 (4 medium targets): 4/4 SUCCEEDED
- 21528 34278 41056 44231 — all reconstructed + oracle-validated, entries written;
  41056 also spot-validated in the MAIN tree. cwd-gotcha instruction added to prompts →
  no thrash this time (41056 agent explicitly `pwd`-verified the worktree).
- Highlights: 21528/44231 were relocations again; 34278 heavy drift (fn→dispatcher since
  2023) localized cleanly; 44231 agent hand-PREDICTED the exact corrupted output before
  running (matched verbatim). Confidences very_high/high.
- **RUNNING TOTAL: 17 reconstructed / 18 attempted (94%)**. Only 58829 failed
  (untraceable rewrite drift). All entries: `kind: semantic` + reconstruction.patch.
### Reconstruction BATCH 4 (4 large/epic targets): 3 clean + 1 qualified
- 53556 ✅ (8-file fix → ONE-line sentinel forcing source-card-is-model? false;
  spot-validated), 47184 ✅ (epic; agent PIVOTED to a still-undrifted oracle — the
  migration helper — dropped `(inc i)`), 41635 ✅ (the "fix" ADDED an endpoint → delete
  it → 404). All localized brilliantly (large fix → 1-line change) + entries written.
- 22449 ⚠️ QUALIFIED/IMPURE (41-file alias omnibus): agent localized to aggregation-name
  in the DRIFTED sql_mbql5.clj copy; oracle flips causally BUT as a thrown :error (crash),
  not a clean assertion :fail, and reintroduces a crash not the original wrong-alias
  behavior. Fails our validity bar (not_setup_crash / must be assertion). Recorded
  status: qualified_impure, repro_confirmed: false. Model of honest self-classification.
- Findings: even huge multi-file fixes localize to 1-line reconstructions when ONE oracle
  is picked; in epics some oracle tests have drifted beyond reach while others stay clean
  (pick the localizable one); the omnibus/refactor tail (22449) is where drift finally
  makes a clean reconstruction unreachable.

### LIVE-BE SEMANTIC RECONSTRUCTION POPULATION COMPLETE (all 22 live_candidates)
- **20 clean reconstructions / 22 attempted (91%)** + 1 qualified-impure (22449) + 1
  failed (58829). Every live-BE conflict with a cheap oracle has been processed.
- Clean: 55687 35561 38111 67680 32126 47584 39053 62053 24223 31926 47172 61010 24018
  21528 34278 41056 44231 53556 47184 41635. All `kind: semantic` + reconstruction.patch;
  4 spot-validated by me in the main tree; the rest oracle-validated in worktrees.
- NEXT populations (all need design): (a) the 8 `partial` fix-presence entries (suspect,
  incl 57674 zombie); (b) the 16 `no_added_deftest` conflicts (fix edited existing tests →
  needs a different oracle signal); (c) FE conflicts + no-shipped-test + e2e-only-oracle
  conflicts = the bulk of the 1035, needing the expensive e2e oracle and/or harder recon.

### FULL WORKING SAVED (`bugs/<issue>/reconstruction-report.md`)
- Every reconstruction now has its agent's VERBATIM final report saved (28 so far: all of
  b1–b4 backfilled + batch-5 wave-1, successes AND negatives). Extracted from the on-disk
  task transcripts via a script (`node` reading tasks/<agentId>.output, last assistant
  message) — zero-token, exact. config.yaml points to it via `report_file`. This is the
  "show our working" evidence for the eventual FINDINGS writeup (not yet drafted).

### Reconstruction BATCH 5 = no_added_deftest bucket (fix modified existing tests)
- Oracle detector (`fix-presence-scan.js` only saw NEW deftests) enhanced by a separate
  scan that finds the ENCLOSING deftest of the fix's test-file changes (the "modified
  deftest" = oracle). But it's HEURISTIC with false positives.
- Wave 1 (8): **4 clean (52236, 47887, 49142, 49305) / 4 negatives** = ~50% yield, MUCH
  lower than live_candidate batches (91%). The negatives fall into 4 distinct categories
  (this taxonomy is a headline finding):
  1. `arity_only_cypress` (65533) — fix's test hunk was arity-only (0 assertions); real
     oracle is a Cypress spec. No BE oracle.
  2. `dead_target__moved_to_frontend` (45252) — product file deleted, feature moved to FE
     TS; oracle rewritten to drop the assertions. Nothing to revert.
  3. `no_be_oracle__fix_deleted_its_throw_test` (53299) — bug IS reconstructable (REPL-
     verified) but the fix DELETED its discriminating throw-test instead of converting it
     to a positive assertion → no surviving BE assertion. **A genuine BE unit HOLE.**
  4. `no_be_oracle__neutralizing_setting_fe_oracle` (52333) — fix patched BE tests by
     ADDING a behavior-neutralizing SETTING, not an assertion; real oracle is a FE JS test.
     Bug reconstructable but **BE unit HOLE; FE/e2e guarded.**
  Successes: 49305 was the standout — the NAMED product file was vestigial (revert = no
  effect); behavior + oracle both relocated; agent found the real locus empirically.
- IMPLICATION: the no_added_deftest bucket is lower-yield AND surfaces genuine unit holes
  (the fix's regression is only guarded by FE/e2e, not BE).
- Wave 2 DONE (9: 45073 45063 32121 30236 30235 22473 8490 5816 46845): **7 clean / 2
  negatives** (30236 = deleted-negative-test HOLE; 22473 = vacuous fix-added assertion via
  a pre-existing test-fixture cascade-delete bug). 45073 = detector mis-named the oracle
  (fix appended NEW deftests) but agent found the real one → success. 46845 (partial
  bucket) also ✅. Two more "named product file is inert/vestigial, real fix elsewhere"
  cases (46845 schema.cljc, 49305 legacy schema).
- BATCH-5 TOTAL (17): **11 clean / 6 negatives (~65%)**; 3 of the 6 are reconstructable
  BE holes (53299 52333 30236). All patches + configs + verbatim reconstruction-report.md
  saved. Worktrees cleaned; main tree clean.
- CORPUS NOW: 76 entries (37 mechanical + 39 semantic: 31 clean / 1 qualified / 7 failed).
  FINDINGS.md written (presentation-ready). 37 reconstruction-report.md saved.

### Stage-0 fix-presence pre-filter BUILT + RUN (`scripts/fix-presence-scan.js`)
- Necessitated by the 57674 zombie: NOT every fix is still live in the tree. Pre-filter
  checks whether the fix's shipped deftests still exist (Level 1, grep) and pass on clean
  HEAD (Level 2, one batched test-agent run). Output: `regression-corpus/fix-presence.jsonl`.
- Sized the cheap-oracle reconstructable population over all 1035 conflicts:
  - 46 conflicts are BE-fix-with-shipped-test (built-in cheap oracle, no e2e stack).
  - **22 live_candidate → ALL 22 CONFIRMED GREEN** (Level 2: 63 tests / 191 assertions /
    0 failures on HEAD). These are the ready worklist for semantic reconstruction:
    21528 22449 24018 24223 31926 32126 34278 35561 38111 39053 41056 41635 44231 47172
    47184 47584 53556 55687 58829 61010 62053 67680. (55687 already reconstructed ✓;
    58829 green-confirmed.)
  - 8 partial (fix partially superseded — suspect; 57674 here), 16 no_added_deftest
    (fix edited existing tests → needs a different oracle signal).
- Classifier validated: 55687 + 58829 (known-valid) both landed in live_candidate; the
  57674 zombie landed in partial. Base rate: only ~half of even the cheap-oracle conflicts
  have a fully-live fix — zombie/partial filtering is mandatory before reconstruction.
- Scope caveat: these 22 are the tractable beachhead (BE + cheap oracle + live fix). The
  bulk of the 1035 (FE conflicts, no shipped test, e2e-only oracle) still need the
  expensive e2e oracle and/or harder reconstruction — that's the next design fork.

## UPDATE (session 2, same day): FULL-POPULATION revert scan + 18 new entries

- **Clean-revert rate over ALL 1231 issues = 3.0%**, NOT the pilot's 23%. Breakdown:
  37 clean / 1035 conflict (84%) / 156 test_only (13%) / 3 no_candidate. The pilot's
  23% was pure recency bias (recent fixes are small/single-file/close to HEAD). Takeaway:
  mechanical revert is a SMALL slice; semantic reconstruction is essential for the ~97%,
  not optional. (test_only=156 may be partly recoverable with better fix-commit mapping —
  the mapper picks the repro-test-introducing commit, which for older bugs is often a
  separate test-only commit, not the product fix.)
- **18 new clean-reverter entries materialized** (corpus now 37 total): 5334 33084 34226
  35009 42723 44499 45359 46177 46372 47005 49319 55484 55673 56839 56905 56913 57685
  59306. All applies_cleanly=true, all have repro_tests. NOT yet coverage-classified
  (Stage 3) or repro-confirmed. Flags: 34226 & 35009 share the SAME fix commit (#37669
  closed both) → identical patch; 45359 subject is e2e test-infra ("Incorrect font in e2e
  tests") → verify it's a real product fix before trusting.
- **Parallelized Stage 1** (git/CPU-bound, so worker processes not LLM agents): sharded
  mapper `map-fix-commits-shard.sh` (10×, `issue % N`) + sharded scanner
  `check-clean-revert-shard.sh` (10×, read-only) orchestrated by `full-revert-scan.sh`
  (waits for mapper → fans out scan shards → merges → summarizes). Cut Stage 1 from
  ~55min to ~5min. `revert-check.jsonl` is now full-population; pilot preserved in
  `revert-check.head84.jsonl`. Bug fixed: shard subject escaping now handles backslashes
  (a conflict-entry subject `question\ ` had crashed the merge; merge is now skip-and-warn).
- **Stage 3 DONE** — coverage-classified all 18 + isolation-baseline-confirmed:
  **2 kills** (5334 FE+BE pie drill-through; 56839 FE FK-dropdown), **14 misses/holes**,
  **2 untestable-at-unit** (45359 `.stores.tsx` no-tests + e2e-infra subject; 59306
  `.module.css`). CRITICAL lesson: raw `findRelatedTests` gave 6 kill-candidates but 4
  (42723,44499,47005,49319) were **load-flakes** — heavy 9.8k–11.4k-test parallel runs
  fail flaky suites (FormDateInput, DataModel, etc.) that pass in isolation. New script
  `baseline-confirm.sh` isolates each candidate's non-flaky failing files on the mutated
  tree to confirm deterministically. ALWAYS isolation-confirm before trusting a kill.
  Results written to each config `coverage` block; full 37-entry rollup in MATRIX.
  Corpus-wide: 13 kill / 19 hole (4 closed) / 4 untestable / 1 excluded; hole rate ≈53%.

## UPDATE (session 2, same day): first hole CLOSED + patch direction pinned

- **Patch direction (pinned, matches `coverage-leg.sh`):** MUTATE = `git apply -R
  inverse.patch`; RESTORE = `git apply inverse.patch`. (Forward-apply = restore fix,
  as the crash-recovery note below already says.) Do NOT forward-apply to mutate — it
  fails "patch does not apply" because HEAD already has the fix.
- **66957 hole CLOSED** by a targeted unit test (step 2 deliverable). Added to
  `ViewTitleHeader.unit.spec.tsx`; verified kill (-R mutate → FAIL with filter pills
  absent = original issue shape; forward restore → PASS). Recorded in
  `bugs/66957/config.yaml` `hole_closed` + MATRIX note ¹. Chosen first because it had
  existing scaffolding (setup accepts isObjectDetail/queryBuilderMode) — cheapest hole.
  Note: the type-safe kill MUST go through ViewTitleHeader (integration), NOT a direct
  `shouldRender` test — on clean, shouldRender no longer accepts isObjectDetail, so a
  direct call can't distinguish clean from mutated in a way that type-checks.
- **3 more holes CLOSED (session 2, via parallel subagents)** — 64473, 65908, 70647.
  Each subagent authored a colocated unit test + confirmed pass-on-clean (NO git ops —
  I kept all mutate/restore to myself); I then kill-verified all three serially on the
  shared tree (`-R` mutate → FAIL, forward restore → PASS). All recorded in their
  `config.yaml` (`hole_closed` + `failure_shape` observed=true/observed_unit). So **4/5
  unit holes now closed** (64473, 65908, 66957, 70647). Test files:
    - 70647 → `enterprise/.../table-editing/inputs/TableActionInputDate.unit.spec.tsx` (NEW)
    - 65908 → `frontend/.../dashboard/components/grid/GridLayout.unit.spec.tsx` (extended)
    - 64473 → `frontend/.../QueryEditor/QueryEditorVisualization/QueryEditorVisualization.unit.spec.tsx` (NEW)
  Subagent-parallelism lesson: safe because subagents only WROTE tests + ran them on the
  clean tree; the tree-mutating kill-check must stay serial + single-owner.
- **67903 left OPEN** — CSS-adjacent (`contain: strict`); only a className-presence test
  is possible (weak). Reclassify with the CSS-only entries (63026, 74433); keep e2e.
- Shared-tree gotcha (cost a retry): the Bash tool shell is **zsh**, which does NOT
  word-split unquoted `$vars` in `for x in $LIST`. Iterate over literals or a real array.
- `coverage-leg.sh` HARDENED (step 3 done): EXIT trap force-restores the in-flight patch
  (tested via simulated mid-mutation death → tree self-healed); records
  `fe_failed/fe_total` + `be_failed/be_total` (jest + clojure summary parsing).
- **New schema field `failure_shape`** (documented in README): observed symptom +
  how the repro test fails + `not_setup_crash` discriminator. This is the acceptance
  ORACLE for the semantic-reconstruction leg and the guard against false repros.
  Backfilled observed=true for 66670 (e2e) and 66957 (unit). Inferred stubs
  (observed=false, source=fix_diff) added for 64473/65908/67903/70647/63026/74433 —
  each e2e sanity leg MUST flip observed→true and set not_setup_crash. 67903/63026/74433
  flagged CSS-adjacent (weak e2e signal; likely reclassify as CSS-untestable).
- Mapper: still running, ~756/1231.
- e2e stack was fully COLD this session (Docker/BE/:8080 all down); e2e legs NOT run —
  deferred as the token-expensive path. Sample-instance json present (78k, intact).

## UPDATE (later same day): coverage leg COMPLETE

Steps 1–2 of "Next steps" are done — see `MATRIX.md` for the confirmed kill matrix
(11 unit kills, 5 genuine holes, 2 CSS-untestable; all baselines run; flaky suites
FormDateInput + SmartScalar/compute discounted). Per-entry results are in each
`bugs/<issue>/config.yaml` coverage block. Remaining: e2e legs for misses/CSS entries,
targeted tests for holes, semantic-reconstruction leg, mapper still running.

## What is done

- `repro-tests.jsonl`: all 1,915 issue-referencing e2e titles; 1,231 unique issues.
- `fix-commits.jsonl`: issue → fix-commit candidates, ~407+/1,231 done (recent-first).
  Resume: `./regression-corpus/scripts/map-fix-commits.sh` (skips mapped issues; safe to
  rerun anytime; ~2.5 issues/min).
- `revert-check.jsonl` (84 most recent issues): 19 clean / 62 conflict / 3 test-only.
  `threeway-check.jsonl`: only 3 conflicts rescued by 3-way. `fail-kinds.jsonl`: of 62
  conflicts — 15 missing-file only (renames, rescuable by path rewrite), 33 context, 14
  both. Conclusion: mechanical revert ceiling ~35–45% even for recent bugs; semantic
  (agent) reconstruction from fix diff is the primary path for the rest. NOT built yet.
- 19 corpus entries in `bugs/<issue>/` (config.yaml + inverse.patch).
  - 70451 = dependency bump, tagged excluded.
  - **66670 = fully validated end-to-end** (see its config.yaml): e2e repro green on
    clean, fails with 500-on-save on mutated tree; BE kill by 2 deftests in
    `metabase.revisions.impl.dashboard-test`, clean baseline green.
- Coverage batch (`scripts/coverage-leg.sh`) results so far in `coverage-results.jsonl`
  (fe_exit=1 → jest related-tests FAILED on mutated tree = candidate kill):
  61457 kill, 63026 no-files-classified (patch touches files outside fe/be regex —
  inspect), 63416 kill, 63537 kill. Remaining 13 were running when session ended:
  `./regression-corpus/scripts/coverage-leg.sh 64368 64473 65908 66742 66957 67903 69160 70311 70647 71488 74433 74461 76710`
  (safe to rerun — but check crash recovery FIRST; it appends to coverage-results.jsonl,
  so drop already-done issues from the arg list).
  Full logs per entry: `logs/<issue>-{fe,be}.log`.

## Next steps (in order)

1. Finish the coverage batch (command above, minus completed issues).
2. **Baseline-confirm every jest kill**: from `logs/<issue>-fe.log` take the failing
   test files, re-run them on the CLEAN tree (`npx jest <test files>`); only if green is
   the kill real. Then update each `bugs/<issue>/config.yaml` coverage block
   (status kill/miss, killed_by list, clean_baseline).
3. Inspect 63026 (`grep '^diff --git' bugs/63026/inverse.patch`) — classifier skipped
   its files; decide the right suite manually.
4. BE entries: 70311 + 74461 touch cljc — jest leg needs `bun run build:cljs` after
   mutation to be meaningful (currently only the BE leg is valid for them).
5. Misses (any entry where no suite kills) → these are the deliverable: holes list with
   named evidence. Write targeted cheap tests or flag for e2e retention.
6. One FE-side e2e validation (66670 was BE-side): apply an FE entry's patch, dev server
   hot-reloads it, run its spec (see e2e commands below), expect fail, revert.
7. Harden `coverage-leg.sh`: add `trap` to restore the in-flight patch on exit/crash.
8. Report: mini kill-matrix table (bug × {e2e, be_unit, fe_unit}) from
   coverage-results.jsonl + config.yamls.

## e2e harness — hard-won facts (cost hours; do not relearn)

- Requires: Docker daemon up; FE dev server on :8080 (`bun run build-hot`, background,
  ~5 min) — WITHOUT it tests fail with misleading errors (401s, cy.wait timeouts) because
  the backend serves a stale static FE.
- Snapshots: regenerate by running WITHOUT `GREP` set (GREP leaks into the snapshot pass
  → 0 tests run → `e2e/support/cypress_sample_instance_data.json` gets deleted and never
  recreated → later runs fail with esbuild "Could not resolve ...json" or instant eval
  SyntaxError). If that json is missing, run once with any small spec and no GREP.
- Normal run:
  `MB_EDITION=oss CYPRESS_VIDEO=false CYPRESS_RETRIES=0 CYPRESS_GUI=false GENERATE_SNAPSHOTS=false GREP="<issue>" bun test-cypress --spec <spec>`
- No EE tokens in env → always `MB_EDITION=oss`.
- Backend (from source, :4000) hot-reloads Clojure per request → BE mutations need NO
  restart (validated, 12s cycle). Kill stale backend between sessions:
  `lsof -ti :4000 | xargs kill` (BindException races otherwise).
- BE tests: `./bin/test-agent :only '[ns/test-name ...]'` or `:module <m>` — never
  `clj -X:dev:test`.

## Open design threads

- Semantic-reconstruction leg for the ~75% conflicted reverts (agent reads fix diff,
  reapplies bug to current code; validate with the same e2e-fails/green-baseline loop).
- Rename-rescue for the 15 missing-file-only conflicts (rewrite patch paths via
  `git log --follow`).
- CI fan-out: NOT needed for targeted legs; becomes right at the hole-leg stage
  (full-suite-vs-bug sampling) and for a nightly corpus-freshness job (apply each patch,
  confirm repro test still fails). Amortize warmup: one runner processes many bugs.
- Known biases to report alongside results: corpus skews to clean-revert (small, recent,
  well-covered fixes); killing unit tests often shipped with the fix commit — right
  measurement for culling ("guarded now"), but do not read kill-rate as historical
  detection power.
