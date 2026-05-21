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

(defn- applicability
  "For each chosen `dim`, decide whether it has a resolvable target on
  `card`'s `dimension_mappings`. Returns
  `{dimension_id {:target :enriched-dim} | nil}` keyed by dim id."
  [dim-by-id metric]
  (let [mappings (:dimension_mappings metric)]
    (into {}
          (keep (fn [[dim-id dim]]
                  (when-let [target (qp.mbql/find-dimension-target dim-id mappings)]
                    [dim-id {:target target :dim dim}])))
          dim-by-id)))

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
        metrics   (vec
                   (keep
                    (fn [tm]
                      (let [card (get cards (:card_id tm))]
                        (when card
                          (let [mp              (mp-by-db (:database_id card))
                                card-dims       (into {} (map (juxt :id identity)) (:dimensions card))
                                ;; Enrich each thread-dim with the metric Card's :group metadata
                                ;; so format-dim-block can show "group → name" labels and the
                                ;; variant builders see the same enrichment.
                                enriched-thread-dims (into {}
                                                           (map (fn [[dim-id d]]
                                                                  [dim-id (enrich-dim-with-card-group d card-dims)]))
                                                           dim-by-id)
                                appl            (applicability enriched-thread-dims tm)
                                default-temp    (qp.mbql/extract-default-temporal-breakout-col
                                                 mp (:dataset_query card))
                                result-col-name (metrics/aggregation-column-name
                                                 (:database_id card)
                                                 (:dataset_query card))]
                            {:metric-id                 (:card_id tm)
                             :card                      card
                             :mp                        mp
                             :enriched-thread-dims      enriched-thread-dims
                             :applicability             appl
                             :default-temporal-breakout (when default-temp
                                                          {:column (some-> (first default-temp) :display-name)
                                                           :unit   (some-> (second default-temp) name)})
                             :segments                  (segment-blurbs mp (:dataset_query card))
                             :name                      (:name card)
                             :description               (some-> (:description card) str/trim not-empty)
                             :aggregation               (aggregation-summary mp (:dataset_query card))
                             :result-column-name        result-col-name}))))
                    thread-metrics))
        ;; Build per-dim applicable-to lists by inverting applicability.
        applicable-to (reduce (fn [acc m]
                                (reduce (fn [acc2 dim-id]
                                          (update acc2 dim-id (fnil conj []) (:metric-id m)))
                                        acc
                                        (keys (:applicability m))))
                              {}
                              metrics)
        ;; A single enriched thread-dim (use the first metric's enrichment, which has the
        ;; richest :group info since it's the only place :group lives).
        enriched-by-id (or (some :enriched-thread-dims metrics) dim-by-id)
        dimensions    (vec
                       (for [td thread-dims
                             :let [dim-id   (:dimension_id td)
                                   dim      (get enriched-by-id dim-id td)
                                   [k _]    (qp.mbql/default-bucket-for-dim dim)
                                   binned?  (= k :binning)]]
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
