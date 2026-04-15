(ns metabase.metabot.usage
  "LLM usage logging and limit enforcement.

  Logging: [[log-ai-usage!]] records each LLM call to the `ai_usage_log` table (EE only).

  Limit checking: [[check-usage-limits!]] checks instance, tenant, and user limits.
  In OSS, no limits are enforced and no usage is logged."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.metabot.provider-util :as provider-util]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.premium-features.core :as premium-features :refer [defenterprise defenterprise-schema]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
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

(defn- meter-value
  [meters meter-key]
  (some-> meter-key keyword meters))

(defn- default-metabase-meter-key
  []
  (some-> metabot.settings/default-metabase-llm-metabot-provider
          provider-util/strip-metabase-prefix
          u/qualified-name
          (str/replace-first "/" ":")
          (str ":tokens")))

(defn- meter-entry
  [token-status]
  (let [meters      (:meters token-status)
        default-key (default-metabase-meter-key)]
    (meter-value meters default-key)))

(defn- managed-free-limit-reached?
  [token-status]
  (some-> (meter-entry token-status)
          :is-locked))

(defn check-metabase-managed-free-limit!
  "Return the free-trial lock message when the managed Metabase provider is locked."
  []
  (api/check (not (and
                   (provider-util/metabase-provider? (metabot.settings/llm-metabot-provider))
                   (some-> (premium-features/token-status) managed-free-limit-reached?)))
             [402 {:message    (tru "You''ve used all of your included AI service tokens. To keep using AI features, end your trial early and start your subscription, or add your own AI provider API key.")
                   :error-code "metabase-ai-managed-locked"}]))
