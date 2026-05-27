(ns metabase.explorations.query-plan.context
  "Build the prompt context map handed to the LLM planner.

  Takes a thread plus its metric and dimension selections, hydrates them
  against the application metadata provider, computes the per-pair
  applicability (dimension target resolves on the metric Card) so the LLM
  doesn't waste a slot on pairs the variant builders would just reject,
  and renders the per-metric and per-dimension markdown blocks the
  `plan.selmer` template embeds verbatim.

  This namespace exists to keep `metabase.explorations.query-plan` (the
  orchestrator) focused on the LLM call/validate/materialize loop — the
  shape of the prompt is its own concern and is the most likely place to
  iterate on prompt engineering."
  (:require
   [clojure.string :as str]
   [metabase.explorations.query-plan.mbql :as qp.mbql]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metrics.core :as metrics]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- aggregation-summary
  "Compact human label for a metric's aggregation — e.g. `count(*)`,
  `sum(revenue)`, `avg(latency_ms)`. Falls back to a generic `aggregation`
  string when the dataset query can't be normalized."
  [mp dataset-query]
  (try
    (let [base (lib/query mp dataset-query)
          agg  (first (lib/aggregations base))]
      (if agg
        (lib/display-name base agg)
        "aggregation"))
    (catch Exception _ "aggregation")))

(defn- segment-blurbs
  "List of `{:id :name :description}` for the metric Card's available segments,
  resolved against its `dataset_query`. Empty when none."
  [mp dataset-query]
  (try
    (let [q (lib/query mp dataset-query)]
      (mapv (fn [seg]
              {:id          (:id seg)
               :name        (:name seg)
               :description (:description seg)})
            (lib/available-segments q)))
    (catch Exception _ [])))

(defn- format-metric-block
  "One markdown block for the LLM's METRICS section. IDs are emitted as raw
  values (no prefix) — the LLM must echo them back verbatim in `metric_id` /
  `dimension_id` / `segment_id`."
  [{:keys [metric-id name description aggregation result-column-name
           default-temporal-breakout segments applicable-dims]}]
  (let [lines (cond-> [(str "metric_id=" metric-id ": " (or name "(unnamed metric)"))]
                description
                (conj (str "  description: " description))

                :always
                (conj (str "  aggregation: " aggregation))

                result-column-name
                (conj (str "  result_column: " result-column-name))

                default-temporal-breakout
                (conj (str "  default_temporal_breakout: " (:column default-temporal-breakout)
                           " @ " (or (:unit default-temporal-breakout) "(unbucketed)")))

                (seq segments)
                (into (cons "  segments_available:"
                            (map (fn [{:keys [id name description]}]
                                   (str "    - segment_id=" id ": " name
                                        (when (not (str/blank? description))
                                          (str " — " description))))
                                 segments)))

                (seq applicable-dims)
                (conj (str "  applicable_dimension_ids: ["
                           (str/join ", " (map pr-str applicable-dims))
                           "]")))]
    (str/join "\n" lines)))

(defn- format-dim-block
  "One markdown block for the LLM's DIMENSIONS section. Same id-prefix rule
  as `format-metric-block`: raw values only, no `D`/`M` prefixes."
  [{:keys [dimension-id display-name group-label effective-type semantic-type
           distinct-count auto-binned? numeric-min numeric-max applicable-to]}]
  (let [type-line  (str "  type:        effective=" (or effective-type "?")
                        ", semantic="                (or semantic-type "?"))
        card-line  (str "  cardinality: " (or distinct-count "unknown")
                        (when auto-binned? " (max bars after auto-binning)"))
        range-line (when (and numeric-min numeric-max)
                     (str "  numeric_range: " numeric-min ".." numeric-max))
        apply-line (str "  applicable_to_metric_ids: ["
                        (str/join ", " applicable-to)
                        "]")
        header     (cond-> (str "dimension_id=" (pr-str dimension-id)
                                " — " (or display-name dimension-id))
                     group-label (str "     (group: " group-label ")"))]
    (str/join "\n"
              (filter some?
                      [header type-line card-line range-line apply-line]))))

(defn- enrich-dim-with-card-group
  "Look up `:group` for `dim` on the metric Card's `:dimensions` snapshot, if
  any — same lookup `attach-query-dimension-labels` does in api.clj."
  [dim card-dim-by-id]
  (if-let [group (get-in card-dim-by-id [(:dimension_id dim) :group])]
    (assoc dim :group group)
    dim))

(defn- column-fingerprint-for-target
  "Resolve `target` against `base-query`'s breakoutable columns and return the
  resolved column's `:fingerprint` (or nil). Thread-dim rows don't carry
  fingerprints — the metadata provider does, via the underlying Field. Without
  this lookup, categorical-dim cardinality probes (`effective-cardinality`)
  always come up nil for text dims, so eligibility heuristics like
  `top-n-other-eligible?` fail closed every time."
  [base-query columns target]
  (try
    (let [ref-clause (qp.mbql/normalize-target-ref target)
          col        (lib/find-matching-column base-query -1 ref-clause columns)]
      (:fingerprint col))
    (catch Exception _ nil)))

(defn- applicability
  "For each chosen `dim`, decide whether it has a resolvable target on
  `card`'s `dimension_mappings`. Returns
  `{dimension_id {:target :enriched-dim} | nil}` keyed by dim id. The dim
  is enriched with the resolved column's `:fingerprint`, looked up through
  the metadata provider — bare thread-dim rows don't store fingerprints, so
  categorical-cardinality probes have nothing to read without this lookup."
  [dim-by-id metric mp card-dataset-query]
  (let [mappings (:dimension_mappings metric)
        base    (try (lib/query mp card-dataset-query) (catch Exception _ nil))
        columns (when base (lib/breakoutable-columns base))]
    (into {}
          (keep (fn [[dim-id dim]]
                  (when-let [target (qp.mbql/find-dimension-target dim-id mappings)]
                    (let [fp   (when base (column-fingerprint-for-target base columns target))
                          dim' (cond-> dim fp (assoc :fingerprint fp))]
                      [dim-id {:target target :dim dim'}]))))
          dim-by-id)))

(defn- metric-context
  "Per-metric entry for [[metric-and-dim-context]]'s `:metrics` list. Enriches
  the shared `dim-by-id` with this Card's `:group` metadata before computing
  applicability, so `format-dim-block` and the variant builders see the same
  enrichment."
  [tm card mp dim-by-id]
  (let [dataset-query        (:dataset_query card)
        card-dims            (into {} (map (juxt :id identity)) (:dimensions card))
        enriched-thread-dims (update-vals dim-by-id #(enrich-dim-with-card-group % card-dims))
        appl                 (applicability enriched-thread-dims tm mp dataset-query)
        default-temp         (qp.mbql/extract-default-temporal-breakout-col mp dataset-query)]
    {:metric-id                 (:card_id tm)
     :card                      card
     :mp                        mp
     :applicability             appl
     :default-temporal-breakout (when default-temp
                                  {:column (some-> (first default-temp) :display-name)
                                   :unit   (some-> (second default-temp) name)})
     :segments                  (segment-blurbs mp dataset-query)
     :name                      (:name card)
     :description               (some-> (:description card) str/trim not-empty)
     :aggregation               (aggregation-summary mp dataset-query)
     :result-column-name        (metrics/aggregation-column-name (:database_id card) dataset-query)}))

(defn metric-and-dim-context
  "Hydrate the metric Cards, snapshot per-(metric, dim) applicability, and
  expose the lookup tables the orchestrator needs at materialization time:

  Returns
    {:metrics       [{:metric-id ... :card ... :mp ... :segments [...]
                      :default-temporal-breakout {:column :unit} ...} ...]
     :dimensions    [{:dimension-id ... :dim ... :applicable-to [metric-id ...]} ...]
     :applicability {metric-id {dimension-id {:target :dim}}}}

  `metrics` carries one entry per chosen `ExplorationThreadMetric`; the
  underlying Card is hydrated with the columns the variant builders need
  (`:id :name :description :database_id :dataset_query :card_schema :dimensions`)."
  [thread-metrics thread-dims]
  (let [card-ids  (distinct (map :card_id thread-metrics))
        cards     (when (seq card-ids)
                    (t2/select-pk->fn identity
                                      [:model/Card :id :name :description :database_id
                                       :dataset_query :card_schema :dimensions]
                                      :id [:in card-ids]))
        mp-by-db  (memoize (fn [db-id] (lib-be/application-database-metadata-provider db-id)))
        dim-by-id (into {} (map (juxt :dimension_id identity)) thread-dims)
        metrics   (into []
                        (keep (fn [tm]
                                (when-let [card (get cards (:card_id tm))]
                                  (metric-context tm card (mp-by-db (:database_id card)) dim-by-id))))
                        thread-metrics)
        ;; Build per-dim applicable-to lists by inverting applicability.
        applicable-to (reduce (fn [acc m]
                                (reduce (fn [acc2 dim-id]
                                          (update acc2 dim-id (fnil conj []) (:metric-id m)))
                                        acc
                                        (keys (:applicability m))))
                              {}
                              metrics)
        ;; Take the per-dim enriched dim from the first metric whose applicability
        ;; resolves it — that copy carries both `:group` and `:fingerprint`. Dims that
        ;; resolve on no metric are dropped: nothing can be charted from them, so
        ;; surfacing them in the prompt would just be noise.
        enriched-by-id (into {}
                             (keep (fn [dim-id]
                                     (when-let [d (some #(get-in % [:applicability dim-id :dim]) metrics)]
                                       [dim-id d])))
                             (keys dim-by-id))
        dimensions    (vec
                       (for [td thread-dims
                             :let [dim-id   (:dimension_id td)
                                   dim      (get enriched-by-id dim-id)
                                   [k _]    (qp.mbql/default-bucket-for-dim dim)
                                   binned?  (= k :binning)]
                             :when dim]
                         {:dimension-id   dim-id
                          :dim            dim
                          :display-name   (or (:display_name dim) dim-id)
                          :group-label    (some-> dim :group :display_name)
                          :effective-type (:effective_type dim)
                          :semantic-type  (:semantic_type dim)
                          ;; effective-cardinality returns the bin count for auto-binned
                          ;; numerics (so the LLM sees the chart-width number, not the
                          ;; raw fingerprint distinct-count which can be huge).
                          :distinct-count (qp.mbql/effective-cardinality dim)
                          :auto-binned?   binned?
                          :numeric-min    (get-in dim [:fingerprint :type :type/Number :min])
                          :numeric-max    (get-in dim [:fingerprint :type :type/Number :max])
                          :applicable-to  (vec (get applicable-to dim-id []))}))]
    {:metrics       metrics
     :dimensions    dimensions
     :applicability (into {} (map (juxt :metric-id :applicability)) metrics)}))

(defn build-row-context
  "Resolve everything the variant multimethods need to finalize a single
  pending `ExplorationQuery` row at execution time. Returns the ctx map
  consumed by `qp.variants/query-name` and `qp.variants/dataset-query`,
  or `nil` when a required dependency (Card / thread metric / thread dim)
  can't be loaded.

  Looks up the metric Card, derives the metadata provider, finds the dim's
  target via the thread-metric's `:dimension_mappings`, resolves any
  selected segment, and — for `per-value-time-series` rows that carry
  `:params.temporal_dimension_id` — also resolves the override temporal
  axis. The runner calls this per claimed row."
  [{:keys [card_id exploration_thread_id dimension_id segment_id params]}]
  (let [card          (t2/select-one :model/Card :id card_id)
        thread-dim    (t2/select-one :model/ExplorationThreadDimension
                                     :exploration_thread_id exploration_thread_id
                                     :dimension_id dimension_id)
        thread-metric (t2/select-one :model/ExplorationThreadMetric
                                     :exploration_thread_id exploration_thread_id
                                     :card_id card_id)]
    (when (and card thread-dim thread-metric)
      (let [mp           (lib-be/application-database-metadata-provider (:database_id card))
            mappings     (:dimension_mappings thread-metric)
            target       (qp.mbql/find-dimension-target dimension_id mappings)
            segment      (when segment_id
                           (try
                             (let [q (lib/query mp (:dataset_query card))]
                               (some #(when (= segment_id (:id %)) %)
                                     (lib/available-segments q)))
                             (catch Exception _ nil)))
            t-dim-id     (:temporal_dimension_id params)
            t-target     (when t-dim-id (qp.mbql/find-dimension-target t-dim-id mappings))
            t-thread-dim (when t-dim-id
                           (t2/select-one :model/ExplorationThreadDimension
                                          :exploration_thread_id exploration_thread_id
                                          :dimension_id t-dim-id))]
        {:mp              mp
         :card            card
         :target          target
         :dim             thread-dim
         :dim-label       (or (:display_name thread-dim) dimension_id)
         :segment         segment
         :params          params
         :temporal-target t-target
         :temporal-dim    t-thread-dim}))))

(defn prompt-vars
  "Build the Selmer context map for `plan.selmer`. `metric-dim-ctx` is the
  output of [[metric-and-dim-context]]; `thread-prompt` is passed through
  verbatim."
  [{:keys [metric-dim-ctx thread-prompt]}]
  (let [{:keys [metrics dimensions]} metric-dim-ctx
        metrics-md    (str/join "\n\n"
                                (map (fn [m]
                                       (format-metric-block
                                        {:metric-id                 (:metric-id m)
                                         :name                      (:name m)
                                         :description               (:description m)
                                         :aggregation               (:aggregation m)
                                         :result-column-name        (:result-column-name m)
                                         :default-temporal-breakout (:default-temporal-breakout m)
                                         :segments                  (:segments m)
                                         :applicable-dims           (keys (:applicability m))}))
                                     metrics))
        dimensions-md (str/join "\n\n" (map format-dim-block dimensions))]
    {:thread_prompt   (when-not (str/blank? thread-prompt) thread-prompt)
     :metric_count    (count metrics)
     :metrics_md      metrics-md
     :dimension_count (count dimensions)
     :dimensions_md   dimensions-md}))
