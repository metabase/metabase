(ns metabase.cache.db
  "Application database queries for the cache module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as app-db]
   [metabase.cache.schema :as cache.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn cache-config :- [:maybe ::cache.schema/cache-config]
  "The ::cache.schema/cache-config with `pk`, or nil."
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
             (cond-> (base-query models collection id)
               sort-column (assoc :order-by [[(sort-column->order-by sort-column) sort-direction]])
               limit       (assoc :limit limit)
               offset      (assoc :offset offset))))

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

(mu/defn cache-config-exists?
  "Whether any CacheConfig exists."
  []
  (t2/exists? :model/CacheConfig))

(mu/defn preemptive-cache-config-exists?
  "Whether any CacheConfig refreshes automatically."
  []
  (t2/exists? :model/CacheConfig :refresh_automatically true))

(mu/defn cache-entry
  "`row-fn` applied, while the result set is still open, to the results and update time of the QueryCache entry for
  `query-hash`, or nil."
  [{:keys [row-fn query-hash]} :- [:map {:closed true}
                                   [:row-fn     fn?]
                                   [:query-hash bytes?]]]
  (t2/select-one-fn row-fn [:model/QueryCache :results :updated_at] :query_hash [:auto/param query-hash]))

(mu/defn query-cache-stats
  "The average result `:length` and `:count` of the QueryCache entries."
  []
  (t2/select-one [:model/QueryCache [[:avg [:length :results]] :length] [:%count.* :count]]))
