(ns metabase.metabot.usage
  "LLM usage logging and limit enforcement.

  Logging: [[log-ai-usage!]] records each LLM call to the `ai_usage_log` table (EE only).

  Limit checking: [[check-usage-limits!]] checks instance, tenant, and user limits.
  In OSS, no limits are enforced and no usage is logged."
  (:require
   [metabase.premium-features.core :refer [defenterprise defenterprise-schema]]
   [metabase.util.malli.schema :as ms]))

(def ^:private usage-map-schema
  [:map
   [:source            :string]
   [:model             :string]
   [:prompt-tokens     [:int {:min 0}]]
   [:completion-tokens [:int {:min 0}]]
   [:user-id           {:optional true} [:maybe ms/PositiveInt]]
   [:tenant-id         {:optional true} [:maybe ms/PositiveInt]]
   [:conversation-id   {:optional true} [:maybe :string]]
   [:profile-id        {:optional true} [:maybe :keyword]]
   [:request-id        {:optional true} [:maybe :string]]
   [:ai-proxied        {:optional true} [:maybe :boolean]]])

(defenterprise-schema log-ai-usage! :- :any
  "Record an LLM API call in the ai_usage_log table.
  In OSS, this is a no-op."
  metabase-enterprise.metabot.usage
  [_usage-map :- usage-map-schema]
  nil)

(defenterprise check-usage-limits!
  "Check all usage limits for the current user. Returns nil if all limits are within bounds,
  or a user-friendly error message string if any limit is exceeded.

  In OSS, always returns nil (no limits enforced)."
  metabase-enterprise.metabot.usage
  []
  nil)
