(ns metabase.search.postgres.ingestion
  "Use to populate the search. For now it leverage the legacy search code, to avoid duplication.
  Unfortunately, this makes it difficult to share logic for re-indexing individual models efficiently,
  and to determine when changes to related entities should cause an item to be re-indexed.
  For this reason we'll want to move to using a spec-based approach next."
  (:require
   [clojure.string :as str]
   [metabase.search.config :as search.config]
   [metabase.search.impl :as search.impl]
   [metabase.search.postgres.index :as search.index]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(def ^:private model-rankings
  (zipmap search.config/models-search-order (range)))

(defn- model-rank [model]
  ;; Give unknown models the lowest priority
  (model-rankings model (count model-rankings)))

(defn- searchable-text [m]
  ;; For now, we never index the native query content
  (->> (search.config/searchable-columns (:model m) false)
       (map m)
       (str/join " ")))

(defn- ->entry [m]
  (-> m
      (select-keys
       [:id
        :model
        :archived
        :collection_id
        :database_id
        :table_id])
      (update :archived boolean)
      (assoc
       :searchable_text (searchable-text m)
       :model_rank      (model-rank (:model m)))))

(defn- search-items-reducible []
  (-> {:search-string      nil
       :models             search.config/all-models
       ;; we want to see everything
       :is-superuser?      true
       ;; irrelevant, as we're acting as a super user
       :current-user-id    1
       :current-user-perms #{"/"}
       ;; include both achived and non-archived items.
       :archived?          nil
       ;; only need this for display data
       :model-ancestors?   false}
      search.impl/full-search-query
      (dissoc :limit)
      t2/reducible-query))

(defn populate-index!
  "Go over all searchable items and populate the index with them."
  []
  (->> (search-items-reducible)
        ;; TODO realize and insert in batches
       (eduction
        (comp
         (map t2.realize/realize)
         (map ->entry)))
       (run! search.index/update!)))
