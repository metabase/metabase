(ns metabase.explorations.query-plan.mbql
  "Pure MBQL helpers shared between the variant builders and the
  `metabase.explorations.query-plan.context` namespace. Nothing here calls the
  LLM or persists state — everything is a thin wrapper over `metabase.lib`
  that the variant builders compose."
  (:require
   [metabase.lib-metric.core :as lib-metric]
   [metabase.lib.core :as lib]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.metrics.core :as metrics]))

(set! *warn-on-reflection* true)

(defn index-dimension-targets
  "Map of `{dimension_id → target}` from a metric's `dimension_mappings`. Prefer this when
  resolving many dims against the same mappings; [[find-dimension-target]] for a single id."
  [dimension-mappings]
  (into {} (map (juxt :dimension_id :target)) dimension-mappings))

(defn find-dimension-target
  "Look up the MBQL `target` for a dimension by ID inside a metric's snapshotted
  `dimension_mappings`. Returns nil when the dim has no mapping on this metric."
  [dimension-id dimension-mappings]
  (some #(when (= (:dimension_id %) dimension-id)
           (:target %))
        dimension-mappings))

(defn dim-type-isa?
  "True if the dim's snapshot effective_type / base_type / semantic_type derives from `parent`."
  [dim parent]
  (lib-metric/type-isa? dim parent))

(defn default-bucket-for-dim
  "Pick a default temporal bucket or numeric binning for a dimension based on its
  snapshot type. Returns one of:
    `[:temporal unit]`  — apply via `lib/with-temporal-bucket`
    `[:binning binning]` — apply via `lib/with-binning`
    `nil`               — no bucket; use a bare breakout.

  Resolution order matters: DateTime first (it derives from both HasDate and
  HasTime), then Date, then Time. Coordinates come before generic numbers
  because Coordinate also derives from Number."
  [dim]
  (cond
    (dim-type-isa? dim :type/DateTime)   [:temporal :month]
    (dim-type-isa? dim :type/Date)       [:temporal :day]
    (dim-type-isa? dim :type/Time)       [:temporal :hour]
    (dim-type-isa? dim :type/Coordinate) [:binning {:strategy :default}]
    (dim-type-isa? dim :type/Number)     [:binning {:strategy :default}]
    :else                                nil))

(def default-binning-max-bins
  "Upper bound on how many bars Metabase's `:default` binning strategy
  produces on the chart. The actual number depends on the column's min/max
  fingerprint and database-specific bin-width logic in
  `metabase.query-processor.middleware.binning`, but it never exceeds this
  cap. Using the cap (rather than a per-dim estimate) lets the planner
  short-circuit cardinality checks for auto-binned dims: any variant whose
  bar/series budget is `>=` this value is satisfied by construction."
  20)

(defn effective-cardinality
  "Number of x-axis cells the dim will produce on a chart *after* the default
  bucket/binning fires:

  - Numeric dims with default binning → `default-binning-max-bins`. The real
    count is usually lower, but the upper bound is what gates eligibility
    decisions (chart-width, series-count budgets).
  - Temporal dims → `nil`. Cardinality isn't the right axis to reason about
    them on; callers should use the temporal unit.
  - All other dims → raw `:fingerprint.global.distinct-count`, or `nil` if
    the fingerprint is missing."
  [dim]
  (let [[kind] (default-bucket-for-dim dim)]
    (case kind
      :temporal nil
      :binning  default-binning-max-bins
      nil       (get-in dim [:fingerprint :global :distinct-count]))))

(defn binnable-ref?
  "True if `ref-clause` can actually be binned on `query` — i.e. lib offers at least one
  binning strategy for it. Lib only offers strategies when the column resolves to a real
  Field whose fingerprint has a defined `:min`/`:max` range (and the database supports
  binning); anything else would crash the QP's binning middleware at preprocess time."
  [query ref-clause]
  (boolean (seq (lib/available-binning-strategies query -1 ref-clause))))

(defn apply-default-bucket
  "Apply a default temporal bucket / numeric binning to the breakout `ref-clause`,
  chosen from the dim's snapshot effective/semantic type. Numeric binning is
  gated on lib actually offering a binning strategy for the column (see
  [[binnable-ref?]]) — without that the QP throws at preprocess time. Returns
  the (possibly unchanged) ref."
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
    (when (and (vector? ref-clause) (= :field (first ref-clause)))
      (let [id-or-name (nth ref-clause 2 nil)]
        (when (pos-int? id-or-name)
          id-or-name)))))

(defn default-temporal-breakout-col
  "If `base-query` carries a temporal breakout (the metric's default temporal
  dimension, e.g. `created_at` bucketed by `:month`), resolve the breakout against
  the query's visible columns and return `[col raw-unit display-name]`. Returns
  `nil` if no temporal breakout exists, the column can't be resolved, or column
  resolution throws. The raw unit may be `nil` if the metric breakout was unbucketed.

  Prefer this over [[extract-default-temporal-breakout-col]] when the caller already
  holds the Lib query — building one is the expensive half."
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
