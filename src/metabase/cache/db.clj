(ns metabase.cache.db
  "Application database queries for the cache module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as app-db]
   [metabase.cache.schema :as cache.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.toucan.core :as t2]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(mu/defn database-with-ids
  "A Database whose id is in `ids`, or nil."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select-one :model/Database :id [:in ids]))

(mu/defn dashboard-with-ids
  "A Dashboard whose id is in `ids`, or nil."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select-one :model/Dashboard :id [:in ids]))

(mu/defn card-with-ids
  "A Card whose id is in `ids`, or nil."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select-one :model/Card :id [:in ids]))

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
  (if (seq dashboard-ids)
    (t2/select-fn->fn :id :collection_id [:model/Dashboard :id :collection_id] :id [:in dashboard-ids])
    {}))

(mu/defn card-collection-ids :- [:map-of ::lib.schema.id/card [:maybe ::lib.schema.id/collection]]
  "The `:collection_id` of each of the Cards with `card-ids`, by id."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (if (seq card-ids)
    (t2/select-fn->fn :id :collection_id [:model/Card :id :collection_id] :id [:in card-ids])
    {}))

(mu/defn databases
  "The Databases with `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (if (seq database-ids)
    (t2/select :model/Database :id [:in database-ids])
    []))

(mu/defn cache-config
  "The CacheConfig with primary key `pk`, or nil."
  [pk :- ms/PositiveInt]
  (t2/select-one :model/CacheConfig :id pk))

(mu/defn root-ttl-cache-config
  "The root TTL CacheConfig, or nil."
  []
  (t2/select-one :model/CacheConfig :model "root" :model_id 0 :strategy :ttl))

(defn- sort-order-by
  "The `:order-by` for `sort-column` in `sort-direction`, empty when there is no sort column."
  [sort-column sort-direction]
  (let [desc? (= sort-direction :desc)]
    (case sort-column
      :name       (if desc?
                    (t2/fragment [[[:coalesce :report_card.name :report_dashboard.name] :desc]])
                    (t2/fragment [[[:coalesce :report_card.name :report_dashboard.name] :asc]]))
      :collection (if desc?
                    (t2/fragment [[[:coalesce :report_card.collection_id :report_dashboard.collection_id] :desc]])
                    (t2/fragment [[[:coalesce :report_card.collection_id :report_dashboard.collection_id] :asc]]))
      :policy     (if desc?
                    (t2/fragment [[:cache_config.strategy :desc]])
                    (t2/fragment [[:cache_config.strategy :asc]]))
      (t2/fragment []))))

(defn- page-select
  "The columns of a page of CacheConfigs, with the name and Collection of the configured entity unless `id` is given."
  [id]
  (if id
    (t2/fragment [:cache_config.*])
    (t2/fragment [:cache_config.*
                  [[:coalesce :report_card.name :report_dashboard.name] :item_name]
                  [[:coalesce :report_card.collection_id :report_dashboard.collection_id] :collection_id]
                  [:collection.name :collection_name]
                  [:collection.authority_level :collection_authority_level]
                  [:collection.type :collection_type]])))

(defn- name-joins
  "The JOINs for the name and Collection of the configured entity, none when `id` is given."
  [collection id]
  (if id
    (t2/fragment [])
    (t2/fragment [:report_card      [:and
                                     [:= :model "question"]
                                     [:= :model_id :report_card.id]
                                     (when collection
                                       (t2/fragment [:= :report_card.collection_id collection]))]
                  :report_dashboard [:and
                                     [:= :model "dashboard"]
                                     [:= :model_id :report_dashboard.id]
                                     (when collection
                                       (t2/fragment [:= :report_dashboard.collection_id collection]))]
                  :collection       [:= :collection.id
                                     [:coalesce :report_card.collection_id
                                      :report_dashboard.collection_id]]])))

(defn- models-where
  "The `:where` for the CacheConfigs of `models`, of the entity with `id` when given."
  [models id]
  (if id
    (t2/fragment [:and [:in :model models] [:= :model_id id]])
    (t2/fragment [:and
                  [:in :model models]
                  [:case
                   [:= :model "question"]  [:!= :report_card.id nil]
                   [:= :model "dashboard"] [:!= :report_dashboard.id nil]
                   :else                             true]])))

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
             {:select    (page-select id)
              :from      [:cache_config]
              :left-join (name-joins collection id)
              :where     (models-where models id)
              :order-by  (sort-order-by sort-column sort-direction)
              :limit     (or limit Integer/MAX_VALUE)
              :offset    (or offset 0)}))

(mu/defn cache-config-count-row
  "The `:count` row of the CacheConfigs [[cache-configs-page]] pages through."
  [models     :- [:sequential :string]
   collection :- [:maybe ms/PositiveInt]
   id         :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (t2/query-one {:select    [[[:count :*] :count]]
                 :from      [:cache_config]
                 :left-join (name-joins collection id)
                 :where     (models-where models id)}))

(mu/defn lock-cache-config
  "The CacheConfig for `model` and `model-id` locked for update, or nil."
  [model    :- :string
   model-id :- ms/IntGreaterThanOrEqualToZero]
  (t2/select-one :model/CacheConfig :model model :model_id model-id {:for :update}))

(mu/defn upsert-cache-config!
  "Insert or replace the CacheConfig for `model` and `model-id` with `data`, returning its ID."
  [model    :- :string
   model-id :- ms/IntGreaterThanOrEqualToZero
   data     :- (mut/select-keys ::cache.schema/cache-config.update [:model :model_id :strategy :config :refresh_automatically])]
  (app-db/update-or-insert! :model/CacheConfig {:model model :model_id model-id}
                            (constantly data)))

(mu/defn cache-configs-for
  "The CacheConfigs for `model` and `model-ids`."
  [model     :- :string
   model-ids :- [:sequential ms/IntGreaterThanOrEqualToZero]]
  (t2/select :model/CacheConfig :model model :model_id [:in model-ids]))

(mu/defn delete-cache-configs!
  "Delete the CacheConfigs for `model` and `model-ids`, returning the number deleted."
  [model     :- :string
   model-ids :- [:sequential ms/IntGreaterThanOrEqualToZero]]
  (t2/delete! :model/CacheConfig :model model :model_id [:in model-ids]))

(mu/defn card-ids-for-databases
  "The ids of the Cards of the Databases with `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/select-fn-vec :id [:model/Card :id] :database_id [:in database-ids]))

(mu/defn dashboard-card-ids
  "The Card ids of the DashboardCards of the Dashboards with `dashboard-ids` (nil for DashboardCards without a Card)."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (t2/select-fn-vec :card_id [:model/DashboardCard :card_id] :dashboard_id [:in dashboard-ids]))

(mu/defn invalidate-cards!
  "Set `cache_invalidated_at` of the Cards with `card-ids` to `invalidated-at`, returning the number updated."
  [card-ids       :- [:sequential ::lib.schema.id/card]
   invalidated-at :- ms/TemporalInstant]
  (t2/update! :model/Card :id [:in card-ids] {:cache_invalidated_at invalidated-at}))

(defn- pairs-where
  "The clause matching any of the `[model model-id]` `pairs`, as a balanced tree."
  [pairs]
  (let [n (count pairs)]
    (case n
      0 (t2/fragment [:or])
      1 (let [[model model-id] (first pairs)]
          (t2/fragment [:and [:= :model model] [:= :model_id model-id]]))
      (let [[l r] (split-at (quot n 2) pairs)]
        (t2/fragment [:or (pairs-where l) (pairs-where r)])))))

(mu/defn invalidate-cache-configs!
  "Set `invalidated_at` of the CacheConfigs identified by the `[model model-id]` pairs to `invalidated-at`, returning
  the number updated."
  [model+ids      :- [:sequential [:tuple :string ms/IntGreaterThanOrEqualToZero]]
   invalidated-at :- ms/TemporalInstant]
  (t2/query-one {:update (t2/table-name :model/CacheConfig)
                 :set    {:invalidated_at invalidated-at}
                 :where  (pairs-where model+ids)}))

(mu/defn cache-config-exists?
  "Whether any CacheConfig exists."
  []
  (t2/exists? :model/CacheConfig))
