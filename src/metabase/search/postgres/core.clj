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
  (-> (sql.helpers/with [:index-query (search.index/search-query search-term)]
                        [:source-query (in-place-query search-ctx)])
      (sql.helpers/select :sq.*)
      (sql.helpers/from [:source-query :sq])
      (sql.helpers/join [:index-query :iq] [:and
                                            [:= :sq.model :iq.model]
                                            [:= :sq.id :iq.model_id]])
      (sql/format {:quoted true})
      t2/reducible-query))

(defn- hybrid-multi
  "Perform multiple legacy searches to see if its faster. Perverse!"
  [search-term & {:as search-ctx}]
  (when-not @#'search.index/initialized?
    (throw (ex-info "Search index is not initialized. Use [[init!]] to ensure it exists."
                    {:search-engine :postgres})))
  (->> (search.index/search-query search-term)
       t2/query
       (group-by :model)
       (mapcat (fn [[model results]]
                 (let [ids (map :model_id results)]
                   ;; Something is very wrong here, this also returns items with other ids.
                   (as-> search-ctx <>
                     (assoc <> :models #{model} :ids ids)
                     (dissoc <> :search-string)
                     (in-place-query <>)
                     (t2/query <>)
                     (filter (comp (set ids) :id) <>)))))))

(defn- parse-datetime [s]
  (when s
    (OffsetDateTime/parse s)))

(defn- minimal
  "Search via index, and return potentially stale information, without restricting to collections we have access to."
  [search-term & {:as search-ctx}]
  (when-not @#'search.index/initialized?
    (throw (ex-info "Search index is not initialized. Use [[init!]] to ensure it exists."
                    {:search-engine :postgres})))
  (->> (search.index/search-query search-term [:legacy_input])
       (search.filter/where-clause search-ctx)
       (t2/query)
       (map :legacy_input)
       (map #(json/parse-string % keyword))
       (map #(-> %
                 (update :created_at parse-datetime)
                 (update :updated_at parse-datetime)
                 (update :last_edited_at parse-datetime)))))

(defn- minimal-with-perms
  "Search via index, and return potentially stale information, but applying permissions. Does not perform ranking."
  [search-term & {:as search-ctx}]
  (when-not @#'search.index/initialized?
    (throw (ex-info "Search index is not initialized. Use [[init!]] to ensure it exists."
                    {:search-engine :postgres})))
  (->> (let [base-query (search.index/search-query search-term [:legacy_input])]
         (search.permissions/add-collection-join-and-where-clauses base-query nil search-ctx))
       (search.filter/where-clause search-ctx)
       (t2/query)
       (map :legacy_input)
       (map #(json/parse-string % keyword))
       (map #(-> %
                 (update :created_at parse-datetime)
                 (update :updated_at parse-datetime)
                 (update :last_edited_at parse-datetime)))))

(def ^:private default-engine hybrid-multi)

(defn- search-fn [search-engine]
  (case search-engine
    :search.engine/hybrid             hybrid
    :search.engine/hybrid-multi       hybrid-multi
    :search.engine/minimal            minimal
    :search.engine/minimal-with-perms minimal-with-perms
    :search.engine/fulltext           default-engine
    default-engine))

(defn search
  "Return a reducible-query corresponding to searching the entities via a tsvector."
  [search-ctx]
  (let [f (search-fn (:search-engine search-ctx))]
    (f (:search-string search-ctx)
       (dissoc search-ctx :search-string))))

(defn model-set
  "Return a set of the models which have at least one result for the given query.
  TODO: consider filters and permissions."
  [search-ctx]
  (set
   (filter
    ;; TODO use a single query
    (fn [m]
      (t2/exists? :search_index
                  (-> (search.index/search-query (:search-string search-ctx))
                      (sql.helpers/where [:= :model m]))))
    ;; regardless of :models in search-ctx, search across all of them.
    search.config/all-models)))

(defn no-scoring
  "Do no scoring, whatsoever"
  [result _scoring-ctx]
  {:score  1
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
