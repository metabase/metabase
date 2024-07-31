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
   [metabase.lib.options :as lib.options]
   [metabase.lib.query :as lib.query]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(defn- resolve-metric [query metric-id]
  (when (integer? metric-id)
    (lib.metadata/metric query metric-id)))

(mu/defn- metric-definition :- [:maybe ::lib.schema/stage.mbql]
  [{:keys [dataset-query], :as _metric-metadata} :- ::lib.schema.metadata/metric]
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
  [query stage-number [_tag opts metric-id-or-name]]
  (let [display-name (:display-name opts)
        opts (cond-> opts
               (and display-name (not (:long-display-name opts)))
               (assoc :long-display-name display-name))]
    (merge
     (if-let [metric-metadata (resolve-metric query metric-id-or-name)]
       (lib.metadata.calculation/display-info query stage-number metric-metadata)
       {:effective-type    :type/*
        :display-name      (fallback-display-name)
        :long-display-name (fallback-display-name)})
     (select-keys opts [:name :display-name :long-display-name]))))

(defmethod lib.metadata.calculation/column-name-method :metric
  [query stage-number [_tag _opts metric-id-or-name]]
  (or (when-let [metric-metadata (resolve-metric query metric-id-or-name)]
        (lib.metadata.calculation/column-name query stage-number metric-metadata))
      "metric"))

(defn- source-metric
  "Returns the `:metadata/metric` for the given stage, or nil if this stage is not based on a metric."
  [metadata-providerable stage]
  (some->> stage :source-card (lib.metadata/metric metadata-providerable)))

(mu/defn metric-based? :- :boolean
  "Returns true if this MBQL `query` is based on metrics.

  This is always false for stages other than 0, but accepting the parameter means consumers of the API don't need to
  know about that.

  Being \"based on metrics\" means the source is a metric."
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (and (zero? (lib.util/canonical-stage-index query stage-number))
       (not (lib.query/native? query))
       (source-metric query (lib.util/query-stage query stage-number))))

(mu/defn available-metrics :- [:maybe [:sequential {:min 1} ::lib.schema.metadata/metric]]
  "Get a list of Metrics that you may consider using as aggregations for a query."
  ([query]
   (available-metrics query -1))
  ([query :- ::lib.schema/query
    stage-number :- :int]
   (let [first-stage? (zero? (lib.util/canonical-stage-index query stage-number))
         metric-aggregations (into {}
                                   (keep-indexed (fn [index aggregation-clause]
                                                   (when (lib.util/clause-of-type? aggregation-clause :metric)
                                                     [[(get aggregation-clause 2)
                                                       (:join-alias (lib.options/options aggregation-clause))]
                                                      index])))
                                   (lib.aggregation/aggregations query stage-number))
         s-metric (source-metric query (lib.util/query-stage query stage-number))
         maybe-add-aggregation-pos (fn [metric-metadata]
                                     (let [aggregation-pos (-> metric-metadata
                                                               ((juxt :id ::lib.join/join-alias))
                                                               metric-aggregations)]
                                       (cond-> metric-metadata
                                         aggregation-pos (assoc :aggregation-position aggregation-pos))))]
     (cond
       (and first-stage? s-metric)
       [(maybe-add-aggregation-pos s-metric)]

       first-stage?
       (let [source-table (lib.util/source-table-id query)
             metrics (if source-table
                       (lib.metadata/metadatas-for-table query :metadata/metric source-table)
                       (lib.metadata/metadatas-for-card query :metadata/metric (lib.util/source-card-id query)))]
         (not-empty
          (into []
                (comp (filter (fn [metric-card]
                                (= 1 (lib.query/stage-count (lib.query/query query (:dataset-query metric-card))))))
                      (map maybe-add-aggregation-pos))
                metrics)))))))
