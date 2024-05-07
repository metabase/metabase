(ns metabase.lib.metric
  "A Metric is a saved MBQL query stage snippet with EXACTLY ONE `:aggregation` and optionally a `:filter` (boolean)
  expression. Can be passed into the `:aggregation`s list."
  (:require
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metric.basics :as lib.metric.basics]
   [metabase.lib.options :as lib.options]
   [metabase.lib.query :as lib.query]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(defn- resolve-metric [query metric-id]
  (when (integer? metric-id)
    (lib.metadata/metric query metric-id)))

(mu/defn ^:private metric-definition :- [:maybe ::lib.schema/stage.mbql]
  [{:keys [dataset-query], :as _metric-metadata} :- lib.metadata/MetricMetadata]
  (when dataset-query
    (let [normalized-definition (cond-> dataset-query
                                  (not (contains? dataset-query :lib/type))
                                  ;; legacy; needs conversion
                                  (-> mbql.normalize/normalize lib.convert/->pMBQL))]
      (lib.util/query-stage normalized-definition -1))))

(defmethod lib.ref/ref-method :metadata/metric
  [{:keys [id ::lib.join/join-alias], :as metric-metadata}]
  (let [effective-type (or (:effective-type metric-metadata)
                           (:base-type metric-metadata)
                           (when-let [aggregation (first (:aggregation (metric-definition metric-metadata)))]
                             (let [ag-effective-type (lib.schema.expression/type-of aggregation)]
                               (when (isa? ag-effective-type :type/*)
                                 ag-effective-type))))
        options (cond-> {:lib/uuid (str (random-uuid))}
                  join-alias (assoc :join-alias join-alias)
                  effective-type (assoc :effective-type effective-type))]
    [:metric options id]))

(defmethod lib.metadata.calculation/type-of-method :metadata/metric
  [query stage-number metric-metadata]
  (or
   (when-let [[aggregation] (not-empty (:aggregation (metric-definition metric-metadata)))]
     (lib.metadata.calculation/type-of query stage-number aggregation))
   :type/*))

(defmethod lib.metadata.calculation/type-of-method :metric
  [query stage-number [_tag _opts metric-id-or-name]]
  (or (when-let [metric-metadata (resolve-metric query metric-id-or-name)]
        (lib.metadata.calculation/type-of query stage-number metric-metadata))
      :type/*))

(defn- fallback-display-name []
  (i18n/tru "[Unknown Metric]"))

(defmethod lib.metadata.calculation/display-name-method :metadata/metric
  [_query _stage-number metric-metadata _style]
  (or ((some-fn :display-name :name) metric-metadata)
      (fallback-display-name)))

(defmethod lib.metadata.calculation/display-name-method :metric
  [query stage-number [_tag _opts metric-id-or-name] style]
  (or (when-let [metric-metadata (resolve-metric query metric-id-or-name)]
        (lib.metadata.calculation/display-name query stage-number metric-metadata style))
      (fallback-display-name)))

(defmethod lib.metadata.calculation/display-info-method :metadata/metric
  [query stage-number metric-metadata]
  (merge
   ((get-method lib.metadata.calculation/display-info-method :default) query stage-number metric-metadata)
   (select-keys metric-metadata [:description :aggregation-position])))

(defmethod lib.metadata.calculation/display-info-method :metric
  [query stage-number [_tag _opts metric-id-or-name]]
  (if-let [metric-metadata (resolve-metric query metric-id-or-name)]
    (lib.metadata.calculation/display-info query stage-number metric-metadata)
    {:effective-type    :type/*
     :display-name      (fallback-display-name)
     :long-display-name (fallback-display-name)}))

(defmethod lib.metadata.calculation/column-name-method :metric
  [query stage-number [_tag _opts metric-id-or-name]]
  (or (when-let [metric-metadata (resolve-metric query metric-id-or-name)]
        (lib.metadata.calculation/column-name query stage-number metric-metadata))
      "metric"))

(defmethod lib.metadata.calculation/returned-columns-method :metadata/metric
  [query stage-number metric options]
  (lib.metadata.calculation/returned-columns-method query stage-number (assoc metric :lib/type :metadata/card) options))

(defn- metrics-for-all-joins
  [query stage-number]
  (for [join (lib.join/joins query stage-number)]
    (lib.metric.basics/join-metric query join)))

(defn- joined-metrics
  [query stage-number]
  (->> (metrics-for-all-joins query stage-number)
       (filter identity)))

(mu/defn metric-based? :- :boolean
  "Returns true if this MBQL `query` is based on metrics.

  This is always false for stages other than 0, but accepting the parameter means consumers of the API don't need to
  know about that.

  Being \"based on metrics\" means the source is a metric, and so are the sources of all the joins in stage 0."
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (and (zero? (lib.util/canonical-stage-index query stage-number))
       (not (lib.query/native? query))
       (lib.metric.basics/source-metric query (lib.util/query-stage query stage-number))
       (every? identity (metrics-for-all-joins query 0))))

(mu/defn available-metrics :- [:maybe [:sequential {:min 1} lib.metadata/MetricMetadata]]
  "Get a list of Metrics that you may consider using as aggregations for a query."
  ([query]
   (available-metrics query -1))
  ([query :- ::lib.schema/query
    stage-number :- :int]
   (let [metric-aggregations (into {}
                                   (keep-indexed (fn [index aggregation-clause]
                                                   (when (lib.util/clause-of-type? aggregation-clause :metric)
                                                     [[(get aggregation-clause 2)
                                                       (:join-alias (lib.options/options aggregation-clause))]
                                                      index])))
                                   (lib.aggregation/aggregations query stage-number))
         s-metric (lib.metric.basics/source-metric query (lib.util/query-stage query stage-number))
         metrics (cond->> (joined-metrics query stage-number)
                   s-metric (cons s-metric))]
     (when (seq metrics)
       (if (empty? metric-aggregations)
         (vec metrics)
         (mapv (fn [metric-metadata]
                 (let [aggregation-pos (-> metric-metadata
                                           ((juxt :id ::lib.join/join-alias))
                                           metric-aggregations)]
                   (cond-> metric-metadata
                     aggregation-pos (assoc :aggregation-position aggregation-pos))))
               metrics))))))
