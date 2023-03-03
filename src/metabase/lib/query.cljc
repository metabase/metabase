(ns metabase.lib.query
  (:require
   [malli.core :as mc]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(def ^:private Metadata
  [:or
   lib.metadata/DatabaseMetadata
   lib.metadata/StageMetadata])

(defmulti ^:private ->query
  "Implementation for [[query]]."
  {:arglists '([metadata x])}
  (fn [_metadata x]
    (lib.dispatch/dispatch-value x)))

;;; for a native query.
(defmethod ->query :dispatch-type/string
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

(defmethod ->query :dispatch-type/map
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

;;; TODO -- the stuff below will probably change in the near future, please don't read too much in to it.
(mu/defn native-query :- ::lib.schema/query
  "Create a new native query.

  Native in this sense means a pMBQL `:pipeline` query with a first stage that is a native query."
  ([database-metadata :- lib.metadata/DatabaseMetadata ; or results metadata?
    query]
   ;; TODO -- shouldn't this be outputting a pipeline query right away? I think this is wrong
   {:lib/type     :mbql/query
    :lib/metadata database-metadata
    :database     (:id database-metadata)
    :type         :pipeline
    :stages       [(-> {:lib/type :mbql.stage/native
                        :native   query}
                       lib.options/ensure-uuid)]})

  ([database-metadata :- lib.metadata/DatabaseMetadata
    results-metadata  :- lib.metadata/StageMetadata
    query]
   ;; TODO -- in #28717 we will probably change this so `:lib/metadata` is always DatabaseMetadata and the
   ;; `results-metadata` is `:lib/stage-metadata` attached to the first stage
   {:lib/type     :mbql/query
    :lib/metadata results-metadata
    :database     (:id database-metadata)
    :type         :pipeline
    :stages       [(-> {:lib/type :mbql.stage/native
                        :native   query}
                       lib.options/ensure-uuid)]}))

;;; TODO -- this needs database metadata passed in as well.
(mu/defn saved-question-query :- ::lib.schema/query
  "Convenience for creating a query from a Saved Question (i.e., a Card)."
  [{query :dataset_query, metadata :result_metadata}]
  (->query metadata query))

(mu/defn metadata :- [:maybe Metadata]
  "Get the metadata associated with a `query`, if any."
  [query :- ::lib.schema/query]
  (:lib/metadata query))

(mu/defn source-table-id :- ::lib.schema.id/table
  "Finds the ID for the source table of `query`."
  [query :- ::lib.schema/query]
  (-> query
      (lib.util/query-stage 0)
      :source-table))
