(ns dev.dbt-import.parse
  "Stage 1 of the converter: turn a decoded dbt manifest into the IR (see [[dev.dbt-import.schemas.ir]]).

(set! *warn-on-reflection* true)

  Pure apart from [[read-manifest]]. Applies dbt's own defaulting rules and nothing Metabase-specific:

  * a nil `expr` on an entity, dimension or measure means the name is the column;
  * a measure without `agg_time_dimension` inherits the semantic model's default;
  * a metric's `label` falls back to its name when missing or blank;
  * `filter` and `fill_nulls_with` may sit on the metric or on its input measure, and either counts.

  Only simple metrics are parsed. Anything else is reported in `:unsupported` with a reason."
  (:require
   [better-cond.core :as b]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [dev.dbt-import.schemas.dbt-manifest :as dbt-manifest]
   [dev.dbt-import.schemas.ir :as ir]
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
  [{:keys [database schema_name alias]} :- ::dbt-manifest/node-relation]
  {:database database
   :schema   schema_name
   :table    alias})

(mu/defn- source-node :- [:maybe ::dbt-manifest/node]
  "The node a semantic model is built on: of the nodes it depends on, the one (model, seed or snapshot) whose
  database, schema and alias match `node_relation`, or failing that the first one the manifest has."
  [manifest                            :- ::dbt-manifest/manifest
   {:keys [node_relation depends_on]}  :- ::dbt-manifest/semantic-model]
  (let [nodes          (keep #(get-in manifest [:nodes %]) (:nodes depends_on))
        same-relation? (fn [{:keys [database schema alias]}]
                         (= [database schema alias]
                            [(:database node_relation) (:schema_name node_relation) (:alias node_relation)]))]
    (or (first (filter same-relation? nodes))
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
  [{entity-name :name, :keys [type expr label description]} :- ::dbt-manifest/entity]
  {:name        entity-name
   :type        type
   :expr        (or expr entity-name)
   :label       label
   :description description})

(mu/defn- parse-dimension :- ::ir/dimension
  [{dimension-name :name, :keys [type expr label description type_params]} :- ::dbt-manifest/dimension]
  {:name        dimension-name
   :type        type
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
   {model-name :name, :keys [unique_id label description node_relation defaults entities dimensions measures]
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
  "The aggregation of a 1.12 inline-spec simple metric, which carries it in `metric_aggregation_params` instead of
  pointing at a measure. Shape unverified on a real 1.12 manifest (QRES-6)."
  [metric-name    :- :string
   semantic-model :- ::ir/semantic-model
   {:keys [agg expr agg_params non_additive_dimension agg_time_dimension]} :- ::dbt-manifest/metric-aggregation-params]
  {:agg                    agg
   :expr                   (or expr metric-name)
   :agg-params             agg_params
   :non-additive-dimension non_additive_dimension
   :agg-time-dimension     (or agg_time_dimension (:default-agg-time-dimension semantic-model))})

(mu/defn parse-metric :- [:or ::ir/metric ::ir/unsupported]
  "Parse one manifest metric into an `::ir/metric`, or an `::ir/unsupported` record saying why it could not be.
  `semantic-models` is keyed by semantic model unique ID, which is how the metric's `depends_on` refers to it."
  [semantic-models :- [:map-of :string ::ir/semantic-model]
   {metric-name :name, metric-type :type, metric-filter :filter, metric-meta :meta
    :keys       [unique_id label description type_params depends_on]
    :as         metric}
   :- ::dbt-manifest/metric]
  (b/cond
    (not= metric-type :simple)
    (unsupported metric (format "metric type %s is not supported yet (QRES-5)" (name metric-type)))

    :let [semantic-model-id (first (filter #(str/starts-with? % "semantic_model.") (:nodes depends_on)))
          semantic-model    (get semantic-models semantic-model-id)]

    (not semantic-model)
    (unsupported metric (format "semantic model %s not found in manifest" (pr-str semantic-model-id)))

    :let [input-measure (:measure type_params)
          measure       (when input-measure
                          (get-in semantic-model [:measures (:name input-measure)]))
          inline-params (:metric_aggregation_params type_params)]

    (and input-measure (not measure))
    (unsupported metric (format "measure %s not found on semantic model %s"
                                (pr-str (:name input-measure)) (pr-str (:name semantic-model))))

    (and (not measure) (not (:agg inline-params)))
    (unsupported metric "simple metric has neither a measure nor metric_aggregation_params")

    :let [aggregation (if measure
                        (select-keys measure [:agg :expr :agg-params :non-additive-dimension :agg-time-dimension])
                        (inline-aggregation metric-name semantic-model inline-params))]

    :else
    (merge aggregation
           {:name              metric-name
            :unique-id         unique_id
            :label             (if (str/blank? label) metric-name label)
            :description       description
            :semantic-model    (:name semantic-model)
            :measure           (:name measure)
            :filters           (into (filter-templates metric-filter)
                                     (filter-templates (:filter input-measure)))
            :fill-nulls-with   (or (:fill_nulls_with type_params) (:fill_nulls_with input-measure))
            :join-to-timespine (boolean (or (:join_to_timespine type_params) (:join_to_timespine input-measure)))
            :meta              metric-meta})))

(mu/defn parse-manifest :- ::ir/manifest
  "Parse a decoded manifest (see [[read-manifest]]) into the IR. Metrics that cannot be parsed land in `:unsupported`
  with a reason instead of failing the run."
  [manifest :- ::dbt-manifest/manifest]
  (let [semantic-models                   (update-vals (:semantic_models manifest)
                                                       #(parse-semantic-model manifest %))
        {metrics false, unsupported true} (->> (vals (:metrics manifest))
                                               (sort-by :name)
                                               (map #(parse-metric semantic-models %))
                                               (group-by #(contains? % :reason)))]
    {:source          {:tool    "dbt"
                       :version (-> manifest :metadata :dbt_version)
                       :project (-> manifest :metadata :project_name)}
     :semantic-models (u/index-by :name (vals semantic-models))
     :metrics         (vec metrics)
     :unsupported     (vec unsupported)}))

(mu/defn parse-manifest-file :- ::ir/manifest
  "[[read-manifest]] then [[parse-manifest]]."
  [manifest-filename :- :string]
  (parse-manifest (read-manifest manifest-filename)))

(comment
  (def %manifest-filename
    "Path to the flexanalytics manifest for REPL use; see the README for how to generate it."
    "/home/cam/dbt-business-intelligence/target/manifest.json")

  (parse-manifest-file %manifest-filename))
