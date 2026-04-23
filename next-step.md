# Next step — align emitter with `data_complexity` 1-0-0 schema

## Goal

This branch (`bot-1306-more-measures`) regressed the Snowplow event shape
during the 5-dimension rewrite. The base branch's `data_complexity`
schema at `1-0-0` is the source of truth and must not change. This
branch's emitter needs to match it. No downstack changes required —
earlier branches still emit the correct shape from the base-branch
emitter. We're just fixing the regression on this tip.

The shape contract (from
`snowplow/iglu-client-embedded/schemas/com.metabase/data_complexity/jsonschema/1-0-0`):

- Event name: `data_complexity_scoring`
- Required top-level: `event`, `catalog`, `key`, `score` (nullable),
  `formula_version`, `parameters`
- Optional top-level: `measurement`, `error` (maxLength 1024)
- `parameters` is a free-form object. Per user direction:
  - `level` → inside `parameters`
  - `synonym_threshold` → inside `parameters`
  - `embedding_model_provider` / `embedding_model_name` → inside `parameters`
- `key` values:
  - `"total"` — catalog grand total
  - `"<dimension>.<variable>"` — per-leaf (e.g. `"nominal.name_collisions"`,
    `"semantic.synonym_pairs"`, `"scale.entity_count"`)

## State of the working tree (as of pausing)

### Branch position

- Local HEAD: `2694a198772 Truncate long error messages in complexity emission`
- Origin is 1 commit *ahead*: `ab06c45378f Collapse data_complexity
  2-0-0 schema into 1-0-0`. I soft-reset that locally because it took
  the wrong direction (5-dim shape inside 1-0-0). When we next push,
  `gs ss` will force-push to replace it.

### Staged changes (safe — still needed)

- `src/metabase/analytics/snowplow.clj` — registry pointer
  `:snowplow/data_complexity` reverted from `"2-0-0"` to `"1-0-0"`.
- `snowplow/iglu-client-embedded/schemas/com.metabase/data_complexity/jsonschema/2-0-0`
  — deleted (never should have existed; unreleased).
- `enterprise/backend/test/metabase_enterprise/data_complexity_score/complexity_test.clj`
  — partial: test helper renames (`semantic-complexity-schema` →
  `data-complexity-schema`), schema path refs
  (`semantic_complexity/2-0-0` → `data_complexity/1-0-0`),
  `emit-snowplow-schema-2-0-0-payload-shape-test` → dropped the
  `-2-0-0`. These stagings are from the earlier commit I soft-reset and
  are still correct.

### Unstaged (in-progress rewrites)

- `enterprise/backend/src/metabase_enterprise/data_complexity_score/complexity.clj`
  — rewrote `emit-catalog-snowplow!` and `emit-snowplow!`. New helpers:
  `dotted-key` (produces `"total"` or `"<dim>.<var>"`) and
  `parameters-map` (sorted map of string-keyed level / synonym_threshold
  / embedding_model_*). `truncate-error` + `max-error-length` preserved.
- `enterprise/backend/test/metabase_enterprise/data_complexity_score/complexity_test.clj`
  — rewrote 4 of 5 emission tests:
  - `complexity-events!` filters on `data_complexity_scoring`
  - `emit-snowplow-publishes-totals-and-variables-test` — asserts
    `key=total` per catalog and dotted `<dim>.<var>` on leaves; reads
    `parameters.level`
  - `emit-snowplow-includes-measurement-test` — switched to `by-key`
    with fully-qualified keys (`scale.entity_count`,
    `scale.field_count`, `nominal.name_collisions`)
  - `emit-snowplow-propagates-error-on-embedder-failure-test` — filters
    on `key = "semantic.synonym_pairs"`
  - `emit-snowplow-truncates-error-to-schema-max-test` — same
  - `emit-snowplow-schema-payload-shape-test` — rebuilt to check 1-0-0
    shape: every event has `parameters.level`, `score` is required
    (nullable), level-2 events carry `parameters.synonym_threshold`,
    descriptive leaves have `score=nil` + `measurement`, scored leaves
    have integer score, etc.

## Remaining work

1. **`emit-snowplow-includes-embedding-model-meta-test` — not yet
   touched.** Currently reads `embedding_model_provider` /
   `embedding_model_name` from the top-level event map. Must change to
   read from `parameters`:
   ```clj
   (is (every? #(= "openai" (get-in % ["parameters" "embedding_model_provider"])) events))
   (is (every? #(= "text-embedding-3-small" (get-in % ["parameters" "embedding_model_name"])) events))
   ```
2. **Straggler hunt.** Grep for leftovers across the branch:
   - `:data_complexity_scored` (the wrong event name — I may have
     missed one)
   - `:axis` / `:dimension` as event fields outside the metrics
     namespaces (metrics code still uses these internally — that's
     fine, they just must not leak into Snowplow payloads)
   - top-level `:level` / `:synonym_threshold` /
     `:embedding_model_provider` / `:embedding_model_name` in any
     analytics/Snowplow code
3. **Run the tests.** `./bin/test-agent :only '[metabase-enterprise.data-complexity-score.complexity-test]'`
   — all emission tests should pass. Also run the wider ns to catch
   anything else that assumed the 5-dim event shape.
4. **Commit.** One coherent commit replacing the reverted
   `ab06c45378f`. Suggested message:
   > Align `data_complexity` emitter with 1-0-0 schema
   >
   > The 5-dimension rewrite diverged from the base-branch's
   > `data_complexity/1-0-0` event shape (top-level `axis`/`dimension`/
   > `level`/`synonym_threshold`/`embedding_model_*`, wrong event name).
   > Nothing was released, so rather than bump the schema we collapse
   > back to 1-0-0: `key` identifies the slice (`"total"` or
   > `"<dimension>.<variable>"`), and `parameters` carries level /
   > synonym_threshold / embedding_model_*. Deletes the stub 2-0-0
   > schema, retargets the registry, and fixes the test helpers.
5. **`gs sr && gs ss`.** Will force-push #73028 to replace the
   soft-reset commit.

## Why this matters downstack

The user flagged: *"we just need to make sure the later branches don't
regress on the shape of the events."* Earlier branches in the stack
(`bot-1306-data-complexity-score` → `bot-1306-complexity-score-cli` →
`bot-1344-complexity-tier-fixtures` → `bot-1344-complexity-analysis` →
`bot-1306-minilm-synonym-axis`) all use the v1 emitter, which already
produces the 1-0-0 shape. The only regression is on this tip branch.
No downstack PRs need updating for this change.

## Context: prior planning doc

`notes-to-continue.md` (different file, from an earlier session) is
about auditing 12 base-side hardening commits for what got dropped in
the 5-dim rewrite. That audit is unrelated to this emitter-shape fix
but overlaps the same branch — worth looking at together when you come
back.
