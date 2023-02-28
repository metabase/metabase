(ns metabase.lib.query
  (:require
   [malli.core :as mc]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.columns :as lib.metadata.columns]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(defmulti ^:private ->query
  "Implementation for [[query]]."
  {:arglists '([database-metadata x])}
  (fn [_database-metadata x]
    (lib.dispatch/dispatch-value x)))

(defmethod ->query :type/string
  [database-metadata table-name]
  ;; this is done for side-effects, it will error if it doesn't match the schema
  (mc/coerce lib.metadata/DatabaseMetadata database-metadata)
  (-> {:lib/type     :mbql/query
       :lib/metadata database-metadata
       :database     (:id database-metadata)
       :type         :pipeline
       :stages       [(let [table-metadata (lib.metadata/table-metadata database-metadata table-name)]
                        (-> {:lib/type     :mbql.stage/mbql
                             :source-table (:id table-metadata)}
                            lib.options/ensure-uuid))]}
      lib.metadata.columns/populate-stage-metadatas))

(defmethod ->query :type/map
  [database-metadata query]
  (-> (lib.util/pipeline query)
      (assoc :lib/metadata database-metadata
             :lib/type     :mbql/query)
      (update :stages (fn [stages]
                        (mapv lib.options/ensure-uuid stages)))
      lib.metadata.columns/populate-stage-metadatas))

(defmethod ->query :mbql/query
  [database-metadata query]
  ((get-method ->query :type/map) database-metadata query))

(mu/defn query :- ::lib.schema/query
  "Create a new MBQL query from anything that could conceptually be an MBQL query, like a Database or Table or an
  existing MBQL query or saved question or whatever. If the thing in question does not already include metadata, pass
  it in separately -- metadata is needed for most query manipulation operations."
  ([x]
   (->query nil x))
  ([database-metadata :- [:maybe lib.metadata/DatabaseMetadata]
    x]
   (->query database-metadata x)))

;;;; TODO -- this should probably also handle maps like
;;;
;;;    {:query "SELECT * FROM VENUES WHERE id = ?", :args [1]}
;;;
;;; But it doesn't currently have a way of doing that.
(mu/defn native-query :- ::lib.schema/query
  "Create a new native query."
  ([database-metadata :- lib.metadata/DatabaseMetadata
    query]
   (native-query database-metadata nil query))

  ([database-metadata :- lib.metadata/DatabaseMetadata
    results-metadata
    query
    & args]
   {:lib/type     :mbql/query
    :lib/metadata database-metadata
    :database     (:id database-metadata)
    :type         :pipeline
    :stages       [(-> {:lib/type           :mbql.stage/native
                        :lib/stage-metadata (lib.metadata/stage-metadata results-metadata)
                        :native             query
                        :args               args}
                       lib.options/ensure-uuid)]}))

(mu/defn saved-question-query :- ::lib.schema/query
  "Convenience for creating a query from a Saved Question (i.e., a Card)."
  ([database-metadata card]
   (saved-question-query database-metadata (:result_metadata card) (:id card)))
  ([database-metadata result-metadata card-id :- ::lib.schema.id/database]
   {:lib/type     :mbql/query
    :lib/metadata database-metadata
    :database     (:id database-metadata)
    :type         :pipeline
    :stages       [(-> {:lib/type           :mbql.stage/mbql
                        :lib/stage-metadata (lib.metadata/stage-metadata result-metadata)
                        :source-table       (str "card__" card-id)}
                       lib.options/ensure-uuid)]}))

(mu/defn metadata :- [:maybe lib.metadata/DatabaseMetadata]
  "Get the Database metadata associated with a `query`, if any."
  [query :- ::lib.schema/query]
  (:lib/metadata query))
