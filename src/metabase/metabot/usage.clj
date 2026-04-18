(ns metabase.metabot.usage
  "LLM usage logging.

  [[log-ai-usage!]] records each LLM call to the `ai_usage_log` table (EE only).
  In OSS, no usage is logged."
  (:require
   [metabase.premium-features.core :refer [defenterprise-schema]]
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
   [:request-id        {:optional true} [:maybe :string]]])

(defenterprise-schema log-ai-usage! :- :any
  "Record an LLM API call in the ai_usage_log table.
  In OSS, this is a no-op."
  metabase-enterprise.metabot.usage
  [_usage-map :- usage-map-schema]
  nil)
