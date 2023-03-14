(ns metabase.lib.query
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(defmethod lib.metadata.calculation/metadata :mbql/query
  [query stage-number x]
  (lib.metadata.calculation/metadata query stage-number (lib.util/query-stage x stage-number)))

(defmethod lib.metadata.calculation/display-name-method :mbql/query
  [query stage-number x]
  (lib.metadata.calculation/display-name query stage-number (lib.util/query-stage x stage-number)))

(defn- query-with-stages [metadata-provider stages]
  {:lib/type     :mbql/query
   :lib/metadata metadata-provider
   :database     (:id (lib.metadata/database metadata-provider))
   :type         :pipeline
   :stages       (mapv lib.options/ensure-uuid stages)})

(defn- query-from-existing [metadata-provider query]
  (let [query (lib.util/pipeline query)]
    (query-with-stages metadata-provider (:stages query))))

(defmulti ^:private ->query
  "Implementation for [[query]]."
  {:arglists '([metadata-provider x])}
  (fn [_metadata-provider x]
    (lib.dispatch/dispatch-value x)))

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
  (let [mbql-query (cond-> (assoc (lib.util/pipeline mbql-query)
                                  :lib/metadata metadata-provider)
                     metadata
                     (lib.util/update-query-stage -1 assoc :lib/stage-metadata metadata))]
    (query metadata-provider mbql-query)))
