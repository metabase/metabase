(ns dev.dbt-import.parse
  "Stage 1 of the converter: turn a decoded dbt manifest into the IR (see [[dev.dbt-import.schemas.ir]]).

(set! *warn-on-reflection* true)

  Pure apart from [[read-manifest]]. Applies dbt's own defaulting rules and nothing Metabase-specific:

  * a nil `expr` on an entity, dimension or measure means the name is the column;
  * a measure without `agg_time_dimension` inherits the semantic model's default;
  * a metric's `label` falls back to its name when missing or blank;
  * `filter` and `fill_nulls_with` may sit on the metric or on its input measure, and either counts.

  Simple, cumulative, ratio and derived metrics are parsed. What is structurally beyond Metabase is reported in
  `:unsupported` with a reason here: a cumulative metric with a window or `grain_to_date`, an input with an offset,
  and conversion metrics. Whether the metrics a ratio or derived metric refers to exist is the resolve stage's
  business."
  (:require
   [better-cond.core :as b]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [dev.dbt-import.schemas.dbt-manifest :as dbt-manifest]
   [dev.dbt-import.schemas.ir :as ir]
   [medley.core :as m]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]))

(mu/defn read-manifest :- ::dbt-manifest/manifest
  "Read and decode a `target/manifest.json`."
  [manifest-filename :- :string]
  (-> (with-open [r (io/reader manifest-filename)]
        (json/decode r))
      dbt-manifest/decode-manifest))

(mu/defn- parse-relation :- ::ir/relation
  [{:keys [database schema_name], table-alias :alias} :- ::dbt-manifest/node-relation]
  {:database database
   :schema   schema_name
   :table    table-alias})

(mu/defn- source-node :- [:maybe ::dbt-manifest/node]
  "The node a semantic model is built on: of the nodes it depends on, the one (model, seed or snapshot) whose
  database, schema and alias match `node_relation`, or failing that the first one the manifest has."
  [manifest                            :- ::dbt-manifest/manifest
   {:keys [node_relation depends_on]}  :- ::dbt-manifest/semantic-model]
  (let [nodes          (keep #(get-in manifest [:nodes %]) (:nodes depends_on))
        same-relation? (fn [{:keys [database schema], table-alias :alias}]
                         (= [database schema table-alias]
                            [(:database node_relation) (:schema_name node_relation) (:alias node_relation)]))]
    (or (m/find-first same-relation? nodes)
        (first nodes))))

(mu/defn- parse-columns :- [:map-of :string ::ir/column]
  "Column metadata from the node a semantic model is built on (see [[source-node]]), keyed by column name. Empty when
  the manifest has no such node."
  [manifest       :- ::dbt-manifest/manifest
   semantic-model :- ::dbt-manifest/semantic-model]
  (into {}
        (map (fn [[column-name {:keys [data_type description]}]]
               [column-name {:name        column-name
                             :data-type   data_type
                             :description description}]))
        (:columns (source-node manifest semantic-model))))

(mu/defn- parse-entity :- ::ir/entity
  [{entity-name :name, entity-type :type, :keys [expr label description]} :- ::dbt-manifest/entity]
  {:name        entity-name
   :type        entity-type
   :expr        (or expr entity-name)
   :label       label
   :description description})

(mu/defn- parse-dimension :- ::ir/dimension
  [{dimension-name :name, dimension-type :type, :keys [expr label description type_params]} :- ::dbt-manifest/dimension]
  {:name        dimension-name
   :type        dimension-type
   :expr        (or expr dimension-name)
   :granularity (:time_granularity type_params)
   :label       label
   :description description})

(mu/defn- parse-measure :- ::ir/measure
  [default-agg-time-dimension :- [:maybe :string]
   {measure-name :name, :keys [agg expr label description agg_params non_additive_dimension agg_time_dimension]}
   :- ::dbt-manifest/measure]
  {:name                   measure-name
   :agg                    agg
   :expr                   (or expr measure-name)
   :label                  label
   :description            description
   :agg-params             agg_params
   :non-additive-dimension non_additive_dimension
   :agg-time-dimension     (or agg_time_dimension default-agg-time-dimension)})

(mu/defn parse-semantic-model :- ::ir/semantic-model
  "Parse one manifest semantic model. Needs the whole `manifest` to look up the model node that holds column types."
  [manifest :- ::dbt-manifest/manifest
   {model-name :name, :keys [unique_id label description node_relation defaults primary_entity entities dimensions measures]
    :as        semantic-model}
   :- ::dbt-manifest/semantic-model]
  (let [default-agg-time-dimension (:agg_time_dimension defaults)]
    {:name                       model-name
     :unique-id                  unique_id
     :label                      label
     :description                description
     :relation                   (parse-relation node_relation)
     :columns                    (parse-columns manifest semantic-model)
     :default-agg-time-dimension default-agg-time-dimension
     ;; `primary_entity` is for a model with no entity of type primary; otherwise that entity is it
     :primary-entity             (or primary_entity
                                     (some #(when (= :primary (:type %)) (:name %)) entities))
     :entities                   (mapv parse-entity entities)
     :dimensions                 (mapv parse-dimension dimensions)
     :measures                   (u/index-by :name (map #(parse-measure default-agg-time-dimension %) measures))}))

(mu/defn- filter-templates :- [:sequential :string]
  [filter-intersection :- ::dbt-manifest/filter]
  (mapv :where_sql_template (:where_filters filter-intersection)))

(mu/defn- unsupported :- ::ir/unsupported
  [{metric-name :name, :keys [unique_id]} :- ::dbt-manifest/metric
   reason                                 :- :string]
  {:name      metric-name
   :unique-id unique_id
   :reason    reason})

(mu/defn- inline-aggregation :- ::ir/aggregation
  "The aggregation of a 1.12 inline-spec simple metric, which carries it in `type_params.metric_aggregation_params`
  instead of pointing at a measure. dbt writes the expression next to it, as `type_params.expr`, the same place a
  derived metric's goes; it is `nil` when the metric is written without one, meaning the column is the metric's name.
  Verified against the `parcel_delivery` fixture, dbt 1.12.6 (QRES-6)."
  [metric-name    :- :string
   semantic-model :- ::ir/semantic-model
   expr           :- [:maybe :string]
   {:keys [agg agg_params non_additive_dimension agg_time_dimension]} :- ::dbt-manifest/metric-aggregation-params]
  {:agg                    agg
   :expr                   (or expr metric-name)
   :agg-params             agg_params
   :non-additive-dimension non_additive_dimension
   :agg-time-dimension     (or agg_time_dimension (:default-agg-time-dimension semantic-model))})

(mu/defn- metric-common :- ::ir/metric.common
  "The part of the IR every kind of metric shares."
  [metric-type :- [:enum :simple :cumulative :ratio :derived]
   {metric-name :name, metric-filter :filter, metric-meta :meta, :keys [unique_id label description]}
   :- ::dbt-manifest/metric]
  {:type        metric-type
   :name        metric-name
   :unique-id   unique_id
   :label       (if (str/blank? label) metric-name label)
   :description description
   :filters     (filter-templates metric-filter)
   :meta        metric-meta})

(mu/defn- parse-metric-input :- ::ir/metric-input
  [{metric-name :name, :keys [alias filter]} :- ::dbt-manifest/metric-input]
  {:metric  metric-name
   :alias   alias
   :filters (filter-templates filter)})

(mu/defn- offset-reason :- [:maybe :string]
  "Why a ratio or derived metric with `inputs` cannot be converted: the first input shifted in time, if any. MBQL's
  `offset` is relative to the rows of the result, not to a span of time, so period-over-period comparisons have no
  faithful equivalent."
  [inputs :- [:sequential ::dbt-manifest/metric-input]]
  (some (fn [{metric-name :name, :keys [alias offset_window offset_to_grain]}]
          (let [input-name (or alias metric-name)]
            (cond
              offset_window
              (format "input %s has an offset_window of %d %s: period-over-period comparisons have no Metabase equivalent"
                      (pr-str input-name) (:count offset_window) (:granularity offset_window))

              offset_to_grain
              (format "input %s has an offset_to_grain of %s: comparisons with the start of a period have no Metabase equivalent"
                      (pr-str input-name) (pr-str offset_to_grain)))))
        inputs))

(mu/defn- parse-ratio :- [:or ::ir/metric.ratio ::ir/unsupported]
  [{:keys [type_params] :as metric} :- ::dbt-manifest/metric]
  (let [{:keys [numerator denominator]} type_params]
    (b/cond
      (or (nil? numerator) (nil? denominator))
      (unsupported metric "ratio metric without a numerator and a denominator")

      :let [reason (offset-reason [numerator denominator])]

      reason
      (unsupported metric reason)

      :else
      (assoc (metric-common :ratio metric)
             :numerator   (parse-metric-input numerator)
             :denominator (parse-metric-input denominator)))))

(mu/defn- parse-derived :- [:or ::ir/metric.derived ::ir/unsupported]
  [{:keys [type_params] :as metric} :- ::dbt-manifest/metric]
  (let [{:keys [expr metrics]} type_params]
    (b/cond
      (str/blank? expr)
      (unsupported metric "derived metric without an expr")

      (empty? metrics)
      (unsupported metric "derived metric without input metrics")

      :let [reason (offset-reason metrics)]

      reason
      (unsupported metric reason)

      :else
      (assoc (metric-common :derived metric)
             :expr   expr
             :inputs (mapv parse-metric-input metrics)))))

(mu/defn- cumulative-reason :- [:maybe :string]
  "Why a cumulative metric cannot be converted: a window or a `grain_to_date`, written the 1.12 way in
  `cumulative_type_params` or the legacy way directly in `type_params`. Without either it is a running total over
  everything, which Metabase has."
  [{:keys [window grain_to_date cumulative_type_params]} :- ::dbt-manifest/metric-type-params]
  (let [window        (or window (:window cumulative_type_params))
        grain-to-date (or grain_to_date (:grain_to_date cumulative_type_params))]
    (cond
      window
      (format "a cumulative metric with a window of %d %s has no Metabase equivalent: MBQL has no rolling-window aggregation"
              (:count window) (:granularity window))

      grain-to-date
      (format "a cumulative metric with grain_to_date %s has no Metabase equivalent: a running total that resets at each %s needs a breakout the metric cannot require"
              (pr-str grain-to-date) grain-to-date))))

(mu/defn- parse-simple :- [:or ::ir/metric.simple ::ir/unsupported]
  "A simple or cumulative metric, which aggregate one measure of one semantic model. A legacy-spec metric of either
  kind points at the measure. An inline-spec (dbt 1.12) simple metric carries the aggregation itself, in
  `metric_aggregation_params` and `expr`; an inline-spec cumulative metric points at the simple metric it runs over,
  in `cumulative_type_params.metric` and `depends_on`, and takes that metric's aggregation, semantic model and
  filters."
  [semantic-models :- [:map-of :string ::ir/semantic-model]
   metrics         :- [:map-of :string ::dbt-manifest/metric]
   {metric-type :type, :keys [type_params depends_on] :as metric}
   :- ::dbt-manifest/metric]
  (b/cond
    :let [reason (when (= metric-type :cumulative) (cumulative-reason type_params))]

    reason
    (unsupported metric reason)

    :let [node-id-with-prefix (fn [prefix nodes] (m/find-first #(str/starts-with? % prefix) nodes))
          input-metric-id     (when (= metric-type :cumulative)
                                (node-id-with-prefix "metric." (:nodes depends_on)))
          input-metric        (get metrics input-metric-id)]

    (and input-metric-id (not input-metric))
    (unsupported metric (format "input metric %s not found in manifest" (pr-str input-metric-id)))

    (and input-metric (not= :simple (:type input-metric)))
    (unsupported metric (format "a cumulative metric over the %s metric %s has no Metabase equivalent: only a simple aggregation can run cumulatively"
                                (name (:type input-metric)) (pr-str (:name input-metric))))

    ;; the metric whose type_params carry the aggregation: the input metric of an inline-spec cumulative metric,
    ;; otherwise this one
    :let [source            (or input-metric metric)
          source-params     (:type_params source)
          semantic-model-id (node-id-with-prefix "semantic_model." (-> source :depends_on :nodes))
          semantic-model    (get semantic-models semantic-model-id)]

    (not semantic-model)
    (unsupported metric (format "semantic model %s not found in manifest" (pr-str semantic-model-id)))

    :let [input-measure (:measure source-params)
          measure       (when input-measure
                          (get-in semantic-model [:measures (:name input-measure)]))
          inline-params (:metric_aggregation_params source-params)]

    (and input-measure (not measure))
    (unsupported metric (format "measure %s not found on semantic model %s"
                                (pr-str (:name input-measure)) (pr-str (:name semantic-model))))

    (and (not measure) (not inline-params))
    (unsupported metric "simple metric has neither a measure nor metric_aggregation_params")

    :let [aggregation (if measure
                        (select-keys measure [:agg :expr :agg-params :non-additive-dimension :agg-time-dimension])
                        (inline-aggregation (:name source) semantic-model (:expr source-params) inline-params))]

    :else
    (merge aggregation
           (metric-common metric-type metric)
           {:semantic-model    (:name semantic-model)
            :measure           (:name measure)
            ;; the metric's own filters, then those of the metric it runs over and of the reference to it, then the
            ;; measure's; a filter on either side of a reference applies to its use
            :filters           (-> []
                                   (into (filter-templates (:filter metric)))
                                   (into (when input-metric (filter-templates (:filter input-metric))))
                                   (into (filter-templates (get-in type_params [:cumulative_type_params :metric :filter])))
                                   (into (filter-templates (:filter input-measure))))
            :fill-nulls-with   (or (:fill_nulls_with type_params) (:fill_nulls_with source-params) (:fill_nulls_with input-measure))
            :join-to-timespine (boolean (or (:join_to_timespine type_params) (:join_to_timespine source-params) (:join_to_timespine input-measure)))})))

(mu/defn parse-metric :- [:or ::ir/metric ::ir/unsupported]
  "Parse one manifest metric into an `::ir/metric`, or an `::ir/unsupported` record saying why it could not be.
  `semantic-models` is keyed by semantic model unique ID, which is how a simple metric's `depends_on` refers to it;
  `metrics` is the manifest's own `metrics` map, keyed by metric unique ID, which is how an inline-spec cumulative
  metric refers to the metric it runs over. Without it, such a metric is reported."
  ([semantic-models :- [:map-of :string ::ir/semantic-model]
    metric          :- ::dbt-manifest/metric]
   (parse-metric semantic-models {} metric))

  ([semantic-models :- [:map-of :string ::ir/semantic-model]
    metrics         :- [:map-of :string ::dbt-manifest/metric]
    {metric-type :type, :as metric} :- ::dbt-manifest/metric]
   (case metric-type
     (:simple :cumulative) (parse-simple semantic-models metrics metric)
     :ratio                (parse-ratio metric)
     :derived              (parse-derived metric)
     :conversion           (unsupported metric "conversion metrics are out of scope: a per-entity funnel is nothing a Metabase metric expresses"))))

(mu/defn parse-manifest :- ::ir/manifest
  "Parse a decoded manifest (see [[read-manifest]]) into the IR. Metrics that cannot be parsed land in `:unsupported`
  with a reason instead of failing the run."
  [manifest :- ::dbt-manifest/manifest]
  (let [semantic-models                   (update-vals (:semantic_models manifest)
                                                       #(parse-semantic-model manifest %))
        {metrics false, unsupported-metrics true} (->> (vals (:metrics manifest))
                                               (sort-by :name)
                                               (map #(parse-metric semantic-models (:metrics manifest) %))
                                               (group-by #(contains? % :reason)))]
    {:source          {:tool    "dbt"
                       :version (-> manifest :metadata :dbt_version)
                       :project (-> manifest :metadata :project_name)}
     :semantic-models (u/index-by :name (vals semantic-models))
     :metrics         (vec metrics)
     :unsupported     (vec unsupported-metrics)}))

(mu/defn parse-manifest-file :- ::ir/manifest
  "[[read-manifest]] then [[parse-manifest]]."
  [manifest-filename :- :string]
  (parse-manifest (read-manifest manifest-filename)))

(comment
  (def %manifest-filename
    "Path to the flexanalytics manifest for REPL use; see the README for how to generate it."
    "/home/cam/dbt-business-intelligence/target/manifest.json")

  (parse-manifest-file %manifest-filename))
