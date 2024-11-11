(ns metabase.search.postgres.core
  (:require
   [cheshire.core :as json]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase.api.common :as api]
   [metabase.search.config :as search.config]
   [metabase.search.filter :as search.filter]
   [metabase.search.legacy :as search.legacy]
   [metabase.search.permissions :as search.permissions]
   [metabase.search.postgres.index :as search.index]
   [metabase.search.postgres.ingestion :as search.ingestion]
   [metabase.search.postgres.scoring :as search.scoring]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)))

(set! *warn-on-reflection* true)

(defn- user-params [search-ctx]
  (cond
    (:current-user-id search-ctx)
    (select-keys search-ctx [:is-superuser? :current-user-id :current-user-perms])

    api/*current-user-id*
    {:is-superuser?      api/*is-superuser?*
     :current-user-id    api/*current-user-id*
     :current-user-perms @api/*current-user-permissions-set*}

    :else
    {:is-superuser?      true
     ;; this does not matter, we won't use it.
     :current-user-id    1
     :current-user-perms #{"/"}}))

(defn- in-place-query [{:keys [models search-term archived?] :as search-ctx}]
  (search.legacy/full-search-query
   (merge
    (user-params search-ctx)
    {:search-string    search-term
     :models           (or models
                           (if api/*current-user-id*
                             search.config/all-models
                             ;; For REPL convenience, skip these models as
                             ;; they require the user to be initialized.
                             (disj search.config/all-models "indexed-entity")))
     :archived?        archived?
     :model-ancestors? true})))

(defn- hybrid
  "Use the index for using the search string, but rely on the legacy code path for rendering
  the display data, applying permissions, additional filtering, etc.

  NOTE: this is less efficient than legacy search even. We plan to replace it with something
  less feature complete but much faster."
  [search-term & {:as search-ctx}]
  (when-not @#'search.index/initialized?
    (throw (ex-info "Search index is not initialized. Use [[init!]] to ensure it exists."
                    {:search-engine :postgres})))
  (-> (sql.helpers/with [:index-query (search.index/search-query search-term search-ctx)]
                        [:source-query (in-place-query search-ctx)])
      (sql.helpers/select :sq.*)
      (sql.helpers/from [:source-query :sq])
      (sql.helpers/join [:index-query :iq] [:and
                                            [:= :sq.model :iq.model]
                                            [:= :sq.id :iq.model_id]])
      (sql/format {:quoted true})
      t2/reducible-query))

(defn- parse-datetime [s]
  (when s
    (OffsetDateTime/parse s)))

(defn- rehydrate [index-row]
  ;; Useful for debugging scoring
  #_ (dissoc index-row :legacy_input :created_at :updated_at :last_edited_at)
  (-> (merge
       (json/parse-string (:legacy_input index-row) keyword)
       (select-keys index-row [:total_score :pinned]))
      (update :created_at parse-datetime)
      (update :updated_at parse-datetime)
      (update :last_edited_at parse-datetime)))

(defn- fulltext
  "Search purely using the index."
  [search-term & {:as search-ctx}]
  (when-not @#'search.index/initialized?
    (throw (ex-info "Search index is not initialized. Use [[init!]] to ensure it exists."
                    {:search-engine :postgres})))
  (->> (let [base-query (search.index/search-query search-term search-ctx [:legacy_input])]
         (search.permissions/add-collection-join-and-where-clauses base-query "search-index" search-ctx))
       (search.scoring/with-scores search-ctx)
       (search.filter/with-filters search-ctx)
       (t2/query)
       (map rehydrate)))

(def ^:private default-engine fulltext)

(defn- search-fn [search-engine]
  (case search-engine
    :search.engine/hybrid             hybrid
    :search.engine/fulltext           fulltext
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
    (->> (-> (search.index/search-query (:search-string search-ctx) search-ctx [[[:distinct :model] :model]])
             (search.permissions/add-collection-join-and-where-clauses "search-index" search-ctx))
         (search.filter/with-filters search-ctx)
         t2/query
         (into #{} (map :model)))))

(defn no-scoring
  "Do no scoring, whatsoever"
  [result _scoring-ctx]
  {:score  (:total_score result 1)
   :result (assoc result :all-scores [] :relevant-scores [])})

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
  (search.ingestion/populate-index!)
  (search.index/activate-pending!))

(comment
  (init! true)
  (t2/select-fn-vec :legacy_input :search_index))
