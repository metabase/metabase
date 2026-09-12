(ns metabase.search.db
  "Application database queries for the search module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (connection and transaction handling still use `toucan2.core`)."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.search.appdb.index-schema :as index-schema]
   [metabase.search.appdb.query :as appdb.query]
   [metabase.search.appdb.scoring :as search.scoring]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.config :as search.config]
   [metabase.search.in-place.legacy :as legacy]
   [metabase.search.ingestion.query :as ingestion.query]
   [metabase.search.schema :as search.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def sql-states
  "SQLSTATE codes returned by supported application databases."
  ;; `undefined_table` is PostgreSQL-specific; the rest are X/Open. H2 uses three missing-table states, corresponding
  ;; to `TABLE_OR_VIEW_NOT_FOUND_1`, `..._WITH_CANDIDATES_2`, and `..._DATABASE_EMPTY_1` in `org.h2.api.ErrorCode`.
  {:undefined-table                         "42P01"
   :table-or-view-not-found                 "42S02"
   :table-or-view-not-found-with-candidates "42S03"
   :table-or-view-not-found-database-empty  "42S04"
   :unique-violation                        "23505"
   :integrity-constraint-violation          "23000"})

(def error-codes
  "Vendor-specific error codes returned by supported application databases."
  ;; MySQL and MariaDB use one SQLSTATE for every integrity-constraint failure, so `ER_DUP_ENTRY` identifies duplicate
  ;; keys.
  {:mysql/duplicate-entry 1062})

(mu/defn spec-index-reducible-rows
  "A reducible of the indexable rows of `search-model` (see `metabase.search.ingestion.query/spec-index-query`)
  matching `where-clause`, or every row when it is nil.

  `where-clause` is the one Honey SQL argument left in this namespace. It is the search-spec generated `:where`
  fragment of `metabase.search.spec/search-models-to-update`, which is the payload of the ingestion queue itself:
  `metabase.search.util/impossible-condition?` drops entries by inspecting it, `metabase.search.ingestion` ORs the
  distinct clauses of a batch together and parses `[model id]` pairs back out of them to decide what to purge.
  Turning it into plain data means redesigning that queue, not restructuring a caller."
  [search-model :- :string
   where-clause :- [:maybe vector?]]
  (mdb/streaming-reducible-query (ingestion.query/spec-index-query-where search-model where-clause)))

(mu/defn spec-index-row
  "A probe row when the `search-model` row with the underlying model PK `id` is indexable, or nil."
  [search-model :- :string
   id           :- ms/PositiveInt]
  (t2/query-one (-> (ingestion.query/spec-index-query-where search-model [:= :this.id id])
                    (assoc :select [[[:inline 1] :one]] :limit 1))))

(mu/defn spec-index-count
  "The number of indexable rows of `search-model`."
  [search-model :- :string]
  (:count (t2/query-one (assoc (ingestion.query/spec-index-query search-model) :select [[:%count.* :count]]))))

(mu/defn in-place-model-set-rows
  "The `:model` rows of the in-place search engine's model-set query for `search-ctx`, or nil when no model applies."
  [search-ctx :- search.config/SearchContext]
  (some-> (legacy/model-set-query search-ctx) mdb/query))

(mu/defn in-place-search-reducible
  "A reducible of the in-place (index-free) search results for `search-ctx`."
  [search-ctx :- search.config/SearchContext]
  (mdb/streaming-reducible-query (legacy/full-search-query search-ctx)))

(mu/defn scored-search-rows
  "The scored, filtered rows of the search index `index-table` for `search-ctx` and `search-string`, best first.
  `view-count-percentiles` maps each model to its view-count percentile (see [[view-count-percentile-rows]])."
  [index-table            :- [:or :keyword :string]
   search-ctx             :- search.config/SearchContext
   search-string          :- [:maybe :string]
   view-count-percentiles :- [:map-of :keyword [:maybe number?]]]
  (t2/query (search.scoring/with-scores search-ctx
              (search.scoring/scorers search-ctx view-count-percentiles)
              (appdb.query/base-filtered-query index-table search-ctx search-string [:legacy_input]))))

(mu/defn distinct-model-rows
  "The distinct `:model` rows of the search index `index-table` with at least one visible result for `search-ctx`."
  [index-table :- [:or :keyword :string]
   search-ctx  :- search.config/SearchContext]
  (t2/query (appdb.query/model-set-query index-table search-ctx)))

(mu/defn search-index-probe-row
  "A probe row when the `model`/`id` row of the search index `index-table` survives the first `layer-count`
  `metabase.search.appdb.query/filter-layers` (nil = every layer) for `search-ctx` and `search-string`, or nil."
  [index-table   :- [:or :keyword :string]
   search-ctx    :- search.config/SearchContext
   search-string :- [:maybe :string]
   model         :- :string
   id            :- [:or :string ms/PositiveInt]
   layer-count   :- [:maybe nat-int?]]
  (t2/query-one (appdb.query/probe-query index-table search-ctx search-string model id layer-count)))

(defn- index-search-query
  "The Honey SQL query selecting `select-items` from the search index `table-name`, matching `search-term` (or every
  row, when blank/nil), honoring `search-native-query?` (see `metabase.search.appdb.specialization.postgres/base-query`
  and `.h2/base-query`)."
  [table-name search-term search-native-query? select-items]
  (specialization/base-query table-name search-term {:search-native-query search-native-query?} select-items))

(mu/defn search-index-rows
  "The `select-items` rows of the search index `table-name` matching `search-term`, honoring
  `search-native-query?`."
  [table-name           :- [:or :keyword :string]
   search-term          :- [:maybe :string]
   search-native-query? :- [:maybe :boolean]
   select-items         :- [:sequential :keyword]]
  (t2/query (index-search-query table-name search-term search-native-query? select-items)))

(mu/defn view-count-percentile-rows
  "The Model to view-count-percentile rows for the search index table `index-table` at percentile `p-value`."
  [index-table :- [:or :keyword :string]
   p-value     :- number?]
  (t2/query (specialization/view-count-percentile-query index-table p-value)))

(mu/defn drop-search-index-table-if-exists!
  "Drop the search index table named `table-name` on `conn`, if it exists."
  [conn       :- [:maybe (ms/InstanceOfClass java.sql.Connection)]
   table-name :- [:or :keyword :string]]
  (t2/query conn {:drop-table [:if-exists table-name]}))

;; `IF EXISTS` cannot reliably report whether it dropped a table: PostgreSQL emits only a JDBC warning, which Toucan
;; does not expose, and H2 emits nothing. Let an absent table throw so callers can detect races.
(mu/defn drop-search-index-table!
  "Drop the search index table named `table-name` on `conn`, throwing if it is already gone."
  [conn       :- [:maybe (ms/InstanceOfClass java.sql.Connection)]
   table-name :- [:or :keyword :string]]
  (t2/query conn {:drop-table table-name}))

(mu/defn create-search-index-table!
  "Create the search index table named `table-name` on `conn`: the columns of
  `metabase.search.appdb.index-schema/base-schema` as shaped by the active search engine specialization,
  then that specialization's post-creation statements (index creation and the like)."
  [conn       :- [:maybe (ms/InstanceOfClass java.sql.Connection)]
   table-name :- [:or :keyword :string]]
  (t2/query conn (-> (sql.helpers/create-table table-name)
                     (sql.helpers/with-columns (specialization/table-schema index-schema/base-schema))))
  (let [table-name (name table-name)]
    (doseq [statement (specialization/post-create-statements table-name table-name)]
      (t2/query conn statement))))

(mu/defn analyze-search-index-table!
  "Run `ANALYZE` on the search index table `table-name` (Postgres only)."
  [table-name :- [:or :keyword :string]]
  (t2/query (str "ANALYZE " (name table-name))))

(defn- postgres-batch-upsert-query
  [table entries]
  ;; The entries are not guaranteed to be homogeneous -- some may be missing nullable columns -- so
  ;; the updated columns come from the keys of *all* of them.
  (let [update-keys (vec (disj (set (mapcat keys entries)) :id :model :model_id))
        excluded-kw (fn [column] (keyword (str "excluded." (name column))))]
    {:insert-into   table
     :values        entries
     :on-conflict   [:model :model_id]
     :do-update-set (with-meta (zipmap update-keys (map excluded-kw update-keys))
                               {:allow-subquery true})}))

(mu/defn postgres-batch-upsert!
  "Upsert `entries` into the search index `table` on `conn`, overwriting every other column on a
  `(model, model_id)` conflict."
  [conn    :- [:maybe (ms/InstanceOfClass java.sql.Connection)]
   table   :- [:or :keyword :string]
   entries :- [:sequential :map]]
  (when (seq entries)
    (t2/query conn (postgres-batch-upsert-query table entries))))

(mu/defn user-exists?
  "Whether a User with `user-id` exists."
  [user-id :- ::lib.schema.id/user]
  (t2/exists? :model/User :id user-id))

(mu/defn entity-exists?
  "Whether a `model` row with `id` exists."
  [model :- :keyword
   id    :- ms/PositiveInt]
  (t2/exists? model :id id))

(mu/defn index-metadata-for-engine
  "The SearchIndexMetadata rows of `engine`."
  [engine :- :keyword]
  (t2/select :model/SearchIndexMetadata :engine engine))

(mu/defn index-row
  "The row of the search index `table` for `model` and `model-id`, or nil."
  [table    :- [:or :keyword :string]
   model    :- [:or :keyword :string]
   model-id :- [:or :string ms/PositiveInt]]
  (t2/select-one table :model model :model_id model-id))

(mu/defn delete-all-rows!
  "Delete every row of the search index `table`, on `conn`."
  [conn  :- [:maybe (ms/InstanceOfClass java.sql.Connection)]
   table :- [:or :keyword :string]]
  (t2/delete! :conn conn table))

(mu/defn delete-index-rows!
  "Delete the rows of the search index `table` for `model` and `model-ids`, on `conn` when given."
  ([table     :- [:or :keyword :string]
    model     :- [:or :keyword :string]
    model-ids :- [:or [:set [:or :string ms/PositiveInt]] [:sequential [:or :string ms/PositiveInt]]]]
   (delete-index-rows! nil table model model-ids))
  ([conn      :- [:maybe (ms/InstanceOfClass java.sql.Connection)]
    table     :- [:or :keyword :string]
    model     :- [:or :keyword :string]
    model-ids :- [:or [:set [:or :string ms/PositiveInt]] [:sequential [:or :string ms/PositiveInt]]]]
   (t2/delete! :conn conn table :model model :model_id [:in model-ids])))

(mu/defn insert-rows!
  "Insert `entries` into the search index `table`, on `conn`."
  [conn    :- [:maybe (ms/InstanceOfClass java.sql.Connection)]
   table   :- [:or :keyword :string]
   entries :- [:sequential :map]]
  (t2/insert! :conn conn table entries))

(mu/defn index-entry-count
  "The number of entries in the search index table `index-table`."
  [index-table :- [:or :keyword :string]]
  (t2/count index-table))

(mu/defn table-exists?
  "Whether a table named `table-name` exists in the app DB, read on `conn`."
  [conn       :- [:maybe (ms/InstanceOfClass java.sql.Connection)]
   table-name :- :string]
  (t2/exists? :conn conn :information_schema.tables :table_name table-name))

(mu/defn orphan-index-table-names
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

(mu/defn pg-class-estimate
  "The planner's `:reltuples` and `:relpages` estimate for `table-name` (Postgres only), or nil."
  [table-name :- :string]
  (t2/query-one {:select [:reltuples :relpages]
                 :from   [:pg_class]
                 :where  [:= :oid [:to_regclass table-name]]}))

(mu/defn pg-text-search-configs
  "The `:cfgname`s of the Postgres text search configurations."
  []
  (t2/query {:select [:cfgname]
             :from   [:pg_ts_config]}))

(mu/defn active-index-created-at
  "When the active `appdb` search index for `version` and `lang-code` was created, or nil."
  [version   :- :string
   lang-code :- :string]
  (t2/select-one-fn :created_at
                    :model/SearchIndexMetadata
                    :engine :appdb
                    :version version
                    :lang_code lang-code
                    :status :active
                    {:order-by [[:created_at :desc]]}))

(mu/defn insert-index-metadata!
  "Insert the SearchIndexMetadata `row`, on `conn` when given."
  ([row  :- ::search.schema/search-index-metadata.update]
   (insert-index-metadata! nil row))
  ([conn :- [:maybe (ms/InstanceOfClass java.sql.Connection)]
    row  :- ::search.schema/search-index-metadata.update]
   (t2/insert! :conn conn :model/SearchIndexMetadata row)))

(mu/defn delete-index-metadata-by-version!
  "Delete the SearchIndexMetadata rows of `version`."
  [version :- :string]
  (t2/delete! :model/SearchIndexMetadata :version version))

(mu/defn delete-index-metadata-by-name!
  "Delete the SearchIndexMetadata rows named `index-name` using `conn`."
  [conn       :- (ms/InstanceOfClass java.sql.Connection)
   index-name :- :string]
  (t2/delete! :conn conn :model/SearchIndexMetadata :index_name index-name))

(mu/defn delete-pending-index-metadata!
  "Delete the pending SearchIndexMetadata row of `engine`, `version`, and `lang-code`, on `conn`."
  [conn      :- [:maybe (ms/InstanceOfClass java.sql.Connection)]
   engine    :- :keyword
   version   :- :string
   lang-code :- :string]
  (t2/delete! :conn conn :model/SearchIndexMetadata
              :engine engine :version version :lang_code lang-code :status :pending))

(mu/defn delete-named-pending-index-metadata!
  "Delete the pending SearchIndexMetadata row of `engine`, `version`, `lang-code`, and `index-name`, on
  `conn`."
  [conn       :- [:maybe (ms/InstanceOfClass java.sql.Connection)]
   engine     :- :keyword
   version    :- :string
   lang-code  :- :string
   index-name :- :string]
  (t2/delete! :conn conn :model/SearchIndexMetadata
              :engine engine :version version :lang_code lang-code :index_name index-name :status :pending))

(mu/defn index-metadata
  "The name, status, and creation time of the active and pending SearchIndexMetadata rows of `engine`,
  `version`, and `lang-code`, read on `conn`."
  [conn      :- [:maybe (ms/InstanceOfClass java.sql.Connection)]
   engine    :- :keyword
   version   :- :string
   lang-code :- :string]
  (t2/select :conn conn [:model/SearchIndexMetadata :index_name :status :created_at]
             :engine engine
             :version version
             :lang_code lang-code
             :status [:in [:active :pending]]))

(mu/defn delete-expired-pending-index-metadata!
  "Delete the pending SearchIndexMetadata rows of `lang-code` created before `created-before`, on `conn`."
  [conn           :- [:maybe (ms/InstanceOfClass java.sql.Connection)]
   lang-code      :- :string
   created-before :- ms/TemporalInstant]
  (t2/delete! :conn conn :model/SearchIndexMetadata
              {:where [:and
                       [:= :lang_code lang-code]
                       [:= :status "pending"]
                       [:< :created_at created-before]]}))

(mu/defn pending-index-metadata-exists?
  "Whether the pending SearchIndexMetadata row of `engine`, `version`, and `lang-code` exists, read on
  `conn`."
  [conn      :- [:maybe (ms/InstanceOfClass java.sql.Connection)]
   engine    :- :keyword
   version   :- :string
   lang-code :- :string]
  (t2/exists? :conn conn :model/SearchIndexMetadata
              :engine engine :version version :lang_code lang-code :status :pending))

(mu/defn named-pending-index-metadata-exists?
  "Whether the pending SearchIndexMetadata row of `engine`, `version`, `lang-code`, and `index-name`
  exists, read on `conn`."
  [conn       :- [:maybe (ms/InstanceOfClass java.sql.Connection)]
   engine     :- :keyword
   version    :- :string
   lang-code  :- :string
   index-name :- :string]
  (t2/exists? :conn conn :model/SearchIndexMetadata
              :engine engine :version version :lang_code lang-code :index_name index-name :status :pending))

(mu/defn delete-retired-index-metadata!
  "Delete the retired SearchIndexMetadata rows of `engine`, `version`, and `lang-code`, on `conn`."
  [conn      :- [:maybe (ms/InstanceOfClass java.sql.Connection)]
   engine    :- :keyword
   version   :- :string
   lang-code :- :string]
  (t2/delete! :conn conn :model/SearchIndexMetadata
              :engine engine :version version :lang_code lang-code :status :retired))

(mu/defn retire-active-index-metadata!
  "Retire the active SearchIndexMetadata rows of `engine`, `version`, and `lang-code`, on `conn`."
  [conn      :- [:maybe (ms/InstanceOfClass java.sql.Connection)]
   engine    :- :keyword
   version   :- :string
   lang-code :- :string]
  (t2/update! :conn conn :model/SearchIndexMetadata
              {:engine engine :version version :lang_code lang-code :status :active}
              {:status :retired}))

(mu/defn activate-pending-index-metadata!
  "Activate the pending SearchIndexMetadata row of `engine`, `version`, and `lang-code`, on `conn`.
  The caller must have cleared the retired row and retired the active one first."
  [conn      :- [:maybe (ms/InstanceOfClass java.sql.Connection)]
   engine    :- :keyword
   version   :- :string
   lang-code :- :string]
  ;; `idx_search_index_metadata_unique_status` is unique on `(engine, version, lang_code, status)`, so there is at
  ;; most one pending row to promote -- and retiring before clearing would collide with the row already retired.
  (t2/update! :conn conn :model/SearchIndexMetadata
              {:engine engine, :version version, :lang_code lang-code, :status :pending}
              {:status :active}))

(mu/defn activate-named-pending-index-metadata!
  "Activate the pending SearchIndexMetadata row of `engine`, `version`, `lang-code`, and `index-name`, on
  `conn`."
  [conn       :- [:maybe (ms/InstanceOfClass java.sql.Connection)]
   engine     :- :keyword
   version    :- :string
   lang-code  :- :string
   index-name :- :string]
  (t2/update! :conn conn :model/SearchIndexMetadata
              {:engine engine, :version version, :lang_code lang-code, :index_name index-name, :status :pending}
              {:status :active}))

(mu/defn active-index-name
  "The name of the active SearchIndexMetadata row of `engine`, `version`, and `lang-code` on `conn`, or nil."
  [conn      :- [:maybe (ms/InstanceOfClass java.sql.Connection)]
   engine    :- :keyword
   version   :- :string
   lang-code :- :string]
  (t2/select-one-fn :index_name :conn conn :model/SearchIndexMetadata
                    :engine engine :version version :lang_code lang-code :status :active))

(defn- recent-index-versions-query [limit]
  {:select   [:version]
   :from     [(t2/table-name :model/SearchIndexMetadata)]
   :group-by [:version]
   ;; use pk as a tie-breaker
   :order-by [[[:max :updated_at] :desc]
              [[:max :id] :desc]]
   :limit    limit})

(mu/defn recent-index-versions
  "The `:version`s of the `limit` most recently updated SearchIndexMetadata versions, read on `conn`."
  [conn  :- [:maybe (ms/InstanceOfClass java.sql.Connection)]
   limit :- ms/PositiveInt]
  (t2/query conn (recent-index-versions-query limit)))

(defn- obsolete-index-metadata-query [recent-versions keep-versions updated-before]
  {:delete-from [(t2/table-name :model/SearchIndexMetadata)]
   :where       [:or
                 [:not-in :version recent-versions]
                 [:and
                  [:not-in :version keep-versions]
                  [:< :updated_at updated-before]]]})

(mu/defn delete-obsolete-index-metadata!
  "Delete the SearchIndexMetadata rows whose version is not in `recent-versions`, or not in `keep-versions` and last
  updated before `updated-before`, on `conn`."
  [conn            :- [:maybe (ms/InstanceOfClass java.sql.Connection)]
   recent-versions :- [:sequential :string]
   keep-versions   :- [:sequential :string]
   updated-before  :- ms/TemporalInstant]
  (t2/query-one conn (obsolete-index-metadata-query recent-versions keep-versions updated-before)))

(mu/defn lease-times
  "The app database's current time, and the lease expiry `duration-millis` later, read on `conn` without
  converting JDBC time types."
  [conn            :- (ms/InstanceOfClass java.sql.Connection)
   duration-millis :- :int]
  (t2/query-one conn
                (case (mdb/db-type)
                  :postgres ["SELECT CURRENT_TIMESTAMP AS now, CURRENT_TIMESTAMP + (? * INTERVAL '1 millisecond') AS expires_at"
                             duration-millis]
                  :mysql    ["SELECT CURRENT_TIMESTAMP AS now, TIMESTAMPADD(MICROSECOND, ?, CURRENT_TIMESTAMP) AS expires_at"
                             (* duration-millis 1000)]
                  :h2       ["SELECT CURRENT_TIMESTAMP AS now, DATEADD('MILLISECOND', ?, CURRENT_TIMESTAMP) AS expires_at"
                             duration-millis])))

(mu/defn insert-lease!
  "Insert the search index lease `row` on `conn`."
  [conn :- (ms/InstanceOfClass java.sql.Connection)
   row  :- :map]
  (t2/insert! :conn conn :search_index_lease row))

(mu/defn take-over-expired-lease!
  "Take over the lease at `coordinate` on `conn`, if it expired at or before `now`, by writing `claim`.
  Returns the number of rows updated."
  [conn       :- (ms/InstanceOfClass java.sql.Connection)
   coordinate :- :map
   now        :- :any
   claim      :- :map]
  (t2/update! :conn conn :search_index_lease (assoc coordinate :expires_at [:<= now]) claim))

(def ^:private db-now-expr
  ^:allow-raw-sql [:raw "CURRENT_TIMESTAMP"])

(defn- db-expiry-expr
  "Honey SQL expression for the lease expiry `duration-millis` after the app database's current time."
  [duration-millis]
  ^:allow-raw-sql
  [:raw (case (mdb/db-type)
          :postgres (format "CURRENT_TIMESTAMP + (%d * INTERVAL '1 millisecond')" duration-millis)
          :mysql    (format "TIMESTAMPADD(MICROSECOND, %d, CURRENT_TIMESTAMP)" (* duration-millis 1000))
          :h2       (format "DATEADD('MILLISECOND', %d, CURRENT_TIMESTAMP)" duration-millis))])

(mu/defn renew-lease!
  "Extend the unexpired lease at `coordinate` held by `owner` by `duration-millis`, on `conn`.
  Returns the number of rows updated."
  [conn            :- (ms/InstanceOfClass java.sql.Connection)
   coordinate      :- :map
   owner           :- :string
   duration-millis :- :int]
  ;; One statement, so a per-batch fence costs a single round trip.
  (t2/update! :conn conn :search_index_lease
              (assoc coordinate :owner owner :expires_at [:> db-now-expr])
              {:last_renewed_at db-now-expr, :expires_at (db-expiry-expr duration-millis)}))

(mu/defn delete-lease!
  "Delete the lease of `engine`, `version`, and `lang-code` on `conn`, if `owner` still holds it.
  Returns the number of rows deleted."
  [conn      :- (ms/InstanceOfClass java.sql.Connection)
   engine    :- [:maybe :string]
   version   :- [:maybe :string]
   lang-code :- [:maybe :string]
   owner     :- [:maybe :string]]
  (t2/delete! :conn conn :search_index_lease
              :engine engine :version version :lang_code lang-code :owner owner))

(mu/defn non-destination-database-ids
  "The ids of the Databases that are not routing destinations, or nil."
  []
  (t2/select-pks-set :model/Database :router_database_id nil))

(mu/defn user-common-names
  "A map of User id to common name for the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-pk->fn :common_name [:model/User :id :first_name :last_name :email] :id [:in user-ids]))

(mu/defn card-result-metadata
  "A map of Card id to result metadata for the Cards with `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (t2/select-pk->fn :result_metadata [:model/Card :id :card_schema :result_metadata] :id [:in card-ids]))
