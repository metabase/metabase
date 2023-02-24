(ns metabase.lib.query
  (:require
   [malli.core :as mc]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(def ^:private Metadata
  [:or
   lib.metadata/DatabaseMetadata
   lib.metadata/SourceQueryMetadata])

(defmulti ^:private ->query
  "Implementation for [[query]]."
  {:arglists '([metadata x])}
  (fn [_metadata x]
    (lib.dispatch/dispatch-value x)))

;;; for a native query.
(defmethod ->query :type/string
  [database-metadata table-name]
  (mc/coerce lib.metadata/DatabaseMetadata database-metadata)
  {:lib/type     :mbql/query
   :lib/metadata database-metadata
   :database     (:id database-metadata)
   :type         :pipeline
   :stages       [(let [table (lib.metadata/table-metadata database-metadata table-name)]
                    (-> {:lib/type     :mbql.stage/mbql
                         :source-table (:id table)}
                        lib.options/ensure-uuid))]})

(defmethod ->query :type/map
  [metadata query]
  (-> (lib.util/pipeline query)
      (assoc :lib/metadata metadata
             :lib/type     :mbql/query)
      (update :stages (fn [stages]
                        (mapv
                         lib.options/ensure-uuid
                         stages)))))

(mu/defn query :- ::lib.schema/query
  "Create a new MBQL query from anything that could conceptually be an MBQL query, like a Database or Table or an
  existing MBQL query or saved question or whatever. If the thing in question does not already include metadata, pass
  it in separately -- metadata is needed for most query manipulation operations."
  ([x]
   (->query nil x))
  ([metadata :- Metadata
    x]
   (->query metadata x)))

(mu/defn native-query :- ::lib.schema/query
  "Create a new native query."
  ([database-metadata :- lib.metadata/DatabaseMetadata ; or results metadata?
    query]
   {:database     (:id database-metadata)
    :type         :native
    :native       {:query query}
    :lib/type     :mbql/query
    :lib/metadata database-metadata})
  ([database-metadata :- lib.metadata/DatabaseMetadata
    results-metadata  :- lib.metadata/SourceQueryMetadata
    query]
   {:lib/type     :mbql/query
    :lib/metadata results-metadata
    :database     (:id database-metadata)
    :type         :pipeline
    :stages       [(-> {:lib/type :mbql.stage/native
                        :native   query}
                       lib.options/ensure-uuid)]}))

(mu/defn saved-question-query :- ::lib.schema/query
  "Convenience for creating a query from a Saved Question (i.e., a Card)."
  [{query :dataset_query, metadata :result_metadata}]
  (->query metadata query))

(mu/defn metadata :- [:maybe Metadata]
  "Get the metadata associated with a `query`, if any."
  [query :- ::lib.schema/query]
  (:lib/metadata query))
