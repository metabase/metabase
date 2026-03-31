(ns metabase.metabot.limits
  "LLM usage logging and limit enforcement.

  Logging: [[log-ai-usage!]] records each LLM call to the `ai_usage_log` table.

  Limits are checked at three levels (in order):
  1. Instance-wide: `metabot_instance_limit` where `tenant_id IS NULL`
  2. Tenant: `metabot_instance_limit` where `tenant_id` matches the current user's tenant
  3. User: max `max_usage` across `metabot_group_limit` for all groups the user belongs to

  Results are cached per scope key for 5 minutes to limit database hits."
  (:require
   [clojure.core.memoize :as memoize]
   [metabase.api.common :as api]
   [metabase.metabot.models.metabot-group-limit :as group-limit]
   [metabase.metabot.models.metabot-instance-limit :as instance-limit]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.users.models.user :as user]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.time LocalDate YearMonth ZoneOffset)))

(set! *warn-on-reflection* true)

(mu/defn log-ai-usage!
  "Record an LLM API call in the ai_usage_log table. Uses api/*current-user-id* for user-id and tenant-id if not provided."
  [{:keys [source model prompt-tokens completion-tokens
           user-id tenant-id conversation-id profile-id request-id]}
   :- [:map
       [:source            :string]
       [:model             :string]
       [:prompt-tokens     [:int {:min 0}]]
       [:completion-tokens [:int {:min 0}]]
       [:user-id           {:optional true} [:maybe ms/PositiveInt]]
       [:tenant-id         {:optional true} [:maybe ms/PositiveInt]]
       [:conversation-id   {:optional true} [:maybe :string]]
       [:profile-id        {:optional true} [:maybe :keyword]]
       [:request-id        {:optional true} [:maybe :string]]]]
  (when-not (= "user-intent-classification" source)
    (try
      (let [total-tokens (+ prompt-tokens completion-tokens)]
        (t2/insert! :model/AiUsageLog
                    {:source            source
                     :model             model
                     :prompt_tokens     prompt-tokens
                     :completion_tokens completion-tokens
                     :total_tokens      total-tokens
                     :user_id           (or user-id api/*current-user-id*)
                     :tenant_id         (or tenant-id (some-> api/*current-user* deref :tenant_id))
                     :conversation_id   conversation-id
                     :profile_id        (some-> profile-id name)
                     :request_id        request-id}))
      (catch Exception e
        (log/warn e "Failed to log LLM usage to ai_usage_log")))))

(defn- period-start
  "Return the start of the current billing period as an Instant, based on the reset rate setting."
  []
  (let [rate (metabot.settings/metabot-limit-reset-rate)
        today (LocalDate/now (ZoneOffset/UTC))]
    (case rate
      :monthly (.toInstant (.atStartOfDay (.atDay (YearMonth/from today) 1)) ZoneOffset/UTC)
      ;; default to monthly
      (.toInstant (.atStartOfDay (.atDay (YearMonth/from today) 1)) ZoneOffset/UTC))))

(defn- usage-query
  "Query ai_usage_log for current-period usage. `where-clauses` are additional HoneySQL where conditions.
  Returns a token sum or row count depending on `metabot-limit-type`."
  [where-clauses]
  (let [limit-type (metabot.settings/metabot-limit-type)
        start      (period-start)
        base-where [:and
                    [:>= :created_at start]]
        full-where (if (seq where-clauses)
                     (into base-where where-clauses)
                     base-where)]
    (case limit-type
      :tokens
      (or (:sum (t2/query-one {:select [[[:sum :total_tokens] :sum]]
                               :from   [:ai_usage_log]
                               :where  full-where}))
          0)

      :conversations
      (or (:cnt (t2/query-one {:select [[[:count :*] :cnt]]
                               :from   [:ai_usage_log]
                               :where  full-where}))
          0)

      ;; default to tokens
      (or (:sum (t2/query-one {:select [[[:sum :total_tokens] :sum]]
                               :from   [:ai_usage_log]
                               :where  full-where}))
          0))))

(defn- check-instance-limit
  "Check the instance-wide limit. Returns an error message string if exceeded, nil otherwise."
  []
  (when-let [{:keys [max_usage]} (instance-limit/instance-limit nil)]
    (let [usage (usage-query [])]
      (when (>= usage max_usage)
        (str "This Metabase instance has reached its AI usage limit for the current period. "
             "Please contact your administrator.")))))

(defn- check-tenant-limit
  "Check the tenant-level limit. Returns an error message string if exceeded, nil otherwise."
  [tenant-id]
  (when tenant-id
    (when-let [{:keys [max_usage]} (instance-limit/instance-limit tenant-id)]
      (let [usage (usage-query [[:= :tenant_id tenant-id]])]
        (when (>= usage max_usage)
          (str "Your organization has reached its AI usage limit for the current period. "
               "Please contact your administrator."))))))

(defn- user-group-max-limit
  "Find the maximum max_usage across all group limits for groups the user belongs to.
  Returns nil if the user has no group limits configured."
  [user-id]
  (when-let [group-ids (seq (user/group-ids user-id))]
    (let [limits (keep (fn [gid]
                         (:max_usage (group-limit/group-limit gid)))
                       group-ids)]
      (when (seq limits)
        (apply max limits)))))

(defn- check-user-limit
  "Check the user-level limit (max across all their groups). Returns an error message if exceeded, nil otherwise."
  [user-id]
  (when user-id
    (when-let [max-usage (user-group-max-limit user-id)]
      (let [usage (usage-query [[:= :user_id user-id]])]
        (when (>= usage max-usage)
          (str "You have reached your AI usage limit for the current period. "
               "Please contact your administrator."))))))

(def ^:private ^:const cache-ttl-ms
  "Cache TTL in milliseconds (5 minutes)."
  (* 5 60 1000))

(def ^:private check-instance-limit*
  (memoize/ttl
   (fn [_cache-key] (check-instance-limit))
   :ttl/threshold cache-ttl-ms))

(def ^:private check-tenant-limit*
  (memoize/ttl
   (fn [_cache-key tenant-id] (check-tenant-limit tenant-id))
   :ttl/threshold cache-ttl-ms))

(def ^:private check-user-limit*
  (memoize/ttl
   (fn [_cache-key user-id] (check-user-limit user-id))
   :ttl/threshold cache-ttl-ms))

(defn clear-cache!
  "Clear all cached limit check results. Useful for tests."
  []
  (memoize/memo-clear! check-instance-limit*)
  (memoize/memo-clear! check-tenant-limit*)
  (memoize/memo-clear! check-user-limit*))

(defn check-usage-limits!
  "Check all usage limits for the current user. Returns nil if all limits are within bounds,
  or a user-friendly error message string if any limit is exceeded.

  Results are cached for 5 minutes per scope (instance, tenant, user)."
  []
  (let [user-id   api/*current-user-id*
        tenant-id (some-> api/*current-user* deref :tenant_id)]
    (or (check-instance-limit* :instance)
        (check-tenant-limit* tenant-id tenant-id)
        (check-user-limit* user-id user-id))))
