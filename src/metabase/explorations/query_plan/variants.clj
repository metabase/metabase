(ns metabase.explorations.query-plan.variants
  "Variant builders for LLM-planned exploration queries. Each builder takes a
  per-pair context map and returns a vector of *candidate* maps shaped like
  the rows the runner's caller inserts into `:model/ExplorationQuery`:

      {:query_type   <string>
       :name         <localized name>
       :display      <string or nil>
       :dataset_query <MBQL 5 query>
       :segment_id   <int or nil>}

  Builders are split out so the orchestrator stays a thin dispatch table —
  add a new variant by adding one builder here plus an entry in the schema's
  enum and the validator's per-variant rules."
  (:require
   [metabase.explorations.query-plan.mbql :as qp.mbql]
   [metabase.lib.core :as lib]
   [metabase.query-processor.core :as qp]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(def ^:private other-bucket-label
  "Label used for the rollup bucket in `top-n-other`. Plain string so the case
  expression doesn't need localization parametrization — the bucket name is the
  same regardless of which categorical dim is being grouped."
  "Other")

(defn- maybe-segment-filtered
  "Apply a segment as a filter clause when `segment-id` is non-nil. The segment
  is fetched from the metric's available-segments list, which the caller
  pre-resolves."
  [query segment]
  (cond-> query
    segment (lib/filter segment)))

(defn- with-segment-suffix
  "If `segment` is non-nil, append its name in parentheses, matching the format
  the pre-LLM code emitted for segment-fanned-out queries."
  [base-name segment]
  (if segment
    (tru "{0} ({1})" base-name (:name segment))
    base-name))

;; ---------------------------------------------------------------------------
;; Discovery query — fetch top-K dim values for a (metric, dim) pair
;; ---------------------------------------------------------------------------

(defn- run-top-k-discovery
  "Runs a single QP query that breaks the metric out by `target` (with the dim's
  default bucket applied), orders by the aggregation descending, and limits to
  `k`. Returns a vector of the top-K dim-value cells, or `nil` if anything
  throws. We run this synchronously inside the planning worker because the
  variant builders that need it (`top-n-other`, `per-value-time-series`) can't
  emit MBQL without knowing the values.

  Order-by here uses `lib/aggregation-ref` rather than the aggregation clause
  directly: passing the aggregation clause to `lib/order-by` would route through
  `lib.ref/ref` for `:count`/`:sum`/etc., which has no method registered for
  those dispatch values. `aggregation-ref` builds the correct `:aggregation`
  ref clause by index.

  Failure path returns nil; the orchestrator skips the plan item rather than
  emitting a half-built variant."
  [mp card target dim k]
  (try
    (let [base       (qp.mbql/build-snapshot-mbql mp (:dataset_query card) target dim)
          ordered    (if (seq (lib/aggregations base))
                       (lib/order-by base (lib/aggregation-ref base 0) :desc)
                       base)
          limited    (lib/limit ordered k)
          {:keys [data]} (qp/process-query
                          (qp/userland-query-with-default-constraints
                           limited {:context :exploration}))
          dim-idx    (first (keep-indexed (fn [i c]
                                            (when (= :breakout (:source c)) i))
                                          (:cols data)))]
      (when (and dim-idx (seq (:rows data)))
        (vec (keep (fn [row]
                     (let [v (nth row dim-idx nil)]
                       (when (some? v) v)))
                   (:rows data)))))
    (catch Throwable _ nil)))

;; ---------------------------------------------------------------------------
;; Variant builders
;; ---------------------------------------------------------------------------

(defn- build-default
  [{:keys [mp card target dim dim-label segment]}]
  [{:query_type    "default"
    :name          (with-segment-suffix (tru "{0} by {1}" (:name card) dim-label) segment)
    :display       nil
    :dataset_query (-> (qp.mbql/build-snapshot-mbql mp (:dataset_query card) target dim)
                       (maybe-segment-filtered segment))
    :segment_id    (:id segment)}])

(defn- build-temporal-pattern
  [{:keys [mp card target dim-label segment]} unit query-type label-fn]
  (let [base-query (-> (lib/query mp (:dataset_query card)) lib/remove-all-breakouts)
        ref-clause (qp.mbql/normalize-target-ref target)
        bucketed   (lib/breakout base-query (lib/with-temporal-bucket ref-clause unit))]
    [{:query_type    query-type
      :name          (with-segment-suffix (label-fn (:name card) dim-label) segment)
      :display       nil
      :dataset_query (maybe-segment-filtered bucketed segment)
      :segment_id    (:id segment)}]))

(defn- build-temporal-pattern-day
  [ctx]
  (build-temporal-pattern ctx :day-of-week "day-of-week"
                          (fn [m d] (tru "{0} by {1} (day of week)" m d))))

(defn- build-temporal-pattern-hour
  [ctx]
  (build-temporal-pattern ctx :hour-of-day "hour-of-day"
                          (fn [m d] (tru "{0} by {1} (hour of day)" m d))))

(defn- build-time-facet
  [{:keys [mp card target dim-label]}]
  (let [base-query (-> (lib/query mp (:dataset_query card)) lib/remove-all-breakouts)
        ref-clause (qp.mbql/normalize-target-ref target)]
    (when-let [[temporal-col raw-unit] (qp.mbql/extract-default-temporal-breakout-col
                                        mp (:dataset_query card))]
      [{:query_type    "time-facet"
        :name          (tru "{0} by {1} over time" (:name card) dim-label)
        :display       "line"
        :dataset_query (-> base-query
                           (lib/breakout ref-clause)
                           (lib/breakout (lib/with-temporal-bucket
                                           temporal-col (or raw-unit :month))))
        ;; time-facet never combines with segments — the per-category line series is already busy.
        :segment_id    nil}])))

(defn- build-top-n-other
  "Categorical dim, keep top-K values, roll the rest into `Other`. Implementation:
  run a discovery query for the top-K values, then build MBQL that adds a `:case`
  expression mapping each top value to itself and everything else to the literal
  `Other` string, breakout by that expression. Result: one chart with up to
  K+1 bars."
  [{:keys [mp card target dim dim-label segment params]}]
  (let [k (:k params)]
    (when-let [top-values (seq (run-top-k-discovery mp card target dim k))]
      (let [base-query  (-> (lib/query mp (:dataset_query card)) lib/remove-all-breakouts)
            ref-clause  (qp.mbql/normalize-target-ref target)
            field-ref   (lib/find-matching-column base-query -1 ref-clause
                                                  (lib/breakoutable-columns base-query))
            ;; Use `lib/=` with multiple values per branch — but `lib/case` wants
            ;; pred/value pairs where each value is a literal label. We emit one
            ;; pair per top value: (when (= dim v) v), then the fallback "Other".
            pairs       (mapv (fn [v] [(lib/= (or field-ref ref-clause) v) v]) top-values)
            case-expr   (lib/case pairs other-bucket-label)
            expr-name   (str (or (:display_name dim) (:dimension_id dim) "value") "_grouped")
            with-expr   (lib/expression base-query expr-name case-expr)
            expr-ref    (lib/expression-ref with-expr expr-name)
            with-bo     (lib/breakout with-expr expr-ref)]
        [{:query_type    "top-n-other"
          :name          (with-segment-suffix
                           (tru "{0} by {1} (top {2} + Other)" (:name card) dim-label k)
                           segment)
          :display       "bar"
          :dataset_query (maybe-segment-filtered with-bo segment)
          :segment_id    (:id segment)}]))))

(defn- resolve-temporal-axis
  "Pick the temporal breakout for `per-value-time-series`. Prefers the
  LLM-chosen `temporal-target`/`temporal-dim` threaded through from the
  orchestrator; falls back to the metric Card's own default temporal
  breakout. Returns `[col unit]` (the shape `lib/with-temporal-bucket`
  consumes) or `nil` when neither path resolves a column."
  [{:keys [mp card temporal-target temporal-dim]}]
  (or (when temporal-target
        (let [base       (-> (lib/query mp (:dataset_query card)) lib/remove-all-breakouts)
              ref-clause (qp.mbql/normalize-target-ref temporal-target)
              col        (lib/find-matching-column base -1 ref-clause
                                                   (lib/breakoutable-columns base))
              ;; LLM-chosen axis: bucket by the dim's natural default (day for
              ;; Date, month for DateTime, hour for Time), matching what
              ;; `default-bucket-for-dim` picks for breakouts.
              [_ unit]   (qp.mbql/default-bucket-for-dim temporal-dim)]
          (when (or col ref-clause)
            [(or col ref-clause) unit])))
      (qp.mbql/extract-default-temporal-breakout-col mp (:dataset_query card))))

(defn- build-per-value-time-series
  "For each of the top-K values of `dim`, emit a separate filtered query that
  breaks the metric out by a temporal column. The temporal column is either
  the LLM-chosen `temporal_dimension_id` (threaded into ctx as
  `:temporal-target`/`:temporal-dim`) or the metric Card's default temporal
  breakout. Returns K candidate maps (or `nil` when discovery fails or no
  temporal axis can be resolved)."
  [{:keys [mp card target dim dim-label segment params] :as ctx}]
  (let [k (:k params)]
    (when-let [[temporal-col raw-unit] (resolve-temporal-axis ctx)]
      (when-let [top-values (seq (run-top-k-discovery mp card target dim k))]
        (let [base-query (-> (lib/query mp (:dataset_query card)) lib/remove-all-breakouts)
              ref-clause (qp.mbql/normalize-target-ref target)
              field-ref  (lib/find-matching-column base-query -1 ref-clause
                                                   (lib/breakoutable-columns base-query))]
          (mapv (fn [v]
                  {:query_type    "per-value-time-series"
                   :name          (with-segment-suffix
                                    (tru "{0} for {1} = {2} over time" (:name card) dim-label (str v))
                                    segment)
                   :display       "line"
                   :dataset_query (-> base-query
                                      (lib/filter (lib/= (or field-ref ref-clause) v))
                                      (lib/breakout (lib/with-temporal-bucket
                                                      temporal-col (or raw-unit :month)))
                                      (maybe-segment-filtered segment))
                   :segment_id    (:id segment)})
                top-values))))))

(defn- build-filtered-subset
  "Single breakout query restricted to one or more named dim values. The LLM
  supplies `filter_values` directly — values it has high confidence will exist
  on the dim (e.g. boolean true/false, enum-like strings)."
  [{:keys [mp card target dim dim-label segment params]}]
  (let [values (:filter_values params)]
    (when (seq values)
      (let [snapshot   (qp.mbql/build-snapshot-mbql mp (:dataset_query card) target dim)
            ref-clause (qp.mbql/normalize-target-ref target)
            field-ref  (lib/find-matching-column snapshot -1 ref-clause
                                                 (lib/breakoutable-columns snapshot))
            ;; MBQL `:=` takes multiple values for set membership.
            filter-clause (apply lib/= (or field-ref ref-clause) values)
            filtered      (lib/filter snapshot filter-clause)
            value-summary (if (= 1 (count values))
                            (str (first values))
                            (str (count values) " values"))]
        [{:query_type    "filtered-subset"
          :name          (with-segment-suffix
                           (tru "{0} by {1} ({2})" (:name card) dim-label value-summary)
                           segment)
          :display       nil
          :dataset_query (maybe-segment-filtered filtered segment)
          :segment_id    (:id segment)}]))))

(def ^:private builders
  {"default"               build-default
   "temporal-pattern-day"  build-temporal-pattern-day
   "temporal-pattern-hour" build-temporal-pattern-hour
   "time-facet"            build-time-facet
   "top-n-other"           build-top-n-other
   "per-value-time-series" build-per-value-time-series
   "filtered-subset"       build-filtered-subset})

(defn build
  "Dispatch a plan item to its variant builder. Returns a vector of zero or more
  candidate maps. The orchestrator drops plan items whose builder returns an
  empty vector (e.g. discovery query returned no rows) and continues — a single
  unbuildable item should not fail the whole plan."
  [variant ctx]
  (if-let [builder (get builders variant)]
    (or (builder ctx) [])
    (throw (ex-info (str "Unknown query plan variant: " variant)
                    {:variant variant}))))

(def known-variants
  "Set of variant names the builders dispatch on. Exposed for the validator so
  the schema enum and the dispatch table can't drift."
  (set (keys builders)))
