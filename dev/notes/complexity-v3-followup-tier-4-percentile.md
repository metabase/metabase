# Complexity score v3 follow-up — tier 4 percentile-anchored synonyms

## Context

v3's synonym axis uses a fixed 0.90 cosine threshold calibrated against the
production embedding model (Snowflake Arctic Embed L v2.0). That threshold is
correct for production but problematic for cross-instance comparison: if the
embedding model changes (e.g. migration to MiniLM for STS tasks, or to a larger
Arctic variant), "0.90" means something different and historical scores stop
being comparable.

The percentile-anchored variable is model-invariant by construction: it
samples the instance's own similarity distribution and reports pairs above
the top p% of that distribution. At p=0.1%, the "how many weirdly-similar
name pairs does this catalog have" question is answered in a way that
survives embedder migration.

Ships at tier 4 (new level). Published *alongside* the fixed-threshold pair
count, not instead of it — operators comparing a single instance across time
still want the same threshold; operators comparing instances across different
embedder builds want the percentile view.

## Dimension shape addition

Within the existing `:semantic` block, adds:

```clj
:semantic {:variables {,,,
                       :synonym-pairs-percentile  {:value N
                                                   :threshold F   ; anchored p99.9 similarity
                                                   :percentile 99.9
                                                   :sample-size  M}}}
```

No `:score` on this variable — it's a second view on the same signal.
`:synonym-pairs` (the fixed-threshold one) stays the scored variable.

## Algorithm

1. Build the same `name→vector` map as the tier-2 semantic dim (one invocation
   of the embedder; reuse the existing `embedder-result` fn).
2. Draw M random unordered name pairs from distinct normalized names.
   `M = min(10 000, choose(|V|, 2))`. Sampling is without replacement among
   pair indices using the usual reservoir / rejection approach — not Clojure's
   `shuffle` (that materializes V² pairs which is what we're avoiding).
3. Compute cosine similarity for each sampled pair.
4. Sort similarities; pick the (1 − p/100)-th quantile value. Default p = 0.1
   (top 0.1%, matches Vershynin high-dimensional tail framing).
5. Full O(V²) walk: count pairs whose cosine ≥ that threshold.
6. Report `{:value <count>, :threshold <sim>, :percentile <p>, :sample-size <M>}`.

Cost: dominated by step 5 (same O(V²) as `synonym-pairs`). Step 2-4 adds
O(M log M) which is negligible for M=10 000. So tier 4 is essentially "tier 2
cost + ~constant overhead" — not meaningfully more expensive, just opt-in
because the percentile view needs a deliberate "I want this extra view"
switch.

## File-level changes

- `metrics/semantic.clj`:
  - New private `sample-similarities` producing the cosine distribution.
  - New public `percentile-pair-count` taking `{:name->vec ...}` + `p` →
    `{:value :threshold :percentile :sample-size}`.
  - `score` extended to compute percentile when `level ≥ 4`, attach to
    `:variables`.
- `settings.clj`:
  - Bump `max-level` to 4.
  - Update defsetting docstring to list tier 4.
- `complexity.clj`:
  - `score-catalog`: pass `level` through to `metrics.semantic/score` so the
    namespace can decide (already does); no structural change.
- `api.clj`:
  - Extend `SemanticDim`'s `:variables` map to include the optional
    `:synonym-pairs-percentile` key with a richer sub-schema.

## Determinism / reproducibility

Sampling makes the threshold value vary across runs. Options:

A. Seed the RNG with a hash of the sorted distinct-names vector — same input
   → same threshold. Preferred for dashboards.
B. Document the value as approximate; don't seed.

Go with (A). Write a tiny helper in `metrics/common.clj`:
`(deterministic-rng names) → java.util.Random` keyed on names' hash.

## Tests

- `metrics/semantic_test.clj`:
  - Known distribution: 20 orthogonal names + 3 near-duplicates. Expect the
    percentile threshold to land between the orthogonal-baseline and
    near-dup similarity; pair count to equal 3 (the near-dups).
  - Determinism: two runs with the same input produce the same threshold.
  - Edge case: `|V| < 2` → variable is absent or value=0.
- `tier_fixtures_test.clj`:
  - Don't pin the percentile threshold (it's sample-dependent in spirit).
    Just assert the variable is present and value is `nat-int?` at level 4.

## Verification

1. `./bin/test-agent :only '[metabase-enterprise.semantic-layer.metrics.semantic-test]'` passes.
2. REPL at level 4 on stats appdb: compare `:synonym-pairs` (fixed 0.90)
   count vs. `:synonym-pairs-percentile` count. They should be close when
   the fixed threshold is well-calibrated; divergence tells us the threshold
   drifted from the in-instance distribution.
3. Swap to a different embedder and rerun: `synonym-pairs` moves wildly,
   `synonym-pairs-percentile` stays roughly stable (different thresholds,
   similar counts). That's the whole reason for shipping this.

## Open questions

- Default p: 0.1 (top 0.1%) vs. 0.5 (top 0.5%)? The brainstorm mentioned
  0.1%. Start there; revisit if real-instance counts are too small to be
  useful (fewer than ~10 pairs on most instances → noise dominates).
- Should we also publish the *baseline* distribution summary
  (`:p50 :p90 :p99 :p99_9`) as a sibling descriptor variable? Adds transparency
  at near-zero cost. Lean yes.

## Explicit non-goals

- No re-embedding. The whole point is using existing vectors from the
  search-index embedder. If the embedder isn't available, the percentile
  variable is absent, same as the rest of `:semantic`.
- Not a replacement for the fixed-threshold variable. Both ship.
