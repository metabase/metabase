(ns metabase.explorations.query-plan.mbql
  "Pure MBQL helpers, thin wrappers over `metabase.lib`. Nothing here calls the
  LLM or persists state."
  (:require
   [metabase.lib-metric.core :as lib-metric]
   [metabase.lib.core :as lib]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.metrics.core :as metrics]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn index-dimension-targets
  "Map of `{dimension-id → target}` from a metric's `dimension_mappings`. Prefer this when
  resolving many dims against the same mappings; [[find-dimension-target]] for a single id."
  [dimension-mappings]
  (into {} (map (juxt :dimension-id :target)) dimension-mappings))

(defn find-dimension-target
  "Look up the MBQL `target` for a dimension by ID inside a metric's snapshotted
  `dimension_mappings`. Returns nil when the dim has no mapping on this metric."
  [dimension-id dimension-mappings]
  (some #(when (= (:dimension-id %) dimension-id)
           (:target %))
        dimension-mappings))

(defn dim-type-isa?
  "True if the dim's snapshot effective-type / base-type / semantic-type derives from `parent`."
  [dim parent]
  (lib-metric/type-isa? dim parent))

(defn default-bucket-for-dim
  "Pick a default temporal bucket or numeric binning for a dimension based on its
  snapshot type. Returns one of:
    `[:temporal unit]`  — apply via `lib/with-temporal-bucket`
    `[:binning binning]` — apply via `lib/with-binning`
    `nil`               — no bucket; use a bare breakout."
  [dim]
  ;; Branch order is load-bearing: each type below derives from the one after it. DateTime
  ;; derives from both Date and Time, keys from Number, and Coordinate from Number.
  (cond
    (dim-type-isa? dim :type/DateTime)   [:temporal :month]
    (dim-type-isa? dim :type/Date)       [:temporal :day]
    (dim-type-isa? dim :type/Time)       [:temporal :hour]
    (dim-type-isa? dim :Relation/*)      nil
    (dim-type-isa? dim :type/Coordinate) [:binning {:strategy :default}]
    (dim-type-isa? dim :type/Number)     [:binning {:strategy :default}]
    :else                                nil))

(def default-binning-max-bins
  "Upper bound on how many bars Metabase's `:default` binning strategy
  produces on the chart. The actual number depends on
  `metabase.query-processor.middleware.binning`, but it never exceeds this. Used
  as a conservative cap so cardinality checks can short-circuit for auto-binned dims."
  20)

(defn effective-cardinality
  "Upper bound on the x-axis cells the dim will produce once bucketing is applied:

  - binned dims → [[default-binning-max-bins]]
  - temporal dims → `nil`. You should reason by temporal unit instead.
  - otherwise → `:fingerprint.global.distinct-count` or `nil` (if missing)"
  [dim]
  (let [[kind] (default-bucket-for-dim dim)]
    (case kind
      :temporal nil
      :binning  default-binning-max-bins
      nil       (get-in dim [:fingerprint :global :distinct-count]))))

(defn binnable-ref?
  "True if `ref-clause` can actually be binned on `query` — i.e. lib offers at least one
  binning strategy for it. Binning a ref that fails the check would crash the QP."
  [query ref-clause]
  (boolean (seq (lib/available-binning-strategies query -1 ref-clause))))

(defn apply-default-bucket
  "Return `ref-clause` with this dim's default temporal bucket or binning applied. Unchanged
  when the dim has no default, or when the column can't be binned. See [[binnable-ref?]]"
  [query ref-clause dim]
  (let [[kind v] (default-bucket-for-dim dim)]
    (case kind
      :temporal (lib/with-temporal-bucket ref-clause v)
      :binning  (cond-> ref-clause
                  (binnable-ref? query ref-clause) (lib/with-binning v))
      nil       ref-clause)))

(defn normalize-target-ref
  "Coerce a JSON-decoded legacy ref (string operator + string-typed option values)
  into a well-formed MBQL 5 ref."
  [target]
  (metrics/normalize-target-ref target))

(defn target-field-id
  "Integer Field id from a (possibly JSON-decoded) mapping/filter target, or nil when the
  target is missing, name-based, or not a `:field` ref."
  [target]
  (let [ref-clause (normalize-target-ref target)]
    ;; targets are read back from JSON at rest and may not normalize into a well-formed ref at all.
    ;; `lib/field-ref-id` is schema-instrumented and throws on anything that isn't a valid `:field`
    ;; clause, so check before handing it over.
    (when (mr/validate :mbql.clause/field ref-clause)
      (lib/field-ref-id ref-clause))))

(defn default-temporal-breakout-col
  "If `base-query` carries a temporal breakout (the metric's default temporal
  dimension, e.g. `created_at` bucketed by `:month`), resolve the breakout against
  the query's visible columns and return `[col raw-unit display-name]`. Returns
  `nil` if no temporal breakout exists, the column can't be resolved, or column
  resolution throws. The raw unit may be `nil` if the metric breakout was unbucketed.

  Prefer this over [[extract-default-temporal-breakout-col]] when the caller already
  holds the Lib query — building one is expensive."
  [base-query]
  (try
    (let [cols (lib/visible-columns base-query)]
      (some (fn [bo]
              (when-let [col (lib/find-matching-column bo cols)]
                (when (lib.types.isa/temporal? col)
                  [col (lib/raw-temporal-bucket bo) (lib/display-name base-query col)])))
            (lib/breakouts base-query)))
    (catch Exception _ nil)))

(defn extract-default-temporal-breakout-col
  "[[default-temporal-breakout-col]] for callers holding a metric Card's `dataset_query`
  rather than a built Lib query. Returns `nil` when the query can't be normalized."
  [mp card-dataset-query]
  (try
    (default-temporal-breakout-col (lib/query mp card-dataset-query))
    (catch Exception _ nil)))

(defn dim-fingerprint-distinct-count
  "Read `:fingerprint.global.distinct-count` for the column referenced by
  `ref-clause`, if any. Returns `nil` when the ref doesn't resolve to a real
  column, the fingerprint is missing, or column resolution throws."
  [query ref-clause]
  (try
    (when-let [col (lib/find-matching-column query -1 ref-clause
                                             (lib/breakoutable-columns query))]
      (get-in col [:fingerprint :global :distinct-count]))
    (catch Exception _ nil)))

(defn build-snapshot-mbql
  "Wrap the metric Card's `:dataset_query` in a Lib query, drop any breakout the
  metric carries, and add a single breakout for the chosen dimension's target.
  A default temporal bucket / numeric binning is applied to the ref based on
  the dim's snapshot type so date/numeric breakouts produce a useful chart out
  of the box rather than a group-by-every-distinct-value."
  [mp card-dataset-query target dim]
  (let [base-query (-> (lib/query mp card-dataset-query) lib/remove-all-breakouts)
        ref-clause (normalize-target-ref target)]
    (lib/breakout base-query (apply-default-bucket base-query ref-clause dim))))
