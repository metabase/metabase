(ns metabase.search.appdb.core
  (:require
   [cheshire.core :as json]
   [honey.sql.helpers :as sql.helpers]
   [metabase.db :as mdb]
   [metabase.public-settings :as public-settings]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.appdb.scoring :as search.scoring]
   [metabase.search.appdb.specialization.postgres :as specialization.postgres]
   [metabase.search.config :as search.config]
   [metabase.search.engine :as search.engine]
   [metabase.search.filter :as search.filter]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.permissions :as search.permissions]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)))

;; Register the multimethods for each specialization
(comment
  specialization.postgres/keep-me)

(set! *warn-on-reflection* true)

(defmethod search.engine/supported-engine? :search.engine/fulltext [_]
  (and (public-settings/experimental-fulltext-search-enabled)
       (= (mdb/db-type) :postgres)))

(defn- parse-datetime [s]
  (when s (OffsetDateTime/parse s)))

(defn- rehydrate [weights active-scorers index-row]
  (-> (merge
       (json/parse-string (:legacy_input index-row) keyword)
       (select-keys index-row [:pinned]))
      (assoc
       :score      (:total_score index-row 1)
       :all-scores (mapv (fn [k]
                           ;; we shouldn't get null scores, but just in case (i.e., because there are bugs)
                           (let [score  (or (get index-row k) 0)
                                 weight (or (weights k) 0)]
                             {:score        score
                              :name         k
                              :weight       weight
                              :contribution (* weight score)}))
                         active-scorers))
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

(defmethod search.engine/results :search.engine/fulltext
  [{:keys [search-string] :as search-ctx}]
  (when-not @#'search.index/initialized?
    (throw (ex-info "Search index is not initialized. Use [[init!]] to ensure it exists."
                    {:search-engine :postgres})))
  (let [weights (search.config/weights search-ctx)
        scorers (search.scoring/scorers search-ctx)]
    (->> (search.index/search-query search-string search-ctx [:legacy_input])
         (add-collection-join-and-where-clauses search-ctx)
         (search.scoring/with-scores search-ctx scorers)
         (search.filter/with-filters search-ctx)
         t2/query
         (map (partial rehydrate weights (keys scorers))))))

(defmethod search.engine/model-set :search.engine/fulltext
  [search-ctx]
  ;; We ignore any current models filter
  (let [search-ctx (assoc search-ctx :models search.config/all-models)]
    (->> (search.index/search-query (:search-string search-ctx) search-ctx [[[:distinct :model] :model]])
         (add-collection-join-and-where-clauses search-ctx)
         (search.filter/with-filters search-ctx)
         t2/query
         (into #{} (map :model)))))

(defmethod search.engine/init! :search.engine/fulltext
  [& {:keys [force-reset? populate?] :or {populate? true}}]
  (search.index/ensure-ready! force-reset?)
  (when populate?
    (search.ingestion/populate-index! :search.engine/fulltext)))

(defmethod search.engine/reindex! :search.engine/fulltext
  []
  (search.index/ensure-ready! false)
  (search.index/maybe-create-pending!)
  (u/prog1 (search.ingestion/populate-index! :search.engine/fulltext)
    (search.index/activate-pending!)))
