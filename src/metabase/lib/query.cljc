(ns metabase.lib.query
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(defn- query-with-stages [database-metadata-provider stages]
  {:lib/type     :mbql/query
   :lib/metadata database-metadata-provider
   :database     (:id (lib.metadata/database database-metadata-provider))
   :type         :pipeline
   :stages       (mapv lib.options/ensure-uuid stages)})

(defn- query-from-existing [database-metadata-provider query]
  (let [query (lib.util/pipeline query)]
    (query-with-stages database-metadata-provider (:stages query))))

(defmulti ^:private ->query
  "Implementation for [[query]]."
  {:arglists '([database-metadata-provider x])}
  (fn [_database-metadata-provider x]
    (lib.dispatch/dispatch-value x)))

(defmethod ->query :dispatch-type/map
  [database-metadata-provider query]
  (query-from-existing database-metadata-provider query))

;;; this should already be a query in the shape we want, but let's make sure it has the database metadata that was
;;; passed in
(defmethod ->query :mbql/query
  [database-metadata-provider query]
  (assoc query :lib/metadata database-metadata-provider))

(defmethod ->query :metadata/table
  [database-metadata-provider table-metadata]
  (query-with-stages database-metadata-provider
                     [{:lib/type     :mbql.stage/mbql
                       :source-table (:id table-metadata)}]))

(mu/defn query :- ::lib.schema/query
  "Create a new MBQL query from anything that could conceptually be an MBQL query, like a Database or Table or an
  existing MBQL query or saved question or whatever. If the thing in question does not already include metadata, pass
  it in separately -- metadata is needed for most query manipulation operations."
  [database-metadata-provider :- lib.metadata/DatabaseMetadataProvider
   x]
  (->query database-metadata-provider x))

;;; TODO -- the stuff below will probably change in the near future, please don't read too much in to it.
(mu/defn native-query :- ::lib.schema/query
  "Create a new native query.

  Native in this sense means a pMBQL `:pipeline` query with a first stage that is a native query."
  ([database-metadata-provider :- lib.metadata/DatabaseMetadataProvider
    inner-query]
   (native-query database-metadata-provider nil inner-query))

  ([database-metadata-provider :- lib.metadata/DatabaseMetadataProvider
    results-metadata           :- lib.metadata/StageMetadata
    inner-query]
   (query-with-stages database-metadata-provider
                      [(-> {:lib/type           :mbql.stage/native
                            :lib/stage-metadata results-metadata
                            :native             inner-query}
                           lib.options/ensure-uuid)])))

(mu/defn saved-question-query :- ::lib.schema/query
  "Convenience for creating a query from a Saved Question (i.e., a Card)."
  [database-metadata-provider :- lib.metadata/DatabaseMetadataProvider
   {mbql-query :dataset_query, metadata :result_metadata}]
  (let [mbql-query (cond-> (assoc (lib.util/pipeline mbql-query)
                                  :lib/metadata database-metadata-provider)
                     metadata
                     (lib.util/update-query-stage -1 assoc :lib/stage-metadata metadata))]
    (query database-metadata-provider mbql-query)))
