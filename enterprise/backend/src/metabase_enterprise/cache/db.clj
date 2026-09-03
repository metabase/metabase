(ns metabase-enterprise.cache.db
  "Application database queries for the cache module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [toucan2.core :as t2]))

(defn card-cache-config
  "The most specific CacheConfig applying to the Card with `card-id` on the Dashboard with `dashboard-id` in the
  Database with `database-id`, or nil."
  [card-id dashboard-id database-id]
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

(defn cards-by-id
  "A map of ID to Card for `card-ids`."
  [card-ids]
  (t2/select-pk->fn identity :model/Card :id [:in card-ids]))

(defn router-database-ids
  "The subset of `database-ids` that are database routers."
  [database-ids]
  (t2/select-fn-set :database_id :model/DatabaseRouter :database_id [:in database-ids]))

(defn duration-cache-configs
  "The duration CacheConfigs that refresh automatically."
  []
  (t2/select :model/CacheConfig :strategy :duration :refresh_automatically true))

(defn duration-queries-to-rerun
  "The query definitions to rerun for the duration cache `scopes`, each `{:model :model-id :rerun-cutoff}`, counting
  only executions started after `started-after`; `parameterized?` selects parameterized or plain queries."
  [scopes started-after parameterized?]
  (t2/select
   :model/Query
   {:select [:u.query :u.cache-hash :u.card-id :u.dashboard-id :u.count]
    :from   [[^:allow-subquery
              {:union (for [{:keys [model model-id rerun-cutoff]} scopes]
                        ^:allow-subquery
                        {:nest
                         ^:allow-subquery
                         {:select   [[:q.query :query]
                                     [:qc.query_hash :cache-hash]
                                     [:qe.card_id :card-id]
                                     [:qe.dashboard_id :dashboard-id]
                                     [[:count :q.query_hash] :count]]
                          :from     [[(t2/table-name :model/Query) :q]]
                          :join     [[(t2/table-name :model/QueryExecution) :qe] [:= :qe.hash :q.query_hash]
                                     [(t2/table-name :model/QueryCache) :qc] [:= :qc.query_hash :qe.cache_hash]]
                          :where    [:and
                                     (case model
                                       "question"  [:= :qe.card_id model-id]
                                       "dashboard" [:= :qe.dashboard_id model-id])
                                     [:<= :qc.updated_at rerun-cutoff]
                                     [:>= :qe.started_at started-after]
                                     [:= :qe.error nil]
                                     [:= :qe.is_sandboxed false]
                                     (if parameterized?
                                       [:and
                                        [:= :qe.parameterized true]
                                        ;; Only rerun a parameterized query if it's had a cache hit within
                                        ;; the last caching window
                                        [:= :qe.cache_hit true]
                                        ;; Don't factor the last cache refresh into whether we should rerun
                                        ;; a parameterized query
                                        [:not= :qe.context "cache-refresh"]]
                                       [:= :qe.parameterized false])]
                          :group-by [:q.query_hash :q.query :qc.query_hash :qe.card_id :qe.dashboard_id]}})}
              :u]]}))

(defn scheduled-base-query-to-rerun
  "The unparameterized query definition of the Card with `card-id` executed most recently after `started-after`, or
  nil."
  [card-id started-after]
  (t2/select-one :model/Query
                 {:select   [:q.query [:qe.card_id :card-id]]
                  :from     [[(t2/table-name :model/Query) :q]]
                  :join     [[(t2/table-name :model/QueryExecution) :qe] [:= :qe.hash :q.query_hash]]
                  :where    [:and
                             [:= :qe.card_id card-id]
                             [:= :qe.parameterized false]
                             [:= :qe.error nil]
                             [:= :qe.is_sandboxed false]
                             [:>= :qe.started_at started-after]]
                  :order-by [[:qe.started_at :desc]]
                  :limit    1}))

(defn scheduled-parameterized-queries-to-rerun
  "The `limit` most common parameterized query definitions of the Card with `card-id` executed after `rerun-cutoff`."
  [card-id rerun-cutoff limit]
  (t2/select :model/Query
             {:select   [:q.query [:qe.card_id :card-id]]
              :from     [[(t2/table-name :model/Query) :q]]
              :join     [[(t2/table-name :model/QueryExecution) :qe] [:= :qe.hash :q.query_hash]]
              :where    [:and
                         [:= :qe.card_id card-id]
                         [:>= :qe.started_at rerun-cutoff]
                         ;; Don't factor the last cache refresh into whether we should rerun a parameterized query
                         [:not= :qe.context "cache-refresh"]
                         [:= :parameterized true]
                         [:= :qe.error nil]
                         [:= :qe.is_sandboxed false]]
              :group-by [:q.query_hash :q.query :qe.card_id]
              :order-by [[[:count :q.query_hash] :desc]
                         [[:min :qe.started_at] :asc]]
              :limit    limit}))

(defn delete-query-caches!
  "Delete the QueryCache entries with `query-hashes`."
  [query-hashes]
  (t2/delete! :model/QueryCache :query_hash [:in query-hashes]))

(defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one :model/Dashboard :id dashboard-id))

(defn cache-configs-ready-to-run
  "The CacheConfigs of `strategy` whose next run is unset or due at `now`."
  [strategy now]
  (t2/select :model/CacheConfig
             :strategy strategy
             {:where [:or
                      [:= :next_run_at nil]
                      [:<= :next_run_at now]]}))

(defn update-cache-config!
  "Apply `changes` to the CacheConfig with `cache-config-id`."
  [cache-config-id changes]
  (t2/update! :model/CacheConfig {:id cache-config-id} changes))
