(ns dev.dbt-import.parse
  "Stage 1 of the converter: turn a decoded dbt manifest into the IR (see [[dev.dbt-import.schemas.ir]]).

  Pure apart from [[read-manifest]]. Applies dbt's own defaulting rules and nothing Metabase-specific:

  * a nil `expr` on an entity, dimension or measure means the name is the column;
  * a measure without `agg_time_dimension` inherits the semantic model's default;
  * a metric's `label` falls back to its name when missing or blank;
  * `filter`, `fill_nulls_with` and `join_to_timespine` may sit on the metric, on its input measure or, for a
    cumulative metric, on the metric it runs over; see [[simple-metric-extras]] for which counts when.

  A key a manifest leaves out is read as if it were `null`: the schemas make every nullable key optional, and the
  code here destructures, so absence and `null` take the same path.

  Simple, cumulative, ratio and derived metrics are parsed. What is structurally beyond Metabase is reported in
  `:unsupported` with a reason here: a cumulative metric with a window, a `grain_to_date` or a `period_agg` other than
  `last`, an input with an offset, conversion metrics, a non-additive measure, and a percentile without a value,
  outside 0..1 or discrete. So is a manifest that disagrees with itself, where a name in `type_params` is not what
  `depends_on` resolved to. Whether the metrics a ratio or derived metric refers to exist is the resolve stage's
  business. An unexpected exception while parsing one metric or semantic model is logged and reported too, flagged
  `:error?`, so one bad entry does not fail the run."
  (:require
   [better-cond.core :as b]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [dev.dbt-import.schemas.dbt-manifest :as dbt-manifest]
   [dev.dbt-import.schemas.ir :as ir]
   [dev.dbt-import.unsupported :as unsupported]
   [medley.core :as m]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (clojure.lang ExceptionInfo)))

(mu/defn- read-json :- :any
  "The JSON of the file at `manifest-filename`, parsed with string keys, whatever its shape. Throws, naming the file,
  when it cannot be read or is not JSON."
  [manifest-filename :- :string]
  (try
    (with-open [r (io/reader manifest-filename)]
      (json/decode r))
    (catch Exception e
      (throw (ex-info (format "Cannot read dbt manifest %s: %s" manifest-filename (ex-message e))
                      {:path manifest-filename}
                      e)))))

(mu/defn read-manifest :- ::dbt-manifest/manifest
  "Read and decode a `target/manifest.json`. Every failure names the file and carries its `:path` in the exception's
  data: a file that cannot be read or is not JSON, one whose JSON is not an object (an empty file decodes to nothing),
  and one that is not a manifest the converter reads, which [[dbt-manifest/decode-manifest]] explains."
  [manifest-filename :- :string]
  (let [raw (read-json manifest-filename)]
    (when-not (map? raw)
      (throw (ex-info (format "Invalid dbt manifest %s: %s" manifest-filename
                              (cond
                                (nil? raw)        "the file is empty"
                                (sequential? raw) "the file holds a JSON array, not an object"
                                :else             "the file holds a JSON value that is not an object"))
                      {:path manifest-filename})))
    (try
      (dbt-manifest/decode-manifest raw)
      (catch ExceptionInfo e
        (throw (ex-info (format "%s (%s)" (ex-message e) manifest-filename)
                        (assoc (ex-data e) :path manifest-filename)
                        e))))))

(def ^:private relation-name-part-re
  "One part of a relation name as dbt renders it, with the dot after it when there is one: in double quotes
  (`\"dbt_bi\"`, dbt-postgres, dbt-snowflake, dbt-redshift, dbt-oracle, dbt-trino), in backticks (`` `dbt_bi` ``,
  dbt-mysql, dbt-bigquery, dbt-spark, dbt-databricks, dbt-hive), in square brackets (`[dbt_bi]`, dbt-sqlserver) or
  bare (`dbt_bi`). A closing quote doubled inside a quoted part stands for itself. The groups, in that order, say how
  the part was quoted."
  #"(?:\"((?:[^\"]|\"\")*)\"|`((?:[^`]|``)*)`|\[((?:[^\]]|\]\])*)\]|([^.\"`\[\]]+))\.?")

(mu/defn- relation-name-parts :- [:maybe [:sequential [:map {:closed true}
                                                        [:name    :string]
                                                        [:quoted? :boolean]]]]
  "The parts of `relation-name` in order, each with its quotes stripped (a doubled closing quote undoubled) and
  whether it had any; nil when the name is not a dotted list of parts [[relation-name-part-re]] reads."
  [relation-name :- :string]
  (let [matches (re-seq relation-name-part-re relation-name)]
    (when (= relation-name (apply str (map first matches)))
      (for [[_ double-quoted backticked bracketed bare] matches]
        (cond
          double-quoted {:name (str/replace double-quoted "\"\"" "\""), :quoted? true}
          backticked    {:name (str/replace backticked "``" "`"), :quoted? true}
          bracketed     {:name (str/replace bracketed "]]" "]"), :quoted? true}
          :else         {:name bare, :quoted? false})))))

(mu/defn quoted-parts :- [:set ::ir/relation-part]
  "The parts of `node-relation` that dbt quoted when it built the table, read off `relation_name`, the relation as dbt
  renders it in SQL (`\"dbt_bi\".\"public\".\"fact_sales\"`, `analytics.dbt_alice.dim_customers`,
  `` `mydb`.`orders` ``): its last part is the table, the one before the schema and the one before that the database,
  and a part counts as quoted when it is in quotes and names what `node_relation` says. Empty when `relation_name` is
  missing (dbt writes none for an ephemeral model), is not in a form this reads, or names another relation: every
  part is then taken as unquoted, and a warehouse that folds the case of an unquoted identifier is taken to have folded
  it (see [[dev.dbt-import.metadata]])."
  [{:keys [database], schema-name :schema_name, table-alias :alias, relation-name :relation_name}
   :- ::dbt-manifest/node-relation]
  (into #{}
        (keep (fn [[part expected {part-name :name, :keys [quoted?]}]]
                (when (and quoted? (= part-name expected))
                  part)))
        (map vector
             [:table :schema :database]
             [table-alias schema-name database]
             (reverse (some-> relation-name relation-name-parts)))))

(mu/defn- parse-relation :- ::ir/relation
  [{:keys [database], schema-name :schema_name, table-alias :alias, :as node-relation}
   :- ::dbt-manifest/node-relation]
  {:database database
   :schema   schema-name
   :table    table-alias
   :quoted   (quoted-parts node-relation)})

(mu/defn- source-node :- [:maybe ::dbt-manifest/node]
  "The node a semantic model is built on: of the `nodes` it depends on, the one (model, seed or snapshot) whose
  database, schema and alias match `node_relation`, or failing that the first one the manifest has."
  [nodes                                                 :- [:map-of :string ::dbt-manifest/node]
   {node-relation :node_relation, depends-on :depends_on} :- ::dbt-manifest/semantic-model]
  (let [candidates     (keep nodes (:nodes depends-on))
        same-relation? (fn [{:keys [database schema], table-alias :alias}]
                         (= [database schema table-alias]
                            [(:database node-relation) (:schema_name node-relation) (:alias node-relation)]))]
    (or (m/find-first same-relation? candidates)
        (first candidates))))

(mu/defn- parse-columns :- [:map-of :string ::ir/column]
  "Column metadata from `node`, the node a semantic model is built on (see [[source-node]]), keyed by column name.
  Empty when the manifest has no such node."
  [node :- [:maybe ::dbt-manifest/node]]
  (into {}
        (map (fn [[column-name {data-type :data_type, quoted? :quote, :keys [description]}]]
               [column-name {:name        column-name
                             :data-type   data-type
                             :description description
                             :quoted?     (boolean quoted?)}]))
        (:columns node)))

(mu/defn- parse-entity :- ::ir/entity
  [{entity-name :name, entity-type :type, :keys [expr label description]} :- ::dbt-manifest/entity]
  {:name        entity-name
   :type        entity-type
   :expr        (or expr entity-name)
   :label       label
   :description description})

(mu/defn- parse-validity-params :- [:maybe ::ir/validity-params]
  "A time dimension's `validity_params`, the flags that mark it as the start or end of a slowly changing dimension's
  validity window; dbt defaults each flag to false when it is left out."
  [validity-params :- [:maybe ::dbt-manifest/dimension-type-params.validity-params]]
  (when validity-params
    {:is-start (boolean (:is_start validity-params))
     :is-end   (boolean (:is_end validity-params))}))

(mu/defn- parse-dimension :- ::ir/dimension
  [{dimension-name :name, dimension-type :type, type-params :type_params, :keys [expr label description]}
   :- ::dbt-manifest/dimension]
  {:name            dimension-name
   :type            dimension-type
   :expr            (or expr dimension-name)
   :granularity     (:time_granularity type-params)
   :validity-params (parse-validity-params (:validity_params type-params))
   :label           label
   :description     description})

(mu/defn- parse-agg-params :- [:maybe ::dbt-manifest/aggregation-params]
  "`agg_params` with dbt's defaults filled in: the two flags are false when left out, and every key is present, so a
  manifest that leaves a key out reads as one that writes it `null`."
  [agg-params :- [:maybe ::dbt-manifest/aggregation-params]]
  (when agg-params
    {:percentile                 (:percentile agg-params)
     :use_discrete_percentile    (boolean (:use_discrete_percentile agg-params))
     :use_approximate_percentile (boolean (:use_approximate_percentile agg-params))}))

(mu/defn- parse-non-additive-dimension :- [:maybe ::dbt-manifest/non-additive-dimension]
  "`non_additive_dimension` with dbt's defaults filled in: `window_choice` is `min` and `window_groupings` is empty
  when left out."
  [non-additive-dimension :- [:maybe ::dbt-manifest/non-additive-dimension]]
  (when non-additive-dimension
    {:name             (:name non-additive-dimension)
     :window_choice    (or (:window_choice non-additive-dimension) :min)
     :window_groupings (vec (:window_groupings non-additive-dimension))}))

(mu/defn- parse-aggregation :- ::ir/aggregation
  "The IR aggregation a legacy-spec measure or an inline-spec metric's `metric_aggregation_params` declares; both
  carry the same keys. A nil `expr` means the column is `default-expr`, the measure's or the metric's name; a nil
  `agg_time_dimension` means `default-agg-time-dimension`, the semantic model's."
  [default-expr               :- :string
   default-agg-time-dimension :- [:maybe :string]
   {:keys                  [agg expr]
    agg-params             :agg_params
    non-additive-dimension :non_additive_dimension
    agg-time-dimension     :agg_time_dimension}
   :- [:or ::dbt-manifest/measure ::dbt-manifest/metric-aggregation-params]]
  {:agg                    agg
   :expr                   (or expr default-expr)
   :agg-params             (parse-agg-params agg-params)
   :non-additive-dimension (parse-non-additive-dimension non-additive-dimension)
   :agg-time-dimension     (or agg-time-dimension default-agg-time-dimension)})

(mu/defn- parse-measure :- ::ir/measure
  [default-agg-time-dimension :- [:maybe :string]
   {measure-name :name, :keys [label description] :as measure} :- ::dbt-manifest/measure]
  (assoc (parse-aggregation measure-name default-agg-time-dimension measure)
         :name        measure-name
         :label       label
         :description description))

(mu/defn- measure-aggregation :- ::ir/aggregation
  "The aggregation part of an IR measure: everything but its name, label and description."
  [measure :- ::ir/measure]
  (dissoc measure :name :label :description))

(mu/defn parse-semantic-model :- ::ir/semantic-model
  "Parse one manifest semantic model. `nodes` is the manifest's `nodes`, where the model node that holds the column
  types is looked up (see [[source-node]])."
  [nodes :- [:map-of :string ::dbt-manifest/node]
   {model-name     :name
    unique-id      :unique_id
    node-relation  :node_relation
    primary-entity :primary_entity
    :keys          [label description defaults entities dimensions measures]
    :as            semantic-model}
   :- ::dbt-manifest/semantic-model]
  (let [default-agg-time-dimension (:agg_time_dimension defaults)]
    {:name                       model-name
     :unique-id                  unique-id
     :label                      label
     :description                description
     :relation                   (parse-relation node-relation)
     :columns                    (parse-columns (source-node nodes semantic-model))
     :default-agg-time-dimension default-agg-time-dimension
     ;; `primary_entity` is for a model with no entity of type primary; otherwise that entity is it
     :primary-entity             (or primary-entity
                                     (some #(when (= :primary (:type %)) (:name %)) entities))
     :entities                   (mapv parse-entity entities)
     :dimensions                 (mapv parse-dimension dimensions)
     :measures                   (u/index-by :name (map #(parse-measure default-agg-time-dimension %) measures))}))

(mu/defn- filter-templates :- [:sequential :string]
  [filter-intersection :- ::dbt-manifest/filter]
  (mapv :where_sql_template (:where_filters filter-intersection)))

(mu/defn- metric-common :- ::ir/metric.common
  "The part of the IR every kind of metric shares. `filters` and `fill_nulls_with` are the metric's own; for a simple
  or cumulative metric [[parse-simple]] replaces them with what [[simple-metric-extras]] gathers from every place the
  specs put them."
  [metric-type :- [:enum :simple :cumulative :ratio :derived]
   {metric-name      :name
    metric-filter    :filter
    metric-meta      :meta
    unique-id        :unique_id
    type-params      :type_params
    time-granularity :time_granularity
    :keys            [label description]}
   :- ::dbt-manifest/metric]
  {:type             metric-type
   :name             metric-name
   :unique-id        unique-id
   :label            (if (str/blank? label) metric-name label)
   :description      description
   :filters          (filter-templates metric-filter)
   :fill-nulls-with  (:fill_nulls_with type-params)
   :time-granularity time-granularity
   :meta             metric-meta})

(mu/defn- parse-metric-input :- ::ir/metric-input
  [{metric-name :name, input-alias :alias, input-filter :filter} :- ::dbt-manifest/metric-input]
  {:metric  metric-name
   :alias   input-alias
   :filters (filter-templates input-filter)})

(mu/defn- offset-reason :- [:maybe :string]
  "Why a metric with `inputs` cannot be converted: the first input shifted in time, if any. MBQL's `offset` is
  relative to the rows of the result, not to a span of time, so period-over-period comparisons have no faithful
  equivalent. `inputs` are a ratio metric's numerator and denominator, a derived metric's `metrics`, or the metric an
  inline-spec cumulative metric runs over."
  [inputs :- [:sequential ::dbt-manifest/metric-input]]
  (some (fn [{metric-name :name, input-alias :alias, offset-window :offset_window, offset-to-grain :offset_to_grain}]
          (let [input-name (or input-alias metric-name)]
            (cond
              offset-window
              (format (str "input %s has an offset_window of %d %s: period-over-period comparisons have no Metabase"
                           " equivalent")
                      (pr-str input-name) (:count offset-window) (:granularity offset-window))

              offset-to-grain
              (format (str "input %s has an offset_to_grain of %s: comparisons with the start of a period have no"
                           " Metabase equivalent")
                      (pr-str input-name) (pr-str offset-to-grain)))))
        inputs))

(mu/defn- metric-node-name :- [:maybe :string]
  "The metric name in `node-id`, a `depends_on.nodes` entry, when it is a metric's unique id: `metric.<package>.<name>`
  (neither part may contain a dot). Nil for any other node."
  [node-id :- :string]
  (when (str/starts-with? node-id "metric.")
    (last (str/split node-id #"\."))))

(mu/defn- undeclared-input :- [:maybe :string]
  "The name of the first of `inputs` that is not among the metrics `depends-on` lists, if any. dbt resolves every
  input of a ratio or derived metric to a `metric.<package>.<name>` node there, so an input with no node is one dbt
  did not resolve: a manifest edited by hand, or written by something other than dbt, which is reported rather than
  trusted."
  [depends-on :- ::dbt-manifest/depends-on
   inputs     :- [:sequential ::dbt-manifest/metric-input]]
  (let [declared (into #{} (keep metric-node-name) (:nodes depends-on))]
    (some (fn [{input-name :name}]
            (when-not (contains? declared input-name)
              input-name))
          inputs)))

(mu/defn- check-inputs! :- :nil
  "[[unsupported/throw!]] when one of a ratio or derived metric's `inputs` is shifted in time (see [[offset-reason]])
  or is not among the metrics its `depends_on` resolved (see [[undeclared-input]])."
  [{depends-on :depends_on} :- ::dbt-manifest/metric
   inputs                   :- [:sequential ::dbt-manifest/metric-input]]
  (some-> (offset-reason inputs) unsupported/throw!)
  (when-let [input-name (undeclared-input depends-on inputs)]
    (unsupported/throw! (str "input metric %s is not among the metrics depends_on lists: the manifest did not resolve"
                             " it, so it is not read")
                        (pr-str input-name))))

(mu/defn- parse-ratio :- ::ir/metric.ratio
  [{type-params :type_params :as metric} :- ::dbt-manifest/metric]
  (let [{numerator-input :numerator, denominator-input :denominator} type-params]
    (when (or (nil? numerator-input) (nil? denominator-input))
      (unsupported/throw! "ratio metric without a numerator and a denominator"))
    (check-inputs! metric [numerator-input denominator-input])
    (assoc (metric-common :ratio metric)
           :numerator   (parse-metric-input numerator-input)
           :denominator (parse-metric-input denominator-input))))

(mu/defn- parse-derived :- ::ir/metric.derived
  [{type-params :type_params :as metric} :- ::dbt-manifest/metric]
  (let [{:keys [expr metrics]} type-params]
    (when (str/blank? expr)
      (unsupported/throw! "derived metric without an expr"))
    (when (empty? metrics)
      (unsupported/throw! "derived metric without input metrics"))
    (check-inputs! metric metrics)
    (assoc (metric-common :derived metric)
           :expr   expr
           :inputs (mapv parse-metric-input metrics))))

(mu/defn- cumulative-reason :- [:maybe :string]
  "Why a cumulative metric cannot be converted: a window or a `grain_to_date`, written the 1.12 way in
  `cumulative_type_params` or the legacy way directly in `type_params`, or a `period_agg` other than `last`. Without
  a window or `grain_to_date` it is a running total over everything, which Metabase has, but only as the value at the
  end of each period when broken out coarser than its grain: dbt's `period_agg: last`. The default, `first`, is the
  value at the start of each period, and `average` the mean over its days; neither is what Metabase computes, so both
  are reported rather than approximated. A manifest without `period_agg` means dbt's default."
  [{:keys                  [window]
    grain-to-date          :grain_to_date
    cumulative-type-params :cumulative_type_params}
   :- ::dbt-manifest/metric-type-params]
  (let [window        (or window (:window cumulative-type-params))
        grain-to-date (or grain-to-date (:grain_to_date cumulative-type-params))
        period-agg    (or (:period_agg cumulative-type-params) :first)]
    (cond
      window
      (format (str "a cumulative metric with a window of %d %s has no Metabase equivalent: MBQL has no rolling-window"
                   " aggregation")
              (:count window) (:granularity window))

      grain-to-date
      (format (str "a cumulative metric with grain_to_date %s has no Metabase equivalent: a running total that resets"
                   " at each %s needs a breakout the metric cannot require")
              (pr-str grain-to-date) grain-to-date)

      (not= period-agg :last)
      (format (str "a cumulative metric with period_agg %s has no Metabase equivalent: under a breakout coarser than"
                   " its grain, Metabase's running total is the value at the end of each period, which is"
                   " period_agg last; set period_agg: last to convert it")
              (name period-agg)))))

(mu/defn- aggregation-reason :- [:maybe :string]
  "Why an aggregation has no Metabase equivalent, from the IR alone: a non-additive dimension, or a percentile
  without a value, outside 0..1 or discrete. Nil when Metabase can express it."
  [{:keys [agg agg-params non-additive-dimension]} :- ::ir/aggregation]
  (let [percentile (:percentile agg-params)]
    (cond
      non-additive-dimension
      "non-additive measures have no Metabase equivalent"

      (not= agg :percentile)
      nil

      (nil? percentile)
      "percentile aggregation without a percentile value"

      ;; dbt takes the percentile as a fraction and nothing else: `95` is not read as 95%, since `1.5` could not be
      (not (<= 0 percentile 1))
      (format "percentile %s is out of range: dbt takes a fraction between 0 and 1" percentile)

      (:use_discrete_percentile agg-params)
      "discrete percentiles have no Metabase equivalent: Metabase percentiles are continuous")))

(mu/defn- node-id-with-prefix :- [:maybe :string]
  "The first of the `depends_on.nodes` ids `node-ids` of the kind `prefix` names, `\"metric.\"` or
  `\"semantic_model.\"`."
  [prefix   :- :string
   node-ids :- [:sequential :string]]
  (m/find-first #(str/starts-with? % prefix) node-ids))

(mr/def ::cumulative-input
  "The simple metric an inline-spec cumulative metric runs over, and the reference to it written in
  `cumulative_type_params.metric`, whose filter applies to the cumulative metric too (nil when the manifest has only
  the `depends_on` node)."
  [:map {:closed true}
   [:metric    ::dbt-manifest/metric]
   [:reference [:maybe ::dbt-manifest/metric-input]]])

(mu/defn- cumulative-input :- [:maybe ::cumulative-input]
  "The metric a cumulative `metric` runs over: on the 1.12 inline spec the simple metric in
  `cumulative_type_params.metric`, resolved through `depends_on` into `metrics`, the manifest's own metrics by unique
  id. Nil for a legacy-spec cumulative metric, which points at a measure instead. [[unsupported/throw!]] when the
  input metric is not in `metrics`, is not a simple metric, is not the metric `cumulative_type_params.metric` names,
  or is shifted in time by an `offset_window` or `offset_to_grain` (see [[offset-reason]])."
  [metrics                                           :- [:map-of :string ::dbt-manifest/metric]
   {type-params :type_params, depends-on :depends_on} :- ::dbt-manifest/metric]
  (when-let [input-metric-id (node-id-with-prefix "metric." (:nodes depends-on))]
    (let [input-metric (get metrics input-metric-id)
          reference    (get-in type-params [:cumulative_type_params :metric])]
      (when-not input-metric
        (unsupported/throw! "input metric %s not found in manifest" (pr-str input-metric-id)))
      (when-not (= :simple (:type input-metric))
        (unsupported/throw! (str "a cumulative metric over the %s metric %s has no Metabase equivalent: only a simple"
                                 " aggregation can run cumulatively")
                            (name (:type input-metric)) (pr-str (:name input-metric))))
      (when (and reference (not= (:name reference) (:name input-metric)))
        (unsupported/throw! (str "cumulative_type_params.metric names %s but depends_on resolved to the metric %s:"
                                 " the manifest disagrees with itself")
                            (pr-str (:name reference)) (pr-str (:name input-metric))))
      (some-> (when reference (offset-reason [reference])) unsupported/throw!)
      {:metric    input-metric
       :reference reference})))

(mr/def ::aggregation-source
  "Where a simple metric's aggregation comes from, in one shape whichever spec wrote it: the semantic model, the
  aggregation, and the measure's name when the aggregation is a measure's (nil on the inline spec)."
  [:map {:closed true}
   [:semantic-model ::ir/semantic-model]
   [:aggregation    ::ir/aggregation]
   [:measure        [:maybe :string]]])

(mu/defn- aggregation-source :- ::aggregation-source
  "The aggregation of `metric` (see `::aggregation-source`). On the legacy spec `type_params.measure` points at a
  measure of the semantic model in `depends_on`. On the 1.12 inline spec the metric carries the aggregation itself,
  in `metric_aggregation_params` and `expr`; a nil `expr` means the column is the metric's name, as dbt documents
  (every metric of the `parcel_delivery` fixture writes an `expr`, so the fixture does not exhibit it). The published
  v12 schema also allows an `expr` inside `metric_aggregation_params`, which dbt 1.12 does not write: it is read when
  `type_params.expr` is nil, and the metric is reported when the two disagree. When both a measure and
  `metric_aggregation_params` are present, the measure wins.

  [[unsupported/throw!]] when the semantic model or the measure is not in the manifest, when the metric has neither a
  measure nor `metric_aggregation_params`, and when `metric_aggregation_params.semantic_model` names another semantic
  model than `depends_on` resolved to."
  [semantic-models                                                       :- [:map-of :string ::ir/semantic-model]
   {metric-name :name, type-params :type_params, depends-on :depends_on} :- ::dbt-manifest/metric]
  (b/cond
    :let [semantic-model-id (node-id-with-prefix "semantic_model." (:nodes depends-on))
          semantic-model    (get semantic-models semantic-model-id)]

    (not semantic-model)
    (unsupported/throw! "semantic model %s not found in manifest" (pr-str semantic-model-id))

    :let [input-measure (:measure type-params)
          measure       (when input-measure
                          (get-in semantic-model [:measures (:name input-measure)]))
          inline-params (:metric_aggregation_params type-params)]

    (and input-measure (not measure))
    (unsupported/throw! "measure %s not found on semantic model %s"
                        (pr-str (:name input-measure)) (pr-str (:name semantic-model)))

    measure
    {:semantic-model semantic-model
     :aggregation    (measure-aggregation measure)
     :measure        (:name measure)}

    (not inline-params)
    (unsupported/throw! "simple metric has neither a measure nor metric_aggregation_params")

    :let [inline-model (:semantic_model inline-params)]

    (and inline-model (not= inline-model (:name semantic-model)))
    (unsupported/throw! (str "metric_aggregation_params names semantic model %s but depends_on resolved to %s: the"
                             " manifest disagrees with itself")
                        (pr-str inline-model) (pr-str (:name semantic-model)))

    :let [type-expr   (:expr type-params)
          inline-expr (:expr inline-params)]

    (and type-expr inline-expr (not= type-expr inline-expr))
    (unsupported/throw! "metric_aggregation_params.expr %s disagrees with type_params.expr %s"
                        (pr-str inline-expr) (pr-str type-expr))

    :else
    {:semantic-model semantic-model
     :aggregation    (parse-aggregation metric-name
                                        (:default-agg-time-dimension semantic-model)
                                        (assoc inline-params :expr (or type-expr inline-expr)))
     :measure        nil}))

(mr/def ::simple-metric-extras
  "What a simple or cumulative metric carries besides its aggregation, gathered from every place the specs put it
  (see [[simple-metric-extras]]): the filters that apply, the `fill_nulls_with` value and whether to
  `join_to_timespine`."
  [:map {:closed true}
   [:filters           [:sequential :string]]
   [:fill-nulls-with   [:maybe :int]]
   [:join-to-timespine :boolean]])

(mu/defn- own-extras :- ::simple-metric-extras
  "The filter, `fill_nulls_with` and `join_to_timespine` written on `metric` itself: its `filter`, and the two keys of
  its `type_params`, where the 1.12 inline spec puts them."
  [{metric-filter :filter, type-params :type_params} :- ::dbt-manifest/metric]
  {:filters           (filter-templates metric-filter)
   :fill-nulls-with   (:fill_nulls_with type-params)
   :join-to-timespine (boolean (:join_to_timespine type-params))})

(mu/defn- input-measure-extras :- ::simple-metric-extras
  "The filter, `fill_nulls_with` and `join_to_timespine` written on a legacy-spec metric's `type_params.measure`;
  nothing when the metric has none."
  [input-measure :- [:maybe ::dbt-manifest/metric-input-measure]]
  {:filters           (filter-templates (:filter input-measure))
   :fill-nulls-with   (:fill_nulls_with input-measure)
   :join-to-timespine (boolean (:join_to_timespine input-measure))})

(mu/defn- reference-extras :- ::simple-metric-extras
  "The filter written on `reference`, an inline-spec cumulative metric's `cumulative_type_params.metric`, the only
  one of the three a reference to a metric can carry; nothing when there is no reference."
  [reference :- [:maybe ::dbt-manifest/metric-input]]
  {:filters           (filter-templates (:filter reference))
   :fill-nulls-with   nil
   :join-to-timespine false})

(mu/defn- simple-metric-extras :- ::simple-metric-extras
  "The filters, `fill_nulls_with` and `join_to_timespine` of a simple or cumulative `metric`, from every place the two
  specs put them, in this order:

  1. the metric itself (see [[own-extras]]): its `filter`, and `type_params.fill_nulls_with` /
     `type_params.join_to_timespine`, where the 1.12 inline spec writes them. dbt-semantic-interfaces,
     `PydanticMetricTypeParams`: \"These fields are allowed for simple metrics only. Previously, these lived in the
     PydanticMetricInput, which was only ever attached to a consumer metric. Now, they are attached to the producing
     metric\";
  2. the metric's legacy-spec input measure, `type_params.measure` (see [[input-measure-extras]]), where `filter`,
     `fill_nulls_with` and `join_to_timespine` sat before 1.12 (https://docs.getdbt.com/docs/build/simple,
     https://docs.getdbt.com/docs/build/fill-nulls-advanced);
  3. for an inline-spec cumulative metric, the simple metric it runs over, `input-metric`: its own, then the
     reference to it in `cumulative_type_params.metric` (`reference`, see [[reference-extras]]), whose `filter` dbt
     documents as applying to the cumulative metric (https://docs.getdbt.com/docs/build/cumulative), then the input
     metric's own input measure.

  Filters are conjunctive, so every one applies, in that order. `fill_nulls_with` is one value: the first non-nil in
  that order wins, the metric's own over anything it inherits. `join_to_timespine` is true when any place says so.
  dbt documents each place on its own and writes one of them per spec, so the order only matters for a manifest that
  sets the same thing twice; it is pinned here so that it is one rule rather than an accident of evaluation."
  [metric       :- ::dbt-manifest/metric
   input-metric :- [:maybe ::dbt-manifest/metric]
   reference    :- [:maybe ::dbt-manifest/metric-input]]
  (let [places (concat [(own-extras metric)
                        (input-measure-extras (-> metric :type_params :measure))]
                       (when input-metric
                         [(own-extras input-metric)
                          (reference-extras reference)
                          (input-measure-extras (-> input-metric :type_params :measure))]))]
    {:filters           (into [] (mapcat :filters) places)
     :fill-nulls-with   (some :fill-nulls-with places)
     :join-to-timespine (boolean (some :join-to-timespine places))}))

(mu/defn- parse-simple :- ::ir/metric.simple
  "A simple or cumulative metric: one aggregation over one semantic model, flattened from its [[aggregation-source]],
  with the filters, `fill_nulls_with` and `join_to_timespine` [[simple-metric-extras]] gathers. An inline-spec
  (dbt 1.12) cumulative metric points at the simple metric it runs over instead (see [[cumulative-input]]) and takes
  that metric's aggregation and semantic model. A cumulative metric with a window, a `grain_to_date` or a `period_agg`
  other than `last` is [[unsupported/throw!]] (see [[cumulative-reason]]), as is an aggregation Metabase cannot
  express (see [[aggregation-reason]])."
  [semantic-models :- [:map-of :string ::ir/semantic-model]
   metrics         :- [:map-of :string ::dbt-manifest/metric]
   {metric-type :type, type-params :type_params :as metric} :- ::dbt-manifest/metric]
  (when (= metric-type :cumulative)
    (some-> (cumulative-reason type-params) unsupported/throw!))
  (let [{input-metric :metric, :keys [reference]} (when (= metric-type :cumulative)
                                                    (cumulative-input metrics metric))
        {:keys [semantic-model aggregation measure]} (aggregation-source semantic-models (or input-metric metric))]
    (some-> (aggregation-reason aggregation) unsupported/throw!)
    (-> (metric-common metric-type metric)
        (merge aggregation (simple-metric-extras metric input-metric reference))
        (assoc :semantic-model (:name semantic-model)
               :measure        measure))))

(mu/defn- error-report :- ::ir/unsupported
  "The `:unsupported` entry for an entry of the manifest that threw something other than an unsupported reason while
  it was parsed: a bug in the converter or an input it did not anticipate, logged with its stack and flagged
  `:error?` so the report tells it apart from what the converter chose not to convert."
  [what       :- :string
   entry-name :- :string
   unique-id  :- :string
   e          :- (ms/InstanceOfClass Throwable)]
  (log/errorf e "Error parsing %s %s" what (pr-str entry-name))
  (assoc (unsupported/report entry-name unique-id
                             (format "error parsing %s (%s): %s" what (pr-str (class e)) (ex-message e)))
         :error? true))

(mu/defn parse-metric :- [:or ::ir/metric ::ir/unsupported]
  "Parse one manifest metric into an `::ir/metric`, or an `::ir/unsupported` record saying why it could not be.
  `semantic-models` is keyed by semantic model unique ID, which is how a simple metric's `depends_on` refers to it;
  `metrics` is the manifest's own `metrics` map, keyed by metric unique ID, which is how an inline-spec cumulative
  metric refers to the metric it runs over. Without it, such a metric is reported. An exception that is not an
  unsupported reason is reported too, flagged `:error?` (see [[error-report]])."
  ([semantic-models :- [:map-of :string ::ir/semantic-model]
    metric          :- ::dbt-manifest/metric]
   (parse-metric semantic-models {} metric))

  ([semantic-models :- [:map-of :string ::ir/semantic-model]
    metrics         :- [:map-of :string ::dbt-manifest/metric]
    {metric-type :type, metric-name :name, unique-id :unique_id :as metric} :- ::dbt-manifest/metric]
   (try
     (unsupported/catching
      (fn []
        (case metric-type
          (:simple :cumulative) (parse-simple semantic-models metrics metric)
          :ratio                (parse-ratio metric)
          :derived              (parse-derived metric)
          :conversion           (unsupported/throw! (str "conversion metrics are out of scope: a per-entity funnel is"
                                                         " nothing a Metabase metric expresses"))))
      (fn [reason]
        (unsupported/report metric-name unique-id reason)))
     (catch Exception e
       (error-report "metric" metric-name unique-id e)))))

(mu/defn- parse-semantic-model-or-report :- [:or ::ir/semantic-model ::ir/unsupported]
  "[[parse-semantic-model]], or the `:unsupported` entry for a semantic model it threw on (see [[error-report]]); the
  metrics over such a model are then reported as over a semantic model the manifest does not have."
  [nodes :- [:map-of :string ::dbt-manifest/node]
   {model-name :name, unique-id :unique_id :as semantic-model} :- ::dbt-manifest/semantic-model]
  (try
    (parse-semantic-model nodes semantic-model)
    (catch Exception e
      (error-report "semantic model" model-name unique-id e))))

(mu/defn parse-manifest :- ::ir/manifest
  "Parse a decoded manifest (see [[read-manifest]]) into the IR. Metrics that cannot be parsed land in `:unsupported`
  with a reason instead of failing the run, and so does a semantic model that cannot be."
  [{:keys [metadata nodes metrics], semantic-models :semantic_models} :- ::dbt-manifest/manifest]
  (let [models        (update-vals semantic-models #(parse-semantic-model-or-report nodes %))
        parsed-models (m/remove-vals unsupported/report? models)
        parsed        (->> (vals metrics)
                           (sort-by :name)
                           (mapv #(parse-metric parsed-models metrics %)))]
    {:source          {:tool    "dbt"
                       :version (:dbt_version metadata)
                       :project (:project_name metadata)}
     :adapter-type    (:adapter_type metadata)
     :semantic-models (u/index-by :name (vals parsed-models))
     :metrics         (vec (remove unsupported/report? parsed))
     :unsupported     (into (filterv unsupported/report? (vals models)) (filter unsupported/report?) parsed)}))

(mu/defn parse-manifest-file :- ::ir/manifest
  "[[read-manifest]] then [[parse-manifest]]."
  [manifest-filename :- :string]
  (parse-manifest (read-manifest manifest-filename)))

(comment
  (def %manifest-filename
    "Path to the flexanalytics manifest for REPL use; see the README for how to generate it."
    "/path/to/dbt-business-intelligence/target/manifest.json")

  (parse-manifest-file %manifest-filename))
