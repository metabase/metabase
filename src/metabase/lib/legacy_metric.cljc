(ns metabase.lib.legacy-metric
  "A Metric is a saved MBQL query stage snippet with EXACTLY ONE `:aggregation` and optionally a `:filter` (boolean)
  expression. Can be passed into the `:aggregation`s list."
  (:require
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

;; Replaced by metrics v2
#_
(defn- resolve-metric [query metric-id]
  (when (integer? metric-id)
    (lib.metadata/legacy-metric query metric-id)))

(mu/defn ^:private metric-definition :- [:maybe ::lib.schema/stage.mbql]
  [{:keys [definition], :as _metric-metadata} :- ::lib.schema.metadata/legacy-metric]
  (when definition
    (let [normalized-definition (cond-> definition
                                  (not (contains? definition :lib/type))
                                  ;; legacy; needs conversion
                                  (-> mbql.normalize/normalize lib.convert/->pMBQL))]
      (lib.util/query-stage normalized-definition -1))))

(defmethod lib.ref/ref-method :metadata/legacy-metric
  [{:keys [id], :as metric-metadata}]
  (let [effective-type (or (:effective-type metric-metadata)
                           (:base-type metric-metadata)
                           (when-let [aggregation (first (:aggregation (metric-definition metric-metadata)))]
                             (let [ag-effective-type (lib.schema.expression/type-of aggregation)]
                               (when (isa? ag-effective-type :type/*)
                                 ag-effective-type))))
        options (cond-> {:lib/uuid (str (random-uuid))}
                  effective-type (assoc :effective-type effective-type))]
    [:metric options id]))

(defmethod lib.metadata.calculation/type-of-method :metadata/legacy-metric
  [query stage-number metric-metadata]
  (or
   (when-let [[aggregation] (not-empty (:aggregation (metric-definition metric-metadata)))]
     (lib.metadata.calculation/type-of query stage-number aggregation))
   :type/*))

;; Replaced by metrics v2
#_
(defmethod lib.metadata.calculation/type-of-method :metric
  [query stage-number [_tag _opts metric-id-or-name]]
  (or (when-let [metric-metadata (resolve-metric query metric-id-or-name)]
        (lib.metadata.calculation/type-of query stage-number metric-metadata))
      :type/*))

(defn- fallback-display-name []
  (i18n/tru "[Unknown Metric]"))

(defmethod lib.metadata.calculation/display-name-method :metadata/legacy-metric
  [_query _stage-number metric-metadata _style]
  (or ((some-fn :display-name :name) metric-metadata)
      (fallback-display-name)))

;; Replaced by metrics v2
#_
(defmethod lib.metadata.calculation/display-name-method :metric
  [query stage-number [_tag _opts metric-id-or-name] style]
  (or (when-let [metric-metadata (resolve-metric query metric-id-or-name)]
        (lib.metadata.calculation/display-name query stage-number metric-metadata style))
      (fallback-display-name)))

(defmethod lib.metadata.calculation/display-info-method :metadata/legacy-metric
  [query stage-number metric-metadata]
  (merge
   ((get-method lib.metadata.calculation/display-info-method :default) query stage-number metric-metadata)
   (select-keys metric-metadata [:description :aggregation-position])))

;; Replaced by metrics v2
#_
(defmethod lib.metadata.calculation/display-info-method :metric
  [query stage-number [_tag _opts metric-id-or-name]]
  (if-let [metric-metadata (resolve-metric query metric-id-or-name)]
    (lib.metadata.calculation/display-info query stage-number metric-metadata)
    {:effective-type    :type/*
     :display-name      (fallback-display-name)
     :long-display-name (fallback-display-name)}))

;; Replaced by metrics v2
#_
(defmethod lib.metadata.calculation/column-name-method :metric
  [query stage-number [_tag _opts metric-id-or-name]]
  (or (when-let [metric-metadata (resolve-metric query metric-id-or-name)]
        (lib.metadata.calculation/column-name query stage-number metric-metadata))
      "metric"))

(mu/defn available-legacy-metrics :- [:maybe [:sequential {:min 1} ::lib.schema.metadata/legacy-metric]]
  "Get a list of Metrics that you may consider using as aggregations for a query. Only Metrics that have the same
  `table-id` as the `source-table` for this query will be suggested."
  ([query]
   (available-legacy-metrics query -1))
  ([query :- ::lib.schema/query
    stage-number :- :int]
   (when (zero? (lib.util/canonical-stage-index query stage-number))
     (when-let [source-table-id (lib.util/source-table-id query)]
       (let [metrics (lib.metadata.protocols/legacy-metrics (lib.metadata/->metadata-provider query) source-table-id)
             metric-aggregations (into {}
                                       (keep-indexed (fn [index aggregation-clause]
                                                       (when (lib.util/clause-of-type? aggregation-clause :metric)
                                                         [(get aggregation-clause 2) index])))
                                       (lib.aggregation/aggregations query stage-number))]
         (cond
           (empty? metrics)             nil
           (empty? metric-aggregations) (vec metrics)
           :else                        (mapv (fn [metric-metadata]
                                                (let [aggregation-pos (-> metric-metadata :id metric-aggregations)]
                                                  (cond-> metric-metadata
                                                    aggregation-pos (assoc :aggregation-position aggregation-pos))))
                                              metrics)))))))
