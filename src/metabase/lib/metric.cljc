(ns metabase.lib.metric
  "A Metric is a special type of Card that you can do special metric stuff with. (Not sure exactly what said special
  stuff is TBH.)"
  (:refer-clojure :exclude [select-keys not-empty])
  (:require
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.options :as lib.options]
   [metabase.lib.query :as lib.query]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [select-keys not-empty]]))

(defn- resolve-metric [query card-id]
  (when (pos-int? card-id)
    (lib.metadata/metric query card-id)))

(mu/defn- metric-definition :- [:maybe ::lib.schema/stage.mbql]
  [{:keys [dataset-query], :as _metric-metadata} :- ::lib.schema.metadata/metric]
  (when dataset-query
    (let [normalized-definition (case (lib.util/normalized-mbql-version dataset-query)
                                  ;; TODO (Cam 10/7/25) -- not sure we'll ever see legacy queries here anymore since
                                  ;; they get normalized to MBQL 5 coming out of the app DB
                                  :mbql-version/legacy (-> dataset-query mbql.normalize/normalize lib.convert/->pMBQL)
                                  :mbql-version/mbql5  (lib.normalize/normalize ::lib.schema/query dataset-query))]
      (lib.util/query-stage normalized-definition -1))))

(defmethod lib.ref/ref-method :metadata/metric
  [{:keys [id], join-alias ::lib.join/join-alias, :as metric-metadata}]
  (let [effective-type (or ((some-fn :effective-type :base-type) metric-metadata)
                           (when-let [aggregation (first (:aggregation (metric-definition metric-metadata)))]
                             (let [ag-effective-type (lib.schema.expression/type-of-resolved aggregation)]
                               (when (isa? ag-effective-type :type/*)
                                 ag-effective-type))))
        options (cond-> {:lib/uuid (str (random-uuid))}
                  join-alias (assoc :join-alias join-alias)
                  effective-type (assoc :effective-type effective-type))]
    [:metric options id]))

(defmethod lib.metadata.calculation/type-of-method :metadata/metric
  [_query _stage-number metric-metadata]
  (or
   (when-let [[aggregation] (not-empty (:aggregation (metric-definition metric-metadata)))]
     (lib.schema.expression/type-of aggregation))
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
   (select-keys metric-metadata [:description :aggregation-position :display-name])))

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
         maybe-add-aggregation-pos (fn [metric-metadata]
                                     (let [aggregation-pos (-> metric-metadata
                                                               ((juxt :id ::lib.join/join-alias))
                                                               metric-aggregations)]
                                       (cond-> metric-metadata
                                         aggregation-pos (assoc :aggregation-position aggregation-pos))))]
     (when first-stage?
       (let [source-table (lib.util/source-table-id query)
             metrics (if source-table
                       (lib.metadata/metadatas-for-table query :metadata/metric source-table)
                       (lib.metadata/metadatas-for-card query :metadata/metric (lib.util/source-card-id query)))]
         (when (seq metrics)
           ;; "pre-warm" the metadata provider
           (lib.metadata/bulk-metadata query :metadata/card (into #{} (map :id) metrics)))
         (not-empty
          (into []
                (comp (filter (fn [metric-card]
                                (= 1 (lib.query/stage-count (lib.query/query query (:dataset-query metric-card))))))
                      (map maybe-add-aggregation-pos))
                (sort-by (some-fn :display-name :name) metrics))))))))

(defn- normalize-legacy-query
  [query]
  (cond-> query
    (#{:query :native} (lib.util/normalized-query-type query))
    mbql.normalize/normalize))

(defmethod lib.metadata.calculation/metadata-method :metric
  [query _stage-number [_ opts metric-id]]
  (if-let [metric-meta (lib.metadata/metric query metric-id)]
    (let [metric-query      (lib.query/query query (normalize-legacy-query (:dataset-query metric-meta)))
          inner-aggregation (first (lib.aggregation/aggregations metric-query))
          inner-meta        (lib.metadata.calculation/metadata metric-query -1 inner-aggregation)]
      (-> inner-meta
          (assoc :display-name (:name metric-meta) ; Metric card's name
                 :name         (:name inner-meta)) ; Name of the inner aggregation column
          ;; If the :metric ref has a :name option, that overrides the metric card's name.
          (cond-> (:name opts) (assoc :name (:name opts)))))
    {:lib/type :metadata/metric
     :id metric-id
     :display-name (fallback-display-name)}))
