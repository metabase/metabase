(ns metabase.search.postgres.core
  (:require
   [cheshire.core :as json]
   [honey.sql.helpers :as sql.helpers]
   [metabase.search.config :as search.config]
   [metabase.search.filter :as search.filter]
   [metabase.search.permissions :as search.permissions]
   [metabase.search.postgres.index :as search.index]
   [metabase.search.postgres.ingestion :as search.ingestion]
   [metabase.search.postgres.scoring :as search.scoring]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)))

(set! *warn-on-reflection* true)

(defn- parse-datetime [s]
  (when s
    (OffsetDateTime/parse s)))

(defn- rehydrate [context index-row]
  (-> (merge
       (json/parse-string (:legacy_input index-row) keyword)
       (select-keys index-row [:total_score :pinned]))
      (assoc :scores (mapv (fn [k]
                             ;; we shouldn't get null scores, but just in case (i.e., because there are bugs)
                             (let [score  (or (get index-row k) 0)
                                   weight (search.config/weight context k)]
                               {:score        score
                                :name         k
                                :weight       weight
                                :contribution (* weight score)}))
                           (keys (search.scoring/scorers nil))))
      (update :created_at parse-datetime)
      (update :updated_at parse-datetime)
      (update :last_edited_at parse-datetime)))

(defn add-collection-join-and-where-clauses
  "Add a `WHERE` clause to the query to only return Collections the Current User has access to; join against Collection,
  so we can return its `:name`."
  [search-ctx qry]
  (let [collection-id-col :search_index.collection_id
        permitted-clause  (search.permissions/permitted-collections-clause search-ctx collection-id-col)
        personal-clause   (search.filter/personal-collections-where-clause search-ctx collection-id-col)]
    (cond-> qry
      true (sql.helpers/left-join [:collection :collection] [:= collection-id-col :collection.id])
      true (sql.helpers/where permitted-clause)
      personal-clause (sql.helpers/where personal-clause))))

(defn- fulltext
  "Search purely using the index."
  [search-term & {:as search-ctx}]
  (when-not @#'search.index/initialized?
    (throw (ex-info "Search index is not initialized. Use [[init!]] to ensure it exists."
                    {:search-engine :postgres})))
  (->> (search.index/search-query search-term search-ctx [:legacy_input])
       (add-collection-join-and-where-clauses search-ctx)
       (search.scoring/with-scores search-ctx)
       (search.filter/with-filters search-ctx)
       t2/query
       (map (partial rehydrate (:context search-ctx)))))

(def ^:private default-engine fulltext)

(defn- search-fn [search-engine]
  (case search-engine
    :search.engine/fulltext fulltext
    default-engine))

(defn search
  "Return a reducible-query corresponding to searching the entities via a tsvector."
  [search-ctx]
  (let [f (search-fn (:search-engine search-ctx))]
    (f (:search-string search-ctx)
       (dissoc search-ctx :search-string))))

(defn model-set
  "Return a set of the models which have at least one result for the given query."
  [search-ctx]
  ;; We ignore any current models filter
  (let [search-ctx (assoc search-ctx :models search.config/all-models)]
    (->> (search.index/search-query (:search-string search-ctx) search-ctx [[[:distinct :model] :model]])
         (add-collection-join-and-where-clauses search-ctx)
         (search.filter/with-filters search-ctx)
         t2/query
         (into #{} (map :model)))))

(defn no-scoring
  "Do no scoring, whatsoever"
  [result _scoring-ctx]
  {:score  (:total_score result 1)
   :result (assoc result :all-scores (:scores result))})

(defn init!
  "Ensure that the search index exists, and has been populated with all the entities."
  [& [force-reset?]]
  (search.index/ensure-ready! force-reset?)
  (search.ingestion/populate-index!))

(defn reindex!
  "Populate a new index"
  []
  (search.index/ensure-ready! false)
  (search.index/maybe-create-pending!)
  (u/prog1 (search.ingestion/populate-index!)
    (search.index/activate-pending!)))

(comment
  (init! true)
  (t2/select-fn-vec :legacy_input search.index/*active-table*))
