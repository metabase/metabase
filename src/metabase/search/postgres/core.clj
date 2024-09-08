(ns metabase.search.postgres.core
  (:require
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase.api.common :as api]
   [metabase.search.config :as search.config]
   [metabase.search.impl :as search.impl]
   [metabase.search.postgres.index :as search.index]
   [metabase.search.postgres.ingestion :as search.ingestion]
   [toucan2.core :as t2]))

(defn- user-params []
  (if api/*current-user-id*
    {:is-superuser?      api/*is-superuser?*
     :current-user-id    api/*current-user-id*
     :current-user-perms @api/*current-user-permissions-set*}
    {:is-superuser?      true
     ;; this does not matter, we won't use it.
     :current-user-id    1
     :current-user-perms #{"/"}}))

(defn- in-place-query [{:keys [models search-term archived?]}]
  (search.impl/full-search-query
   (merge
    (user-params)
    {:search-string      search-term
     :models             (or models
                             (if api/*current-user-id*
                               search.config/all-models
                               ;; For REPL convenience, skip these models as
                               ;; they require the user to be initialized.
                               (disj search.config/all-models "indexed-entity")))
     :archived?          archived?
     :model-ancestors?   true})))

(defn hybrid
  "Use the index for appling the search string, but rely on the legacy code path for rendering
  the display data, applying permissions, additional filtering, etc.

  NOTE: this is less efficient than legacy search even. We plan to replace it with something
  less feature complete, but much faster."
  [search-term & {:keys [double-filter?] :as opts}]
  (when-not @#'search.index/initialized?
    (throw (ex-info "Search index does not initialized. Use [[init!]] to ensure it exists."
                    {:search-engine :postgres})))
  (-> (sql.helpers/with [:index-query search.index/search-query]
                        [:source-query (in-place-query (cond-> opts
                                                         double-filter?
                                                         (assoc :search-term search-term)))])
      (sql.helpers/select :sq.*)
      (sql.helpers/from [:source-query :sq])
      (sql.helpers/join [:index-query :iq] [:and
                                            [:= :sq.model :iq.model]
                                            [:= :sq.id :iq.model_id]])
      (sql/format {:params {:search-term search-term} :quoted true})
      t2/query))

(defn hybrid-multi
  "Perform multiple legacy searches to see if its faster. Perverse!"
  [search-term & {:as opts}]
  (when-not @#'search.index/initialized?
    (throw (ex-info "Search index does not initialized. Use [[init!]] to ensure it exists."
                    {:search-engine :postgres})))
  (->> {:params {:search-term search-term} :quoted true}
       (sql/format search.index/search-query)
       t2/query
       (group-by :model)
       (mapcat (fn [[model results]]
                 (let [ids (map :model_id results)]
                   ;; Something is very wrong here, this also returns items with other ids.
                   (->> (assoc opts :models #{model} :ids ids)
                        in-place-query
                        t2/query
                        (filter (comp (set ids) :id))))))))

(defn init!
  "Ensure that the search index exists, and has been populated with all  entities."
  [& [force-reset?]]
  (when (or force-reset? (not (#'search.index/exists? @#'search.index/active-table)))
    (search.index/reset-index!))
  (search.ingestion/populate-index!))
