# Regression corpus

Empirical validation for e2e test-suite culling. Each corpus entry is a real historical
bug that can be reintroduced into current master, validated by its original e2e
reproduction test, then used to measure whether cheaper suites (BE/FE unit tests) also
catch it.

## Pipeline (per bug)

1. **Mine**: issue number from e2e test title → fix commit(s) from git history
   (`fix-commits.jsonl`, built by `scripts/map-fix-commits.sh`).
2. **Mutate**: reintroduce the bug on current master. Preferred: inverse patch of the fix
   commit restricted to product code (never test files — the repro test must survive).
   When the inverse patch no longer applies (code moved/rewritten), fall back to a
   *semantic* mutation: reproduce the bug's behavior by hand from the fix diff, and
   record instructions in the config.
3. **Validate (sanity leg)**: the original e2e repro test passes on clean master
   (green baseline) and fails on the mutated tree. Only then is the entry "confirmed".
4. **Measure (coverage leg)**: run candidate cheap suites (BE deftests via
   `./bin/test-agent`, FE jest units) on the mutated tree. Record kill/miss per suite.
5. **Revert** the mutation. Working tree must be clean between entries.

## Kill hygiene

- Green baseline first; count only failures that appear under mutation.
- Discard trivial kills: mutations that break compile/typecheck kill everything.
- Record *which* tests failed, not just suite pass/fail.

## Layout

- `repro-tests.jsonl` — every e2e title referencing an issue:
  `{spec, line, kind, skipped, title, issues[]}`
- `fix-commits.jsonl` — per issue: `{issue, strong[], weak[]}` candidate fix commits.
  `strong` = closing-keyword or `metabase#N` match; `weak` = bare `#N` (may be
  PR-number collisions — verify before use).
- `bugs/<issue>/config.yaml` — the corpus entry (schema below).
- `bugs/<issue>/inverse.patch` — the mutation, when `mutation.kind: patch`.

## Entry schema (`bugs/<issue>/config.yaml`)

```yaml
issue: 32718
issue_url: https://github.com/metabase/metabase/issues/32718
fix_commits: ["<sha>"]
fix_pr: 33042            # if known
area: query-builder      # rough module/area tag
fe_be_boundary: false    # bug spans FE<->BE contract? (report these separately)

mutation:
  kind: patch            # patch | semantic
  patch_file: inverse.patch
  # for kind: semantic — prose instructions for reintroducing the bug:
  notes: null
  base_sha: "<master sha the mutation was validated against>"
  applies_cleanly: true
  breaks_compile: false  # if true, entry is discarded (trivial kill)

validation:
  repro_tests:
    - spec: e2e/test/scenarios/.../foo.cy.spec.js
      title: "issue 32718"
      deleted_in_77163: false   # if true, recover via `git show <sha>:<spec>`
  green_baseline: pass   # pass | fail | untested
  repro_confirmed: true  # e2e test fails on mutated tree

# The observable symptom of the bug. This is the acceptance ORACLE for the
# semantic-reconstruction leg ("repro test fails with the historical failure
# shape") and the guard against false repros (a setup crash / timeout is NOT a
# repro). REQUIRED output of every e2e sanity leg.
failure_shape:
  observed: false        # true once seen on a real mutated-tree run; false = inferred
  source: fix_subject    # observed_e2e | fix_diff | fix_subject | issue  (how we know)
  symptom: >             # user-facing / behavioral symptom of the live bug
    <what goes wrong, e.g. "Save fails with HTTP 500" or "filter pills disappear
    when the object-detail view opens">
  repro_failure: >       # HOW the repro test fails on the mutated tree
    <assertion/step that fails, e.g. "POST /api/dashboard/:id 500" or
    "getByText('Total is less than 50') not found">
  not_setup_crash: null  # true = failure is the bug, not an env/setup crash/timeout
                         #        (only meaningful once observed: true)

coverage:                # kill matrix row — filled by the harness
  be_unit:   {status: untested, killed_by: []}   # kill | miss | untested | trivial
  fe_unit:   {status: untested, killed_by: []}
  notes: null
```

## Running e2e legs locally

Headless, no snapshot regeneration (snapshots must have been generated once before),
single spec:

```bash
CYPRESS_GUI=false GENERATE_SNAPSHOTS=false yarn test-cypress --spec <spec>
```

The runner starts docker containers and (if needed) the backend itself. See the
`e2e-test` skill for details. Note: mutated backend code means the backend must be
rebuilt/restarted per BE mutation — FE-only mutations only need the FE dev build to
pick up the change.
