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

(defenterprise-schema cache-strategy :- [:maybe ::cache-strategy]
  "Returns the granular cache strategy for a card."
  :feature :cache-granular-controls
  [card         :- :metabase.queries.schema/card
   dashboard-id :- [:maybe :metabase.lib.schema.id/dashboard]]
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
    (cache/card-strategy item card)))

;;; Strategy execution

(defmulti ^:private strategy->invalidated-at*
  "Freshness boundary for a given strategy: cache entries older than this are stale."
  {:arglists '([strategy])}
  :type)

(defmethod strategy->invalidated-at* :ttl [strategy]
  (backend.db/invalidated-at-ttl strategy))

(defmethod strategy->invalidated-at* :duration [strategy]
  (if-not (and (:duration strategy) (:unit strategy))
    (log/debugf "Caching strategy %s should have :duration and :unit" (pr-str strategy))
    (let [duration     (t/duration (:duration strategy) (keyword (:unit strategy)))
          duration-ago (t/minus (t/offset-date-time) duration)]
      (if-let [invalidated-at (:invalidated-at strategy)]
        (t/max duration-ago invalidated-at)
        duration-ago))))

(defmethod strategy->invalidated-at* :schedule [{:keys [invalidated-at] :as strategy}]
  (if-not invalidated-at
    (log/debugf "Caching strategy %s has not run yet" (pr-str strategy))
    invalidated-at))

(defmethod strategy->invalidated-at* :nocache [_]
  nil)

(defenterprise strategy->invalidated-at
  "Freshness boundary timestamp for `strategy`: cache entries with `updated_at` older than this are stale."
  :feature :cache-granular-controls
  [strategy]
  (strategy->invalidated-at* strategy))
