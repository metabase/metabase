(ns metabase.cache.db
  "Application database queries for `:model/CacheConfig` and `:model/QueryCache`. Every function here is a direct
  Toucan 2 call with no additional logic, so no other namespace runs a query on either model itself (model
  definitions still use `toucan2.core`).

  The queries below follow [[::cache-config-opts]] and [[::query-cache-opts]]; queries that do not fit them live in
  the cache-only section at the bottom of this namespace.

  `:model/QueryCache` rows are large blobs on a hot path: never add a column to a select on it."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as app-db]
   [metabase.cache.schema :as cache.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::cache-config-filters
  "Which CacheConfigs a query applies to. Keys mirror the columns of `cache_config`: a scalar matches that value and a
  set matches any of its values."
  [:map {:closed true}
   [:id                    {:optional true} ms/PositiveInt]
   [:model                 {:optional true} [:or :string [:set :string]]]
   [:model_id              {:optional true} [:or :int [:set :int]]]
   [:strategy              {:optional true} [:or [:or :keyword :string] [:set [:or :keyword :string]]]]
   [:refresh_automatically {:optional true} :boolean]])

(mr/def ::cache-config-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::cache-config-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::cache.schema/cache-config.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::cache.schema/cache-config.column
                                              [:tuple ::cache.schema/cache-config.column [:enum :asc :desc]]]]]]])

(mr/def ::query-cache-filters
  "Which QueryCaches a query applies to. Keys mirror the columns of `query_cache`: a scalar matches that value and a
  set matches any of its values."
  [:map {:closed true}
   [:query_hash {:optional true} [:or [:or bytes? :string] [:set [:or bytes? :string]]]]])

(mr/def ::query-cache-opts
  "The filters above plus the columns to select."
  [:merge
   ::query-cache-filters
   [:map {:closed true}
    [:columns {:optional true} [:sequential ::cache.schema/query-cache.column]]]])

(defn- ->cache-config-model
  [columns]
  (u.query/model-with-columns :model/CacheConfig columns))

(defn- ->cache-config-args
  [opts]
  (u.query/opts->args opts))

(defn- ->cache-config-kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-cache-configs :- [:sequential ::cache.schema/cache-config.partial]
  "The CacheConfigs matching `opts`."
  ([]
   (select-cache-configs nil))
  ([{:keys [columns] :as opts} :- [:maybe ::cache-config-opts]]
   (apply t2/select (->cache-config-model columns) (->cache-config-args opts))))

(mu/defn select-one-cache-config :- [:maybe ::cache.schema/cache-config.partial]
  "The first CacheConfig matching `opts`, or nil."
  ([]
   (select-one-cache-config nil))
  ([{:keys [columns] :as opts} :- [:maybe ::cache-config-opts]]
   (apply t2/select-one (->cache-config-model columns) (->cache-config-args opts))))

(mu/defn cache-config-exists? :- :boolean
  "Whether a CacheConfig matching `opts` exists."
  ([]
   (cache-config-exists? nil))
  ([opts :- [:maybe ::cache-config-opts]]
   (apply t2/exists? :model/CacheConfig (->cache-config-args opts))))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn delete-cache-configs! :- :int
  "Delete every CacheConfig matching `opts`, returning the number deleted."
  [opts :- [:maybe ::cache-config-opts]]
  (apply t2/delete! :model/CacheConfig (->cache-config-args opts)))

(mu/defn update-cache-configs! :- :int
  "Apply `changes` to every CacheConfig matching `opts`, returning the number updated."
  [opts    :- [:maybe ::cache-config-opts]
   changes :- ::cache.schema/cache-config.update]
  (apply t2/update! :model/CacheConfig (conj (->cache-config-kv-args opts) changes)))

(mu/defn delete-query-caches! :- :int
  "Delete every QueryCache matching `opts`, returning the number deleted."
  [opts :- [:maybe ::query-cache-opts]]
  (apply t2/delete! :model/QueryCache (u.query/opts->args opts)))

;;; --------------------------------------- Queries used only by the cache module ---------------------------------------

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

(mu/defn select-cache-configs-page
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
             (cond-> (base-query models collection id)
               sort-column (assoc :order-by [[(sort-column->order-by sort-column) sort-direction]])
               limit       (assoc :limit limit)
               offset      (assoc :offset offset))))

(mu/defn select-cache-config-count-row
  "The `:count` row of the CacheConfigs [[select-cache-configs-page]] pages through."
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

(mu/defn upsert-cache-config!
  "Insert or replace the CacheConfig for `model` and `model-id` with `data`, returning its ID."
  [model    :- :string
   model-id :- ms/IntGreaterThanOrEqualToZero
   data     :- (mut/select-keys (mr/schema ::cache.schema/cache-config.columns) [:model :model_id :strategy :config :refresh_automatically])]
  (app-db/update-or-insert! :model/CacheConfig {:model model :model_id model-id}
                            (constantly data)))

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

(mu/defn invalidate-cache-configs!
  "Set `invalidated_at` of the CacheConfigs identified by the `[model model-id]` pairs to `invalidated-at`, returning
  the number updated."
  [model+ids      :- [:sequential [:tuple :string ms/IntGreaterThanOrEqualToZero]]
   invalidated-at :- ms/TemporalInstant]
  (t2/query-one {:update (t2/table-name :model/CacheConfig)
                 :set    {:invalidated_at invalidated-at}
                 :where  (into [:or] (for [[model model-id] model+ids]
                                       [:and [:= :model model] [:= :model_id model-id]]))}))
