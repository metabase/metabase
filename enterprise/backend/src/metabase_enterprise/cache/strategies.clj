(ns metabase-enterprise.cache.strategies
  (:require
   [java-time.api :as t]
   [metabase.cache.api]
   [metabase.cache.core :as cache]
   [metabase.premium-features.core :refer [defenterprise defenterprise-schema]]
   [metabase.query-processor.middleware.cache-backend.db :as backend.db]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment metabase.cache.api/keep-me)

;; Data shape

;;; This is basically the same schema as `:metabase.cache.api/cache-strategy.ee` except it adds optional
;;; `:invalidated-at` keys
(mr/def ::cache-strategy
  "Schema for a caching strategy used internally"
  [:and
   :metabase.cache.api/cache-strategy.base.ee
   [:multi {:dispatch :type}
    [:nocache  :metabase.cache.api/cache-strategy.nocache]
    [:ttl      [:merge
                :metabase.cache.api/cache-strategy.ttl
                [:map
                 [:invalidated-at {:optional true} some?]]]]
    [:duration [:merge
                :metabase.cache.api/cache-strategy.ee.duration
                [:map
                 [:invalidated-at {:optional true} some?]]]]
    [:schedule [:merge
                :metabase.cache.api/cache-strategy.ee.schedule
                [:map
                 [:invalidated-at {:optional true} some?]]]]]])

;;; Querying DB

;;; ----------------------------------------- Request-scoped cache -----------------------------------------

(def ^:dynamic *cache-strategy-cache*
  "When bound to an atom (via [[with-cache-strategy-cache]]), caches the shared (non-question)
  cache config lookup so it isn't repeated for every card on the same dashboard+database.
  nil outside of a cached context."
  nil)

(defmacro with-cache-strategy-cache
  "Bind a cache-strategy lookup cache for the duration of `body`."
  [& body]
  `(binding [*cache-strategy-cache* (atom {})]
     ~@body))

(defn- cached
  "Look up `k` in [[*cache-strategy-cache*]], computing `(f)` on miss.
  Passes through to `(f)` when the cache is unbound."
  [k f]
  (if-not *cache-strategy-cache*
    (f)
    (let [v (get @*cache-strategy-cache* k ::miss)]
      (if (identical? v ::miss)
        (let [result (f)]
          (swap! *cache-strategy-cache* assoc k result)
          result)
        v))))

(defenterprise cache-strategy-batch-cache-bindings
  "Returns a Var->atom bindings map for the cache-strategy request-scoped cache, suitable for
  conveying to worker threads via `with-bindings`."
  :feature :cache-granular-controls
  []
  {#'*cache-strategy-cache* (atom {})})

(defn- find-question-cache-config
  "Look up question-level cache config for a specific card. Returns a CacheConfig or nil.
  Result is cached across cards when [[*cache-strategy-cache*]] is bound."
  [card-id]
  (cached [::question-config card-id]
          (fn []
            (t2/select-one :model/CacheConfig
                           :model "question"
                           :model_id card-id))))

(defn- find-shared-cache-config
  "Look up the highest-priority shared (dashboard/database/root) cache config.
  Result is cached across cards when [[*cache-strategy-cache*]] is bound."
  [dashboard-id database-id]
  (cached [::shared-config dashboard-id database-id]
          (fn []
            (let [qs (for [[i model model-id] [[2 "dashboard" dashboard-id]
                                               [3 "database"  database-id]
                                               [4 "root"      0]]
                           :when               model-id]
                       {:from   [:cache_config]
                        :select [:id
                                 [[:inline i] :ordering]]
                        :where  [:and
                                 [:= :model [:inline model]]
                                 [:= :model_id model-id]]})
                  q  {:from     [[{:union-all qs} :unused_alias]]
                      :select   [:id]
                      :order-by :ordering
                      :limit    [:inline 1]}]
              (t2/select-one :model/CacheConfig :id q)))))

(defenterprise warm-question-cache-configs!
  "Pre-warm the question-level cache config cache for a batch of card IDs.
  Performs a single SELECT with an IN clause and populates the request-scoped cache atom,
  including nil entries for cards with no question-level config."
  :feature :cache-granular-controls
  [card-ids]
  (when *cache-strategy-cache*
    (let [card-id-set (set card-ids)
          configs     (when (seq card-id-set)
                        (t2/select :model/CacheConfig
                                   :model "question"
                                   :model_id [:in card-id-set]))
          id->config  (into {} (map (juxt :model_id identity)) configs)]
      (swap! *cache-strategy-cache*
             into
             (map (fn [cid] [[::question-config cid] (get id->config cid)]))
             card-id-set))))

(defenterprise-schema cache-strategy :- [:maybe ::cache-strategy]
  "Returns the granular cache strategy for a card."
  :feature :cache-granular-controls
  [card         :- :metabase.queries.schema/card
   dashboard-id :- [:maybe :metabase.lib.schema.id/dashboard]]
  (let [item (or (find-question-cache-config (:id card))
                 (find-shared-cache-config dashboard-id (:database_id card)))]
    (cache/card-strategy item card)))

;;; Strategy execution

(defmulti ^:private fetch-cache-stmt-ee*
  "Generate prepared statement for a db cache backend for a given strategy"
  {:arglists '([strategy query-hash])}
  (fn [strategy _hash] (:type strategy)))

(defmethod fetch-cache-stmt-ee* :ttl [strategy query-hash]
  (backend.db/fetch-cache-stmt-ttl strategy query-hash))

(defmethod fetch-cache-stmt-ee* :duration [strategy query-hash]
  (if-not (and (:duration strategy) (:unit strategy))
    (log/debugf "Caching strategy %s should have :duration and :unit" (pr-str strategy))
    (let [duration       (t/duration (:duration strategy) (keyword (:unit strategy)))
          duration-ago   (t/minus (t/offset-date-time) duration)
          invalidated-at (t/max duration-ago (:invalidated-at strategy))]
      (backend.db/select-cache query-hash invalidated-at))))

(defmethod fetch-cache-stmt-ee* :schedule [{:keys [invalidated-at] :as strategy} query-hash]
  (if-not invalidated-at
    (log/debugf "Caching strategy %s has not run yet" (pr-str strategy))
    (backend.db/select-cache query-hash invalidated-at)))

(defmethod fetch-cache-stmt-ee* :nocache [_ _ _]
  nil)

(defenterprise fetch-cache-stmt
  "Returns prepared statement to query for db cache backend."
  :feature :cache-granular-controls
  [strategy query-hash]
  (fetch-cache-stmt-ee* strategy query-hash))
