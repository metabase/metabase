(ns metabase.cache.db
  "Application database queries for the cache module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn any-with-ids
  "A `model` row whose id is in `ids`, or nil."
  [model ids]
  (t2/select-one model :id [:in ids]))

(defn dashboard-collection-id
  "The `:collection_id` of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one [:model/Dashboard :collection_id] :id dashboard-id))

(defn card-collection-id
  "The `:collection_id` of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one [:model/Card :collection_id] :id card-id))

(defn cache-config
  "The CacheConfig with primary key `pk`, or nil."
  [pk]
  (t2/select-one :model/CacheConfig pk))

(defn root-ttl-cache-config
  "The root TTL CacheConfig, or nil."
  []
  (t2/select-one :model/CacheConfig :model "root" :model_id 0 :strategy :ttl))

(defn- sort-column->order-by
  "Convert a sort column to the appropriate SQL order-by expression."
  [sort-column]
  (case sort-column
    :name       [:coalesce :report_card.name :report_dashboard.name]
    :collection [:coalesce :report_card.collection_id :report_dashboard.collection_id]
    :policy     :cache_config.strategy))

(defn- base-query
  "Build the base query for cache configs with JOINs for name/collection access."
  [models collection id]
  (if id
    {:select [:cache_config.*]
     :from   [:cache_config]
     :where  [:and [:in :model models] [:= :model_id id]]}
    {:select    [:cache_config.*
                 [[:coalesce :report_card.name :report_dashboard.name] :item_name]
                 [[:coalesce :report_card.collection_id :report_dashboard.collection_id] :collection_id]
                 [:collection.name :collection_name]
                 [:collection.authority_level :collection_authority_level]
                 [:collection.type :collection_type]]
     :from      [:cache_config]
     :left-join [:report_card      [:and
                                    [:= :model "question"]
                                    [:= :model_id :report_card.id]
                                    (when collection
                                      [:= :report_card.collection_id collection])]
                 :report_dashboard [:and
                                    [:= :model "dashboard"]
                                    [:= :model_id :report_dashboard.id]
                                    (when collection
                                      [:= :report_dashboard.collection_id collection])]
                 :collection       [:= :collection.id
                                    [:coalesce :report_card.collection_id
                                     :report_dashboard.collection_id]]]
     :where     [:and
                 [:in :model models]
                 [:case
                  [:= :model "question"]  [:!= :report_card.id nil]
                  [:= :model "dashboard"] [:!= :report_dashboard.id nil]
                  :else                             true]]}))

(defn cache-configs-page
  "The CacheConfigs of `models` in `collection` (or of the entity with `id`), with the name and Collection of the
  configured entity, sorted by `sort-column` in `sort-direction` when given and paged by `limit` and `offset`."
  [models collection id sort-column sort-direction limit offset]
  (t2/select :model/CacheConfig
             (cond-> (base-query models collection id)
               sort-column (assoc :order-by [[(sort-column->order-by sort-column) sort-direction]])
               limit       (assoc :limit limit)
               offset      (assoc :offset offset))))

(defn cache-config-count-row
  "The `:count` row of the CacheConfigs [[cache-configs-page]] pages through."
  [models collection id]
  (t2/query-one (-> (base-query models collection id)
                    (dissoc :select)
                    (assoc :select [[[:count :*] :count]]))))

(defn lock-cache-config
  "The CacheConfig for `model` and `model-id` locked for update, or nil."
  [model model-id]
  (t2/select-one :model/CacheConfig :model model :model_id model-id {:for :update}))

(defn cache-configs-for
  "The CacheConfigs for `model` and `model-ids`."
  [model model-ids]
  (t2/select :model/CacheConfig :model model :model_id [:in model-ids]))

(defn delete-cache-configs!
  "Delete the CacheConfigs for `model` and `model-ids`."
  [model model-ids]
  (t2/delete! :model/CacheConfig :model model :model_id [:in model-ids]))

(defn card-ids-for-databases
  "The ids of the Cards of the Databases with `database-ids`."
  [database-ids]
  (t2/select-fn-vec :id [:model/Card :id] :database_id [:in database-ids]))

(defn dashboard-card-ids
  "The Card ids of the DashboardCards of the Dashboards with `dashboard-ids`."
  [dashboard-ids]
  (t2/select-fn-vec :card_id [:model/DashboardCard :card_id] :dashboard_id [:in dashboard-ids]))

(defn invalidate-cards!
  "Set `cache_invalidated_at` of the Cards with `card-ids` to `invalidated-at`, returning the number updated."
  [card-ids invalidated-at]
  (t2/update! :model/Card :id [:in card-ids] {:cache_invalidated_at invalidated-at}))

(defn invalidate-cache-configs!
  "Set `invalidated_at` of the CacheConfigs identified by the `[model model-id]` pairs to `invalidated-at`."
  [model+ids invalidated-at]
  (t2/query-one {:update (t2/table-name :model/CacheConfig)
                 :set    {:invalidated_at invalidated-at}
                 :where  (into [:or] (for [[model model-id] model+ids]
                                       [:and [:= :model model] [:= :model_id model-id]]))}))

(defn cache-config-exists?
  "Whether any CacheConfig exists."
  []
  (t2/exists? :model/CacheConfig))
