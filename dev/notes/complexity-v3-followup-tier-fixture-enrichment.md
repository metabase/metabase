# Complexity score v3 follow-up — tier fixture enrichment

## Context

The three tier fixtures (`tier_1_clean_startup`, `tier_2_growing_midsize`,
`tier_3_enterprise_sprawl`) have no `:description` or `:semantic_type` values
on tables / fields / cards. As a result, the metadata-dim assertions in
`tier_fixtures_test.clj` are mostly zero-value noise:

```clj
{:metadata {:variables {:description-coverage       {:value 0.0}
                        :field-description-coverage {:value 0.0}
                        :semantic-type-coverage     {:value 0.0}
                        ...}
            :coverage 0.0}}
```

Zero isn't wrong — the fixtures genuinely don't describe anything — but the
metadata dimension is arguably the most operationally important axis (it
shows what curation looks like) and we're shipping it with no tier fixture
coverage beyond "undefined / none." Any regression where we silently start
returning nil instead of 0, or vice versa, on metadata ratios would not be
caught by the tier tests.

This plan enriches the tier fixtures incrementally so metadata assertions
carry signal at every tier, while keeping the existing nominal/scale/semantic
expectations stable.

Ships as a test-resource change + test-expected-value update. No production
code changes.

## Target shape per tier

The natural narrative of the tier fixtures is:

- **Tier 1** — new instance, curated but small. Metadata should show *some*
  coverage (a clean startup is more likely to curate its small set). Target:
  description-coverage ≈ 0.6, semantic-type-coverage ≈ 0.5.
- **Tier 2** — growing mid-size. Mixed curation — library is curated, the
  ad-hoc analytics tables aren't. Library description-coverage ≈ 0.7, universe
  ≈ 0.3. Semantic-type-coverage similar.
- **Tier 3** — enterprise sprawl. Inverted: library is still well-curated
  but universe is mostly uncurated legacy. Library ≈ 0.8, universe ≈ 0.15.

These numbers aren't sacred — the point is *distinguishable* metadata
signals per tier, so an operator reading `coverage: 0.12` vs. `coverage: 0.72`
across catalogs gets a meaningful reading.

## What to edit per fixture

For each tier:

1. `tables.json` — add `:description` to a subset of tables matching the
   target. A good description is 20+ chars (the threshold in `metadata.clj`)
   so the rows that "count" actually pass the `has-description?` check.
2. `fields.json` — add `:semantic_type` to a subset of fields (use real
   Metabase values: `:type/PK`, `:type/FK`, `:type/Category`,
   `:type/CreationTimestamp`, etc.). Add `:description` to some fields too.
3. `cards.json` — add `:description` to some metric cards.

Keep the existing name/collision/synonym topology unchanged so nominal /
semantic dim expectations don't drift. The enrichment is strictly additive
on metadata-only fields.

## File-level changes

- **Modified**: `test_resources/semantic_layer/tier_1_clean_startup/{tables,fields,cards}.json`
- **Modified**: `test_resources/semantic_layer/tier_2_growing_midsize/{tables,fields,cards}.json`
- **Modified**: `test_resources/semantic_layer/tier_3_enterprise_sprawl/{tables,fields,cards}.json`
- **Modified**: `enterprise/backend/test/metabase_enterprise/semantic_layer/tier_fixtures_test.clj`
  - Extend each tier's expected dimension breakdown to pin the new metadata-dim values.
  - Use `=?` with concrete numeric expectations on at least 3 of the 6
    metadata variables per catalog so a regression is caught without
    over-specifying.
- **Unchanged**: all production code.

## Pinning methodology

After each fixture edit:

1. Run in REPL:
   `(tier-fixtures-test/score-fixture "tier_N_...")`
2. Copy the `:metadata` block from the output into the test expectation.
3. Run test suite; it should go green with the pinned values.
4. Commit per-tier so `git log` shows clearly which tier's expectations
   changed when.

## What *not* to pin

- `:description-quality` — its value is a word-count median and is fragile
  to tiny wording changes in the fixture descriptions. Don't pin; just
  assert it's a positive integer when description-coverage > 0.
- `:coverage` — the dimension-level average. Pin when convenient but don't
  let it be the primary regression anchor; individual variable values are
  sharper signals.
- `:embedding-coverage` — stays 1.0 across tiers (every name has an
  embedding in the fixture `embeddings.json`). Already implicitly covered.

## Optional stretch: negative-polarity test

Add one test case per tier that asserts coverage values are in `[0, 1]`:

```clj
(doseq [tier ["tier_1_clean_startup" "tier_2_growing_midsize" "tier_3_enterprise_sprawl"]
        cat [:library :universe]
        coverage-var [:description-coverage :field-description-coverage
                      :semantic-type-coverage :curated-metric-coverage
                      :embedding-coverage]
        :let [v (get-in (score-fixture tier) [cat :dimensions :metadata :variables coverage-var :value])]
        :when (number? v)]
  (is (<= 0.0 v 1.0)
      (format "%s/%s/%s should be in [0,1]: %s" tier cat coverage-var v)))
```

Catches bugs like the original `embedding-coverage > 1.0` I shipped before
clamping (ratio of embedder-map size to distinct-names, not overlap).

## Verification

1. `./bin/test-agent :only '[metabase-enterprise.semantic-layer.tier-fixtures-test]'` passes.
2. Eyeball a tier-2 universe score: metadata coverage ≈ 0.3, library ≈ 0.7 —
   the narrative "curated library, uncurated warehouse" reads as intended.
3. Compare the *total* before and after enrichment: should be identical.
   Metadata doesn't feed into the aggregate total; if totals drift you've
   accidentally edited a scored field.

## Explicit non-goals

- No new tier fixtures (no `tier_4_*`). This is pure enrichment of the three
  existing ones.
- No change to the `representation.clj` loader. It already reads description
  / semantic_type fields; they just happen to be nil everywhere today.
- No rebalancing of tier names or stories. "Clean startup / growing mid-size
  / enterprise sprawl" stays as is; metadata richness just makes each one
  feel more concrete.
