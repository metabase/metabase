(ns metabase.metabot.schema
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::role
  [:enum
   {:encode/api-request u/->snake_case_en
    :decode/api-response keyword}
   :system :user :assistant :tool])

(mr/def ::message
  [:map
   [:role                          ::role]
   [:content    {:optional true}   [:maybe :string]]
   [:tool_calls {:optional true}   [:maybe [:vector [:map
                                                     [:id :string]
                                                     [:name :string]
                                                     [:arguments :string]]]]]
   [:tool_call_id {:optional true} [:maybe :string]]])

(mr/def ::messages
  [:sequential ::message])

(mr/def ::state-map-key
  "A dynamic state-map key, normalized to its canonical string representation."
  [:or {:decode/normalize lib.schema.common/normalize-string-key}
   :string
   :keyword])

(mr/def ::state
  [:map
   [:queries {:optional true} [:map-of ::state-map-key :map]]
   [:charts {:optional true} [:map-of ::state-map-key :map]]
   [:dashboards {:optional true} [:map-of ::state-map-key :map]]
   [:chart-configs {:optional true} [:map-of ::state-map-key :map]]
   [:todos {:optional true} [:sequential :map]]
   [:transforms {:optional true} [:map-of ::state-map-key :map]]
   [:link-registry {:optional true} [:map-of ::state-map-key :string]]])

(defn normalize-state
  "Normalize dynamic state-map keys to strings according to [[::state]]."
  [state]
  (mc/decode ::state state (mtx/transformer {:name :normalize})))

;;; ------------------------------- Client message shape -------------------------------

(mr/def ::client-message-part
  "One part of a persisted message: its a text, tool call, or data blob."
  [:multi {:dispatch :type}
   ["text"
    [:map
     [:id      :string]
     [:role    [:enum "user" "agent"]]
     [:type    [:= "text"]]
     [:message :string]]]
   ["tool_call"
    [:map
     [:id       :string]
     [:role     [:= "agent"]]
     [:type     [:= "tool_call"]]
     [:name     :string]
     [:args     [:maybe :string]]
     [:status   [:enum "started" "ended"]]
     ;; both can be absent if a call is unresolved  and
     ;; conversation is loaded while agent loop is still running
     [:result   {:optional true} [:maybe :string]]
     [:is_error {:optional true} :boolean]]]
   ["data_part"
    [:map
     [:id   :string]
     [:role [:= "agent"]]
     [:type [:= "data_part"]]
     [:part [:map
             [:type :string]
             [:data :any]]]]]])

(mr/def ::client-message-status
  "Where a message's turn got to."
  [:multi {:dispatch :type}
   ["done" [:map [:type [:= "done"]]]]
   ["aborted" [:map [:type [:= "aborted"]]]]
   ["in_progress" [:map [:type [:= "in_progress"]]]]
   ["errored"
    [:map
     [:type  [:= "errored"]]
     ;; the decoded `error` column, or its raw text when it isn't JSON
     [:error [:or
              :string
              [:map
               [:message {:optional true} [:maybe :string]]
               [:type    {:optional true} :string]
               [:data    {:optional true} :any]]]]]]])

(mr/def ::client-message
  "One persisted message as the client models it."
  [:map
   [:id            :string]
   [:externalId    {:optional true} :string]
   [:role          [:enum "user" "agent"]]
   [:parts         [:sequential ::client-message-part]]
   [:status        ::client-message-status]
   ;; how much of the window the conversation occupied once this message was
   ;; produced; absent on all user rows and legacy agent records
   [:contextTokens {:optional true} :int]])

(mr/def ::ai-usage-log
  "A AiUsageLog as selected from the app DB: every column of `:ai_usage_log`."
  [:map {:closed true}
   [:id                    ms/PositiveInt]
   [:created_at            ms/TemporalInstant]
   [:source                [:or :keyword :string]]
   [:model                 [:or :keyword :string]]
   [:prompt_tokens         :int]
   [:completion_tokens     :int]
   [:total_tokens          :int]
   [:user_id               [:maybe ::lib.schema.id/user]]
   [:tenant_id             [:maybe ms/PositiveInt]]
   [:conversation_id       [:maybe :string]]
   [:profile_id            [:maybe :string]]
   [:request_id            [:maybe :string]]
   [:ai_proxied            [:maybe :boolean]]
   [:cache_creation_tokens [:maybe :int]]
   [:cache_read_tokens     [:maybe :int]]])

(mr/def ::ai-usage-log.update
  "What an update (or insert) of a AiUsageLog accepts: every column of `:ai_usage_log` except `id`, all optional."
  [:map {:closed true}
   [:created_at            {:optional true} [:maybe ms/TemporalInstant]]
   [:source                {:optional true} [:maybe [:or :keyword :string]]]
   [:model                 {:optional true} [:maybe [:or :keyword :string]]]
   [:prompt_tokens         {:optional true} [:maybe :int]]
   [:completion_tokens     {:optional true} [:maybe :int]]
   [:total_tokens          {:optional true} [:maybe :int]]
   [:user_id               {:optional true} [:maybe ::lib.schema.id/user]]
   [:tenant_id             {:optional true} [:maybe ms/PositiveInt]]
   [:conversation_id       {:optional true} [:maybe :string]]
   [:profile_id            {:optional true} [:maybe :string]]
   [:request_id            {:optional true} [:maybe :string]]
   [:ai_proxied            {:optional true} [:maybe :boolean]]
   [:cache_creation_tokens {:optional true} [:maybe :int]]
   [:cache_read_tokens     {:optional true} [:maybe :int]]])

(mr/def ::metabot
  "A Metabot as selected from the app DB: every column of `:metabot`."
  [:map {:closed true}
   [:id                   ms/PositiveInt]
   [:name                 :string]
   [:description          [:maybe :string]]
   [:entity_id            :string]
   [:created_at           ms/TemporalInstant]
   [:updated_at           ms/TemporalInstant]
   [:use_verified_content [:maybe :boolean]]
   [:collection_id        [:maybe ::lib.schema.id/collection]]])

(mr/def ::metabot.update
  "What an update (or insert) of a Metabot accepts: every column of `:metabot` except `id`, all optional."
  [:map {:closed true}
   [:name                 {:optional true} [:maybe :string]]
   [:description          {:optional true} [:maybe :string]]
   [:entity_id            {:optional true} [:maybe :string]]
   [:created_at           {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at           {:optional true} [:maybe ms/TemporalInstant]]
   [:use_verified_content {:optional true} [:maybe :boolean]]
   [:collection_id        {:optional true} [:maybe ::lib.schema.id/collection]]])

(mr/def ::metabot-conversation
  "A MetabotConversation as selected from the app DB: every column of `:metabot_conversation`."
  [:map {:closed true}
   [:id                          :string]
   [:created_at                  ms/TemporalInstant]
   [:user_id                     ::lib.schema.id/user]
   [:title                       [:maybe :string]]
   [:ip_address                  [:maybe :string]]
   [:slack_team_id               [:maybe :string]]
   [:slack_channel_id            [:maybe :string]]
   [:slack_thread_ts             [:maybe :string]]
   [:embedding_hostname          [:maybe :string]]
   [:embedding_path              [:maybe :string]]
   [:user_agent                  [:maybe :string]]
   [:sanitized_user_agent        [:maybe :string]]
   [:forked_from_conversation_id [:maybe :string]]])

(mr/def ::metabot-conversation.update
  "What an update (or insert) of a MetabotConversation accepts: every column of `:metabot_conversation` except `id`, all optional."
  [:map {:closed true}
   [:created_at                  {:optional true} [:maybe ms/TemporalInstant]]
   [:user_id                     {:optional true} [:maybe ::lib.schema.id/user]]
   [:title                       {:optional true} [:maybe :string]]
   [:ip_address                  {:optional true} [:maybe :string]]
   [:slack_team_id               {:optional true} [:maybe :string]]
   [:slack_channel_id            {:optional true} [:maybe :string]]
   [:slack_thread_ts             {:optional true} [:maybe :string]]
   [:embedding_hostname          {:optional true} [:maybe :string]]
   [:embedding_path              {:optional true} [:maybe :string]]
   [:user_agent                  {:optional true} [:maybe :string]]
   [:sanitized_user_agent        {:optional true} [:maybe :string]]
   [:forked_from_conversation_id {:optional true} [:maybe :string]]])

(mr/def ::metabot-feedback
  "A MetabotFeedback as selected from the app DB: every column of `:metabot_feedback`."
  [:map {:closed true}
   [:message_id        ms/PositiveInt]
   [:positive          :boolean]
   [:issue_type        [:maybe [:or :keyword :string]]]
   [:freeform_feedback [:maybe :string]]
   [:created_at        ms/TemporalInstant]
   [:updated_at        ms/TemporalInstant]
   [:id                ms/PositiveInt]
   [:user_id           ::lib.schema.id/user]])

(mr/def ::metabot-feedback.update
  "What an update (or insert) of a MetabotFeedback accepts: every column of `:metabot_feedback` except `id`, all optional."
  [:map {:closed true}
   [:message_id        {:optional true} [:maybe ms/PositiveInt]]
   [:positive          {:optional true} [:maybe :boolean]]
   [:issue_type        {:optional true} [:maybe [:or :keyword :string]]]
   [:freeform_feedback {:optional true} [:maybe :string]]
   [:created_at        {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at        {:optional true} [:maybe ms/TemporalInstant]]
   [:user_id           {:optional true} [:maybe ::lib.schema.id/user]]])

(mr/def ::metabot-message.data-part
  "One entry of the `:data` column of a MetabotMessage, decoded."
  :map)

(mr/def ::metabot-message.usage
  "The `:usage` column of a MetabotMessage, decoded."
  :map)

(mr/def ::metabot-message.state
  "The `:state` column of a MetabotMessage, decoded."
  :map)

(mr/def ::metabot-message
  "A MetabotMessage as selected from the app DB: every column of `:metabot_message`."
  [:map {:closed true}
   [:id                     ms/PositiveInt]
   [:created_at             ms/TemporalInstant]
   [:profile_id             :string]
   [:role                   [:or :keyword :string]]
   [:data                   [:sequential ::metabot-message.data-part]]
   [:usage                  [:maybe ::metabot-message.usage]]
   [:total_tokens           :int]
   [:conversation_id        :string]
   [:slack_msg_id           [:maybe :string]]
   [:channel_id             [:maybe :string]]
   [:deleted_at             [:maybe ms/TemporalInstant]]
   [:deleted_by_user_id     [:maybe ::lib.schema.id/user]]
   [:user_id                [:maybe ::lib.schema.id/user]]
   [:ai_proxied             [:maybe :boolean]]
   [:external_id            [:maybe :string]]
   [:finished               [:maybe :boolean]]
   [:error                  [:maybe :string]]
   [:data_version           :int]
   [:state                  [:maybe ::metabot-message.state]]
   [:forked_from_message_id [:maybe ms/PositiveInt]]
   [:context_tokens         [:maybe :int]]])

(mr/def ::metabot-message.update
  "What an update (or insert) of a MetabotMessage accepts: every column of `:metabot_message` except `id`, all optional."
  [:map {:closed true}
   [:created_at             {:optional true} [:maybe ms/TemporalInstant]]
   [:profile_id             {:optional true} [:maybe :string]]
   [:role                   {:optional true} [:maybe [:or :keyword :string]]]
   [:data                   {:optional true} [:maybe [:sequential ::metabot-message.data-part]]]
   [:usage                  {:optional true} [:maybe ::metabot-message.usage]]
   [:total_tokens           {:optional true} [:maybe :int]]
   [:conversation_id        {:optional true} [:maybe :string]]
   [:slack_msg_id           {:optional true} [:maybe :string]]
   [:channel_id             {:optional true} [:maybe :string]]
   [:deleted_at             {:optional true} [:maybe ms/TemporalInstant]]
   [:deleted_by_user_id     {:optional true} [:maybe ::lib.schema.id/user]]
   [:user_id                {:optional true} [:maybe ::lib.schema.id/user]]
   [:ai_proxied             {:optional true} [:maybe :boolean]]
   [:external_id            {:optional true} [:maybe :string]]
   [:finished               {:optional true} [:maybe :boolean]]
   [:error                  {:optional true} [:maybe :string]]
   [:data_version           {:optional true} [:maybe :int]]
   [:state                  {:optional true} [:maybe ::metabot-message.state]]
   [:forked_from_message_id {:optional true} [:maybe ms/PositiveInt]]
   [:context_tokens         {:optional true} [:maybe :int]]])

(mr/def ::metabot-prompt
  "A MetabotPrompt as selected from the app DB: every column of `:metabot_prompt`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:model      [:or :keyword :string]]
   [:card_id    ::lib.schema.id/card]
   [:entity_id  :string]
   [:prompt     :string]
   [:created_at ms/TemporalInstant]
   [:updated_at ms/TemporalInstant]
   [:metabot_id ms/PositiveInt]])

(mr/def ::metabot-prompt.update
  "What an update (or insert) of a MetabotPrompt accepts: every column of `:metabot_prompt` except `id`, all optional."
  [:map {:closed true}
   [:model      {:optional true} [:maybe [:or :keyword :string]]]
   [:card_id    {:optional true} [:maybe ::lib.schema.id/card]]
   [:entity_id  {:optional true} [:maybe :string]]
   [:prompt     {:optional true} [:maybe :string]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at {:optional true} [:maybe ms/TemporalInstant]]
   [:metabot_id {:optional true} [:maybe ms/PositiveInt]]])

(mr/def ::metabot-source-feedback
  "A MetabotSourceFeedback as selected from the app DB: every column of `:metabot_source_feedback`."
  [:map {:closed true}
   [:id          ms/PositiveInt]
   [:message_id  ms/PositiveInt]
   [:user_id     ::lib.schema.id/user]
   [:source_id   ms/PositiveInt]
   [:source_type [:or :keyword :string]]
   [:positive    :boolean]
   [:created_at  ms/TemporalInstant]
   [:updated_at  ms/TemporalInstant]])

(mr/def ::metabot-source-feedback.update
  "What an update (or insert) of a MetabotSourceFeedback accepts: every column of `:metabot_source_feedback` except `id`, all optional."
  [:map {:closed true}
   [:message_id  {:optional true} [:maybe ms/PositiveInt]]
   [:user_id     {:optional true} [:maybe ::lib.schema.id/user]]
   [:source_id   {:optional true} [:maybe ms/PositiveInt]]
   [:source_type {:optional true} [:maybe [:or :keyword :string]]]
   [:positive    {:optional true} [:maybe :boolean]]
   [:created_at  {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at  {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::metabot-used-table
  "A MetabotUsedTable as selected from the app DB: every column of `:metabot_used_table`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:message_id ms/PositiveInt]
   [:table_id   ::lib.schema.id/table]
   [:created_at ms/TemporalInstant]])

(mr/def ::metabot-used-table.update
  "What an update (or insert) of a MetabotUsedTable accepts: every column of `:metabot_used_table` except `id`, all optional."
  [:map {:closed true}
   [:message_id {:optional true} [:maybe ms/PositiveInt]]
   [:table_id   {:optional true} [:maybe ::lib.schema.id/table]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]])
