(ns metabase-enterprise.cache.strategies
  (:require
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.api.cache :as api.cache]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :refer [defenterprise defenterprise-schema]]
   [metabase.query-processor.middleware.cache-backend.db :as backend.db]
   [metabase.util.cron :as u.cron]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; Data shape

(defenterprise CacheStrategy
  "Schema for a caching strategy"
  :feature :cache-granular-controls
  []
  [:and
   [:map
    [:type [:enum :nocache :ttl :duration :schedule :query]]]
   [:multi {:dispatch :type}
    [:nocache  [:map ;; not closed due to a way it's used in tests for clarity
                [:type [:= :nocache]]]]
    [:ttl      [:map {:closed true}
                [:type [:= :ttl]]
                [:multiplier ms/PositiveInt]
                [:min_duration_ms ms/IntGreaterThanOrEqualToZero]]]
    [:duration [:map {:closed true}
                [:type [:= :duration]]
                [:duration ms/PositiveInt]
                [:unit [:enum "hours" "minutes" "seconds" "days"]]]]
    [:schedule [:map {:closed true}
                [:type [:= :schedule]]
                [:schedule u.cron/CronScheduleString]
                ^:internal
                [:invalidated-at [:maybe some?]]]]
    [:query    [:map {:closed true}
                [:type [:= :query]]
                [:field_id int?]
                [:aggregation [:enum "max" "count"]]
                [:schedule u.cron/CronScheduleString]
                ^:internal
                [:invalidated-at [:maybe some?]]]]]])

;;; Querying DB

(defn- granular-duration-hours
  "Returns the granular cache duration (in hours) for a card. On EE, this first checking whether there is a stored value
   for the card, dashboard, or database (in that order of decreasing preference). Returns nil on OSS."
  [card dashboard-id]
  (or (:cache_ttl card)
      (when dashboard-id
        (t2/select-one-fn :cache_ttl [:model/Dashboard :cache_ttl] :id dashboard-id))
      (t2/select-one-fn :cache_ttl [:model/Database :cache_ttl] :id (:database_id card))))

(defenterprise-schema granular-cache-strategy :- [:maybe (CacheStrategy)]
  "Returns the granular cache strategy for a card."
  :feature :cache-granular-controls
  [card dashboard-id]
  (when (public-settings/enable-query-caching)
    (let [qs   (for [[i model model-id] [[1 "question"   (:id card)]
                                         [2 "dashboard"  dashboard-id]
                                         [3 "database"   (:database_id card)]
                                         [4 "root"       0]]
                     :when              model-id]
                 {:from   [:cache_config]
                  :select [:id
                           [[:inline i] :ordering]]
                  :where  [:and
                           [:= :model model]
                           [:= :model_id model-id]]})
          q    {:from     [[{:union-all qs} :unused_alias]]
                :select   [:id]
                :order-by :ordering
                :limit    1}
          item (t2/select-one :model/CacheConfig :id q)]
      (if item
        (-> (:strategy (api.cache/row->config item))
            (m/assoc-some :invalidated-at (t/max (:invalidated_at item)
                                                 (:cache_invalidated_at card))))
        (when-let [ttl (granular-duration-hours card dashboard-id)]
          {:type     :duration
           :duration ttl
           :unit     "hours"})))))

;;; Strategy execution

(defmulti ^:private fetch-cache-stmt-ee*
  "Generate prepared statement for a db cache backend for a given strategy"
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

(defmethod fetch-cache-stmt-ee* :query [{:keys [invalidated-at] :as strategy} query-hash conn]
  (if-not invalidated-at
    (log/debugf "Caching strategy %s has never run yet" (pr-str strategy))
    (backend.db/prepare-statement conn query-hash invalidated-at)))

(defmethod fetch-cache-stmt-ee* :nocache [_ _ _]
  nil)

(defenterprise fetch-cache-stmt
  "Returns prepared statement to query for db cache backend."
  :feature :cache-granular-controls
  [strategy query-hash conn]
  (fetch-cache-stmt-ee* strategy query-hash conn))
