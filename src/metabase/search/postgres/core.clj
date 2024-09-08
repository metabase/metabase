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

(defn hybrid
  "Use the index for appling the search string, but rely on the legacy code path for rendering
  the display data, applying permissions, additional filtering, etc.

  NOTE: this is less efficient than legacy search even. We plan to replace it with something
  less feature complete, but much faster."
  [search-term & {:keys [models double-filter? archived?]}]
  (when-not @#'search.index/initialized?
    (throw (ex-info "Search index does not initialized. Use [[init!]] to ensure it exists."
                    {:search-engine :postgres})))
  (-> (sql.helpers/with [:index-query search.index/search-query]
                        [:source-query
                         (search.impl/full-search-query
                          (merge
                           (user-params)
                           {:search-string      (when double-filter?
                                                  search-term)
                            :models             (or models
                                                    (if api/*current-user-id*
                                                      search.config/all-models
                                                      ;; For REPL convenience, skip these models as
                                                      ;; they require the user to be initialized.
                                                      (disj search.config/all-models "indexed-entities")))
                            :archived?          archived?
                            :model-ancestors?   true}))])
      (sql.helpers/select :sq.*)
      (sql.helpers/from [:source-query :sq])
      (sql.helpers/join [:index-query :iq] [:and
                                            [:= :sq.model :iq.model]
                                            [:= :sq.id :iq.model_id]])
      (sql/format {:params {:search-term search-term} :quoted true})
      t2/query))

(defn init!
  "Ensure that the search index exists, and has been populated with all  entities."
  [& [force-reset?]]
  (when (or force-reset? (not (#'search.index/exists? @#'search.index/active-table)))
    (search.index/reset-index!))
  (search.ingestion/populate-index!))
