(ns metabase-enterprise.metabot.usage
  "Enterprise implementation of metabot usage logging."
  (:require
   [metabase.api.common :as api]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defenterprise log-ai-usage!
  "Record an LLM API call in the ai_usage_log table."
  :feature :none
  [{:keys [source model prompt-tokens completion-tokens
           user-id tenant-id conversation-id profile-id request-id ai-proxied]}]
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
                     :request_id        request-id
                     :ai_proxied        ai-proxied}))
      (catch Exception e
        (log/warn e "Failed to log LLM usage to ai_usage_log")))))
