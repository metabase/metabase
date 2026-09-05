(ns metabase.search.db
  "Application database queries for the search module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (connection and transaction handling still use `toucan2.core`)."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.search.appdb.specialization.api :as specialization]
   [toucan2.core :as t2]))

(defn spec-index-rows
  "The rows matching the Honey SQL `query` built from a search model's spec by `metabase.search.ingestion`."
  [query]
  (t2/query query))

(defn scored-search-rows
  "The rows matching the scored, filtered search Honey SQL `query` built by `metabase.search.appdb.core`."
  [query]
  (t2/query query))

(defn distinct-model-rows
  "The rows matching the Honey SQL `query` built by `metabase.search.appdb.core` to find the distinct search models
  present in the results."
  [query]
  (t2/query query))

(defn search-index-probe-rows
  "The rows matching the Honey SQL `query` built by `metabase.search.appdb.core` to check whether a single row
  survives a filter."
  [query]
  (t2/query query))

(defn search-index-rows
  "The rows matching the Honey SQL `query` built by `metabase.search.appdb.index/search-query`."
  [query]
  (t2/query query))

(defn view-count-percentile-rows
  "The Model to view-count-percentile rows for the search index table `index-table` at percentile `p-value`."
  [index-table p-value]
  (t2/query (specialization/view-count-percentile-query index-table p-value)))

(defn drop-search-index-table-if-exists!
  "Drop the search index table named `table-name`, if it exists."
  [table-name]
  (t2/query (sql.helpers/drop-table :if-exists table-name)))

(defn drop-search-index-table!
  "Drop the search index table named `table-name`."
  [table-name]
  (t2/query (sql.helpers/drop-table table-name)))

(defn create-search-index-table!
  "Create the search index table named `table-name` with `columns` (the Honey SQL column definitions built by the
  active search engine specialization)."
  [table-name columns]
  (t2/query (-> (sql.helpers/create-table table-name)
                (sql.helpers/with-columns columns))))

(defn run-search-index-statement!
  "Run a single post-creation SQL statement (e.g. an index creation) for a search index table."
  [statement]
  (t2/query statement))

(defn analyze-search-index-table!
  "Run `ANALYZE` on the search index table `table-name` (Postgres only)."
  [table-name]
  (t2/query (str "ANALYZE " (name table-name))))

(defn postgres-batch-upsert!
  "Upsert `entries` into the search index `table`, on conflict of `(model, model_id)` overwriting every other column
  with the new value."
  [table entries]
  (when (seq entries)
    (let [update-keys (vec (disj (set (mapcat keys entries)) :id :model :model_id))
          excluded-kw (fn [column] (keyword (str "excluded." (name column))))]
      (t2/query {:insert-into   table
                 :values        entries
                 :on-conflict   [:model :model_id]
                 :do-update-set (with-meta (zipmap update-keys (map excluded-kw update-keys))
                                           {:allow-subquery true})}))))

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

(defn index-entry-count
  "The number of entries in the search index table `index-table`."
  [index-table]
  (t2/count index-table))

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

(defn card-result-metadata
  "A map of Card id to result metadata for the Cards with `card-ids`."
  [card-ids]
  (if (empty? card-ids)
    {}
    (t2/select-pk->fn :result_metadata [:model/Card :id :card_schema :result_metadata :type :database_id
                                        :dataset_query :dimensions :dimension_mappings]
                      :id [:in card-ids])))
