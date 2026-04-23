(ns metabase-enterprise.metabot.usage
  "Enterprise implementation of metabot usage logging and limit checking."
  (:require
   [clojure.core.memoize :as memoize]
   [metabase-enterprise.metabot.models.metabot-group-limit :as group-limit]
   [metabase-enterprise.metabot.models.metabot-instance-limit :as instance-limit]
   [metabase-enterprise.metabot.settings :as metabot.settings]
   [metabase.api.common :as api]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time DayOfWeek LocalDate YearMonth ZoneOffset)
   (java.time.temporal TemporalAdjusters)))

(set! *warn-on-reflection* true)

(defenterprise log-ai-usage!
  "Record an LLM API call in the ai_usage_log table."
  :feature :none
  [{:keys [source model prompt-tokens completion-tokens cache-creation-tokens cache-read-tokens
           user-id tenant-id conversation-id profile-id request-id ai-proxied]}]
  (when-not (= "user-intent-classification" source)
    (try
      (let [cache-creation (or cache-creation-tokens 0)
            cache-read     (or cache-read-tokens 0)
            total-tokens   (+ prompt-tokens completion-tokens)]
        (t2/insert! :model/AiUsageLog
                    {:source                 source
                     :model                  model
                     :prompt_tokens          prompt-tokens
                     :completion_tokens      completion-tokens
                     :total_tokens           total-tokens
                     :cache_creation_tokens  cache-creation
                     :cache_read_tokens      cache-read
                     :user_id                (or user-id api/*current-user-id*)
                     :tenant_id              (or tenant-id (some-> api/*current-user* deref :tenant_id))
                     :conversation_id        conversation-id
                     :profile_id             (some-> profile-id name)
                     :request_id             request-id
                     :ai_proxied             ai-proxied}))
      (catch Exception e
        (log/warn e "Failed to log LLM usage to ai_usage_log")))))

(defn- period-start
  "Return the start of the current billing period as an Instant, based on the reset rate setting."
  []
  (let [rate  (metabot.settings/metabot-limit-reset-rate)
        today (LocalDate/now ZoneOffset/UTC)]
    (.toInstant
     (.atStartOfDay
      (case rate
        :daily   today
        :weekly  (.with today (TemporalAdjusters/previousOrSame DayOfWeek/MONDAY))
        :monthly (.atDay (YearMonth/from today) 1)))
     ZoneOffset/UTC)))

(defn- usage-query
  "Query ai_usage_log for current-period usage. `where-clauses` are additional HoneySQL where conditions.
  Returns a token sum or row count depending on `metabot-limit-unit`."
  [where-clauses]
  (let [limit-type (metabot.settings/metabot-limit-unit)
        start      (period-start)
        base-where [:and
                    [:>= :created_at start]]
        full-where (if (seq where-clauses)
                     (into base-where where-clauses)
                     base-where)]
    (case limit-type
      :tokens
      (quot (or (:sum (t2/query-one {:select [[[:sum :total_tokens] :sum]]
                                     :from   [:ai_usage_log]
                                     :where  full-where}))
                0)
            1000000)

      :messages
      (:cnt (t2/query-one {:select [[[:count :*] :cnt]]
                           :from   [:ai_usage_log]
                           :where  full-where})))))

(defn- check-instance-limit
  "Check the instance-wide limit. Returns an error message string if exceeded, nil otherwise."
  []
  (when-let [max-usage (:max_usage (instance-limit/instance-limit nil))]
    (let [usage (usage-query [])]
      (when (>= usage max-usage)
        (metabot.settings/metabot-quota-reached-message)))))

(defn- check-tenant-limit
  "Check the tenant-level limit. Returns an error message string if exceeded, nil otherwise."
  [tenant-id]
  (when tenant-id
    (when-let [max-usage (:max_usage (instance-limit/instance-limit tenant-id))]
      (let [usage (usage-query [[:= :tenant_id tenant-id]])]
        (when (>= usage max-usage)
          (metabot.settings/metabot-quota-reached-message))))))

(defn- check-user-limit
  "Check the user-level limit (max across all their groups). Returns an error message if exceeded, nil otherwise."
  [user-id]
  (when user-id
    (when-let [max-usage (group-limit/limit-for-user user-id)]
      (let [usage (usage-query [[:= :user_id user-id]])]
        (when (>= usage max-usage)
          (metabot.settings/metabot-quota-reached-message))))))

(def ^:private ^:const cache-ttl-ms
  "Cache TTL in milliseconds."
  (* 10 1000))

(def ^:private check-instance-limit*
  (memoize/ttl
   (fn [_cache-key] (check-instance-limit))
   :ttl/threshold cache-ttl-ms))

(def ^:private check-tenant-limit*
  (memoize/ttl
   check-tenant-limit
   :ttl/threshold cache-ttl-ms))

(def ^:private check-user-limit*
  (memoize/ttl
   check-user-limit
   :ttl/threshold cache-ttl-ms))

(defn clear-limit-cache!
  "Clear all cached limit check results. Useful for tests."
  []
  (memoize/memo-clear! check-instance-limit*)
  (memoize/memo-clear! check-tenant-limit*)
  (memoize/memo-clear! check-user-limit*))

(defenterprise clear-metabot-limit-cache!
  "EE implementation: clears the memoized limit-check results so they re-evaluate immediately."
  :feature :none
  []
  (clear-limit-cache!))

(defenterprise check-usage-limits!
  "Check all usage limits for the current user. Returns nil if all limits are within bounds,
  or a user-friendly error message string if any limit is exceeded.

  Results are cached for `cache-ttl-ms`."
  :feature :none
  []
  (let [user-id   api/*current-user-id*
        tenant-id (some-> api/*current-user* deref :tenant_id)]
    (or (check-instance-limit* :instance)
        (check-tenant-limit* tenant-id)
        (check-user-limit* user-id))))
