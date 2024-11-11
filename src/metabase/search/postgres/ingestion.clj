(ns metabase.search.postgres.ingestion
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.search.config :as search.config]
   [metabase.search.postgres.index :as search.index]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(def ^:private insert-batch-size 150)

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
  (reduce u/rconcat [] (map spec-index-reducible (keys (methods search.spec/spec)))))

(defn- batch-update! [search-items-reducible]
  (->> search-items-reducible
       (eduction
        (comp
         (map t2.realize/realize)
         ;; It's possible to get redundant entries from the indexed-entities table.
         ;; We remove duplicates to avoid creating invalid insert statements.
         (m/distinct-by (juxt :id :model))
         (map ->entry)
         (partition-all insert-batch-size)))
       (run! search.index/batch-update!)))

(defn populate-index!
  "Go over all searchable items and populate the index with them."
  []
  (batch-update! (search-items-reducible)))

(def ^:dynamic *force-sync*
  "Force ingestion to happen immediately, on the same thread."
  false)

(defmacro ^:private run-on-thread [& body]
  `(if *force-sync*
     (do ~@body)
     (doto (Thread. ^Runnable (fn [] ~@body))
       (.start))))

(defn update-index!
  "Given a new or updated instance, create or update all the corresponding search entries if needed."
  [instance]
  (when-let [updates (seq (search.spec/search-models-to-update instance))]
    ;; We need to delay execution to handle deletes, which alert us *before* updating the database.
    ;; TODO It's dangerous to simply unleash threads on the world, this should use a queue in future.
    (run-on-thread
     (Thread/sleep 100)
     (->> (for [[search-model where-clause] updates]
            (spec-index-reducible search-model where-clause))
          ;; init collection is only for clj-kondo, as we know that the list is non-empty
          (reduce u/rconcat [])
          (batch-update!)))
    nil))

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

(comment
  (t2/query
   (spec-index-query-where "table" [:= 1 :this.db_id])))
