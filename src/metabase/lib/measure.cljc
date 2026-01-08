(ns metabase.lib.measure
  "A Measure is a saved MBQL query stage snippet with `:aggregation`. Measures are numeric expressions."
  (:refer-clojure :exclude [mapv empty? some])
  (:require
   [clojure.string :as str]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.options :as lib.options]
   [metabase.lib.query :as lib.query]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk.util :as lib.walk.util]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [mapv empty? some]]))

(defn- resolve-measure [query measure-id]
  (when (integer? measure-id)
    (lib.metadata/measure query measure-id)))

(defmethod lib.ref/ref-method :metadata/measure
  [{:keys [id], measure-name :name}]
  (lib.options/ensure-uuid [:measure {:display-name measure-name} id]))

(defn- measure-aggregation
  "Get the aggregation clause from a measure's definition."
  [{:keys [definition]}]
  (when definition
    (let [normalized (lib.normalize/normalize ::lib.schema/query definition)]
      (first (:aggregation (lib.util/query-stage normalized -1))))))

(defmethod lib.metadata.calculation/type-of-method :metadata/measure
  [_query _stage-number measure-metadata]
  (or (when-let [aggregation (measure-aggregation measure-metadata)]
        (lib.schema.expression/type-of aggregation))
      :type/*))

(defmethod lib.metadata.calculation/type-of-method :measure
  [query stage-number [_tag _opts measure-id]]
  (or (when-let [measure-metadata (resolve-measure query measure-id)]
        (lib.metadata.calculation/type-of query stage-number measure-metadata))
      :type/*))

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
    ;; Get the inner aggregation from the measure definition to extract the operator name (e.g., "sum", "count")
    ;; This is similar to how metrics work - the :name should be the operator name, not the measure's display name
    (let [measure-query     (lib.query/query query (lib.normalize/normalize ::lib.schema/query (:definition measure-meta)))
          inner-aggregation (first (lib.aggregation/aggregations measure-query))
          inner-meta        (when inner-aggregation
                              (lib.metadata.calculation/metadata measure-query -1 inner-aggregation))]
      {:lib/type     :metadata/column
       :base-type    :type/Number
       :name         (or (:name opts) (:name inner-meta) "measure")
       :display-name (or (:display-name opts) (:name measure-meta) (fallback-display-name))})
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

(defn check-measure-cycles
  "DFS to detect cycles starting from `measure-id` with `definition`.
  `metadata-provider` is used for looking up referenced measures.
  `path` is a vector of measure IDs representing the current DFS path (for cycle detection and reporting).
  `visited` is the set of measure IDs we've fully processed (for avoiding redundant work).
  Returns updated `visited` set. Throws if a cycle is detected or if a referenced measure doesn't exist."
  ([metadata-provider definition measure-id]
   (check-measure-cycles metadata-provider definition measure-id [] #{}))
  ([metadata-provider definition measure-id path visited]
   (cond
     (some #{measure-id} path)
     (let [cycle-start-idx (u/index-of #{measure-id} path)
           cycle-path      (conj (subvec path cycle-start-idx) measure-id)]
       (throw (ex-info (i18n/tru "Measure cycle detected: {0}" (str/join " → " cycle-path))
                       {:measure-id measure-id
                        :cycle-path cycle-path
                        :path       path})))

     (contains? visited measure-id)
     visited

     :else
     (let [referenced-ids (lib.walk.util/all-measure-ids definition)
           path'          (conj path measure-id)]
       (reduce (fn [visited' ref-id]
                 (if-let [measure (lib.metadata/measure metadata-provider ref-id)]
                   (check-measure-cycles metadata-provider (:definition measure) ref-id path' visited')
                   (throw (ex-info (i18n/tru "Measure {0} does not exist." ref-id)
                                   {:measure-id ref-id}))))
               (conj visited measure-id)
               referenced-ids)))))

(mu/defn check-measure-overwrite
  "Check if saving a measure with `measure-id` and `definition` would create a cycle.
  Returns nil if safe to save, throws an exception if it would create a cycle.

  `measure-id` can be nil for new measures that don't have an ID yet.
  `definition` is the measure's MBQL5 query which also serves as the metadata provider
  for looking up referenced measures."
  [measure-id :- [:maybe ::lib.schema.id/measure]
   definition :- ::lib.schema/query]
  (check-measure-cycles definition definition measure-id)
  nil)
