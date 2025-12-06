(ns metabase.lib.measure
  "A Measure is a saved MBQL query stage snippet with `:aggregation`. Measures are numeric expressions."
  (:refer-clojure :exclude [mapv empty? select-keys])
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [mapv empty? select-keys]]))

(defn- resolve-measure [query measure-id]
  (when (integer? measure-id)
    (lib.metadata/measure query measure-id)))

(defmethod lib.ref/ref-method :metadata/measure
  [{:keys [id name]}]
  (lib.options/ensure-uuid [:measure {:display-name name} id]))

(defmethod lib.metadata.calculation/type-of-method :metadata/measure
  [_query _stage-number _measure-metadata]
  :type/Number)

(defmethod lib.metadata.calculation/type-of-method :measure
  [_query _stage-number _measure-clause]
  :type/Number)

(defn- fallback-display-name []
  "[Unknown Measure]")

(defmethod lib.metadata.calculation/display-name-method :metadata/measure
  [_query _stage-number measure-metadata _style]
  (or (:display-name measure-metadata)
      (:name measure-metadata)
      (fallback-display-name)))

(defmethod lib.metadata.calculation/display-name-method :measure
  [query stage-number [_tag opts measure-id-or-name] style]
  (or (:display-name opts)
      (when-let [measure-metadata (resolve-measure query measure-id-or-name)]
        (lib.metadata.calculation/display-name query stage-number measure-metadata style))
      (fallback-display-name)))

(defmethod lib.metadata.calculation/display-info-method :metadata/measure
  [query stage-number {:keys [description aggregation-positions], :as measure-metadata}]
  (let [default-display-info-method (get-method lib.metadata.calculation/display-info-method :default)
        default-display-info        (default-display-info-method query stage-number measure-metadata)]
    (cond-> default-display-info
      description (assoc :description description)
      aggregation-positions (assoc :aggregation-positions aggregation-positions))))

(defmethod lib.metadata.calculation/display-info-method :measure
  [query stage-number [_tag opts measure-id-or-name]]
  (let [display-name (:display-name opts)
        opts-to-merge (cond-> {}
                        display-name
                        (assoc :display-name display-name
                               :long-display-name display-name))]
    (merge
     (if-let [measure-metadata (resolve-measure query measure-id-or-name)]
       (lib.metadata.calculation/display-info query stage-number measure-metadata)
       {:effective-type    :type/Number
        :display-name      (fallback-display-name)
        :long-display-name (fallback-display-name)})
     opts-to-merge)))

(defmethod lib.metadata.calculation/column-name-method :measure
  [query stage-number [_tag _opts measure-id-or-name]]
  (or (when-let [measure-metadata (resolve-measure query measure-id-or-name)]
        (lib.metadata.calculation/column-name query stage-number measure-metadata))
      "measure"))

(defmethod lib.metadata.calculation/metadata-method :measure
  [query _stage-number [_ opts measure-id]]
  (if-let [measure-meta (lib.metadata/measure query measure-id)]
    {:lib/type     :metadata/column
     :base-type    :type/Number
     :name         (or (:name opts) (:name measure-meta) "measure")
     :display-name (or (:display-name opts) (:name measure-meta) (fallback-display-name))}
    {:lib/type     :metadata/column
     :base-type    :type/Number
     :name         "measure"
     :display-name (fallback-display-name)}))

(mu/defn available-measures :- [:maybe [:sequential {:min 1} ::lib.schema.metadata/measure]]
  "Get a list of Measures that you may consider using as aggregation for a query. Only Measures that have the same
  `table-id` as the `source-table` for this query will be suggested."
  ([query]
   (available-measures query -1))
  ([query :- ::lib.schema/query
    stage-number :- :int]
   (when (zero? (lib.util/canonical-stage-index query stage-number))
     (when-let [source-table-id (lib.util/source-table-id query)]
       (let [measures (lib.metadata.protocols/measures (lib.metadata/->metadata-provider query) source-table-id)
             measure-aggregations (into {}
                                        (keep-indexed (fn [index aggregation-clause]
                                                        (when (lib.util/clause-of-type? aggregation-clause :measure)
                                                          [(get aggregation-clause 2) index])))
                                        (lib.aggregation/aggregations query 0))]
         (cond
           (empty? measures)             nil
           (empty? measure-aggregations) (vec measures)
           :else                         (mapv (fn [measure-metadata]
                                                 (let [aggregation-pos (-> measure-metadata :id measure-aggregations)]
                                                   (cond-> measure-metadata
                                                     aggregation-pos (assoc :aggregation-positions [aggregation-pos]))))
                                               measures)))))))

(def keep-me
  "Var to keep ns loaded for side-effects."
  nil)
