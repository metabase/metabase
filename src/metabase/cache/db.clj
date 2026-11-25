(ns metabase.cache.db
  "Application database queries for the cache module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as app-db]
   [metabase.cache.schema :as cache.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn database-with-ids
  "A Database whose id is in `ids`, or nil."
  [ids :- [:sequential ms/PositiveInt]]
  (some #(t2/select-one :model/Database :id [:in %]) (app-db/select-partitions ids)))

(mu/defn dashboard-with-ids
  "A Dashboard whose id is in `ids`, or nil."
  [ids :- [:sequential ms/PositiveInt]]
  (some #(t2/select-one :model/Dashboard :id [:in %]) (app-db/select-partitions ids)))

(mu/defn card-with-ids
  "A Card whose id is in `ids`, or nil."
  [ids :- [:sequential ms/PositiveInt]]
  (some #(t2/select-one :model/Card :id [:in %]) (app-db/select-partitions ids)))

(mu/defn dashboard-collection-id
  "The `:collection_id` of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one [:model/Dashboard :collection_id] :id dashboard-id))

(mu/defn card-collection-id
  "The `:collection_id` of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one [:model/Card :collection_id] :id card-id))

(mu/defn dashboard-collection-ids :- [:map-of ::lib.schema.id/dashboard [:maybe ::lib.schema.id/collection]]
  "The `:collection_id` of each of the Dashboards with `dashboard-ids`, by id."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (app-db/select-batched-map #(t2/select-fn->fn :id :collection_id [:model/Dashboard :id :collection_id] :id [:in %])
                             dashboard-ids))

(mu/defn card-collection-ids :- [:map-of ::lib.schema.id/card [:maybe ::lib.schema.id/collection]]
  "The `:collection_id` of each of the Cards with `card-ids`, by id."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (app-db/select-batched-map #(t2/select-fn->fn :id :collection_id [:model/Card :id :collection_id] :id [:in %])
                             card-ids))

(mu/defn databases
  "The Databases with `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (app-db/select-batched #(t2/select :model/Database :id [:in %]) database-ids))

(mu/defn dashboards
  "The Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (app-db/select-batched #(t2/select :model/Dashboard :id [:in %]) dashboard-ids))

(mu/defn cards
  "The Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (app-db/select-batched #(t2/select :model/Card :id [:in %]) card-ids))

(mu/defn cache-config
  "The CacheConfig with primary key `pk`, or nil."
  [pk :- ms/PositiveInt]
  (t2/select-one :model/CacheConfig :id [:auto/param pk]))

(mu/defn root-ttl-cache-config
  "The root TTL CacheConfig, or nil."
  []
  (t2/select-one :model/CacheConfig :model "root" :model_id 0 :strategy :ttl))

(defn- sort-column->order-by
  "Convert a sort column to the appropriate SQL order-by expression."
  [sort-column]
  (case sort-column
    :name       [:coalesce :card.name :dashboard.name]
    :collection [:coalesce :card.collection_id :dashboard.collection_id]
    :policy     :cache_config.strategy))

(defn- base-query
  "Build the base query for cache configs with JOINs for name/collection access."
  [models collection id]
  (if id
    {:select [:cache_config.*]
     :from   [[(t2/table-name :model/CacheConfig) :cache_config]]
     :where  [:and [:in :model models] [:= :model_id id]]}
    {:select    [:cache_config.*
                 [[:coalesce :card.name :dashboard.name] :item_name]
                 [[:coalesce :card.collection_id :dashboard.collection_id] :collection_id]
                 [:collection.name :collection_name]
                 [:collection.authority_level :collection_authority_level]
                 [:collection.type :collection_type]]
     :from      [[(t2/table-name :model/CacheConfig) :cache_config]]
     :left-join [[(t2/table-name :model/Card) :card]
                 [:and
                  [:= :model "question"]
                  [:= :model_id :card.id]
                  (when collection
                    [:= :card.collection_id collection])]
                 [(t2/table-name :model/Dashboard) :dashboard]
                 [:and
                  [:= :model "dashboard"]
                  [:= :model_id :dashboard.id]
                  (when collection
                    [:= :dashboard.collection_id collection])]
                 [(t2/table-name :model/Collection) :collection]
                 [:= :collection.id [:coalesce :card.collection_id :dashboard.collection_id]]]
     :where     [:and
                 [:in :model models]
                 [:case
                  [:= :model "question"]  [:!= :card.id nil]
                  [:= :model "dashboard"] [:!= :dashboard.id nil]
                  :else                   true]]}))

(mu/defn cache-configs-page
  "The CacheConfigs of `models` in `collection` (or of the entity with `id`), with the name and Collection of the
  configured entity, sorted by `sort-column` in `sort-direction` when given and paged by `limit` and `offset`."
  [models         :- [:sequential :string]
   collection     :- [:maybe ms/PositiveInt]
   id             :- [:maybe ms/IntGreaterThanOrEqualToZero]
   sort-column    :- [:maybe [:enum :name :collection :policy]]
   sort-direction :- [:maybe [:enum :asc :desc]]
   limit          :- [:maybe ms/PositiveInt]
   offset         :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (t2/select :model/CacheConfig
             (h2x/assert-map-or-nil!
              (cond-> (base-query models collection id)
                sort-column (assoc :order-by [[(sort-column->order-by sort-column) sort-direction]])
                limit       (assoc :limit limit)
                offset      (assoc :offset offset)))))

(mu/defn cache-config-count-row
  "The `:count` row of the CacheConfigs [[cache-configs-page]] pages through."
  [models     :- [:sequential :string]
   collection :- [:maybe ms/PositiveInt]
   id         :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (t2/query-one (-> (base-query models collection id)
                    (dissoc :select)
                    (assoc :select [[[:count :*] :count]]))))

(mu/defn lock-cache-config
  "The CacheConfig for `model` and `model-id` locked for update, or nil."
  [model    :- :string
   model-id :- ms/IntGreaterThanOrEqualToZero]
  (t2/select-one :model/CacheConfig :model model :model_id model-id {:for :update}))

(mu/defn insert-cache-config!
  "Insert the CacheConfig `data` and return the inserted instance."
  [data :- (mut/select-keys ::cache.schema/cache-config.update [:model :model_id :strategy :config :refresh_automatically])]
  (t2/insert-returning-instance! :model/CacheConfig data))

(mu/defn update-cache-config-strategy!
  "Apply `changes` of the strategy columns to the CacheConfig with `cache-config-id`, returning the number updated."
  [cache-config-id :- ms/PositiveInt
   changes         :- (mut/select-keys ::cache.schema/cache-config.update [:strategy :config :refresh_automatically])]
  (t2/update! :model/CacheConfig :id cache-config-id changes))

(mu/defn cache-configs-for
  "The CacheConfigs for `model` and `model-ids`."
  [model     :- :string
   model-ids :- [:sequential ms/IntGreaterThanOrEqualToZero]]
  (app-db/select-batched #(t2/select :model/CacheConfig :model model :model_id [:in %]) model-ids))

(mu/defn cache-config-ids-for-targets :- [:sequential ms/PositiveInt]
  "The ids of the CacheConfigs for `model` and `model-ids`."
  [model     :- :string
   model-ids :- [:sequential ms/IntGreaterThanOrEqualToZero]]
  (app-db/select-batched #(t2/select-pks-vec :model/CacheConfig :model model :model_id [:in %]) model-ids))

(mu/defn card-ids-for-databases
  "The ids of the Cards of the Databases with `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (not-empty (app-db/select-batched #(t2/select-fn-vec :id [:model/Card :id] :database_id [:in %]) database-ids)))

(mu/defn dashboard-card-ids
  "The Card ids of the DashboardCards of the Dashboards with `dashboard-ids` (nil for DashboardCards without a Card)."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (not-empty (app-db/select-batched #(t2/select-fn-vec :card_id [:model/DashboardCard :card_id] :dashboard_id [:in %]) dashboard-ids)))

(mu/defn invalidate-cache-configs!
  "Set `invalidated_at` of the CacheConfigs identified by the `[model model-id]` pairs to `invalidated-at`, returning
  the number updated."
  [model+ids      :- [:sequential [:tuple :string ms/IntGreaterThanOrEqualToZero]]
   invalidated-at :- ms/TemporalInstant]
  (app-db/sum-batched app-db/update-partition-size #(t2/query-one {:update (t2/table-name :model/CacheConfig)
                                                                   :set    {:invalidated_at invalidated-at}
                                                                   :where  (into [:or] (for [[model model-id] %]
                                                                                         [:and [:= :model model] [:= :model_id model-id]]))}) model+ids))

(mu/defn cache-config-exists?
  "Whether any CacheConfig exists."
  []
  (t2/exists? :model/CacheConfig))

;;; ---------------------------------------------- Query cache entries ----------------------------------------------

(mu/defn claim-query-cache-refresh-lease!
  "Set `refresh_started_at` of the QueryCache entry for `query-hash` to `started-at` if its lease (defaulting to
  `lease-free-sentinel`) is older than `lease-cutoff`, returning the number of rows updated."
  [query-hash          :- bytes?
   lease-free-sentinel :- ::cache.schema/temporal
   lease-cutoff        :- ::cache.schema/temporal
   started-at          :- ::cache.schema/temporal]
  (t2/update! (t2/table-name :model/QueryCache)
              {:query_hash                                         query-hash
               [:coalesce :refresh_started_at lease-free-sentinel] [:< lease-cutoff]}
              {:refresh_started_at started-at}))

(mu/defn delete-query-caches-updated-before!
  "Delete the QueryCache entries last updated at or before `updated-before`."
  [updated-before :- ::cache.schema/temporal]
  (t2/delete! (t2/table-name :model/QueryCache) :updated_at [:<= updated-before]))

(mu/defn upsert-query-cache!
  "Insert or update the QueryCache entry for `query-hash`, setting `:results` to `results` and `:updated_at` to
  `timestamp` and clearing `:refresh_started_at`, and return its primary key, the hash bytes."
  [query-hash :- bytes?
   timestamp  :- ::cache.schema/temporal
   results    :- bytes?]
  (app-db/update-or-insert! :model/QueryCache {:query_hash query-hash}
                            (constantly {:updated_at         timestamp
                                         :results            results
                                         :refresh_started_at nil})))
