(ns metabase.search.appdb.query
  "Builds the app-DB search index queries of the appdb engine from a search context. Query building only:
  `metabase.search.db` runs the queries, so this namespace must not require it (nor `metabase.search.appdb.index`)."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.filter :as search.filter]
   [metabase.search.permissions :as search.permissions]))

(defn add-table-where-clauses
  "Add a `WHERE` clause to the query to only return tables the current user has access to.
   Also adds any CTEs required for permission filtering."
  [search-ctx qry]
  (let [model-id-col [:cast :search_index.model_id (case (mdb/db-type)
                                                     :mysql :signed
                                                     :integer)]
        {:keys [with clause]} (search.permissions/permitted-tables-clause search-ctx model-id-col)]
    (cond-> qry
      (seq with) (update :with (fnil into []) with)
      true       (sql.helpers/where
                  [:or
                   [:= :search_index.model nil]
                   [:!= :search_index.model "table"]
                   [:and
                    [:= :search_index.model "table"]
                    clause]]))))

(defn add-collection-join-and-where-clauses
  "Add a `WHERE` clause to the query to only return Collections the Current User has access to; join against Collection,
  so we can return its `:name`."
  [search-ctx qry]
  (let [collection-id-col :search_index.collection_id
        permitted-clause  (search.permissions/permitted-collections-clause search-ctx collection-id-col)
        personal-clause   (search.filter/personal-collections-where-clause search-ctx collection-id-col)
        ;; Tables have their own dedicated permission filter (add-table-where-clauses) that checks both data
        ;; permissions and published-via-collection access, so we exclude them from collection filtering here.
        excluded-models   (conj (vec (search.filter/models-without-collection)) "table")
        or-null           #(vector :or
                                   [:in :search_index.model excluded-models]
                                   %)]
    (cond-> qry
      true (sql.helpers/left-join [:collection :collection] [:= collection-id-col :collection.id])
      true (sql.helpers/where (or-null permitted-clause))
      personal-clause (sql.helpers/where (or-null personal-clause)))))

(defn filter-layers
  "Ordered `[label add-clauses-fn]` pairs that layer the structural + permission `WHERE` clauses onto an index
  query. Defined once so `metabase.search.appdb.core` results and its debug diagnose probe share the exact same chain, and so the
  diagnostic can attribute exclusion to the first layer (per-permission, then per-filter) that drops a row."
  [search-ctx]
  (concat
   [[:collection-permissions (partial add-collection-join-and-where-clauses search-ctx)]
    [:table-permissions      (partial add-table-where-clauses search-ctx)]
    [:transform-source-type  #(sql.helpers/where % (search.filter/transform-source-type-where-clause
                                                    search-ctx
                                                    :search_index.model
                                                    :search_index.source_type))]]
   (for [[filter-key clause] (search.filter/filter-clauses search-ctx)]
     [filter-key #(sql.helpers/where % clause)])))

(defn filter-layer-labels
  "The labels of [[filter-layers]], in order."
  [search-ctx]
  (mapv first (filter-layers search-ctx)))

(defn- apply-layers
  [qry layers]
  (reduce (fn [qry [_ f]] (f qry)) qry layers))

(defn base-filtered-query
  "The structural + permission filtered query of the search index `index-table` (no scoring), parameterized by
  `search-string`. Passing a blank/nil `search-string` drops the fulltext predicate while keeping every other filter
  (see `specialization/base-query`)."
  [index-table search-ctx search-string select-items]
  (apply-layers (specialization/base-query index-table search-string search-ctx select-items)
                (filter-layers search-ctx)))

(defn model-set-query
  "The query returning the distinct `:model`s of the search index `index-table` with at least one visible result for
  `search-ctx`."
  [index-table search-ctx]
  (->> (specialization/base-query index-table (:search-string search-ctx) search-ctx [[[:distinct :model] :model]])
       (add-collection-join-and-where-clauses search-ctx)
       (#(sql.helpers/where % (search.filter/transform-source-type-where-clause
                               search-ctx
                               :search_index.model
                               :search_index.source_type)))
       (search.filter/with-filters search-ctx)))

(defn- restrict-to-row
  [model id qry]
  (sql.helpers/where qry [:and
                          [:= :search_index.model model]
                          [:= :search_index.model_id (str id)]]))

(defn probe-query
  "A single-row probe: does the `model`/`id` row of the search index `index-table` survive the first `layer-count`
  [[filter-layers]] (nil = every layer) for `search-ctx` and `search-string`?"
  [index-table search-ctx search-string model id layer-count]
  (let [layers (cond->> (filter-layers search-ctx)
                 layer-count (take layer-count))]
    (-> (specialization/base-query index-table search-string search-ctx [:model_id])
        (->> (restrict-to-row model id))
        (apply-layers layers)
        (assoc :select [[[:inline 1] :one]] :limit 1)
        (dissoc :order-by))))
