(ns metabase.search.db
  "Application database queries for the search module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (connection and transaction handling still use `toucan2.core`)."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private SearchIndexMetadataRow
  "A whole (or partial) row for the `search_index_metadata` table."
  [:map {:closed true}
   [:id         {:optional true} :any]
   [:engine     {:optional true} :any]
   [:version    {:optional true} :any]
   [:index_name {:optional true} :any]
   [:status     {:optional true} :any]
   [:created_at {:optional true} :any]
   [:updated_at {:optional true} :any]
   [:lang_code  {:optional true} :any]])

(mu/defn spec-index-rows :- [:sequential :map]
  "The rows matching the Honey SQL `query` built from a search model's spec by `metabase.search.ingestion`."
  [query :- :map]
  (t2/query query))

(mu/defn spec-index-reducible-rows
  "A reducible of the rows matching the Honey SQL `query` built from a search model's spec by
  `metabase.search.ingestion`."
  [query :- :map]
  (mdb/streaming-reducible-query query))

(mu/defn in-place-model-set-rows :- [:sequential :map]
  "The rows matching the Honey SQL `query` built by `metabase.search.in-place.legacy` to find the distinct set of
  models with results."
  [query :- :map]
  (mdb/query query))

(mu/defn in-place-search-reducible
  "A reducible of the rows matching the full in-place search Honey SQL `query` built by
  `metabase.search.in-place.legacy`."
  [query :- :map]
  (mdb/streaming-reducible-query query))

(mu/defn scored-search-rows :- [:sequential :map]
  "The rows matching the scored, filtered search Honey SQL `query` built by `metabase.search.appdb.core`."
  [query :- :map]
  (t2/query query))

(mu/defn distinct-model-rows :- [:sequential :map]
  "The rows matching the Honey SQL `query` built by `metabase.search.appdb.core` to find the distinct search models
  present in the results."
  [query :- :map]
  (t2/query query))

(mu/defn search-index-probe-rows :- [:sequential :map]
  "The rows matching the Honey SQL `query` built by `metabase.search.appdb.core` to check whether a single row
  survives a filter."
  [query :- :map]
  (t2/query query))

(mu/defn search-index-rows :- [:sequential :map]
  "The rows matching the Honey SQL `query` built by `metabase.search.appdb.index/search-query`."
  [query :- :map]
  (t2/query query))

(mu/defn view-count-percentile-rows :- [:sequential :map]
  "The Model to view-count-percentile rows for the search index table `index-table` at percentile `p-value`."
  [index-table :- [:or :keyword :string]
   p-value     :- number?]
  (t2/query (specialization/view-count-percentile-query index-table p-value)))

(mu/defn drop-search-index-table-if-exists! :- :any
  "Drop the search index table named `table-name`, if it exists."
  [table-name :- [:or :keyword :string]]
  (t2/query (sql.helpers/drop-table :if-exists table-name)))

(mu/defn drop-search-index-table! :- :any
  "Drop the search index table named `table-name`."
  [table-name :- [:or :keyword :string]]
  (t2/query (sql.helpers/drop-table table-name)))

(mu/defn create-search-index-table! :- :any
  "Create the search index table named `table-name` with `columns` (the Honey SQL column definitions built by the
  active search engine specialization)."
  [table-name :- [:or :keyword :string]
   columns    :- :any]
  (t2/query (-> (sql.helpers/create-table table-name)
                (sql.helpers/with-columns columns))))

(mu/defn run-search-index-statement! :- :any
  "Run a single post-creation SQL statement (e.g. an index creation) for a search index table."
  [statement :- :any]
  (t2/query statement))

(mu/defn analyze-search-index-table! :- :any
  "Run `ANALYZE` on the search index table `table-name` (Postgres only)."
  [table-name :- [:or :keyword :string]]
  (t2/query (str "ANALYZE " (name table-name))))

(mu/defn postgres-batch-upsert! :- [:maybe [:sequential :int]]
  "Upsert `entries` into the search index `table`, on conflict of `(model, model_id)` overwriting every other column
  with the new value."
  [table   :- [:or :keyword :string]
   entries :- [:sequential :map]]
  (when (seq entries)
    (let [update-keys (vec (disj (set (mapcat keys entries)) :id :model :model_id))
          excluded-kw (fn [column] (keyword (str "excluded." (name column))))]
      (t2/query {:insert-into   table
                 :values        entries
                 :on-conflict   [:model :model_id]
                 :do-update-set (with-meta (zipmap update-keys (map excluded-kw update-keys))
                                           {:allow-subquery true})}))))

(mu/defn commit! :- :any
  "Commit the current transaction."
  []
  (t2/query ["commit"]))

(mu/defn user-exists? :- :boolean
  "Whether a User with `user-id` exists."
  [user-id :- ms/PositiveInt]
  (t2/exists? :model/User :id user-id))

(mu/defn entity-exists? :- :boolean
  "Whether a `model` row with `id` exists."
  [model :- :keyword
   id    :- ms/PositiveInt]
  (t2/exists? model :id id))

(mu/defn any-card :- [:maybe (ms/InstanceOf :model/Card)]
  "Some Card, or nil."
  []
  (t2/select-one :model/Card))

(mu/defn index-metadata-for-engine :- [:sequential (ms/InstanceOf :model/SearchIndexMetadata)]
  "The SearchIndexMetadata rows of `engine`."
  [engine :- :keyword]
  (t2/select :model/SearchIndexMetadata :engine engine))

(mu/defn index-row :- [:maybe :map]
  "The row of the search index `table` for `model` and `model-id`, or nil."
  [table    :- [:or :keyword :string]
   model    :- [:or :keyword :string]
   model-id :- [:or :string ms/PositiveInt]]
  (t2/select-one table :model model :model_id model-id))

(mu/defn delete-all-rows! :- :int
  "Delete every row of the search index `table`."
  [table :- [:or :keyword :string]]
  (t2/delete! table))

(mu/defn delete-index-rows! :- :int
  "Delete the rows of the search index `table` for `model` and `model-ids`."
  [table      :- [:or :keyword :string]
   model      :- [:or :keyword :string]
   model-ids  :- [:seqable [:or :string ms/PositiveInt]]]
  (t2/delete! table :model model :model_id [:in model-ids]))

(mu/defn insert-rows! :- :int
  "Insert `entries` into the search index `table`."
  [table   :- [:or :keyword :string]
   entries :- [:sequential :map]]
  (t2/insert! table entries))

(mu/defn index-entry-count :- ms/IntGreaterThanOrEqualToZero
  "The number of entries in the search index table `index-table`."
  [index-table :- [:or :keyword :string]]
  (t2/count index-table))

(mu/defn table-exists? :- :boolean
  "Whether a table named `table-name` exists in the app DB."
  [table-name :- :string]
  (t2/exists? :information_schema.tables :table_name table-name))

(mu/defn orphan-index-table-names :- [:sequential [:map {:closed true} [:table_name :string]]]
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

(mu/defn pg-class-estimate :- [:maybe [:map {:closed true} [:reltuples number?] [:relpages int?]]]
  "The planner's `:reltuples` and `:relpages` estimate for `table-name` (Postgres only), or nil."
  [table-name :- :string]
  (t2/query-one {:select [:reltuples :relpages]
                 :from   [:pg_class]
                 :where  [:= :oid [:to_regclass table-name]]}))

(mu/defn pg-text-search-configs :- [:sequential [:map {:closed true} [:cfgname :string]]]
  "The `:cfgname`s of the Postgres text search configurations."
  []
  (t2/query {:select [:cfgname]
             :from   [:pg_ts_config]}))

(mu/defn active-index-created-at :- [:maybe ms/TemporalInstant]
  "When the active `appdb` search index for `version` and `lang-code` was created, or nil."
  [version   :- :any
   lang-code :- :string]
  (t2/select-one-fn :created_at
                    :model/SearchIndexMetadata
                    :engine :appdb
                    :version version
                    :lang_code lang-code
                    :status :active
                    {:order-by [[:created_at :desc]]}))

(mu/defn insert-index-metadata! :- :int
  "Insert the SearchIndexMetadata `row`."
  [row :- SearchIndexMetadataRow]
  (t2/insert! :model/SearchIndexMetadata row))

(mu/defn delete-index-metadata-by-version! :- :int
  "Delete the SearchIndexMetadata rows of `version`."
  [version :- :any]
  (t2/delete! :model/SearchIndexMetadata :version version))

(mu/defn delete-index-metadata-by-name-on-conn! :- :int
  "Delete the SearchIndexMetadata rows named `index-name`, on `conn`."
  [conn       :- :any
   index-name :- :string]
  (t2/delete! :conn conn :model/SearchIndexMetadata :index_name index-name))

(mu/defn delete-index-metadata! :- :int
  "Delete the SearchIndexMetadata row of `engine`, `version`, `lang-code`, and `index-name`."
  [engine     :- :keyword
   version    :- :any
   lang-code  :- :string
   index-name :- :string]
  (t2/delete! :model/SearchIndexMetadata :engine engine :version version :lang_code lang-code :index_name index-name))

(mu/defn index-metadata :- [:sequential (ms/InstanceOf :model/SearchIndexMetadata)]
  "The name, status, and creation time of the active and pending SearchIndexMetadata rows of `engine`, `version`, and
  `lang-code`."
  [engine    :- :keyword
   version   :- :any
   lang-code :- :string]
  (t2/select [:model/SearchIndexMetadata :index_name :status :created_at]
             :engine engine
             :version version
             :lang_code lang-code
             :status [:in [:active :pending]]))

(mu/defn delete-expired-pending-index-metadata! :- :int
  "Delete the pending SearchIndexMetadata rows of `lang-code` created before `created-before`."
  [lang-code      :- :string
   created-before :- ms/TemporalInstant]
  (t2/delete! :model/SearchIndexMetadata
              {:where [:and
                       [:= :lang_code lang-code]
                       [:= :status "pending"]
                       [:< :created_at created-before]]}))

(mu/defn pending-index-metadata-exists? :- :boolean
  "Whether a pending SearchIndexMetadata row of `engine`, `version`, and `lang-code` exists."
  [engine    :- :keyword
   version   :- :any
   lang-code :- :string]
  (t2/exists? :model/SearchIndexMetadata :engine engine :version version :lang_code lang-code :status :pending))

(mu/defn delete-retired-index-metadata! :- :int
  "Delete the retired SearchIndexMetadata rows of `engine`, `version`, and `lang-code`."
  [engine    :- :keyword
   version   :- :any
   lang-code :- :string]
  (t2/delete! :model/SearchIndexMetadata :engine engine :version version :lang_code lang-code :status :retired))

(mu/defn retire-active-index-metadata! :- :int
  "Retire the active SearchIndexMetadata rows of `engine`, `version`, and `lang-code`."
  [engine    :- :keyword
   version   :- :any
   lang-code :- :string]
  (t2/update! :model/SearchIndexMetadata {:engine engine :version version :lang_code lang-code :status :active} {:status :retired}))

(mu/defn activate-pending-index-metadata! :- :int
  "Activate the pending SearchIndexMetadata rows of `engine`, `version`, and `lang-code`."
  [engine    :- :keyword
   version   :- :any
   lang-code :- :string]
  (t2/update! :model/SearchIndexMetadata {:engine engine :version version :lang_code lang-code :status :pending} {:status :active}))

(mu/defn active-index-name :- [:maybe :string]
  "The name of the active SearchIndexMetadata row of `engine`, `version`, and `lang-code`, or nil."
  [engine    :- :keyword
   version   :- :any
   lang-code :- :string]
  (t2/select-one-fn :index_name :model/SearchIndexMetadata :engine engine :version version :lang_code lang-code :status :active))

(mu/defn recent-index-versions :- [:sequential [:map {:closed true} [:version :any]]]
  "The `:version`s of the `limit` most recently updated SearchIndexMetadata versions."
  [limit :- ms/PositiveInt]
  (t2/query {:select   [:version]
             :from     [(t2/table-name :model/SearchIndexMetadata)]
             :group-by [:version]
             ;; use pk as a tie-breaker
             :order-by [[[:max :updated_at] :desc]
                        [[:max :id] :desc]]
             :limit    limit}))

(mu/defn delete-obsolete-index-metadata! :- :int
  "Delete the SearchIndexMetadata rows whose version is not in `recent-versions`, or not in `keep-versions` and last
  updated before `updated-before`."
  [recent-versions :- [:sequential :any]
   keep-versions   :- [:sequential :any]
   updated-before  :- ms/TemporalInstant]
  (t2/query-one {:delete-from [(t2/table-name :model/SearchIndexMetadata)]
                 :where       [:or
                               [:not-in :version recent-versions]
                               [:and
                                [:not-in :version keep-versions]
                                [:< :updated_at updated-before]]]}))

(mu/defn personal-collection-root-id :- [:maybe ms/PositiveInt]
  "The id of the root personal Collection of the User with `user-id`, or nil."
  [user-id :- ms/PositiveInt]
  (t2/select-one-pk :model/Collection :personal_owner_id [:= user-id] :location "/"))

(mu/defn non-destination-database-ids :- [:maybe [:set ms/PositiveInt]]
  "The ids of the Databases that are not routing destinations, or nil."
  []
  (t2/select-pks-set :model/Database :router_database_id nil))

(mu/defn user-common-names :- [:map-of ms/PositiveInt :string]
  "A map of User id to common name for the Users with `user-ids`."
  [user-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn :common_name [:model/User :id :first_name :last_name :email] :id [:in user-ids]))

(mu/defn card-result-metadata :- [:map-of ms/PositiveInt :any]
  "A map of Card id to result metadata for the Cards with `card-ids`."
  [card-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn :result_metadata [:model/Card :id :card_schema :result_metadata] :id [:in card-ids]))
