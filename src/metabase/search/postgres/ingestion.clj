(ns metabase.search.postgres.ingestion
  "Use to populate the search. For now it leverage the legacy search code, to avoid duplication.
  Unfortunately, this makes it difficult to share logic for re-indexing individual models efficiently,
  and to determine when changes to related entities should cause an item to be re-indexed.
  For this reason we'll want to move to using a spec-based approach next."
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.search.config :as search.config]
   [metabase.search.legacy :as search.legacy]
   [metabase.search.postgres.index :as search.index]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(def ^:private insert-batch-size 50)

(def ^:private model-rankings
  (zipmap search.config/models-search-order (range)))

(defn- model-rank [model]
  ;; Give unknown models the lowest priority
  (model-rankings model (count model-rankings)))

(defn- searchable-text [m]
  ;; For now, we never index the native query content
  (->> (:search-terms (search.spec/spec (:model m)))
       (map m)
       (str/join " ")))

(defn- display-data [m]
  (select-keys m [:name :display_name :description :collection_name]))

(defn- ->entry [m]
  (-> m
      (select-keys
       (into [:id :model] search.spec/attr-columns))
      (update :archived boolean)
      (assoc
       :display_data (display-data m)
       :legacy_input m
       :searchable_text (searchable-text m)
       :model_rank (model-rank (:model m)))))

(defn- legacy-search-items-query
  "Use an in-place search to get all the items we want to index. A *HACK* only used for search-models without a spec."
  ([]
   (let [spec-models (keys (methods search.spec/spec))
         model-names (reduce disj (disj search.config/all-models "indexed-entity") spec-models)]
     (legacy-search-items-query model-names)))
  ([model-names]
   (if (empty? model-names)
       ;; Legacy search will return a singleton with a nil record, let's rather not get back anything.
     {:select [:*] :from :report_card :where [:inline [:= 1 2]]}
     (-> {:search-string      nil
          :models             model-names
            ;; we want to see everything
          :is-superuser?      true
          :current-user-id    (t2/select-one-pk :model/User :is_superuser true)
          :current-user-perms #{"/"}
          :archived?          nil
            ;; only need this for display data
          :model-ancestors?   false}
         search.legacy/full-search-query
         (dissoc :limit)))))

(defn- attrs->select-items [attrs]
  (for [[k v] attrs :when v]
    (let [as (keyword (u/->snake_case_en (name k)))]
      (if (true? v) as [v as]))))

(defn- spec-index-query*
  [search-model]
  (let [spec (search.spec/spec search-model)]
    (u/remove-nils
     {:select    (search.spec/qualify-columns :this
                                              (concat
                                               (:search-terms spec)
                                               (mapcat (fn [k] (attrs->select-items (get spec k)))
                                                       [:attrs :render-terms])))
      :from      [[(t2/table-name (:model spec)) :this]]
      :where     (:where spec [:inline [:= 1 1]])
      :left-join (when (:joins spec)
                   (into []
                         cat
                         (for [[join-alias [join-model join-condition]] (:joins spec)]
                           [[(t2/table-name join-model) join-alias]
                            join-condition])))})))

(def ^{:private true, :arglists '([search-model])} spec-index-query
  (memoize spec-index-query*))

(defn- spec-index-query-where [search-model where-clause]
  (-> (spec-index-query search-model)
      (sql.helpers/where where-clause)))

(defn- spec-index-reducible [search-model & [where-clause]]
  (->> (spec-index-query-where search-model where-clause)
       t2/reducible-query
       (eduction (map #(assoc % :model search-model)))))

(defn- search-items-reducible []
  (reduce u/rconcat
          (t2/reducible-query (legacy-search-items-query))
          (map spec-index-reducible (keys (methods search.spec/spec)))))

(defn- batch-update! [search-items-reducible]
  (->> search-items-reducible
       (eduction
        (comp
         (map t2.realize/realize)
         (map ->entry)
         (partition-all insert-batch-size)))
       (run! search.index/batch-update!)))

(defn populate-index!
  "Go over all searchable items and populate the index with them."
  []
  (batch-update! (search-items-reducible)))

(defn update-index!
  "Given a new or updated instance, create or update all the corresponding search entries if needed."
  [instance]
  (when-let [updates (seq (search.spec/search-models-to-update instance))]
    (->> (for [[search-model where-clause] updates]
           (spec-index-reducible search-model where-clause))
         ;; init collection is only for clj-kondo, as we know that the list is non-empty
         (reduce u/rconcat [])
         (batch-update!))))

;; TODO think about how we're going to handle cascading deletes.
;; Ideas:
;; - Queue full re-index (rather expensive)
;; - Queue "purge" (empty left join to the model) - needs special case for indexed-entity
;; - Pre-delete hook using pre-calculated PK-based graph
(defn delete-model!
  "Given a deleted instance, delete all the corresponding search entries."
  [instance]
  (let [model (t2/model instance)
        id    (:id instance)
        ;; TODO this could use some precalculation into a look-up map
        search-models (->> (methods search.spec/spec)
                           (map (fn [[search-model spec-fn]] (spec-fn search-model)))
                           (filter #(= model (:model %)))
                           (map :name)
                           seq)]
    (when search-models
      (search.index/delete! id search-models))))

(defn- index-model-entries [search-model where-clause]
  (-> (spec-index-query search-model)
      (sql.helpers/where where-clause)))

(comment
  (t2/query
   (index-model-entries "table" [:= 1 :this.db_id])))

(comment
  ;; This is useful introspection for migrating each search-model to a spec
  (spec-index-query "collection")
  (into [] (map t2.realize/realize) (t2/reducible-query (spec-index-query "database")))
  (->> {:search-string      nil
        :models             #{"indexed-entity"}
        :is-superuser?      true
        :current-user-id    (t2/select-one-pk :model/User :is_superuser true)
        :current-user-perms #{"/"}
        :archived?          false
        :model-ancestors?   false}
       (search.legacy/full-search-query)
       #_:select
       #_(remove (fn [[cast :as fields]]
                   (or (= :model (last fields))
                       (and (vector? cast) (nil? (second cast))))))
       #_(sort-by first)))
