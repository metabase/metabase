(ns metabase-enterprise.caching.strategies
  (:require
   [clojure.walk :as walk]
   [java-time.api :as t]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :refer [defenterprise defenterprise-schema]]
   [metabase.query-processor.middleware.cache-backend.db :as backend.db]
   [metabase.util.cron :as u.cron]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- drop-internal-fields [schema]
  (walk/prewalk
   (fn [x]
     (if (and (vector? x) (= :map (first x)))
       (vec (remove #(:internal (meta %)) x))
       x))
   schema))

;; Data shape

(def CacheStrategy
  "Schema for a caching strategy"
  [:and
   [:map
    [:type [:enum :nocache :ttl :duration :schedule :query]]]
   [:multi {:dispatch :type}
    [:nocache  [:map ;; not closed due to a way it's used in tests for clarity
                [:type keyword?]]]
    [:ttl      [:map {:closed true}
                [:type keyword?]
                [:multiplier ms/PositiveInt]
                [:min_duration ms/PositiveInt]]]
    [:duration [:map {:closed true}
                [:type keyword?]
                [:duration ms/PositiveInt]
                [:unit [:enum "hours" "minutes" "seconds" "days"]]]]
    [:schedule [:map {:closed true}
                [:type keyword?]
                [:schedule u.cron/CronScheduleString]
                ^:internal
                [:last-expired-at [:maybe some?]]]]
    [:query    [:map {:closed true}
                [:type keyword?]
                [:field_id int?]
                [:aggregation [:enum "max" "count"]]
                [:schedule u.cron/CronScheduleString]
                ^:internal
                [:last-expired-at [:maybe some?]]]]]])

(def CacheStrategyAPI
  "Schema for a caching strategy for the API"
  (drop-internal-fields CacheStrategy))

(defn row->config
  "Transform from how cache config is stored to how it's used/exposed in the API"
  [row]
  {:model    (:model row)
   :model_id (:model_id row)
   :strategy (assoc (:config row) :type (:strategy row))})

(defn config->row
  "Transform cache config from API form into db storage from"
  [{:keys [model model_id strategy]}]
  {:model    model
   :model_id model_id
   :strategy (:type strategy)
   :config   (dissoc strategy :type)})

;;; Querying DB

(defn granular-duration-hours
  "Returns the granular cache duration (in hours) for a card. On EE, this first checking whether there is a stored value
   for the card, dashboard, or database (in that order of decreasing preference). Returns nil on OSS."
  [card dashboard-id]
  (or (:cache_ttl card)
      (when dashboard-id
        (:cache_ttl (t2/select-one [:model/Dashboard :cache_ttl] :id dashboard-id)))
      (:cache_ttl (t2/select-one [:model/Database :cache_ttl] :id (:database_id card)))))

(defenterprise-schema granular-cache-strategy :- [:maybe CacheStrategy]
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
        (cond-> (:strategy (row->config item))
          (:last_expired_at item) (assoc :last-expired-at (:last_expired_at item)))
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
  (if-not (and (:duration strategy) (:unit strategy))
    (log/debugf "Caching strategy %s should have :duration and :unit" (pr-str strategy))
    (let [duration  (t/duration (:duration strategy) (keyword (:unit strategy)))
          timestamp (t/minus (t/offset-date-time) duration)]
      (backend.db/prepare-statement conn query-hash timestamp))))

(defmethod fetch-cache-stmt-ee* :schedule [{:keys [last-expired-at] :as strategy} query-hash conn]
  (if-not last-expired-at
    (log/debugf "Caching strategy %s was not run yet" (pr-str strategy))
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
