(ns metabase-enterprise.cache.db
  "Application database queries for the cache module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private CacheConfigChanges
  "The keys callers pass to [[update-cache-config!]]."
  [:map {:closed true}
   [:next_run_at    {:optional true} [:maybe ms/TemporalInstant]]
   [:invalidated_at {:optional true} ms/TemporalInstant]])

(mu/defn card-cache-config
  "The most specific CacheConfig applying to the Card with `card-id` on the Dashboard with `dashboard-id` in the
  Database with `database-id`, or nil."
  [card-id      :- ::lib.schema.id/card
   dashboard-id :- [:maybe ::lib.schema.id/dashboard]
   database-id  :- [:maybe ::lib.schema.id/database]]
  (let [qs (for [[i model model-id] [[1 "question"  card-id]
                                     [2 "dashboard" dashboard-id]
                                     [3 "database"  database-id]
                                     [4 "root"      0]]
                 :when              model-id]
             ^:allow-subquery
             {:from   [:cache_config]
              :select [:id
                       [[:inline i] :ordering]]
              :where  [:and
                       [:= :model model]
                       [:= :model_id model-id]]})]
    (t2/select-one :model/CacheConfig
                   :id ^:allow-subquery {:from     [[^:allow-subquery {:union-all qs} :unused_alias]]
                                         :select   [:id]
                                         :order-by :ordering
                                         :limit    [:inline 1]})))

(mu/defn duration-cache-configs
  "The duration CacheConfigs that refresh automatically."
  []
  (t2/select :model/CacheConfig :strategy :duration :refresh_automatically true))

(mu/defn delete-query-caches!
  "Delete the QueryCache entries with `query-hashes`."
  [query-hashes :- [:sequential bytes?]]
  (t2/delete! :model/QueryCache :query_hash [:in query-hashes]))

(mu/defn cache-configs-ready-to-run
  "The CacheConfigs of `strategy` whose next run is unset or due at `now`."
  [strategy :- :keyword
   now      :- ms/TemporalInstant]
  (t2/select :model/CacheConfig
             :strategy strategy
             {:where [:or
                      [:= :next_run_at nil]
                      [:<= :next_run_at now]]}))

(mu/defn update-cache-config!
  "Apply `changes` to the CacheConfig with `cache-config-id`."
  [cache-config-id :- ms/PositiveInt
   changes         :- CacheConfigChanges]
  (t2/update! :model/CacheConfig {:id cache-config-id} changes))
