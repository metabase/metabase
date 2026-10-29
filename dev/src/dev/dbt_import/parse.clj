(ns dev.dbt-import.parse
  "Stage 1 of the converter: turn a decoded dbt manifest into the IR (see [[dev.dbt-import.schemas.ir]]).

  Pure apart from [[read-manifest]]. Applies dbt's own defaulting rules and nothing Metabase-specific:

  * a nil `expr` on an entity, dimension or measure means the name is the column;
  * a measure without `agg_time_dimension` inherits the semantic model's default;
  * a metric's `label` falls back to its name when missing or blank;
  * `filter` and `fill_nulls_with` may sit on the metric or on its input measure, and either counts.

  Simple, cumulative, ratio and derived metrics are parsed. What is structurally beyond Metabase is reported in
  `:unsupported` with a reason here: a cumulative metric with a window, a `grain_to_date` or a `period_agg` other than
  `last`, an input with an offset, conversion metrics, a non-additive measure, and a percentile without a value,
  outside 0..1 or discrete. Whether the metrics a ratio or derived metric refers to exist is the resolve stage's
  business."
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
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

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

(mu/defn- parse-aggregation :- ::ir/aggregation
  "The IR aggregation a legacy-spec measure or an inline-spec metric's `metric_aggregation_params` declares; both
  carry the same keys. A nil `expr` means the column is `default-expr`, the measure's or the metric's name; a nil
  `agg_time_dimension` means `default-agg-time-dimension`, the semantic model's."
  [default-expr               :- :string
   default-agg-time-dimension :- [:maybe :string]
   {:keys [agg expr agg_params non_additive_dimension agg_time_dimension]}
   :- [:or ::dbt-manifest/measure ::dbt-manifest/metric-aggregation-params]]
  {:agg                    agg
   :expr                   (or expr default-expr)
   :agg-params             agg_params
   :non-additive-dimension non_additive_dimension
   :agg-time-dimension     (or agg_time_dimension default-agg-time-dimension)})

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
  "Parse one manifest semantic model. Needs the whole `manifest` to look up the model node that holds column types."
  [manifest :- ::dbt-manifest/manifest
   {model-name :name
    :keys      [unique_id label description node_relation defaults primary_entity entities dimensions measures]
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

(mu/defn- metric-common :- ::ir/metric.common
  "The part of the IR every kind of metric shares. `fill_nulls_with` is read from the metric's `type_params`;
  [[parse-simple]] also looks on the input measure when this is nil."
  [metric-type :- [:enum :simple :cumulative :ratio :derived]
   {metric-name :name, metric-filter :filter, metric-meta :meta
    :keys       [unique_id label description type_params time_granularity]}
   :- ::dbt-manifest/metric]
  {:type             metric-type
   :name             metric-name
   :unique-id        unique_id
   :label            (if (str/blank? label) metric-name label)
   :description      description
   :filters          (filter-templates metric-filter)
   :fill-nulls-with  (:fill_nulls_with type_params)
   :time-granularity time_granularity
   :meta             metric-meta})

(mu/defn- parse-metric-input :- ::ir/metric-input
  [{metric-name :name, input-alias :alias, input-filter :filter} :- ::dbt-manifest/metric-input]
  {:metric  metric-name
   :alias   input-alias
   :filters (filter-templates input-filter)})

(mu/defn- offset-reason :- [:maybe :string]
  "Why a ratio or derived metric with `inputs` cannot be converted: the first input shifted in time, if any. MBQL's
  `offset` is relative to the rows of the result, not to a span of time, so period-over-period comparisons have no
  faithful equivalent."
  [inputs :- [:sequential ::dbt-manifest/metric-input]]
  (some (fn [{metric-name :name, input-alias :alias, :keys [offset_window offset_to_grain]}]
          (let [input-name (or input-alias metric-name)]
            (cond
              offset_window
              (format (str "input %s has an offset_window of %d %s: period-over-period comparisons have no Metabase"
                           " equivalent")
                      (pr-str input-name) (:count offset_window) (:granularity offset_window))

              offset_to_grain
              (format (str "input %s has an offset_to_grain of %s: comparisons with the start of a period have no"
                           " Metabase equivalent")
                      (pr-str input-name) (pr-str offset_to_grain)))))
        inputs))

(mu/defn- parse-ratio :- ::ir/metric.ratio
  [{:keys [type_params] :as metric} :- ::dbt-manifest/metric]
  (let [{numerator-input :numerator, denominator-input :denominator} type_params]
    (when (or (nil? numerator-input) (nil? denominator-input))
      (unsupported/throw! "ratio metric without a numerator and a denominator"))
    (some-> (offset-reason [numerator-input denominator-input]) unsupported/throw!)
    (assoc (metric-common :ratio metric)
           :numerator   (parse-metric-input numerator-input)
           :denominator (parse-metric-input denominator-input))))

(mu/defn- parse-derived :- ::ir/metric.derived
  [{:keys [type_params] :as metric} :- ::dbt-manifest/metric]
  (let [{:keys [expr metrics]} type_params]
    (when (str/blank? expr)
      (unsupported/throw! "derived metric without an expr"))
    (when (empty? metrics)
      (unsupported/throw! "derived metric without input metrics"))
    (some-> (offset-reason metrics) unsupported/throw!)
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
  [{:keys [window grain_to_date cumulative_type_params]} :- ::dbt-manifest/metric-type-params]
  (let [window        (or window (:window cumulative_type_params))
        grain-to-date (or grain_to_date (:grain_to_date cumulative_type_params))
        period-agg    (or (:period_agg cumulative_type_params) :first)]
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
  "The simple metric an inline-spec cumulative metric runs over, and the filters that apply to the cumulative metric
  because of it: the input metric's own and those on the reference to it."
  [:map {:closed true}
   [:metric  ::dbt-manifest/metric]
   [:filters [:sequential :string]]])

(mu/defn- cumulative-input :- [:maybe ::cumulative-input]
  "The metric a cumulative `metric` runs over: on the 1.12 inline spec the simple metric in
  `cumulative_type_params.metric`, resolved through `depends_on` into `metrics`, the manifest's own metrics by unique
  id. Nil for a legacy-spec cumulative metric, which points at a measure instead. [[unsupported/throw!]] when the
  input metric is not in `metrics`, or is not a simple metric."
  [metrics                          :- [:map-of :string ::dbt-manifest/metric]
   {:keys [type_params depends_on]} :- ::dbt-manifest/metric]
  (when-let [input-metric-id (node-id-with-prefix "metric." (:nodes depends_on))]
    (let [input-metric (get metrics input-metric-id)]
      (when-not input-metric
        (unsupported/throw! "input metric %s not found in manifest" (pr-str input-metric-id)))
      (when-not (= :simple (:type input-metric))
        (unsupported/throw! (str "a cumulative metric over the %s metric %s has no Metabase equivalent: only a simple"
                                 " aggregation can run cumulatively")
                            (name (:type input-metric)) (pr-str (:name input-metric))))
      {:metric  input-metric
       :filters (into (filter-templates (:filter input-metric))
                      (filter-templates (get-in type_params [:cumulative_type_params :metric :filter])))})))

(mr/def ::aggregation-source
  "Where a simple metric's aggregation comes from, in one shape whichever spec wrote it: the semantic model and the
  aggregation, the measure's name when the aggregation is a measure's (nil on the inline spec), and the filters,
  `fill_nulls_with` and `join_to_timespine` declared alongside, which apply to the metric besides its own."
  [:map {:closed true}
   [:semantic-model    ::ir/semantic-model]
   [:aggregation       ::ir/aggregation]
   [:measure           [:maybe :string]]
   [:filters           [:sequential :string]]
   [:fill-nulls-with   [:maybe :int]]
   [:join-to-timespine :boolean]])

(mu/defn- aggregation-source :- ::aggregation-source
  "The aggregation of `metric` and what comes with it (see `::aggregation-source`). On the legacy spec
  `type_params.measure` points at a measure of the semantic model in `depends_on`, and the measure's own filter,
  `fill_nulls_with` and `join_to_timespine` come along. On the 1.12 inline spec the metric carries the aggregation
  itself, in `metric_aggregation_params` and `expr`; a nil `expr` means the column is the metric's name, as dbt
  documents (every metric of the `parcel_delivery` fixture writes an `expr`, so the fixture does not exhibit it).
  [[unsupported/throw!]] when the semantic model or the measure is
  not in the manifest, or the metric has neither a measure nor `metric_aggregation_params`."
  [semantic-models                                    :- [:map-of :string ::ir/semantic-model]
   {metric-name :name, :keys [type_params depends_on]} :- ::dbt-manifest/metric]
  (b/cond
    :let [semantic-model-id (node-id-with-prefix "semantic_model." (:nodes depends_on))
          semantic-model    (get semantic-models semantic-model-id)]

    (not semantic-model)
    (unsupported/throw! "semantic model %s not found in manifest" (pr-str semantic-model-id))

    :let [input-measure (:measure type_params)
          measure       (when input-measure
                          (get-in semantic-model [:measures (:name input-measure)]))
          inline-params (:metric_aggregation_params type_params)]

    (and input-measure (not measure))
    (unsupported/throw! "measure %s not found on semantic model %s"
                        (pr-str (:name input-measure)) (pr-str (:name semantic-model)))

    (and (not measure) (not inline-params))
    (unsupported/throw! "simple metric has neither a measure nor metric_aggregation_params")

    :else
    {:semantic-model    semantic-model
     :aggregation       (if measure
                          (measure-aggregation measure)
                          (parse-aggregation metric-name
                                             (:default-agg-time-dimension semantic-model)
                                             (assoc inline-params :expr (:expr type_params))))
     :measure           (:name measure)
     :filters           (filter-templates (:filter input-measure))
     :fill-nulls-with   (or (:fill_nulls_with type_params) (:fill_nulls_with input-measure))
     :join-to-timespine (boolean (or (:join_to_timespine type_params) (:join_to_timespine input-measure)))}))

(mu/defn- parse-simple :- ::ir/metric.simple
  "A simple or cumulative metric: one aggregation over one semantic model, flattened from its [[aggregation-source]].
  An inline-spec (dbt 1.12) cumulative metric points at the simple metric it runs over instead (see
  [[cumulative-input]]) and takes that metric's aggregation, semantic model and filters. A cumulative metric with a
  window, a `grain_to_date` or a `period_agg` other than `last` is [[unsupported/throw!]] (see [[cumulative-reason]]),
  as is an aggregation Metabase cannot express (see [[aggregation-reason]])."
  [semantic-models :- [:map-of :string ::ir/semantic-model]
   metrics         :- [:map-of :string ::dbt-manifest/metric]
   {metric-type :type, :keys [type_params] :as metric} :- ::dbt-manifest/metric]
  (when (= metric-type :cumulative)
    (some-> (cumulative-reason type_params) unsupported/throw!))
  (let [input  (when (= metric-type :cumulative)
                 (cumulative-input metrics metric))
        source (aggregation-source semantic-models (or (:metric input) metric))
        {:keys [semantic-model aggregation measure]} source]
    (some-> (aggregation-reason aggregation) unsupported/throw!)
    (-> (metric-common metric-type metric)
        (merge aggregation)
        (assoc :semantic-model    (:name semantic-model)
               :measure           measure
               :join-to-timespine (boolean (or (:join_to_timespine type_params) (:join-to-timespine source))))
        ;; the metric's own filters, then those of the metric it runs over and of the reference to it, then the
        ;; measure's; a filter on either side of a reference applies to its use
        (update :filters into (concat (:filters input) (:filters source)))
        (update :fill-nulls-with #(or % (:fill-nulls-with source))))))

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
    {metric-type :type, metric-name :name, :keys [unique_id] :as metric} :- ::dbt-manifest/metric]
   (unsupported/catching
    (fn []
      (case metric-type
        (:simple :cumulative) (parse-simple semantic-models metrics metric)
        :ratio                (parse-ratio metric)
        :derived              (parse-derived metric)
        :conversion           (unsupported/throw! (str "conversion metrics are out of scope: a per-entity funnel is"
                                                       " nothing a Metabase metric expresses"))))
    (fn [reason]
      (unsupported/report metric-name unique_id reason)))))

(mu/defn parse-manifest :- ::ir/manifest
  "Parse a decoded manifest (see [[read-manifest]]) into the IR. Metrics that cannot be parsed land in `:unsupported`
  with a reason instead of failing the run."
  [manifest :- ::dbt-manifest/manifest]
  (let [semantic-models (update-vals (:semantic_models manifest) #(parse-semantic-model manifest %))
        parsed          (->> (vals (:metrics manifest))
                             (sort-by :name)
                             (mapv #(parse-metric semantic-models (:metrics manifest) %)))
        unsupported?    #(contains? % :reason)]
    {:source          {:tool    "dbt"
                       :version (-> manifest :metadata :dbt_version)
                       :project (-> manifest :metadata :project_name)}
     :semantic-models (u/index-by :name (vals semantic-models))
     :metrics         (vec (remove unsupported? parsed))
     :unsupported     (filterv unsupported? parsed)}))

(mu/defn parse-manifest-file :- ::ir/manifest
  "[[read-manifest]] then [[parse-manifest]]."
  [manifest-filename :- :string]
  (parse-manifest (read-manifest manifest-filename)))

(comment
  (def %manifest-filename
    "Path to the flexanalytics manifest for REPL use; see the README for how to generate it."
    "/path/to/dbt-business-intelligence/target/manifest.json")

  (parse-manifest-file %manifest-filename))
