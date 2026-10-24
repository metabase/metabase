(ns metabase-enterprise.metabot.usage
  "Enterprise implementation of metabot usage logging and limit checking."
  (:require
   [clojure.core.memoize :as memoize]
   [metabase-enterprise.metabot.db :as metabot.db]
   [metabase-enterprise.metabot.models.metabot-group-limit :as group-limit]
   [metabase-enterprise.metabot.models.metabot-instance-limit :as instance-limit]
   [metabase-enterprise.metabot.settings :as metabot.settings]
   [metabase.api.common :as api]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log])
  (:import
   (java.time DayOfWeek LocalDate YearMonth ZoneOffset)
   (java.time.temporal TemporalAdjusters)))

(set! *warn-on-reflection* true)

;; Keep these in sync with the CASE branches in the LATEST version of:
;;   resources/migrations/instance_analytics_views/ai_usage_log/v6/{h2,mysql,postgres}-ai_usage_log.sql
;;   resources/migrations/instance_analytics_views/metabot_conversations/v8/{h2,mysql,postgres}-metabot_conversations.sql
;; When adding a value here, create a new view version (vN+1) with the extra CASE branches plus a migration
;; that reinstalls the views, so users see a nicer name in ai analytics. Parity is enforced by
;; `metabase-enterprise.metabot.usage-test/known-sources-and-profiles-have-view-case-branches-test`.
(def ^:private known-sources
  #{"metabot_agent"
    "contextual_interestingness"
    "conversation_title"
    "document_generate_content"
    "example_question_generation_batch"
    "exploration"
    "slack"
    "slackbot"
    "oss-sql-gen"
    "sql-gen"
    "unknown"
    "user-intent-classification"})

(def ^:private known-profile-ids
  #{"internal"
    "embedding_next"
    "explorations"
    "nlq"
    "sql"
    "slackbot"
    "transforms_codegen"
    "document-generate-content"})

(defenterprise valid-usage-profile-id
  "Return `profile-id` when it can be persisted to `ai_usage_log`, otherwise nil."
  :feature :none
  [profile-id]
  (when (contains? known-profile-ids (some-> profile-id name))
    profile-id))

(defenterprise log-ai-usage!
  "Record an LLM API call in the ai_usage_log table."
  :feature :none
  [{:keys [source model provider model-name prompt-tokens completion-tokens cache-creation-tokens
           cache-read-tokens user-id tenant-id conversation-id profile-id request-id ai-proxied]}]
  (when-not (contains? known-sources source)
    (throw (ex-info (str "Unknown ai_usage_log source " (pr-str source))
                    {:source source})))
  (when-let [pid (some-> profile-id name)]
    (when-not (contains? known-profile-ids pid)
      (throw (ex-info (str "Unknown ai_usage_log profile-id " (pr-str pid))
                      {:profile-id pid}))))
  (when-not (= "user-intent-classification" source)
    (try
      (let [cache-creation (or cache-creation-tokens 0)
            cache-read     (or cache-read-tokens 0)
            total-tokens   (+ prompt-tokens completion-tokens)]
        (metabot.db/insert-usage-log!
         {:source                 source
          :model                  model
          :provider               provider
          :model_name             model-name
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
        (log/warnf "Failed to log LLM usage to ai_usage_log: %s" (ex-message e))))))

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
  "Current-period usage, narrowed by the optional `user-id` and `tenant-id`. Depending on `metabot-limit-unit`,
  the millions of tokens logged in `ai_usage_log`, or the user messages sent to Metabot: `metabot_message` rows with
  role `user`, one per turn however many LLM calls the turn made."
  [& {:keys [user-id tenant-id]}]
  (let [limit-type (metabot.settings/metabot-limit-unit)
        start      (period-start)]
    (case limit-type
      :tokens
      (quot (or (:sum (metabot.db/usage-token-sum start user-id tenant-id))
                0)
            1000000)

      :messages
      (:cnt (metabot.db/usage-message-count start user-id tenant-id)))))

(defn- over-limit?
  "Whether `usage` leaves no room for the caller. A token limit is checked before the LLM call that would add to it,
  so usage at the limit blocks. A message limit counts the persisted user messages; `pending` is 1 for a message a
  turn is about to persist, which blocks at the limit, and 0 for an LLM call on behalf of a message already counted,
  which blocks only beyond the limit. A limit of 2 allows two messages and the LLM calls they make."
  [usage max-usage pending]
  (case (metabot.settings/metabot-limit-unit)
    :messages (> (+ usage pending) max-usage)
    :tokens   (>= usage max-usage)))

(defn- check-instance-limit
  "Check the instance-wide limit. Returns an error message string if exceeded, nil otherwise."
  [pending]
  (when-let [max-usage (:max_usage (instance-limit/instance-limit nil))]
    (let [usage (usage-query)]
      (when (over-limit? usage max-usage pending)
        (metabot.settings/metabot-quota-reached-message)))))

(defn- check-tenant-limit
  "Check the tenant-level limit. Returns an error message string if exceeded, nil otherwise."
  [tenant-id pending]
  (when tenant-id
    (when-let [max-usage (:max_usage (instance-limit/instance-limit tenant-id))]
      (let [usage (usage-query :tenant-id tenant-id)]
        (when (over-limit? usage max-usage pending)
          (metabot.settings/metabot-quota-reached-message))))))

(defn- check-user-limit
  "Check the user-level limit (max across all their groups). Returns an error message if exceeded, nil otherwise."
  [user-id pending]
  (when user-id
    (when-let [max-usage (group-limit/limit-for-user user-id)]
      (let [usage (usage-query :user-id user-id)]
        (when (over-limit? usage max-usage pending)
          (metabot.settings/metabot-quota-reached-message))))))

(def ^:private ^:const cache-ttl-ms
  "Cache TTL in milliseconds."
  (* 10 1000))

(def ^:private check-instance-limit*
  (memoize/ttl
   check-instance-limit
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

(defn- check-limits
  "The quota message when the instance, tenant, or user limit of the current user leaves no room for `pending` more
  messages, nil otherwise. Results are cached for `cache-ttl-ms`, per `pending`."
  [pending]
  (let [user-id   api/*current-user-id*
        tenant-id (some-> api/*current-user* deref :tenant_id)]
    (or (check-instance-limit* pending)
        (check-tenant-limit* tenant-id pending)
        (check-user-limit* user-id pending))))

(defenterprise check-usage-limits!
  "Check all usage limits for an LLM call by the current user. Returns nil if all limits are within bounds,
  or a user-friendly error message string if any limit is exceeded. A message limit counts the user message the
  call runs for, which the turn persisted before the call, so only a count beyond the limit blocks.

  Results are cached for `cache-ttl-ms`."
  :feature :none
  []
  (check-limits 0))

(defenterprise check-new-message-limits!
  "Check all usage limits for one more user message from the current user, before a turn persists it. Returns nil
  when the message fits, or a user-friendly error message string when a message limit is reached. A token limit is
  checked at each LLM call instead, so the result is nil for it.

  Results are cached for `cache-ttl-ms`, apart from the [[check-usage-limits!]] results."
  :feature :none
  []
  (when (= :messages (metabot.settings/metabot-limit-unit))
    (check-limits 1)))
