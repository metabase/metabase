(ns metabase-enterprise.caching.strategies
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [malli.core :as mc]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :refer [defenterprise defenterprise-schema]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.cache-backend.db :as backend.db]
   [metabase.task :as task]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (org.quartz.spi MutableTrigger)))

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
                 [:updated_at some?]
                 [:schedule string?]]]
     [:query    [:map
                 [:type keyword?]
                 [:updated_at some?]
                 [:payload [:maybe any?]]
                 [:database_id int?]
                 [:table_id int?]
                 [:field_id int?]
                 [:aggregation [:enum "max" "count"]]
                 [:schedule string?]]]]]))

(defenterprise refreshable-states
  "States of `persisted_info` records which can be refreshed."
  :feature :cache-granular-controls
  []
  #{"creating" "persisted" "error"})

(defenterprise prunable-states
  "States of `persisted_info` records which can be pruned."
  :feature :cache-granular-controls
  []
  #{"deletable" "off"})

(defn granular-ttl
  "Returns the granular cache ttl (in seconds) for a card. On EE, this first checking whether there is a stored value
   for the card, dashboard, or database (in that order of decreasing preference). Returns nil on OSS."
  [card dashboard database]
  (let [ttls              [(:cache_ttl card) (:cache_ttl dashboard) (:cache_ttl database)]
        most-granular-ttl (first (filter some? ttls))]
    (when most-granular-ttl ; stored TTLs are in hours; convert to seconds
      (* most-granular-ttl 3600))))

(defenterprise-schema granular-cache-strategy :- CacheStrategy
  "Returns the granular cache strategy for a card."
  :feature :cache-granular-controls
  [card dashboard-id]
  (let [qs     [{:from   [:cache_config]
                 :select [:id]
                 :where  [:and [:= :model "question"]   [:= :model_id (:id card)]]}
                {:from   [:cache_config]
                 :select [:id]
                 :where  [:and [:= :model "dashboard"]  [:= :model_id dashboard-id]]}
                {:from   [:cache_config]
                 :select [:id]
                 :where  [:and [:= :model "collection"] [:= :model_id (:collection_id card)]]}
                {:from   [:cache_config]
                 :select [:id]
                 :where  [:and [:= :model "database"]   [:= :model_id (:database_id card)]]}
                {:from   [:cache_config]
                 :select [:id]
                 :where  [:= :model "root"]}]
        q      {:select [:id]
                :limit  1
                :from   [[{:union-all qs} :unused_alias]]}
        config (t2/select-one :model/CacheConfig :id q)]
    (when (public-settings/enable-query-caching)
      (if config
        (merge {:type       (:strategy config)
                :updated_at (:updated_at config)
                :payload    (:payload config)}
               (:config config))

        (if-let [ttl (granular-ttl
                      card
                      (t2/select-one [:model/Dashboard :cache_ttl] :id dashboard-id)
                      (t2/select-one [:model/Database :cache_ttl] :id (:database_id card)))]
          {:type     :duration
           :duration (int (/ ttl 3600)) ;; UI accepts hours, so it should divide cleanly
           :unit     "hours"}
          {:type         :ttl
           :multiplier   (public-settings/query-caching-ttl-ratio)
           :min_duration 50})))))

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

;; NOTE: something changes `:updated_at` to `:updated-at`
(defmethod fetch-cache-stmt-ee* :schedule [{:keys [updated-at] :as strategy} query-hash conn]
  (if-not updated-at
    (log/debugf "Caching strategy %s was never run yet" (pr-str strategy))
    (backend.db/prepare-statement conn query-hash updated-at)))

(defmethod fetch-cache-stmt-ee* :query [{:keys [updated-at] :as strategy} query-hash conn]
  (if-not updated-at
    (log/debugf "Caching strategy %s was never run yet" (pr-str strategy))
    (backend.db/prepare-statement conn query-hash updated-at)))

(defmethod fetch-cache-stmt-ee* :nocache [_ _ _]
  nil)

(defenterprise fetch-cache-stmt-ee
  "Returns prepared statement to query for db cache backend."
  :feature :cache-granular-controls
  [strategy query-hash conn]
  (fetch-cache-stmt-ee* strategy query-hash conn))

;;; Jobs

(defn- refresh-schedule-configs []
  (let [now (t/offset-date-time)]
    (doseq [item (t2/select :model/CacheConfig :strategy :schedule {:where [:or
                                                                            [:= :next_run_at nil]
                                                                            [:<= :next_run_at [:now]]]})
            :let [cron     (-> (cron/cron-schedule (-> item :config :schedule))
                               cron/finalize)
                  ;; needed by the tests, or the cron will use it's own current date
                  _        (.setStartTime ^MutableTrigger cron (t/java-date))
                  next-run (-> (.getFireTimeAfter ^MutableTrigger cron (t/java-date (t/offset-date-time)))
                               (t/offset-date-time (t/zone-offset)))]]
      (t2/update! :model/CacheConfig {:id (:id item)} {:updated_at  now
                                                       :next_run_at next-run}))))

(defn- refresh-query-configs []
  (let [now (t/offset-date-time)]
    (doseq [item (t2/select :model/CacheConfig :strategy :query {:where [:or
                                                                         [:= :next_run_at nil]
                                                                         [:<= :next_run_at [:now]]]})
            :let [config   (:config item)
                  cron     (-> (cron/cron-schedule (:schedule config))
                               cron/finalize)
                  ;; needed by the tests, or the cron will use it's own current date
                  _        (.setStartTime ^MutableTrigger cron (t/java-date))
                  next-run (-> (.getFireTimeAfter ^MutableTrigger cron (t/java-date (t/offset-date-time)))
                               (t/offset-date-time (t/zone-offset)))
                  query    {:database (:database_id config)
                            :type     :query
                            :query    {:source-table (:table_id config)
                                       :aggregation  [(:aggregation config)
                                                      [:field (:field_id config) nil]]}}
                  result   (-> (qp/process-query query) :data :rows ffirst)]]
      (when (not= result (:payload item))
        (t2/update! :model/CacheConfig {:id (:id item)} {:updated_at  now
                                                         :next_run_at next-run
                                                         :payload     result})))))

(jobs/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc                                   "Refresh 'schedule' caches"}
  Caching [_ctx]
  (refresh-schedule-configs)
  (refresh-query-configs))

(def ^:private caching-job
  (jobs/build
    (jobs/with-description "Schedule Caches refresh task")
    (jobs/of-type Caching)
    (jobs/with-identity (jobs/key "metabase-enterprise.Caching.job"))
    (jobs/store-durably)))

(defmethod task/init! ::Caching [_]
  (let [trigger (triggers/build
                  (triggers/with-identity (triggers/key "metabase-enterprise.Caching.trigger"))
                  (triggers/start-now)
                  (triggers/with-schedule
                    (cron/schedule
                      ;; run every minute
                      (cron/cron-schedule "0 * * * * ? *"))))]
    (task/schedule-task! caching-job trigger)))
