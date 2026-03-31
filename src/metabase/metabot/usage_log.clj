(ns metabase.metabot.usage-log
  "Functions for logging LLM usage to the ai_usage_log table."
  (:require
   [metabase.api.common :as api]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

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
