(ns metabase.lib.query
  (:refer-clojure :exclude [remove])
  (:require
   [metabase.lib.common :as lib.common]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.stage :as lib.stage]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.util.match :as mbql.match]
   [metabase.util.malli :as mu]))

(defn- find-clause
  [query stage-number target-clause]
  (let [stage (lib.util/query-stage query stage-number)
        [target-type _opts target-id] target-clause]
    (not-empty
      (reduce
        (fn [accum top-level-clause]
          (if (mbql.match/match-one (get stage top-level-clause)
                [target-type _ target-id] true)
            (conj accum top-level-clause)
            accum))
        #{}
        [:order-by :aggregation :breakout :filter :expressions :joins :fields]))))

(defn- target-ref-for-stage
  "Gets the ref for the target-id exposed by the previous stage"
  [query stage-number target-id]
  (->> (lib.stage/visible-columns query stage-number)
       (some (fn [{:keys [lib/source id] :as column}]
               (when (and (= :source/previous-stage source) (= target-id id))
                 (lib.ref/ref column))))))

(defn- check-subsequent-stages-for-invalid-target!
  "Throws if target-clause is used in a subsequent stage"
  [previous-query query stage-number target-clause]
  (let [[_ _ target-id] target-clause]
    (loop [stage-number stage-number]
      (when-let [next-stage-number (lib.util/next-stage-number query stage-number)]
        ;; The target could still be exposed (i.e. removing the last breakout could expose itself through default fields)
        (when-not (target-ref-for-stage query next-stage-number target-id)
          ;; Get the ref to look for from the previous-query
          (let [target-ref (target-ref-for-stage previous-query next-stage-number target-id)]
            (if-let [found (find-clause query next-stage-number target-ref)]
              (throw (ex-info "Clause cannot be removed as it has dependents" {:target-clause target-clause
                                                                               :stage-number next-stage-number
                                                                               :found found}))
              (recur next-stage-number))))))))

(mu/defn remove-clause :- :metabase.lib.schema/query
  "Removes the `target-clause` in the filter of the `query`."
  ([query :- :metabase.lib.schema/query
    target-clause]
   (remove-clause query -1 target-clause))
  ([query :- :metabase.lib.schema/query
    stage-number :- :int
    target-clause]
   (reduce
     (fn [query location]
       (let [result (lib.util/update-query-stage query stage-number
                                                 lib.util/remove-clause location target-clause)]
         (when (not= query result)
           (case location
             :breakout (check-subsequent-stages-for-invalid-target! query result stage-number (lib.ref/ref target-clause))
             nil)
           (reduced result))
         result))
     query
     ;; TODO only these top level clauses are supported at this moment
     [:order-by :breakout])))

(mu/defn replace-clause :- :metabase.lib.schema/query
  "Replaces the `target-clause` with `new-clause` in the `query` stage."
  ([query :- :metabase.lib.schema/query
    target-clause
    new-clause]
   (replace-clause query -1 target-clause new-clause))
  ([query :- :metabase.lib.schema/query
    stage-number :- :int
    target-clause
    new-clause]
   (let [replacement (lib.common/->op-arg query stage-number new-clause)]
     (reduce
       (fn [query location]
         (let [result (lib.util/update-query-stage query stage-number
                                                   lib.util/replace-clause location target-clause replacement)]
           (when (not= query result)
             (case location
               :breakout (check-subsequent-stages-for-invalid-target! query result stage-number (lib.ref/ref target-clause))
               nil)
             (reduced result))
           result))
       query
       ;; TODO only these top level clauses are supported at this moment
       [:order-by :breakout]))))

(defmethod lib.normalize/normalize :mbql/query
  [query]
  (lib.normalize/normalize-map
   query
   keyword
   {:type   keyword
    :stages (partial mapv lib.normalize/normalize)}))

(defmethod lib.metadata.calculation/metadata-method :mbql/query
  [query stage-number x]
  (lib.metadata.calculation/metadata query stage-number (lib.util/query-stage x stage-number)))

(defmethod lib.metadata.calculation/display-name-method :mbql/query
  [query stage-number x]
  (lib.metadata.calculation/display-name query stage-number (lib.util/query-stage x stage-number)))

(defn query-with-stages
  "Create a query from a sequence of stages."
  ([metadata-provider stages]
   (query-with-stages (:id (lib.metadata/database metadata-provider)) metadata-provider stages))

  ([database-id metadata-provider stages]
   {:lib/type     :mbql/query
    :lib/metadata metadata-provider
    :database     database-id
    :type         :pipeline
    :stages       (mapv lib.options/ensure-uuid stages)}))

(defn query-with-stage
  "Create a query from a specific stage."
  ([metadata-provider stage]
   (query-with-stages metadata-provider [stage]))

  ([database-id metadata-provider stage]
   (query-with-stages database-id metadata-provider [stage])))

(defn- query-from-existing [metadata-provider query]
  (let [query (lib.util/pipeline query)]
    (query-with-stages metadata-provider (:stages query))))

(defmulti ^:private ->query
  "Implementation for [[query]]."
  {:arglists '([metadata-provider x])}
  (fn [_metadata-provider x]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(defmethod ->query :dispatch-type/map
  [metadata-provider query]
  (query-from-existing metadata-provider query))

;;; this should already be a query in the shape we want, but let's make sure it has the database metadata that was
;;; passed in
(defmethod ->query :mbql/query
  [metadata-provider query]
  (assoc query :lib/metadata metadata-provider))

(defmethod ->query :metadata/table
  [metadata-provider table-metadata]
  (query-with-stages metadata-provider
                     [{:lib/type     :mbql.stage/mbql
                       :source-table (:id table-metadata)}]))

(mu/defn query :- ::lib.schema/query
  "Create a new MBQL query from anything that could conceptually be an MBQL query, like a Database or Table or an
  existing MBQL query or saved question or whatever. If the thing in question does not already include metadata, pass
  it in separately -- metadata is needed for most query manipulation operations."
  [metadata-provider :- lib.metadata/MetadataProvider
   x]
  (->query metadata-provider x))

;;; TODO -- the stuff below will probably change in the near future, please don't read too much in to it.
(mu/defn native-query :- ::lib.schema/query
  "Create a new native query.

  Native in this sense means a pMBQL `:pipeline` query with a first stage that is a native query."
  ([metadata-provider :- lib.metadata/MetadataProvider
    inner-query]
   (native-query metadata-provider nil inner-query))

  ([metadata-provider :- lib.metadata/MetadataProvider
    results-metadata  :- lib.metadata/StageMetadata
    inner-query]
   (query-with-stages metadata-provider
                      [(-> {:lib/type           :mbql.stage/native
                            :lib/stage-metadata results-metadata
                            :native             inner-query}
                           lib.options/ensure-uuid)])))

(mu/defn saved-question-query :- ::lib.schema/query
  "Convenience for creating a query from a Saved Question (i.e., a Card)."
  [metadata-provider :- lib.metadata/MetadataProvider
   {mbql-query :dataset_query, metadata :result_metadata}]
  (let [mbql-query (cond-> (assoc (lib.convert/->pMBQL mbql-query)
                                  :lib/metadata metadata-provider)
                     metadata
                     (lib.util/update-query-stage -1 assoc :lib/stage-metadata metadata))]
    (query metadata-provider mbql-query)))

(mu/defn query-from-legacy-inner-query :- ::lib.schema/query
  "Create a pMBQL query from a legacy inner query."
  [metadata-provider :- lib.metadata/MetadataProvider
   database-id       :- ::lib.schema.id/database
   inner-query       :- :map]
  (->> (lib.convert/legacy-query-from-inner-query database-id inner-query)
       lib.convert/->pMBQL
       (query metadata-provider)))
