(ns metabase.search.db
  "Application database queries for the search module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (connection and transaction handling still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn rows
  "The rows returned by the Honey SQL or raw SQL `query`."
  [query]
  (t2/query query))

(defn execute!
  "Run the Honey SQL or raw SQL `statement`."
  [statement]
  (t2/query statement))

(defn commit!
  "Commit the current transaction."
  []
  (t2/query ["commit"]))

(defn user-exists?
  "Whether a User with `user-id` exists."
  [user-id]
  (t2/exists? :model/User :id user-id))

(defn entity-exists?
  "Whether a `model` row with `id` exists."
  [model id]
  (t2/exists? model :id id))

(defn any-card
  "Some Card, or nil."
  []
  (t2/select-one :model/Card))

(defn index-metadata-for-engine
  "The SearchIndexMetadata rows of `engine`."
  [engine]
  (t2/select :model/SearchIndexMetadata :engine engine))

(defn index-row
  "The row of the search index `table` for `model` and `model-id`, or nil."
  [table model model-id]
  (t2/select-one table :model model :model_id model-id))

(defn delete-all-rows!
  "Delete every row of the search index `table`."
  [table]
  (t2/delete! table))

(defn delete-index-rows!
  "Delete the rows of the search index `table` for `model` and `model-ids`."
  [table model model-ids]
  (t2/delete! table :model model :model_id [:in model-ids]))

(defn insert-rows!
  "Insert `entries` into the search index `table`."
  [table entries]
  (t2/insert! table entries))

(defn row-count
  "The number of rows in `table`."
  [table]
  (t2/count table))

(defn table-exists?
  "Whether a table named `table-name` exists in the app DB."
  [table-name]
  (t2/exists? :information_schema.tables :table_name table-name))

(defn orphan-index-table-names
  "The `:table_name`s of search index tables in the current schema with no SearchIndexMetadata."
  []
  (t2/query {:select [:ist.table_name]
             :from   [[:information_schema.tables :ist]]
             :where  [:and
                      [:= :ist.table_schema :%current_schema]
                      [:or
                       [:like [:lower :ist.table_name] "search\\_index\\_\\_%"]
                       ;; legacy table names
                       [:in [:lower :ist.table_name]
                        ["search_index" "search_index_next" "search_index_retired"]]]
                      ;; Exclude temp tables — they are managed by with-temp-index-table
                      [:not-like [:lower :ist.table_name] "%\\_temp"]
                      [:not [:exists ^:allow-subquery {:select [1]
                                                       :from   [[(t2/table-name :model/SearchIndexMetadata) :sim]]
                                                       :where  [:and
                                                                [:= :sim.engine "appdb"]
                                                                [:= [:lower :sim.index_name] [:lower :ist.table_name]]]}]]]}))

(defn pg-class-estimate
  "The planner's `:reltuples` and `:relpages` estimate for `table-name` (Postgres only), or nil."
  [table-name]
  (t2/query-one {:select [:reltuples :relpages]
                 :from   [:pg_class]
                 :where  [:= :oid [:to_regclass table-name]]}))

(defn pg-text-search-configs
  "The `:cfgname`s of the Postgres text search configurations."
  []
  (t2/query {:select [:cfgname]
             :from   [:pg_ts_config]}))

(defn active-index-created-at
  "When the active `appdb` search index for `version` and `lang-code` was created, or nil."
  [version lang-code]
  (t2/select-one-fn :created_at
                    :model/SearchIndexMetadata
                    :engine :appdb
                    :version version
                    :lang_code lang-code
                    :status :active
                    {:order-by [[:created_at :desc]]}))

(defn insert-index-metadata!
  "Insert the SearchIndexMetadata `row`."
  [row]
  (t2/insert! :model/SearchIndexMetadata row))

(defn delete-index-metadata-by-version!
  "Delete the SearchIndexMetadata rows of `version`."
  [version]
  (t2/delete! :model/SearchIndexMetadata :version version))

(defn delete-index-metadata-by-name-on-conn!
  "Delete the SearchIndexMetadata rows named `index-name`, on `conn`."
  [conn index-name]
  (t2/delete! :conn conn :model/SearchIndexMetadata :index_name index-name))

(defn delete-index-metadata!
  "Delete the SearchIndexMetadata row of `engine`, `version`, `lang-code`, and `index-name`."
  [engine version lang-code index-name]
  (t2/delete! :model/SearchIndexMetadata :engine engine :version version :lang_code lang-code :index_name index-name))

(defn index-metadata
  "The name, status, and creation time of the active and pending SearchIndexMetadata rows of `engine`, `version`, and
  `lang-code`."
  [engine version lang-code]
  (t2/select [:model/SearchIndexMetadata :index_name :status :created_at]
             :engine engine
             :version version
             :lang_code lang-code
             :status [:in [:active :pending]]))

(defn delete-expired-pending-index-metadata!
  "Delete the pending SearchIndexMetadata rows of `lang-code` created before `created-before`."
  [lang-code created-before]
  (t2/delete! :model/SearchIndexMetadata
              {:where [:and
                       [:= :lang_code lang-code]
                       [:= :status "pending"]
                       [:< :created_at created-before]]}))

(defn pending-index-metadata-exists?
  "Whether a pending SearchIndexMetadata row of `engine`, `version`, and `lang-code` exists."
  [engine version lang-code]
  (t2/exists? :model/SearchIndexMetadata :engine engine :version version :lang_code lang-code :status :pending))

(defn delete-retired-index-metadata!
  "Delete the retired SearchIndexMetadata rows of `engine`, `version`, and `lang-code`."
  [engine version lang-code]
  (t2/delete! :model/SearchIndexMetadata :engine engine :version version :lang_code lang-code :status :retired))

(defn retire-active-index-metadata!
  "Retire the active SearchIndexMetadata rows of `engine`, `version`, and `lang-code`."
  [engine version lang-code]
  (t2/update! :model/SearchIndexMetadata {:engine engine :version version :lang_code lang-code :status :active} {:status :retired}))

(defn activate-pending-index-metadata!
  "Activate the pending SearchIndexMetadata rows of `engine`, `version`, and `lang-code`."
  [engine version lang-code]
  (t2/update! :model/SearchIndexMetadata {:engine engine :version version :lang_code lang-code :status :pending} {:status :active}))

(defn active-index-name
  "The name of the active SearchIndexMetadata row of `engine`, `version`, and `lang-code`, or nil."
  [engine version lang-code]
  (t2/select-one-fn :index_name :model/SearchIndexMetadata :engine engine :version version :lang_code lang-code :status :active))

(defn recent-index-versions
  "The `:version`s of the `limit` most recently updated SearchIndexMetadata versions."
  [limit]
  (t2/query {:select   [:version]
             :from     [(t2/table-name :model/SearchIndexMetadata)]
             :group-by [:version]
             ;; use pk as a tie-breaker
             :order-by [[[:max :updated_at] :desc]
                        [[:max :id] :desc]]
             :limit    limit}))

(defn delete-obsolete-index-metadata!
  "Delete the SearchIndexMetadata rows whose version is not in `recent-versions`, or not in `keep-versions` and last
  updated before `updated-before`."
  [recent-versions keep-versions updated-before]
  (t2/query-one {:delete-from [(t2/table-name :model/SearchIndexMetadata)]
                 :where       [:or
                               [:not-in :version recent-versions]
                               [:and
                                [:not-in :version keep-versions]
                                [:< :updated_at updated-before]]]}))

(defn personal-collection-root-id
  "The id of the root personal Collection of the User with `user-id`, or nil."
  [user-id]
  (t2/select-one-pk :model/Collection :personal_owner_id [:= user-id] :location "/"))

(defn non-destination-database-ids
  "The ids of the Databases that are not routing destinations, or nil."
  []
  (t2/select-pks-set :model/Database :router_database_id nil))

(defn user-common-names
  "A map of User id to common name for the Users with `user-ids`."
  [user-ids]
  (t2/select-pk->fn :common_name [:model/User :id :first_name :last_name :email] :id [:in user-ids]))

(defn hydrate-effective-ancestors
  "Hydrate `:effective_ancestors` onto `collection`."
  [collection]
  (t2/hydrate collection :effective_ancestors))

(defn hydrate-effective-parent
  "Hydrate `:effective_parent` onto `collections`."
  [collections]
  (t2/hydrate collections :effective_parent))

(defn hydrate-dashboard-with-moderation-status
  "Hydrate `:dashboard` with its `:moderation_status` onto `results`."
  [results]
  (t2/hydrate results [:dashboard :moderation_status]))

(defn card-result-metadata
  "A map of Card id to result metadata for the Cards with `card-ids`."
  [card-ids]
  (t2/select-pk->fn :result_metadata [:model/Card :id :card_schema :result_metadata] :id [:in card-ids]))
