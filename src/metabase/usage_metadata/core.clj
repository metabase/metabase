(ns metabase.usage-metadata.core
  "Public API for usage-metadata rollups."
  (:require
   [metabase.usage-metadata.insights :as insights]
   [metabase.usage-metadata.schema :as usage-metadata.schema]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn implicit-segments :- [:sequential ::usage-metadata.schema/implicit-segment]
  "Filter predicates users have run ad-hoc that aren't already saved as Segments — surface candidates
  for promotion to first-class Segments."
  [opts :- ::usage-metadata.schema/opts]
  (insights/implicit-segments opts))

(mu/defn implicit-metrics :- [:sequential ::usage-metadata.schema/implicit-metric]
  "Aggregation patterns users have run ad-hoc that aren't already saved as Metric cards — surface
  candidates for promotion to first-class Metrics."
  [opts :- ::usage-metadata.schema/opts]
  (insights/implicit-metrics opts))

(mu/defn implicit-dimensions :- [:sequential ::usage-metadata.schema/implicit-dimension]
  "Columns users have grouped by (breakouts) across the window — surface candidates for promotion
  to first-class dimensions or pre-aggregations."
  [opts :- ::usage-metadata.schema/opts]
  (insights/implicit-dimensions opts))

(mu/defn suggested-segments :- [:sequential ::usage-metadata.schema/suggested-segment]
  "Composite (`:and`) segment definitions that recur across a source's query history. Mined via
  Apriori FIM over composite rollup baskets: each basket is the atom-set of one stage's top-level
  `:and`. Itemsets whose atom-set matches a saved Segment's definition are filtered out, so the
  results are genuinely ad-hoc."
  [opts :- ::usage-metadata.schema/opts]
  (insights/suggested-segments-for-owner opts))

(mu/defn profile-observations :- [:sequential ::usage-metadata.schema/profile-observation]
  "Profile observations recorded for dimensions surfaced by usage-metadata — `:single-value`,
  `:all-null`, `:low-cardinality` — useful for spotting low-value columns or columns whose
  cardinality makes them suitable as facets."
  [opts :- ::usage-metadata.schema/opts]
  (insights/profile-observations opts))
