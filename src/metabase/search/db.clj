(ns metabase.search.db
  "Application database queries for the search module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (connection and transaction handling still use `toucan2.core`)."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.card-schema :as queries.card-schema]
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
  "Drop the search index table named `table-name`, if it exists."
  [table-name :- [:or :keyword :string]]
  (t2/query (sql.helpers/drop-table :if-exists table-name)))

(mu/defn drop-search-index-table!
  "Drop the search index table named `table-name`."
  [table-name :- [:or :keyword :string]]
  (t2/query (sql.helpers/drop-table table-name)))

(mu/defn create-search-index-table!
  "Create the search index table named `table-name`: the columns of `metabase.search.appdb.index-schema/base-schema`
  as shaped by the active search engine specialization, then that specialization's post-creation statements (index
  creation and the like)."
  [table-name :- [:or :keyword :string]]
  (t2/query (-> (sql.helpers/create-table table-name)
                (sql.helpers/with-columns (specialization/table-schema index-schema/base-schema))))
  (let [table-name (name table-name)]
    (doseq [statement (specialization/post-create-statements table-name table-name)]
      (t2/query statement))))

(mu/defn analyze-search-index-table!
  "Run `ANALYZE` on the search index table `table-name` (Postgres only)."
  [table-name :- [:or :keyword :string]]
  (t2/query (str "ANALYZE " (name table-name))))

(mu/defn postgres-batch-upsert!
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

(mu/defn commit!
  "Commit the current transaction."
  []
  (t2/query ["commit"]))

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
  "Delete every row of the search index `table`."
  [table :- [:or :keyword :string]]
  (t2/delete! table))

(mu/defn delete-index-rows!
  "Delete the rows of the search index `table` for `model` and `model-ids`."
  [table      :- [:or :keyword :string]
   model      :- [:or :keyword :string]
   model-ids  :- [:or [:set [:or :string ms/PositiveInt]] [:sequential [:or :string ms/PositiveInt]]]]
  (t2/delete! table :model model :model_id [:in model-ids]))

(mu/defn insert-rows!
  "Insert `entries` into the search index `table`."
  [table   :- [:or :keyword :string]
   entries :- [:sequential :map]]
  (t2/insert! table entries))

(mu/defn index-entry-count
  "The number of entries in the search index table `index-table`."
  [index-table :- [:or :keyword :string]]
  (t2/count index-table))

(mu/defn table-exists?
  "Whether a table named `table-name` exists in the app DB."
  [table-name :- :string]
  (t2/exists? :information_schema.tables :table_name table-name))

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
  "Insert the SearchIndexMetadata `row`."
  [row :- ::search.schema/search-index-metadata.update]
  (t2/insert! :model/SearchIndexMetadata row))

(mu/defn delete-index-metadata-by-version!
  "Delete the SearchIndexMetadata rows of `version`."
  [version :- :string]
  (t2/delete! :model/SearchIndexMetadata :version version))

(mu/defn delete-index-metadata-by-name-on-conn!
  "Delete the SearchIndexMetadata rows named `index-name`, on `conn`."
  [conn       :- (ms/InstanceOfClass java.sql.Connection)
   index-name :- :string]
  (t2/delete! :conn conn :model/SearchIndexMetadata :index_name index-name))

(mu/defn delete-index-metadata!
  "Delete the SearchIndexMetadata row of `engine`, `version`, `lang-code`, and `index-name`."
  [engine     :- :keyword
   version    :- :string
   lang-code  :- :string
   index-name :- :string]
  (t2/delete! :model/SearchIndexMetadata :engine engine :version version :lang_code lang-code :index_name index-name))

(mu/defn index-metadata
  "The name, status, and creation time of the active and pending SearchIndexMetadata rows of `engine`, `version`, and
  `lang-code`."
  [engine    :- :keyword
   version   :- :string
   lang-code :- :string]
  (t2/select [:model/SearchIndexMetadata :index_name :status :created_at]
             :engine engine
             :version version
             :lang_code lang-code
             :status [:in [:active :pending]]))

(mu/defn delete-expired-pending-index-metadata!
  "Delete the pending SearchIndexMetadata rows of `lang-code` created before `created-before`."
  [lang-code      :- :string
   created-before :- ms/TemporalInstant]
  (t2/delete! :model/SearchIndexMetadata
              {:where [:and
                       [:= :lang_code lang-code]
                       [:= :status "pending"]
                       [:< :created_at created-before]]}))

(mu/defn pending-index-metadata-exists?
  "Whether a pending SearchIndexMetadata row of `engine`, `version`, and `lang-code` exists."
  [engine    :- :keyword
   version   :- :string
   lang-code :- :string]
  (t2/exists? :model/SearchIndexMetadata :engine engine :version version :lang_code lang-code :status :pending))

(mu/defn delete-retired-index-metadata!
  "Delete the retired SearchIndexMetadata rows of `engine`, `version`, and `lang-code`."
  [engine    :- :keyword
   version   :- :string
   lang-code :- :string]
  (t2/delete! :model/SearchIndexMetadata :engine engine :version version :lang_code lang-code :status :retired))

(mu/defn retire-active-index-metadata!
  "Retire the active SearchIndexMetadata rows of `engine`, `version`, and `lang-code`."
  [engine    :- :keyword
   version   :- :string
   lang-code :- :string]
  (t2/update! :model/SearchIndexMetadata {:engine engine :version version :lang_code lang-code :status :active} {:status :retired}))

(mu/defn activate-pending-index-metadata!
  "Activate the pending SearchIndexMetadata rows of `engine`, `version`, and `lang-code`."
  [engine    :- :keyword
   version   :- :string
   lang-code :- :string]
  (t2/update! :model/SearchIndexMetadata {:engine engine :version version :lang_code lang-code :status :pending} {:status :active}))

(mu/defn active-index-name
  "The name of the active SearchIndexMetadata row of `engine`, `version`, and `lang-code`, or nil."
  [engine    :- :keyword
   version   :- :string
   lang-code :- :string]
  (t2/select-one-fn :index_name :model/SearchIndexMetadata :engine engine :version version :lang_code lang-code :status :active))

(mu/defn recent-index-versions
  "The `:version`s of the `limit` most recently updated SearchIndexMetadata versions."
  [limit :- ms/PositiveInt]
  (t2/query {:select   [:version]
             :from     [(t2/table-name :model/SearchIndexMetadata)]
             :group-by [:version]
             ;; use pk as a tie-breaker
             :order-by [[[:max :updated_at] :desc]
                        [[:max :id] :desc]]
             :limit    limit}))

(mu/defn delete-obsolete-index-metadata!
  "Delete the SearchIndexMetadata rows whose version is not in `recent-versions`, or not in `keep-versions` and last
  updated before `updated-before`."
  [recent-versions :- [:sequential :string]
   keep-versions   :- [:sequential :string]
   updated-before  :- ms/TemporalInstant]
  (t2/query-one {:delete-from [(t2/table-name :model/SearchIndexMetadata)]
                 :where       [:or
                               [:not-in :version recent-versions]
                               [:and
                                [:not-in :version keep-versions]
                                [:< :updated_at updated-before]]]}))

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
  (into {} (map (juxt :id :result_metadata))
        (when (seq card-ids)
          (t2/select (queries.card-schema/selection)
                     :id [:in card-ids]))))
