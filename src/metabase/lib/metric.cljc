(ns metabase.lib.metric
  "A Metric is a saved MBQL query stage snippet with EXACTLY ONE `:aggregation` and optionally a `:filter` (boolean)
  expression. Can be passed into the `:aggregation`s list."
  (:require
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(defn- resolve-metric [query metric-id]
  (when (integer? metric-id)
    (lib.metadata/metric query metric-id)))

(mu/defn ^:private metric-definition :- [:maybe ::lib.schema/stage.mbql]
  [{:keys [definition], :as _metric-metadata} :- lib.metadata/MetricMetadata]
  (when definition
    (if (:mbql/type definition)
      definition
      ;; legacy; needs conversion
      (->
        ;; database-id cannot be nil, but gets thrown out
        (lib.convert/legacy-query-from-inner-query #?(:clj Integer/MAX_VALUE :cljs js/Number.MAX_SAFE_INTEGER) definition)
        mbql.normalize/normalize
        lib.convert/->pMBQL
        (lib.util/query-stage -1)))))

(defmethod lib.ref/ref-method :metadata/metric
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

(mu/defn ^:private aggregating-by-metric? :- :boolean
  "Whether a given stage of a query currently includes a `:metric` ref clause in its aggregations."
  [query        :- ::lib.schema/query
   stage-number :- :int
   metric-id    :- ::lib.schema.id/metric]
  (let [{aggregations :aggregation} (lib.util/query-stage query stage-number)]
    (boolean
     (some (fn [[tag :as clause]]
             (when (= tag :metric)
               (let [[_tag _opts id] clause]
                 (= id metric-id))))
           aggregations))))

(defmethod lib.metadata.calculation/display-info-method :metadata/metric
  [query stage-number {:keys [id description], :as metric-metadata}]
  (merge
   ((get-method lib.metadata.calculation/display-info-method :default) query stage-number metric-metadata)
   {:description description}
   (when (aggregating-by-metric? query stage-number id)
     {:selected true})))

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

(mu/defn available-metrics :- [:maybe [:sequential {:min 1} lib.metadata/MetricMetadata]]
  "Get a list of Metrics that you may consider using as aggregations for a query. Only Metrics that have the same
  `table-id` as the `source-table` for this query will be suggested."
  [query :- ::lib.schema/query]
  (when-let [source-table-id (lib.util/source-table-id query)]
    (not-empty (lib.metadata.protocols/metrics (lib.metadata/->metadata-provider query) source-table-id))))
