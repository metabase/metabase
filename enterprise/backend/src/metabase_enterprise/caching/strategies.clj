(ns metabase-enterprise.caching.strategies
  (:require
   [java-time.api :as t]
   [malli.core :as mc]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :refer [defenterprise defenterprise-schema]]
   [metabase.query-processor.middleware.cache-backend.db :as backend.db]
   [metabase.util.cron :as u.cron]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def CacheStrategy ;; not used in API since there are some additional fields
  "Schema for a caching strategy"
  (mc/schema
   [:and
    [:map
     [:type [:enum :nocache :ttl :duration :schedule :query]]]
    [:multi {:dispatch :type}
     [:nocache  [:map
                 [:type keyword?]]]
     [:ttl      [:map
                 [:type keyword?]
                 [:multiplier ms/PositiveInt]
                 [:min_duration ms/PositiveInt]]]
     [:duration [:map
                 [:type keyword?]
                 [:duration ms/PositiveInt]
                 [:unit [:enum "hours" "minutes" "seconds" "days"]]]]
     [:schedule [:map
                 [:type keyword?]
                 [:last-expired-at [:maybe some?]]
                 [:schedule u.cron/CronScheduleString]]]
     [:query    [:map
                 [:type keyword?]
                 [:last-expired-at [:maybe some?]]
                 [:field_id int?]
                 [:aggregation [:enum "max" "count"]]
                 [:schedule u.cron/CronScheduleString]]]]]))

(defn granular-duration-hours
  "Returns the granular cache duration (in hours) for a card. On EE, this first checking whether there is a stored value
   for the card, dashboard, or database (in that order of decreasing preference). Returns nil on OSS."
  [card dashboard-id]
  (or (:cache_ttl card)
      (:cache_ttl (t2/select-one [:model/Dashboard :cache_ttl] :id dashboard-id))
      (:cache_ttl (t2/select-one [:model/Database :cache_ttl] :id (:database_id card)))))

(defenterprise-schema granular-cache-strategy :- [:maybe CacheStrategy]
  "Returns the granular cache strategy for a card."
  :feature :cache-granular-controls
  [card dashboard-id]
  (when (public-settings/enable-query-caching)
    (let [qs     (for [[i model model-id] [[1 "question"   (:id card)]
                                           [2 "dashboard"  dashboard-id]
                                           [3 "collection" (:collection_id card)]
                                           [4 "database"   (:database_id card)]
                                           [5 "root"       0]]
                       :when              model-id]
                   {:from   [:cache_config]
                    :select [:id
                             [[:inline i] :ordering]]
                    :where  [:and
                             [:= :model model]
                             [:= :model_id model-id]]})
          q      {:select   [:id]
                  :limit    1
                  :from     [[{:union-all qs} :unused_alias]]
                  :order-by :ordering}
          config (t2/select-one :model/CacheConfig :id q)]
      (if config
        (merge {:type            (:strategy config)
                :last-expired-at (:last_expired_at config)}
               (:config config))
        (when-let [ttl (granular-duration-hours card dashboard-id)]
          {:type     :duration
           :duration ttl
           :unit     "hours"})))))

;;; Strategy execution

(defmulti fetch-cache-stmt-ee*
  "Generate prepared statement for a db cache backend for a given strategy"
  (fn [strategy _hash _conn] (:type strategy)))

(defmethod fetch-cache-stmt-ee* :ttl [strategy query-hash conn]
  (backend.db/fetch-cache-stmt-ttl strategy query-hash conn))

(defmethod fetch-cache-stmt-ee* :duration [strategy query-hash conn]
  (assert (:duration strategy))
  (assert (:unit strategy))
  (let [duration  (t/duration (:duration strategy) (keyword (:unit strategy)))
        timestamp (t/minus (t/offset-date-time) duration)]
    (backend.db/prepare-statement conn query-hash timestamp)))

(defmethod fetch-cache-stmt-ee* :schedule [{:keys [last-expired-at] :as strategy} query-hash conn]
  (if-not last-expired-at
    (log/debugf "Caching strategy %s was never run yet" (pr-str strategy))
    (backend.db/prepare-statement conn query-hash last-expired-at)))

(defmethod fetch-cache-stmt-ee* :query [{:keys [last-expired-at] :as strategy} query-hash conn]
  (if-not last-expired-at
    (log/debugf "Caching strategy %s was never run yet" (pr-str strategy))
    (backend.db/prepare-statement conn query-hash last-expired-at)))

(defmethod fetch-cache-stmt-ee* :nocache [_ _ _]
  nil)

(defenterprise fetch-cache-stmt
  "Returns prepared statement to query for db cache backend."
  :feature :cache-granular-controls
  [strategy query-hash conn]
  (fetch-cache-stmt-ee* strategy query-hash conn))
