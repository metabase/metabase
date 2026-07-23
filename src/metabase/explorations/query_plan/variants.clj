(ns metabase.explorations.query-plan.variants
  "Variant builders for planned exploration queries.

  Each variant is split into three single-responsibility multimethods:

    - `plan-rows`     — eager. Emits one or more row *recipes* the
                        orchestrator inserts as `ExplorationQuery` rows.
                        Recipes carry `:query_type`, `:display`, `:segment_id`,
                        and `:params` (a JSON-able map). They do NOT carry
                        `:name` or `:dataset_query` — both are deferred.
    - `query-name`    — runner-side. Returns the localized chart name. Pure
                        for everything except `per-value-time-series`, which
                        consults the discovery cache for the value at
                        `:params.value_index`.
    - `dataset-query` — runner-side. Returns the MBQL `:dataset_query`. Pure
                        for default/temporal-pattern-*/time-facet/filtered-
                        subset; runs (cached) discovery for `top-n-other` and
                        `per-value-time-series`.

  Discovery queries (`run-top-k-discovery`) for the two variants that need
  them are deduplicated in-process via `discovery-cache`, a TTL cache. Both
  `query-name` and `dataset-query` go through the cache, so a *successful* QP
  call runs at most once per cache key while the entry stays warm and fresh;
  a failed one isn't cached at all, so the next row retries it. The key
  includes the user the discovery ran as — see `cached-discovery`."
  (:require
   [clojure.core.cache :as cache]
   [clojure.core.cache.wrapped :as cache.wrapped]
   [metabase.api.common :as api]
   [metabase.explorations.query-plan.mbql :as qp.mbql]
   [metabase.lib.core :as lib]
   [metabase.query-processor.core :as qp]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru trun]]))

(set! *warn-on-reflection* true)

(def ^:private other-bucket-label
  "Label used for the rollup bucket in `top-n-other`. Plain string so the case
  expression doesn't need localization parametrization — the bucket name is the
  same regardless of which categorical dim is being grouped.
  Keep in sync with frontend OTHER_BUCKET_LABEL."
  "(Other)")

(def ^:private default-max-rows
  "Safety cap on the row count returned by the `default`, `time-facet`, and
  `per-value-time-series` variants. Defense-in-depth against stale/missing
  fingerprints that route a high-cardinality dim into a nominally bounded
  variant — without this, the serialized result can exceed
  `query-caching-max-kb` and the chart fails to persist. Sized well above the
  routing thresholds in `mechanical/items-for-pair` (≤100 for default, ≤20 for
  time-facet) so it only fires when the fingerprint was lying about
  cardinality."
  2000)

(defn- order-by-aggregation-and-limit
  "Apply `order-by aggregation 0 desc → limit n` to `q` when `q` has at least one
  aggregation. When the cap fires, the top-N rows by the metric survive — the
  rows the chart most needs to show. Right for categorical axes only; temporal
  axes use [[order-by-temporal-and-limit]]. The QP composes this with its own
  user-defined max-results constraint and takes the tighter of the two."
  [q n]
  (cond-> q
    (seq (lib/aggregations q))
    (-> (lib/order-by (lib/aggregation-ref q 0) :desc)
        (lib/limit n))))

(defn- order-by-temporal-and-limit
  "Apply `order-by temporal desc → order-by aggregation 0 desc → limit n` to `q`,
  where `temporal-breakout` is the breakout column on `q`'s time axis. When the
  cap fires, the most recent contiguous time window survives instead of a
  gap-riddled scatter of high-metric buckets; the aggregation tiebreak keeps the
  highest-metric cells when the cap splits the oldest surviving bucket across dim
  values."
  [q temporal-breakout n]
  (-> q
      (lib/order-by temporal-breakout :desc)
      (cond-> (seq (lib/aggregations q))
        (lib/order-by (lib/aggregation-ref q 0) :desc))
      (lib/limit n)))

(defn- temporal-dim?
  "True when the dim's snapshot type routes it to a temporal default bucket in
  [[qp.mbql/default-bucket-for-dim]] — i.e. the dim's breakout is a time axis."
  [dim]
  (= :temporal (first (qp.mbql/default-bucket-for-dim dim))))

(defn- maybe-segment-filtered
  [query segment]
  (cond-> query
    segment (lib/filter segment)))

(defn- resolve-target
  "Resolve a dim `target` against `query`. Returns `[ref-clause field-ref]`
  where `ref-clause` is the normalized target clause and `field-ref` is the
  snapshot-resolved breakoutable column (nil if no match). Callers typically
  pass `(or field-ref ref-clause)` to `lib/filter`/`lib/=` so an unmatched
  target still flows through as the raw clause."
  [query target]
  (let [ref-clause (qp.mbql/normalize-target-ref target)
        field-ref  (lib/find-matching-column query -1 ref-clause
                                             (lib/breakoutable-columns query))]
    [ref-clause field-ref]))

(defn- with-segment-suffix
  [base-name segment]
  (if segment
    (tru "{0} ({1})" base-name (:name segment))
    base-name))

;; ---------------------------------------------------------------------------
;; Discovery query + in-process cache
;; ---------------------------------------------------------------------------

(defn- run-top-k-discovery
  "Single QP query that breaks the metric out by `target` (with the dim's
  default bucket applied), orders by the aggregation descending, and limits
  to `k`. Returns a vector of top-K dim-value cells — possibly empty, when the
  query ran fine but the metric has no rows — or `nil` when the query threw.
  `nil` vs `[]` is the signal [[cached-discovery]] uses to decide whether the
  result is worth caching, so keep the two distinct."
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
      (if (and dim-idx (seq (:rows data)))
        (u/keepv #(nth % dim-idx nil) (:rows data))
        []))
    (catch Throwable _ nil)))

(def ^:private discovery-cache-ttl-ms
  "How long a [[discovery-cache]] entry stays valid before the discovery query re-runs.
  Discovery results are top-K value sets over live warehouse data, so a process-lifetime
  entry would pin stale values on a long-lived JVM. 15 minutes comfortably covers one
  plan-then-execute burst (where the dedup matters) while letting values refresh between
  explorations."
  (* 15 60 1000))

(defonce ^:private discovery-cache
  ;; A TTL cache: the TTL both freshens entries and bounds accumulation on a long-lived JVM —
  ;; nothing survives past it. See `cached-discovery` for the key.
  (atom (cache/ttl-cache-factory {} :ttl discovery-cache-ttl-ms)))

(defn- cached-discovery
  "Memoized `run-top-k-discovery`. Returns the discovered vector, or `[]` when discovery failed.
  Both `query-name` and `dataset-query` go through this so the underlying QP query runs at most
  once per key while the entry stays fresh (within the TTL).

  The key leads with the executing user (usually creator) because discovery
  is a real warehouse query run under that user's lens: sandboxing, connection impersonation, and
  database routing can all give two users different top-K values for the same (card, dim, k), and
  serving one user's values to another would leak rows they cannot query. This isolates explorations
  owned by different creators that happen to share a (card, dim, k, filters) tail. Attribute changes
  within a single user are covered by the TTL rather than the key.

  Only *answers* are cached. A failed discovery (QP timeout, warehouse blip) is
  evicted immediately so the next row retries; caching it would blank out every
  top-N and per-value chart for the rest of the TTL on one transient error. An
  empty result is a real answer — the metric has no rows — and stays cached."
  [{:keys [mp card target dim params explore-filters]}]
  (let [card-id   (:id card)
        dim-id    (or (:dimension-id dim) (:id dim))
        k         (:k params)
        ;; Include the "Explore further" filter chain in the key: two threads sharing a
        ;; (card, dim, k) but scoped to different segments must not share top-N discovery results.
        cache-key [api/*current-user-id* card-id dim-id k explore-filters]
        ;; `lookup-or-miss` caches a delay, so concurrent callers still share one QP run.
        result    (cache.wrapped/lookup-or-miss
                   discovery-cache cache-key
                   (fn [_] (run-top-k-discovery mp card target dim k)))]
    (if (nil? result)
      (do (cache.wrapped/evict discovery-cache cache-key) [])
      result)))

;; ---------------------------------------------------------------------------
;; plan-rows — eager. Orchestrator calls this at plan time to produce one
;; row recipe per chart (per-value-time-series fans out to K recipes).
;; ---------------------------------------------------------------------------

(defmulti plan-rows
  "Return a vector of row recipes for a single plan item. Each recipe is a
  map with `:query_type`, `:display`, `:segment_id`, and `:params`."
  {:arglists '([variant ctx])}
  (fn [variant _ctx] variant))

(defn- one-row
  [query-type display {:keys [segment params]}]
  [{:query_type query-type :display display :segment_id (:id segment) :params params}])

(defmethod plan-rows "default"               [_ ctx] (one-row "default"               nil    ctx))
(defmethod plan-rows "temporal-pattern-day"  [_ ctx] (one-row "temporal-pattern-day"  nil    ctx))
(defmethod plan-rows "temporal-pattern-hour" [_ ctx] (one-row "temporal-pattern-hour" nil    ctx))
(defmethod plan-rows "top-n-other"           [_ ctx] (one-row "top-n-other"           "bar"  ctx))
(defmethod plan-rows "filtered-subset"       [_ ctx] (one-row "filtered-subset"       nil    ctx))

(defmethod plan-rows "time-facet"
  ;; time-facet never combines with segments — the per-category line series
  ;; is already busy. The orchestrator may still pass a segment in ctx; we
  ;; pin `:segment_id` to nil here to match pre-refactor behavior.
  [_ {:keys [params]}]
  [{:query_type "time-facet" :display "line" :segment_id nil :params params}])

(defmethod plan-rows "per-value-time-series"
  ;; Fan out to K rows. Each row carries `:params.value_index N` (N=0..K-1);
  ;; the runner resolves it to the n-th discovered value when finalizing.
  [_ {:keys [segment params]}]
  (let [k (:k params)]
    (mapv (fn [n]
            {:query_type "per-value-time-series"
             :display    "line"
             :segment_id (:id segment)
             :params     (assoc params :value_index n)})
          (range k))))

;; ---------------------------------------------------------------------------
;; query-name — runner-side. Localized chart name.
;; ---------------------------------------------------------------------------

(defmulti query-name
  "Return the localized chart name for one row. Called by the runner just
  before executing the row."
  {:arglists '([variant ctx])}
  (fn [variant _ctx] variant))

(defmethod query-name "default"
  [_ {:keys [card dim-label segment]}]
  (with-segment-suffix (tru "{0} by {1}" (:name card) dim-label) segment))

(defmethod query-name "temporal-pattern-day"
  [_ {:keys [card dim-label segment]}]
  (with-segment-suffix (tru "{0} by {1} (Day of week)" (:name card) dim-label) segment))

(defmethod query-name "temporal-pattern-hour"
  [_ {:keys [card dim-label segment]}]
  (with-segment-suffix (tru "{0} by {1} (Hour of day)" (:name card) dim-label) segment))

(defmethod query-name "time-facet"
  [_ {:keys [card dim-label]}]
  (tru "{0} by {1} over time" (:name card) dim-label))

(defmethod query-name "top-n-other"
  [_ {:keys [card dim-label segment params]}]
  (with-segment-suffix (tru "{0} by {1} (Top {2} + Other)" (:name card) dim-label (:k params)) segment))

(defmethod query-name "filtered-subset"
  [_ {:keys [card dim-label segment params]}]
  (let [values        (:filter_values params)
        value-summary (if (= 1 (count values))
                        (str (first values))
                        (trun "{0} value" "{0} values" (count values)))]
    (with-segment-suffix (tru "{0} by {1} ({2})" (:name card) dim-label value-summary) segment)))

(defmethod query-name "per-value-time-series"
  [_ {:keys [card dim-label segment params] :as ctx}]
  (let [v (nth (cached-discovery ctx) (:value_index params) nil)]
    (with-segment-suffix
      (tru "{0} for {1} = {2} over time" (:name card) dim-label (str v))
      segment)))

(defn plan-time-name
  "Localized chart name computed eagerly at plan time, before the row has
  been executed. For variants whose `query-name` is pure (everything except
  `per-value-time-series`) this returns the final name. For
  `per-value-time-series` we return a placeholder that omits the discovered
  value; the runner's `finalize-row!` overwrites it once discovery resolves.

  `ctx` keys: `:card`, `:dim-label`, `:segment`, `:params`. Notably no
  `:mp`/`:target`/`:dim` — those stay deferred so the QP-touching parts of
  variant dispatch don't run at plan time."
  [variant {:keys [card dim-label segment] :as ctx}]
  (if (= "per-value-time-series" variant)
    (with-segment-suffix
      (tru "{0} for {1} over time" (:name card) dim-label)
      segment)
    (query-name variant ctx)))

;; ---------------------------------------------------------------------------
;; variant-qualifier — read-side. The short, param-free label that sets one
;; variant's *page* apart from the plain breakdown.
;; ---------------------------------------------------------------------------

(defmulti variant-qualifier
  "Localized qualifier distinguishing a variant's page from the plain `default` breakdown — e.g.
  \"over time\", \"(Day of week)\" — or `nil` for `default` (no qualifier). Page names are
  generated from parts (`<metric> by <dimension> <qualifier>`), so this is the only
  variant-specific piece the read side needs. Deliberately param-free: per-query specifics
  (segment, top-N k, individual filter values) belong on a chart, not on the page umbrella that
  bundles them."
  {:arglists '([query-type])}
  identity)

(defmethod variant-qualifier :default               [_] nil)
(defmethod variant-qualifier "temporal-pattern-day"  [_] (tru "(Day of week)"))
(defmethod variant-qualifier "temporal-pattern-hour" [_] (tru "(Hour of day)"))
(defmethod variant-qualifier "time-facet"            [_] (tru "over time"))
(defmethod variant-qualifier "per-value-time-series" [_] (tru "over time"))
(defmethod variant-qualifier "top-n-other"           [_] (tru "(Top values + Other)"))
(defmethod variant-qualifier "filtered-subset"       [_] (tru "(Filtered)"))

;; ---------------------------------------------------------------------------
;; dataset-query — runner-side. MBQL the QP will run.
;; ---------------------------------------------------------------------------

(defmulti dataset-query
  "Return the MBQL dataset_query for one row. Pure for most variants;
  runs cached discovery for `top-n-other` and `per-value-time-series`.
  Returns `nil` when the variant can't produce a query (e.g. discovery
  returned no rows). The runner treats a nil result as a row-level error."
  {:arglists '([variant ctx])}
  (fn [variant _ctx] variant))

(defmethod dataset-query "default"
  [_ {:keys [mp card target dim segment]}]
  (let [q (-> (qp.mbql/build-snapshot-mbql mp (:dataset_query card) target dim)
              (maybe-segment-filtered segment))]
    ;; Temporal dims cap by recency (most recent window survives); categorical
    ;; dims cap by metric (top-N buckets survive).
    (if (temporal-dim? dim)
      (order-by-temporal-and-limit q (first (lib/breakouts-metadata q)) default-max-rows)
      (order-by-aggregation-and-limit q default-max-rows))))

(defn- temporal-pattern-mbql
  [{:keys [mp card target segment]} unit]
  (let [base-query (-> (lib/query mp (:dataset_query card)) lib/remove-all-breakouts)
        ref-clause (qp.mbql/normalize-target-ref target)
        breakout   (lib/with-temporal-bucket ref-clause unit)
        bucketed   (lib/breakout base-query breakout)]
    (-> bucketed
        (maybe-segment-filtered segment)
        (lib/order-by (first (lib/breakouts-metadata bucketed)) :asc))))

(defmethod dataset-query "temporal-pattern-day"
  [_ ctx] (temporal-pattern-mbql ctx :day-of-week))

(defmethod dataset-query "temporal-pattern-hour"
  [_ ctx] (temporal-pattern-mbql ctx :hour-of-day))

(defmethod dataset-query "time-facet"
  [_ {:keys [mp card target dim]}]
  (let [base-query   (-> (lib/query mp (:dataset_query card)) lib/remove-all-breakouts)
        ref-clause   (qp.mbql/normalize-target-ref target)
        ;; Apply the dim's default bucket/binning so numerics render as a
        ;; per-bin line series (e.g. 8 lines for an auto-binned `Subtotal`)
        ;; rather than one line per raw value.
        dim-breakout (qp.mbql/apply-default-bucket base-query ref-clause dim)]
    (when-let [[temporal-col raw-unit] (qp.mbql/extract-default-temporal-breakout-col
                                        mp (:dataset_query card))]
      ;; Row cap is defense-in-depth: the planner's `:max-cardinality 20` gate
      ;; is fingerprint-based and can be stale (claims low, reality high).
      (let [temporal-breakout (lib/with-temporal-bucket temporal-col (or raw-unit :month))]
        (-> base-query
            (lib/breakout dim-breakout)
            (lib/breakout temporal-breakout)
            (order-by-temporal-and-limit temporal-breakout default-max-rows))))))

(defmethod dataset-query "top-n-other"
  [_ {:keys [mp card target dim segment] :as ctx}]
  (let [top-values (cached-discovery ctx)]
    (when (seq top-values)
      (let [base-query             (-> (lib/query mp (:dataset_query card)) lib/remove-all-breakouts)
            [ref-clause field-ref] (resolve-target base-query target)
            pairs                  (mapv (fn [v] [(lib/= (or field-ref ref-clause) v) v]) top-values)
            case-expr              (lib/case pairs other-bucket-label)
            expr-name              (or (:display-name dim) (:dimension-id dim) "value")
            with-expr              (lib/expression base-query expr-name case-expr)
            with-bo                (lib/breakout with-expr (lib/expression-ref with-expr expr-name))]
        ;; Order by metric desc within the named buckets. One note: `(Other)`
        ;; is moved to the end by `pin-other-last` on the result rows, not
        ;; in SQL. A SQL sort key that pins `(Other)` last has to be either
        ;; an ungrouped column (illegal GROUP BY for some DB types) or an
        ;; extra returned column, so the pin lives in Clojure instead.
        (-> with-bo
            (maybe-segment-filtered segment)
            (lib/order-by (lib/aggregation-ref with-bo 0) :desc)
            (lib/order-by (lib/expression-ref with-bo expr-name) :asc))))))

(defmethod dataset-query "filtered-subset"
  [_ {:keys [mp card target dim segment params]}]
  (let [values (:filter_values params)]
    (when (seq values)
      (let [snapshot               (qp.mbql/build-snapshot-mbql mp (:dataset_query card) target dim)
            [ref-clause field-ref] (resolve-target snapshot target)
            filter-clause          (apply lib/= (or field-ref ref-clause) values)
            filtered               (lib/filter snapshot filter-clause)]
        (maybe-segment-filtered filtered segment)))))

(defn- resolve-temporal-axis
  "Pick the temporal breakout for `per-value-time-series`. Prefers the
  LLM-chosen `temporal-target`/`temporal-dim` threaded through from the
  runner ctx; falls back to the metric Card's own default temporal
  breakout. Returns `[col unit]` or nil."
  [{:keys [mp card temporal-target temporal-dim]}]
  (or (when temporal-target
        (let [base                       (-> (lib/query mp (:dataset_query card)) lib/remove-all-breakouts)
              [ref-clause temporal-col]  (resolve-target base temporal-target)
              resolved-col               (or temporal-col ref-clause)
              [_ unit]                   (qp.mbql/default-bucket-for-dim temporal-dim)]
          (when resolved-col
            [resolved-col unit])))
      (qp.mbql/extract-default-temporal-breakout-col mp (:dataset_query card))))

(defmethod dataset-query "per-value-time-series"
  [_ {:keys [mp card target segment params] :as ctx}]
  (let [v (nth (cached-discovery ctx) (:value_index params) nil)]
    (when (some? v)
      (when-let [[temporal-col raw-unit] (resolve-temporal-axis ctx)]
        (let [base-query             (-> (lib/query mp (:dataset_query card)) lib/remove-all-breakouts)
              [ref-clause field-ref] (resolve-target base-query target)
              temporal-breakout      (lib/with-temporal-bucket temporal-col (or raw-unit :month))]
          (-> base-query
              (lib/filter (lib/= (or field-ref ref-clause) v))
              (lib/breakout temporal-breakout)
              (maybe-segment-filtered segment)
              (order-by-temporal-and-limit temporal-breakout default-max-rows)))))))

;; ---------------------------------------------------------------------------
;; pin-other-last — runner-side result post-processing.
;; ---------------------------------------------------------------------------

(defn pin-other-last
  "Stable-reorder a QP result's rows so the `top-n-other` rollup bucket sorts
  last, regardless of its metric value, while preserving the metric-desc order
  of the named buckets. The bucket label lives in the dimension column, which
  for `top-n-other` is the single leading breakout. No-op for every other
  variant and for empty/error results.

  This pinning can't be done in SQL without either an ungrouped sort column
  (illegal GROUP BY on Postgres et al.) or an extra returned column (breaks the
  2-col chart-config contract), so the variant's `dataset-query` orders by
  metric desc and the `(Other)`-last pin happens here."
  [variant qp-result]
  (cond-> qp-result
    (and (= "top-n-other" variant)
         (seq (get-in qp-result [:data :rows])))
    (update-in [:data :rows]
               (fn [rows]
                 (vec (sort-by #(= other-bucket-label (first %)) rows))))))

(def known-variants
  "Set of variant names the multimethods dispatch on. Exposed for the LLM
  validator so the schema enum and the dispatch table can't drift."
  #{"default"
    "temporal-pattern-day"
    "temporal-pattern-hour"
    "time-facet"
    "top-n-other"
    "per-value-time-series"
    "filtered-subset"})
