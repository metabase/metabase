(ns metabase.lib.query
  (:require
   [malli.core :as mc]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema]
   [metabase.util.malli :as mu]))

(comment metabase.lib.schema/keep-me)

(def Metadata
  [:or
   lib.metadata/DatabaseMetadata
   lib.metadata/SourceQueryMetadata])

(def Query
  [:and
   [:ref :mbql/outer-query]
   [:map
    [:lib/metadata Metadata]]])

(defmulti query*
  {:arglists '([metadata x])}
  (fn [_metadata x]
    (lib.dispatch/dispatch-value x)))

(defmethod query* :type/string
  [database-metadata table-name]
  (mc/coerce lib.metadata/DatabaseMetadata database-metadata)
  {:database     (:id database-metadata)
   :type         :query
   :query        (let [table (lib.metadata/table-metadata database-metadata table-name)]
                   (-> {:lib/type     :lib/inner-query
                        :source-table (:id table)}
                       lib.options/ensure-uuid))
   :lib/type     :lib/outer-query
   :lib/metadata database-metadata})

(defmethod query* :type/map
  [metadata query]
  (cond-> (assoc query
                 :lib/metadata metadata
                 :lib/type     :lib/outer-query)
    (:query query) (update :query (fn add-inner-query-type [inner-query]
                                    (cond-> (-> inner-query
                                                (assoc :lib/type :lib/inner-query)
                                                lib.options/ensure-uuid)
                                      (:source-query inner-query) (update :source-query add-inner-query-type))))))

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
    :lib/type     :lib/outer-query
    :lib/metadata database-metadata})
  ([database-metadata :- lib.metadata/DatabaseMetadata
    results-metadata  :- lib.metadata/SourceQueryMetadata
    query]
   {:database     (:id database-metadata)
    :type         :native
    :native       {:query query}
    :lib/type     :lib/outer-query
    :lib/metadata results-metadata}))

(mu/defn saved-question-query :- Query
  [{query :dataset_query, metadata :result_metadata}]
  (query* metadata query))

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

#_(defmethod lib.resolve/resolve :lib/outer-query
  [metadata query]
  (cond-> query
    (:query query) (update :query (partial lib.resolve/resolve metadata))))
