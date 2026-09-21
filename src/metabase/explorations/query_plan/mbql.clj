(ns metabase.explorations.query-plan.mbql
  "Pure MBQL helpers, thin wrappers over `metabase.lib`. Nothing here calls the
  LLM or persists state."
  (:require
   [metabase.lib-metric.core :as lib-metric]
   [metabase.lib.core :as lib]
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

(defn- pinned-default-binning
  "Explicit `:bin-width` binning equivalent to what the QP's `:default` strategy
  would resolve for `ref-clause` against `query` as given — i.e. before any
  per-segment filter is added. Exploration charts fan one query out into
  several segment-filtered variants that share an x-axis; left as
  `{:strategy :default}`, the QP re-derives the bin width per variant from that
  variant's own filters, so a segment that range-filters the binned column gets
  a different bin size than its siblings. Pinning the width keeps every variant
  on the same bin grid, while the card's own filters (shared by all variants)
  still narrow the domain. Falls back to `{:strategy :default}` when no width
  can be resolved."
  [query ref-clause]
  (let [col (lib/find-matching-column query -1 ref-clause
                                      (lib/breakoutable-columns query))]
    (if-let [width (when col (lib/default-bin-width query -1 col))]
      {:strategy :bin-width, :bin-width width}
      {:strategy :default})))

(defn apply-default-bucket
  "Return `ref-clause` with this dim's default temporal bucket or binning applied. Unchanged
  when the dim has no default, or when the column can't be binned. See [[binnable-ref?]].
  Numeric binning is pinned to an explicit bin width (see [[pinned-default-binning]])
  so all segment variants of a chart share the same bins."
  [query ref-clause dim]
  (let [[kind v] (default-bucket-for-dim dim)]
    (case kind
      :temporal (lib/with-temporal-bucket ref-clause v)
      :binning  (cond-> ref-clause
                  (binnable-ref? query ref-clause)
                  (lib/with-binning (pinned-default-binning query ref-clause)))
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

(defn default-time-dimension-col
  "Resolve the metric `card`'s curated default dimension to `[col unit display-name]`,
  where `col` is the dimension's target resolved against `base-query`'s visible
  columns, `unit` is the dimension's `:default-temporal-unit` (`:month` when unset),
  and `display-name` is the dimension's curated display name.

  The default dimension is used only when it is active (not orphaned) and its type
  carries a date component (`:type/HasDate` — covers `:type/Date` and `:type/DateTime`;
  bare `:type/Time` dims don't qualify). Curation is authoritative: when the
  default dimension is missing or doesn't qualify, returns `nil` rather than
  falling back to the card's `dataset_query` breakouts."
  [base-query card]
  (try
    (when-let [dim (some #(when (:default %) %) (:dimensions card))]
      (when (and (not= :status/orphaned (:status dim))
                 (dim-type-isa? dim :type/HasDate))
        (when-let [target (find-dimension-target (:id dim) (:dimension_mappings card))]
          (when-let [col (lib/find-matching-column (normalize-target-ref target)
                                                   (lib/visible-columns base-query))]
            [col
             (or (:default-temporal-unit dim) :month)
             (or (:display-name dim) (lib/display-name base-query col))]))))
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
