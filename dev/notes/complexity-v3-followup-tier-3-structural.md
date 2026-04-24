# Complexity score v3 follow-up — tier 3 structural complexity

## Context

v3 shipped with four dimensions (scale, nominal, semantic, metadata) gated by a
tier knob; structural was explicitly deferred because it needs new enumeration
paths (FK graph, Card→Card references) that the scoring module didn't previously
touch. This plan fills that gap.

A clean shallow catalog and one with deep model chaining over a cyclic FK graph
currently produce identical structural readings. The `:structural` dimension
distinguishes them.

Ships at tier 3 (`MB_SEMANTIC_COMPLEXITY_LEVEL=3`). Cost dominator is all-pairs
shortest paths on the join graph — acceptable at tier 3 (opt-in), too expensive
to default on.

## Dimension shape

```clj
:structural {:variables {:join-graph-density         {:value F}
                         :join-graph-components      {:value N}
                         :join-graph-cyclomatic      {:value N :score W}
                         :join-graph-avg-path-length {:value F}
                         :inheritance-depth          {:value N :score W}
                         :collection-tree-depth      {:value N :score W}
                         :collection-tree-breadth    {:value F}
                         :collection-entropy         {:value F}}
             :sub-total W}
```

Scored: cyclomatic number, inheritance depth, collection tree depth. Everything
else is descriptive. Weight picks (first cut, revisit in calibration pass):
`{:join-cycle 20, :inheritance-level 10, :collection-depth-level 5}`.

## Variables

| Variable                    | Source                                              | Cost              |
|-----------------------------|-----------------------------------------------------|-------------------|
| `join-graph-density`        | `E / (V·(V−1)/2)` where V=tables, E=FK edges        | O(V+E)            |
| `join-graph-components`     | Union-find on FK graph                              | O(V+E)            |
| `join-graph-cyclomatic`     | `E − V + C` (independent cycles)                    | O(1) after above  |
| `join-graph-avg-path-length`| Mean shortest-path on largest component; sampled    | O(S·(V+E)) S≈200  |
| `inheritance-depth`         | Longest Card→source-Card chain                      | O(#cards + chain) |
| `collection-tree-depth`     | `max(depth(c))` via `:location`                     | O(C)              |
| `collection-tree-breadth`   | Mean branching factor per non-leaf collection       | O(C)              |
| `collection-entropy`        | Shannon entropy of entities-per-collection          | O(E)              |

## New data enumeration

### Join graph
- Single query: `SELECT table_id, fk_target_field_id FROM metabase_field WHERE active AND fk_target_field_id IS NOT NULL`
- Second query to resolve target Field → target Table:
  `SELECT id, table_id FROM metabase_field WHERE id IN (<ids>)`
- Produces `{source-table → #{target-table ...}}` adjacency.
- Scope-aware: :library restricts V to library tables; :universe uses all.

### Inheritance (model-on-model)
- `Card.dataset_query` is JSON (MBQL or native); for MBQL models the query's
  `:source-table` can be `"card__<ID>"` — that's the parent.
- Enumeration: fetch `[:id :dataset_query]` for all :model Cards, deserialize,
  extract parent pointers, walk to compute max depth.
- Native-SQL models have no parseable source; treat as depth 1 leaves.
- Cache parent-pointer map; reuse across catalogs.

### Collection tree
- Already have `:location` in hand from `universe-collection-count` /
  `library-collection-ids`. Extend to return the full collection rows
  `[:id :location]` so the metrics ns can walk the tree once.

## File-level changes

- **New**: `metrics/structural.clj` — adjacency build (shared with semantic
  graph math? no — different node set; keep a local union-find helper), all
  eight variables as pure functions taking pre-built inputs.
- `complexity.clj`:
  - New enumeration helpers: `fk-adjacency`, `card-parent-map`,
    `collection-tree` (all scope-aware).
  - Extend each `{library,universe,metabot}-catalog` to include
    `{:fk-adjacency ..., :inheritance-map ..., :collection-tree ...}`.
  - `score-catalog`: gate `:structural` behind `(>= level 3)` exactly as
    `:semantic` is gated behind `level ≥ 2`.
- `settings.clj`: bump `max-level` from 2 to 3. Update the defsetting
  docstring to list tier 3.
- `representation.clj`:
  - `fields.json` gains `:fk_target_field_id`.
  - `cards.json` gains `:dataset_query`.
  - `collections.json` already has `:location` — reuse.
  - Loader produces the same `{:fk-adjacency :inheritance-map :collection-tree}`
    keys so offline and live scoring produce identical results.
- `api.clj`: add `StructuralDim` schema under the existing `Dimensions` map
  (optional, like :semantic).
- `cli.clj`: no change — `--level` already accepts up-to-max.

## Avg-path-length specifically

Worst case V=4000 tables; Dijkstra from every vertex is 4000·(V+E)·log(V) ≈
slow for an opt-in tier-3 metric. Mitigation:
- Compute only on the largest component.
- Sample `S = min(|largest|, 200)` source vertices uniformly; run BFS from
  each; mean across reachable pairs.
- Document in the metric ns that the value is a sampled estimate; report
  `:sample-size` in the var map so consumers can see confidence.

## Tests

- `metrics/structural_test.clj` — pure unit tests per variable:
  - Triangle FK graph → density, components=1, cyclomatic=1, avg path ≈ 1.33
  - Two disjoint triangles → components=2, cyclomatic=2
  - Linear chain of 5 → components=1, cyclomatic=0, largest-path=4
  - Inheritance test: Card A → Card B → Card C native → depth=2
  - Collection tree: known location map → depth/breadth/entropy
- `complexity_test.clj`:
  - `level-gating-test`: extend to cover `level=3` enabling `:structural`.
- `tier_fixtures_test.clj`:
  - Bump tier fixtures to include `fk_target_field_id` on a few fields and
    `dataset_query` with a source-card on a few model cards. Re-pin expected
    structural sub-totals per tier.
- New tier fixture might be warranted: "deeply cyclic" tier_4 fixture showing
  what max structural scores look like. Optional.

## Verification

1. `./bin/test-agent :only '[metabase-enterprise.semantic-layer.metrics.structural-test metabase-enterprise.semantic-layer.complexity-test metabase-enterprise.semantic-layer.tier-fixtures-test]'` passes.
2. REPL: `MB_SEMANTIC_COMPLEXITY_LEVEL=3`, call `complexity-scores` against a
   live instance with known FK topology; confirm `:structural` block shape
   and that `join-graph-components` matches hand-counted value.
3. Performance check: time `complexity-scores` on the stats appdb at level 3.
   If avg-path-length dominates (> a few seconds), tune `S` down to 100.

## Open questions before starting

- Do we want Card→Card inheritance to also walk through *native* models
  (depth-1 leaves by default) or to skip native models entirely? Reasonable
  argument either way.
- Should `collection-tree-depth` count the synthetic root (`/`)? Convention:
  no — the root has no semantic weight. Pick and document.
- For scoring weights: the v3 `weights` maps are per-metric-ns. Structural
  dim gets its own `weights` in `metrics/structural.clj`; reuse the scale
  convention (integer weights, published in the ns for discovery).

## Explicit non-goals

- No new pgvector queries — structural operates purely on app-db relations.
- No caching layer beyond the per-call `catalog` map. If this becomes hot
  (e.g., structural scoring runs frequently), add caching as a separate
  follow-up.
