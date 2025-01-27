(ns metabase-enterprise.cache.strategies
  (:require
   [java-time.api :as t]
   [metabase.api.cache]
   [metabase.models.cache-config :as cache-config]
   [metabase.premium-features.core :refer [defenterprise defenterprise-schema]]
   [metabase.query-processor.middleware.cache-backend.db :as backend.db]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment metabase.api.cache/keep-me)

;; Data shape

(mr/def ::cache-strategy
  "Schema for a caching strategy used internally"
  [:and
   :metabase.api.cache/cache-strategy.base
   [:multi {:dispatch :type}
    [:nocache  :metabase.api.cache/cache-strategy.nocache]
    [:ttl      [:merge
                :metabase.api.cache/cache-strategy.ttl
                [:map
                 [:invalidated-at {:optional true} some?]]]]
    [:duration [:merge
                :metabase.api.cache/cache-strategy.ee.duration
                [:map
                 [:invalidated-at {:optional true} some?]]]]
    [:schedule [:merge
                :metabase.api.cache/cache-strategy.ee.schedule
                [:map
                 [:invalidated-at {:optional true} some?]]]]]])

;;; Querying DB

(defenterprise-schema cache-strategy :- [:maybe ::cache-strategy]
  "Returns the granular cache strategy for a card."
  :feature :cache-granular-controls
  [card dashboard-id]
  (let [qs   (for [[i model model-id] [[1 "question"   (:id card)]
                                       [2 "dashboard"  dashboard-id]
                                       [3 "database"   (:database_id card)]
                                       [4 "root"       0]]
                   :when              model-id]
               {:from   [:cache_config]
                :select [:id
                         [[:inline i] :ordering]]
                :where  [:and
                         [:= :model [:inline model]]
                         [:= :model_id model-id]]})
        q    {:from     [[{:union-all qs} :unused_alias]]
              :select   [:id]
              :order-by :ordering
              :limit    [:inline 1]}
        item (t2/select-one :model/CacheConfig :id q)]
    (cache-config/card-strategy item card)))

;;; Strategy execution

(defmulti ^:private fetch-cache-stmt-ee*
  "Generate prepared statement for a db cache backend for a given strategy"
  {:arglists '([strategy query-hash conn])}
  (fn [strategy _hash _conn] (:type strategy)))

(defmethod fetch-cache-stmt-ee* :ttl [strategy query-hash conn]
  (backend.db/fetch-cache-stmt-ttl strategy query-hash conn))

(defmethod fetch-cache-stmt-ee* :duration [strategy query-hash conn]
  (if-not (and (:duration strategy) (:unit strategy))
    (log/debugf "Caching strategy %s should have :duration and :unit" (pr-str strategy))
    (let [duration       (t/duration (:duration strategy) (keyword (:unit strategy)))
          duration-ago   (t/minus (t/offset-date-time) duration)
          invalidated-at (t/max duration-ago (:invalidated-at strategy))]
      (backend.db/prepare-statement conn query-hash invalidated-at))))

(defmethod fetch-cache-stmt-ee* :schedule [{:keys [invalidated-at] :as strategy} query-hash conn]
  (if-not invalidated-at
    (log/debugf "Caching strategy %s has not run yet" (pr-str strategy))
    (backend.db/prepare-statement conn query-hash invalidated-at)))

(defmethod fetch-cache-stmt-ee* :nocache [_ _ _]
  nil)

(defenterprise fetch-cache-stmt
  "Returns prepared statement to query for db cache backend."
  :feature :cache-granular-controls
  [strategy query-hash conn]
  (fetch-cache-stmt-ee* strategy query-hash conn))
