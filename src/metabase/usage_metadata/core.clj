(ns metabase.usage-metadata.core
  "Public API for usage-metadata rollups. Internal consumers should call the fns here rather than reaching into
  `metabase.usage-metadata.insights`; this boundary pins the opts shape and return shape for future consumers."
  (:require
   [metabase.usage-metadata.insights :as insights]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::source-type [:enum :table :card])

(mr/def ::opts
  [:map {:closed true}
   [:source-type  {:optional true} [:maybe ::source-type]]
   [:source-id    {:optional true} [:maybe pos-int?]]
   [:bucket-start {:optional true} [:maybe :time/local-date]]
   [:bucket-end   {:optional true} [:maybe :time/local-date]]
   [:limit        {:optional true} [:maybe pos-int?]]])

(mu/defn implicit-segments :- [:sequential :map]
  "Filter predicates users have run ad-hoc that aren't already saved as Segments — surface candidates
  for promotion to first-class Segments.

  Each result describes one observed predicate:

    :predicate  The MBQL filter clause as it appeared in queries (decoded from canonical storage).
    :source     The table or card the predicate was applied to.
    :fields     Field metadata for every field referenced inside the predicate, populated from the
                Field index. Empty `:fields` rows are dropped.
    :count      Number of query executions in the window whose stage used this exact predicate."
  [opts :- ::opts]
  (insights/implicit-segments opts))

(mu/defn implicit-metrics :- [:sequential :map]
  "Aggregation patterns users have run ad-hoc that aren't already saved as Metric cards — surface
  candidates for promotion to first-class Metrics.

  Each result describes one observed aggregation:

    :source       The table or card the aggregation was applied to.
    :aggregation  Shape of the aggregation:
                    :type           — primitive op (`:sum`, `:count`, `:avg`, …). Composite
                                      aggregations and saved-metric refs are excluded upstream.
                    :field          — the aggregated column's metadata (or nil for `:count`).
                    :temporal-field — the temporal breakout column, if any (joins this aggregation
                                      to a time dimension; nil means an untimed aggregation).
                    :temporal-unit  — bucket of the temporal breakout (`:day`, `:month`, …).
    :count        Number of executions whose stage used this aggregation shape."
  [opts :- ::opts]
  (insights/implicit-metrics opts))

(mu/defn implicit-dimensions :- [:sequential :map]
  "Columns users have grouped by (breakouts) across the window — surface candidates for promotion
  to first-class dimensions or pre-aggregations.

  Each result describes one observed breakout:

    :source     The table or card the breakout was applied to.
    :dimension  Shape of the breakout:
                  :field         — the broken-out column's metadata.
                  :temporal-unit — temporal bucket (`:day`, `:month`, …) if the breakout was
                                   temporally bucketed; nil otherwise.
                  :binning       — decoded binning spec (`:num-bins`, `:bin-width`, `:strategy`)
                                   if the breakout was binned; nil otherwise.
    :count      Number of executions whose stage broke out by this exact shape."
  [opts :- ::opts]
  (insights/implicit-dimensions opts))

(mu/defn suggested-segments :- [:sequential :map]
  "Composite (`:and`) segment definitions that recur across a source's query history. Mined via
  Apriori FIM over composite rollup baskets: each basket is the atom-set of one stage's top-level
  `:and`. Itemsets whose atom-set matches a saved Segment's definition are filtered out, so the
  results are genuinely ad-hoc.

  Each result describes one suggestion:

    :clause        Reconstructed `[:and ...]` MBQL clause built from the itemset's atoms — what a
                   caller would offer the user to save as a new Segment.
    :itemset-size  Number of atomic predicates the suggestion combines (`k` in FIM terms; 2..5).
                   Not the size of the baskets it was mined from — those can be larger.
    :source        The table or card the suggestion is attributed to. Suggestions live within a
                   single source; cross-source composites are not mined.
    :support       Weighted count of baskets containing ALL the itemset's atoms (basket weight is
                   the rollup row's execution count). Primary ranking key.
    :support-ratio Fraction of baskets-touching-any-atom that also contain the full itemset. Guards
                   against an individually popular atom dragging a co-occurrence that doesn't
                   actually travel together."
  [opts :- ::opts]
  (insights/suggested-segments-for-owner opts))

(mu/defn profile-observations :- [:sequential :map]
  "Profile observations recorded for dimensions surfaced by usage-metadata — `:single-value`,
  `:all-null`, `:low-cardinality` — useful for spotting low-value columns or columns whose
  cardinality makes them suitable as facets.

  Each result describes one observation:

    :source       The table or card the field lives on.
    :field        Field metadata for the column the observation is about.
    :basis        Where the observation came from (e.g. `:fingerprint`).
    :observation  Shape `{:type <keyword> :value <opaque>}`. `:type` is the observation kind;
                  `:value` carries kind-specific detail (e.g. distinct count for
                  `:low-cardinality`).
    :count        Number of executions in the window that surfaced this observation for this
                  field."
  [opts :- ::opts]
  (insights/profile-observations opts))
