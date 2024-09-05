(ns metabase.search.fts.ingestion
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.search.config :as search.config]
   [metabase.search.impl :as search.impl]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(def ^:private tsv-language "english")

(def ^:private primary-keys
  [:name :description])

(def ^:private secondary-keys
  [#_:collection_name :table_description])

(defn- combine-fields [m ks]
  (str/join " " (keep m ks)))

(defn- model-rank [model]
  (let [idx (.indexOf search.config/models-search-order model)]
    (if (= -1 idx)
      ;; Give unknown models the lowest priority
      (count search.config/models-search-order)
      idx)))

(defn- legacy->index [m]
  (let [search-text (str
                     (combine-fields m primary-keys) " "
                     (combine-fields m secondary-keys))]
    {;; entity
     :model         (:model m)
     :model_id      (:id m)
     ;; search
     ;; :search_text   search-text
     :search_vector [:to_tsvector
                     [:inline tsv-language]
                     [:cast search-text :text]]
     ;; scoring related
     :model_rank    (model-rank (:model m))
     ;; permission releated entities
     :collection_id (:collection_id m)
     :database_id   (:database_id m)
     :table_id      (:table_id m)
     ;; filter related
     :archived      (boolean (:archived m))}))

(defn- search-items-reducible []
  (t2/reducible-query
   (search.impl/full-search-query
    {:archived?          nil
     ;; this does not matter since we're a superuser
     :current-user-id    1
     :is-superuser?      true
     :current-user-perms #{"/"}
     :model-ancestors?   false
     :models             search.config/all-models
     :search-string      nil})))

(defn search-query
  "Use the index table to search for records."
  [search-term]
  (map (juxt :model_id :model)
       (t2/query
        (sql/format
         {:select [:*]
          :from   [:search_index]
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
          (t2/delete! :model/SearchIndex
                      :model    (:model entry)
                      :model_id (:model_id entry))
          (t2/insert! :model/SearchIndex entry)))))

(comment
  (t2/delete! :model/SearchIndex)
  (t2/count :model/SearchIndex)
  (build-index!)

  (search-query "satisfaction")
  (legacy-query "satisfaction")
  (search-query "e-commerce")
  (legacy-query "e-commerce")
  (search-query "example")
  (legacy-query "example")
  (search-query "rasta")
  (legacy-query "rasta")


  (t2.realize/realize (reducible-cards)))
