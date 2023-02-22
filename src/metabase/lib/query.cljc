(ns metabase.lib.query
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.lib.dispatch :as lib.dispatch]
   [malli.core :as mc]))

(comment metabase.lib.schema/keep-me)

(def Metadata
  [:or
   lib.metadata/DatabaseMetadata
   lib.metadata/SourceQueryMetadata])

(def Query
  [:and
   :mbql/outer-query
   [:map
    [:lib/metadata Metadata]]])

(defmulti query*
  {:arglists '([metadata x])}
  (fn [_metadata x]
    (lib.dispatch/dispatch-value x)))

(defmethod query* :type/string
  [database-metadata table-name]
  (mc/coerce lib.metadata/DatabaseMetadata database-metadata)
  {:database  (:id database-metadata)
   :type      :query
   :query     (let [table (lib.metadata/table-metadata database-metadata table-name)]
                {:source-table (:id table)})
   :lib/metadata database-metadata})

(defmethod query* :type/map
  [metadata query]
  (assoc query :lib/metadata metadata))

(mu/defn query :- Query
  "Create a new MBQL query for a Database."
  [metadata :- Metadata
   x]
  (query* metadata x))

(mu/defn native-query :- Query
  "Create a new native query."
  ([database-metadata :- lib.metadata/DatabaseMetadata ; or results metadata?
    query]
   {:database     (:id database-metadata)
    :type         :native
    :native       {:query query}
    :lib/metadata database-metadata})
  ([database-metadata :- lib.metadata/DatabaseMetadata
    results-metadata  :- lib.metadata/SourceQueryMetadata
    query]
   {:database     (:id database-metadata)
    :type         :native
    :native       {:query query}
    :lib/metadata results-metadata}))

(mu/defn saved-question-query :- Query
  [{query :dataset_query, metadata :result_metadata}]
  (assoc query :lib/metadata metadata))

#_(mu/defn card-query :- QueryWithMetadata
  "Create a query for a Saved Question (aka a 'Card')."
  [card]
  ;; TODO
  )

;;; TODO - query for a Card in a Dashboard?

#_(mu/defn dataset-query :- QueryWithMetadata
  "Create a query for a dataset."
  [dataset]
  ;; TODO
  )

(mu/defn metadata :- Metadata
  [query :- Query]
  (:lib/metadata query))
