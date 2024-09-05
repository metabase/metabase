(ns metabase.search.fts.ingestion
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase.search.config :as search.config]
   [metabase.search.impl :as search.impl]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(def ^:private tsv-language "english")

(defn index-of [^clojure.lang.PersistentVector xs x]
  (let [idx (.indexOf xs x)]
    (when (not= idx -1)
      idx)))

(defn- model-rank [model]
  (or (index-of search.config/models-search-order model)
      ;; Give unknown models the lowest priority
      (count search.config/models-search-order)))

(defn- searchable-text [m]
  ;; For now, we never index the native query content
  (str/join " " (map m (search.config/searchable-columns (:model m) false))))

(defn- legacy->index [m]
  {;; entity
   :model         (:model m)
   :model_id      (:id m)
   ;; search
   :search_vector [:to_tsvector
                   [:inline tsv-language]
                   [:cast (searchable-text m) :text]]
   ;; scoring related
   :model_rank    (model-rank (:model m))
   ;; permission releated entities
   :collection_id (:collection_id m)
   :database_id   (:database_id m)
   :table_id      (:table_id m)
   ;; filter related
   :archived      (boolean (:archived m))})

(defn- search-items-reducible []
  (-> {:archived?          nil
       ;; this does not matter since we're a superuser
       :current-user-id    1
       :is-superuser?      true
       :current-user-perms #{"/"}
       :model-ancestors?   false
       :models             search.config/all-models
       :search-string      nil}
      search.impl/full-search-query
      (dissoc :limit)
      t2/reducible-query))

(defn search-query
  "Use the index table to search for records."
  [search-term]
  (map (juxt :model_id :model)
       (t2/query
        (sql/format
         {:select [:model_id :model]
          :from   [(t2/table-name :model/SearchIndex)]
          :where  [:raw "search_vector @@ websearch_to_tsquery('" tsv-language "', " [:param :search-term] ")"]}
         {:params {:search-term search-term}}))))

(defn- legacy-query
  "Use the source tables directly to search for records."
  [search-term]
  (map (juxt :id :model)
       (t2/query
        (search.impl/full-search-query
         {:archived?          nil
          ;; this does not matter since we're a superuser
          :current-user-id    1
          :is-superuser?      true
          :current-user-perms #{"/"}
          :model-ancestors?   false
          :models             (disj search.config/all-models "indexed-entity")
          :search-string      search-term}))))

(defn build-index!
  "Go over all searchable items and populate the index with them."
  []
  (->> (search-items-reducible)
       (eduction
        ;; not sure how to get this to play nicely with partition
        (comp
         (map t2.realize/realize)
         (map legacy->index)))
       (run!
        (fn [entry]
          #_(t2/delete! :model/SearchIndex
                        :model    (:model entry)
                        :model_id (:model_id entry))
          (t2/insert! :model/SearchIndex entry)))))

(defn search-results [search-term]
  (-> (sql.helpers/with [:index-query
                         {:select [:model :model_id]
                          :from   [(t2/table-name :model/SearchIndex)]
                          :where  [:raw "search_vector @@ websearch_to_tsquery('"
                                   tsv-language "', "
                                   [:param :search-term] ")"]}]
                        [:source-query
                         (search.impl/full-search-query
                          {:archived? nil

                             ;; TODO pass the actual user
                           :current-user-id    1
                           :is-superuser?      true
                           :current-user-perms #{"/"}

                           :model-ancestors? false
                           :models           search.config/all-models

                           :search-string nil})])
      (sql.helpers/select :sq.*)
      (sql.helpers/from   [:source-query :sq])
      (sql.helpers/right-join   [:index-query :iq] [:and
                                                    [:= :sq.model :iq.model]
                                                    [:= :sq.id :iq.model_id]])
      (sql/format {:params {:search-term search-term} :quoted true})
      t2/query))

(defn legacy-results
  "To compare"
  [search-term]
  (t2/query
   (search.impl/full-search-query
    {:archived? nil

     ;; TODO pass the actual user
     :current-user-id    1
     :is-superuser?      true
     :current-user-perms #{"/"}

     :model-ancestors? false
     ;; this model needs dynamic vars
     :models           (disj search.config/all-models "indexed-entity")

     :search-string search-term})))

(comment
  (build-index!)
  (t2/count :model/SearchIndex)
  (t2/select :model/SearchIndex)
  (t2/delete! :model/SearchIndex)
  (dotimes [_ 100]
    (build-index!))

  ;; the same
  (map (juxt :model :id :name) (search-results "user"))
  (map (juxt :model :id :name) (legacy-results "user"))
  (map (juxt :model :id :name) (search-results "satisfaction"))
  (map (juxt :model :id :name) (legacy-results "satisfaction"))

;; cool, newer version return singular result
  (map (juxt :model :id :name) (search-results "satisfactions"))
  (map (juxt :model :id :name) (legacy-results "satisfactions"))

  ;; nope, neither get it as the lexeme is not similar enought
  (map (juxt :model :id :name) (search-results "satisfactory"))
  (map (juxt :model :id :name) (legacy-results "satisfactory"))

;; strips tstop words!
  (search-query "its the satisfaction")
  (legacy-query "its the satisfaction")

  ;; removes unrelated substring
  (search-query "venue")
  (legacy-query "venue")

;; way faster searching the index
  (time (dotimes [_ 1] (search-query "satisfaction")))
  (time (dotimes [_ 100] (search-query "satisfaction")))
  (time (dotimes [_ 100] (legacy-query "satisfaction")))
  (time (dotimes [_ 100] (search-query "venue")))
  (time (dotimes [_ 100] (legacy-query "venue")))

  ;; but joining to the "hydrated query" reverses the advantage
  (time
   (dotimes [_ 500]
     (mapv (juxt :model :id :name) (search-results "sample"))))
  (time
   (dotimes [_ 500]
     (mapv (juxt :model :id :name) (legacy-results "sample"))))

;; consistent B-)
  (search-query "revenue")
  (legacy-query "venue")
  (search-results "venue")
  (legacy-results "venue")
  (doseq [term ["e-commerce" "example" "rasta" "new" "collection" "venue"]]
    (assert (= (set (search-query term))
               (set (legacy-query term)))
            term)))
