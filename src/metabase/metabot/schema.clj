(ns metabase.metabot.schema
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [malli.util :as mut]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.metabot.schema.v2 :as schema.v2]
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
  [:string {:decode/normalize lib.schema.common/normalize-string-key}])

(mr/def ::query
  "An MBQL 5 or legacy query in any state of normalization, as it round-trips through tool-call JSON or persisted turn state."
  ::lib.util/query-like)

(mr/def ::todo
  "One todo item of persisted turn state; only `:id` is guaranteed, since state can hold a partial item
  between the turn that creates it and the turn that fills in its details."
  [:map {:closed true}
   [:id :string]
   [:content  {:optional true} [:maybe :string]]
   [:status   {:optional true} [:maybe [:enum "pending" "in_progress" "completed" "cancelled"]]]
   [:priority {:optional true} [:maybe [:enum "high" "medium" "low"]]]])

(mr/def ::chart-timeline-event
  [:map {:closed true}
   [:name :string]
   [:description {:optional true} [:maybe :string]]
   [:timestamp :string]])

(mr/def ::column-info
  "A chart column's name and inferred type, as sent for chart analysis. Mirrors
  `metabase.metabot.context/ColumnInfoSchema`."
  [:map {:closed true}
   [:name :string]
   [:type {:optional true} [:maybe (into [:enum] #{"number" "string" "date" "datetime" "time" "boolean" "null"})]]])

(mr/def ::row-value
  "One cell value in a chart series. The `object` arm is never read by this code -- it's forwarded to the
  interestingness stats/repr code as-is -- so it's opaque rather than typed. Mirrors
  `metabase.metabot.context/RowValueSchema`."
  [:maybe [:or :string number? :boolean ms/OpaqueJSONObject]])

(mr/def ::chart-data
  "One pre-materialized table of raw chart data (columns + rows). Mirrors
  `metabase.metabot.context/ChartDataSchema`."
  [:map {:closed true}
   [:columns [:sequential ::column-info]]
   [:rows [:sequential [:sequential [:or :string number?]]]]])

(mr/def ::series-config
  "One series of a chart, pre-materialized by the frontend for `analyze_chart`. Mirrors
  `metabase.metabot.context/SeriesConfigSchema`."
  [:map {:closed true}
   [:x ::column-info]
   [:y {:optional true} [:maybe ::column-info]]
   [:x_values {:optional true} [:maybe [:sequential ::row-value]]]
   [:y_values {:optional true} [:maybe [:sequential ::row-value]]]
   [:display_name :string]
   [:chart_type [:or :string :keyword]]
   [:stacked {:optional true} [:maybe :boolean]]])

(mr/def ::chart-config
  "A `chart_configs` entry: a chart's title, pre-materialized series data, and the query that produced it.
  Mirrors `metabase.metabot.context/ChartConfigSchema`."
  [:map {:closed true}
   [:title {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:data {:optional true} [:maybe [:sequential ::chart-data]]]
   [:series {:optional true} [:maybe (ms/string-keyed-map ::series-config)]]
   [:timeline_events {:optional true} [:maybe [:sequential ::chart-timeline-event]]]
   [:query {:optional true} [:maybe ::query]]
   [:display_type {:optional true} [:maybe [:or :string :keyword]]]])

(mr/def ::chart
  [:map {:closed true}
   [:chart_id {:optional true} [:maybe :string]]
   [:query_id {:optional true} [:maybe :string]]
   [:queries {:optional true} [:maybe [:sequential [:maybe ::query]]]]
   [:visualization_settings {:optional true}
    [:maybe [:map {:closed true}
             [:chart_type {:optional true} [:maybe [:or :string :keyword]]]]]]
   [:timeline_events {:optional true} [:maybe [:sequential ::chart-timeline-event]]]
   [:chart_config {:optional true} [:maybe ::chart-config]]])

(mr/def ::transform.target
  [:map {:closed true}
   [:type [:or [:= :table] [:= "table"]]]
   [:name {:optional true} [:maybe :string]]
   [:database {:optional true} [:maybe :int]]
   [:schema {:optional true} [:maybe :string]]])

(mr/def ::transform.source-table
  "One entry of a Python transform's `source-tables`. Mirrors
  `metabase.metabot.context/TransformSourceTableSchema`."
  [:map {:closed true}
   [:alias :string]
   [:table_id {:optional true} [:maybe :int]]
   [:schema {:optional true} [:maybe :string]]
   [:database_id {:optional true} [:maybe :int]]])

(mr/def ::transform.source
  [:multi {:dispatch (comp keyword :type)}
   [:query [:map {:closed true}
            [:type [:or [:= :query] [:= "query"]]]
            [:query {:optional true} [:maybe ::query]]]]
   [:python [:map {:closed true}
             [:type [:or [:= :python] [:= "python"]]]
             [:body {:optional true} [:maybe :string]]
             [:source-database {:optional true} [:maybe :int]]
             [:source-tables {:optional true} [:maybe [:sequential ::transform.source-table]]]]]])

(mr/def ::transform
  [:map {:closed true}
   [:id {:optional true} [:maybe :string]]
   [:name {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:target {:optional true} [:maybe ::transform.target]]
   [:source {:optional true} [:maybe ::transform.source]]])

(mr/def ::state
  [:map {:closed true}
   [:queries {:optional true} [:map-of ::state-map-key ::query]]
   [:charts {:optional true} [:map-of ::state-map-key ::chart]]
   [:chart-configs {:optional true} [:map-of ::state-map-key ::chart-config]]
   [:todos {:optional true} [:sequential ::todo]]
   [:transforms {:optional true} [:map-of ::state-map-key ::transform]]
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
  [:merge
   ::ai-usage-log.columns
   [:map {:closed true}
    [:id                    ms/PositiveInt]]])

(mr/def ::ai-usage-log.columns
  "What an update (or insert) of a AiUsageLog accepts: every column of `:ai_usage_log` except `id`, all optional."
  [:map {:closed true}
   [:created_at            {:optional true} [:maybe ms/TemporalInstantOrNow]]
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

(mr/def ::ai-usage-log.create
  "What an insert of a AiUsageLog accepts."
  (mut/select-keys (mr/schema ::ai-usage-log.columns)
                   [:created_at :source :model :prompt_tokens :completion_tokens :total_tokens :user_id
                    :tenant_id :conversation_id :profile_id :request_id :ai_proxied :cache_creation_tokens
                    :cache_read_tokens]))

(mr/def ::ai-usage-log.update
  "What an update of a AiUsageLog accepts: no immutable columns. AiUsageLog rows are an insert/delete-only log, so
  nothing currently updates one."
  (mut/select-keys (mr/schema ::ai-usage-log.columns)
                   [:source :model :prompt_tokens :completion_tokens :total_tokens :tenant_id :conversation_id
                    :profile_id :request_id :ai_proxied :cache_creation_tokens :cache_read_tokens]))

(mr/def ::ai-usage-log.partial
  "An AiUsageLog row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::ai-usage-log [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::ai-usage-log.column
  "A column of `:ai_usage_log`, for the `:columns` option of the queries in [[metabase.metabot.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::ai-usage-log.columns))))

(mr/def ::metabot
  "A Metabot as selected from the app DB: every column of `:metabot`."
  [:merge
   ::metabot.columns
   [:map {:closed true}
    [:id                   ms/PositiveInt]]])

(mr/def ::metabot.columns
  "What an update (or insert) of a Metabot accepts: every column of `:metabot` except `id`, all optional."
  [:map {:closed true}
   [:name                 {:optional true} [:maybe :string]]
   [:description          {:optional true} [:maybe :string]]
   [:entity_id            {:optional true} [:maybe :string]]
   [:created_at           {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at           {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:use_verified_content {:optional true} [:maybe :boolean]]
   [:collection_id        {:optional true} [:maybe ::lib.schema.id/collection]]])

(mr/def ::metabot.create
  "What an insert of a Metabot accepts."
  (mut/select-keys (mr/schema ::metabot.columns)
                   [:name :description :entity_id :created_at :updated_at :use_verified_content :collection_id]))

(mr/def ::metabot.update
  "What an update of a Metabot accepts: no immutable columns. `:entity_id` and `:created_at` are stamped once on
  insert and never rewritten."
  (mut/select-keys (mr/schema ::metabot.columns)
                   [:name :description :updated_at :use_verified_content :collection_id]))

(mr/def ::metabot.partial
  "A Metabot row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::metabot [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::metabot.column
  "A column of `:metabot`, for the `:columns` option of the queries in [[metabase.metabot.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::metabot.columns))))

(mr/def ::metabot-conversation
  "A MetabotConversation as selected from the app DB: every column of `:metabot_conversation`."
  [:merge
   ::metabot-conversation.columns
   [:map {:closed true}
    [:id                          :string]]])

(mr/def ::metabot-conversation.columns
  "What an update (or insert) of a MetabotConversation accepts: every column of `:metabot_conversation` except `id`, all optional."
  [:map {:closed true}
   [:created_at                  {:optional true} [:maybe ms/TemporalInstantOrNow]]
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

(mr/def ::metabot-conversation.create
  "What an insert of a MetabotConversation accepts."
  (mut/select-keys (mr/schema ::metabot-conversation.columns)
                   [:created_at :user_id :title :ip_address :slack_team_id :slack_channel_id :slack_thread_ts
                    :embedding_hostname :embedding_path :user_agent :sanitized_user_agent
                    :forked_from_conversation_id]))

(mr/def ::metabot-conversation.update
  "What an update of a MetabotConversation accepts: no immutable columns. `:user_id` (the originator) and
  `:forked_from_conversation_id` are stamped once on insert and never rewritten."
  (mut/select-keys (mr/schema ::metabot-conversation.columns)
                   [:title :ip_address :slack_team_id :slack_channel_id :slack_thread_ts :embedding_hostname
                    :embedding_path :user_agent :sanitized_user_agent]))

(mr/def ::metabot-conversation.partial
  "A MetabotConversation row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::metabot-conversation [:map {:closed true} [:id {:optional true} :string]]])

(mr/def ::metabot-conversation.column
  "A column of `:metabot_conversation`, for the `:columns` option of the queries in [[metabase.metabot.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::metabot-conversation.columns))))

(mr/def ::metabot-feedback
  "A MetabotFeedback as selected from the app DB: every column of `:metabot_feedback`."
  [:merge
   ::metabot-feedback.columns
   [:map {:closed true}
    [:id                ms/PositiveInt]]])

(mr/def ::metabot-feedback.columns
  "What an update (or insert) of a MetabotFeedback accepts: every column of `:metabot_feedback` except `id`, all optional."
  [:map {:closed true}
   [:message_id        {:optional true} [:maybe ms/PositiveInt]]
   [:positive          {:optional true} [:maybe :boolean]]
   [:issue_type        {:optional true} [:maybe [:or :keyword :string]]]
   [:freeform_feedback {:optional true} [:maybe :string]]
   [:created_at        {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at        {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:user_id           {:optional true} [:maybe ::lib.schema.id/user]]])

(mr/def ::metabot-feedback.create
  "What an insert of a MetabotFeedback accepts."
  (mut/select-keys (mr/schema ::metabot-feedback.columns)
                   [:message_id :positive :issue_type :freeform_feedback :created_at :updated_at :user_id]))

(mr/def ::metabot-feedback.update
  "What an update of a MetabotFeedback accepts: no immutable columns. `:user_id` (the submitter) and `:created_at`
  are stamped once on insert and never rewritten."
  (mut/select-keys (mr/schema ::metabot-feedback.columns)
                   [:message_id :positive :issue_type :freeform_feedback :updated_at]))

(mr/def ::metabot-feedback.partial
  "A MetabotFeedback row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::metabot-feedback [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::metabot-feedback.column
  "A column of `:metabot_feedback`, for the `:columns` option of the queries in [[metabase.metabot.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::metabot-feedback.columns))))

(mr/def ::metabot-message.data-part
  "One entry of the `:data` column of a MetabotMessage, decoded."
  ::schema.v2/ui-message-part)

(mr/def ::metabot-message.usage
  "The `:usage` column of a MetabotMessage, decoded."
  (ms/string-keyed-map [:map {:closed true}
                        [:prompt :int]
                        [:completion :int]]))

(defn normalize-usage
  "Normalize the model keys of a MetabotMessage `:usage` value to strings according to [[::metabot-message.usage]]."
  [usage]
  (mc/decode ::metabot-message.usage usage (mtx/transformer {:name :normalize})))

(mr/def ::metabot-message.state
  "The `:state` column of a MetabotMessage, decoded."
  ::state)

(mr/def ::metabot-message
  "A MetabotMessage as selected from the app DB: every column of `:metabot_message`."
  [:merge
   ::metabot-message.columns
   [:map {:closed true}
    [:id                     ms/PositiveInt]]])

(mr/def ::metabot-message.columns
  "What an update (or insert) of a MetabotMessage accepts: every column of `:metabot_message` except `id`, all optional."
  [:map {:closed true}
   [:created_at             {:optional true} [:maybe ms/TemporalInstantOrNow]]
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

(mr/def ::metabot-message.create
  "What an insert of a MetabotMessage accepts."
  (mut/select-keys (mr/schema ::metabot-message.columns)
                   [:created_at :profile_id :role :data :usage :total_tokens :conversation_id :slack_msg_id
                    :channel_id :deleted_at :deleted_by_user_id :user_id :ai_proxied :external_id :finished
                    :error :data_version :state :forked_from_message_id :context_tokens]))

(mr/def ::metabot-message.update
  "What an update of a MetabotMessage accepts: no immutable columns. `:user_id` (the author), `:created_at`, and
  `:forked_from_message_id` are stamped once on insert and never rewritten."
  (mut/select-keys (mr/schema ::metabot-message.columns)
                   [:profile_id :role :data :usage :total_tokens :conversation_id :slack_msg_id :channel_id
                    :deleted_at :deleted_by_user_id :ai_proxied :external_id :finished :error :data_version
                    :state :context_tokens]))

(mr/def ::metabot-message.partial
  "A MetabotMessage row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::metabot-message [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::metabot-message.column
  "A column of `:metabot_message`, for the `:columns` option of the queries in [[metabase.metabot.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::metabot-message.columns))))

(mr/def ::metabot-prompt
  "A MetabotPrompt as selected from the app DB: every column of `:metabot_prompt`."
  [:merge
   ::metabot-prompt.columns
   [:map {:closed true}
    [:id         ms/PositiveInt]]])

(mr/def ::metabot-prompt.columns
  "What an update (or insert) of a MetabotPrompt accepts: every column of `:metabot_prompt` except `id`, all optional."
  [:map {:closed true}
   [:model      {:optional true} [:maybe [:or :keyword :string]]]
   [:card_id    {:optional true} [:maybe ::lib.schema.id/card]]
   [:entity_id  {:optional true} [:maybe :string]]
   [:prompt     {:optional true} [:maybe :string]]
   [:created_at {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:metabot_id {:optional true} [:maybe ms/PositiveInt]]])

(mr/def ::metabot-prompt.create
  "What an insert of a MetabotPrompt accepts."
  (mut/select-keys (mr/schema ::metabot-prompt.columns)
                   [:model :card_id :entity_id :prompt :created_at :updated_at :metabot_id]))

(mr/def ::metabot-prompt.update
  "What an update of a MetabotPrompt accepts: no immutable columns. `:entity_id` and `:created_at` are stamped once
  on insert and never rewritten."
  (mut/select-keys (mr/schema ::metabot-prompt.columns) [:model :card_id :prompt :updated_at :metabot_id]))

(mr/def ::metabot-prompt.partial
  "A MetabotPrompt row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::metabot-prompt [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::metabot-prompt.column
  "A column of `:metabot_prompt`, for the `:columns` option of the queries in [[metabase.metabot.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::metabot-prompt.columns))))

(mr/def ::metabot-source-feedback
  "A MetabotSourceFeedback as selected from the app DB: every column of `:metabot_source_feedback`."
  [:merge
   ::metabot-source-feedback.columns
   [:map {:closed true}
    [:id          ms/PositiveInt]]])

(mr/def ::metabot-source-feedback.columns
  "What an update (or insert) of a MetabotSourceFeedback accepts: every column of `:metabot_source_feedback` except `id`, all optional."
  [:map {:closed true}
   [:message_id  {:optional true} [:maybe ms/PositiveInt]]
   [:user_id     {:optional true} [:maybe ::lib.schema.id/user]]
   [:source_id   {:optional true} [:maybe ms/PositiveInt]]
   [:source_type {:optional true} [:maybe [:or :keyword :string]]]
   [:positive    {:optional true} [:maybe :boolean]]
   [:created_at  {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at  {:optional true} [:maybe ms/TemporalInstantOrNow]]])

(mr/def ::metabot-source-feedback.create
  "What an insert of a MetabotSourceFeedback accepts."
  (mut/select-keys (mr/schema ::metabot-source-feedback.columns)
                   [:message_id :user_id :source_id :source_type :positive :created_at :updated_at]))

(mr/def ::metabot-source-feedback.update
  "What an update of a MetabotSourceFeedback accepts: no immutable columns. `:user_id` (the submitter) and
  `:created_at` are stamped once on insert and never rewritten."
  (mut/select-keys (mr/schema ::metabot-source-feedback.columns)
                   [:message_id :source_id :source_type :positive :updated_at]))

(mr/def ::metabot-source-feedback.partial
  "A MetabotSourceFeedback row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::metabot-source-feedback [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::metabot-source-feedback.column
  "A column of `:metabot_source_feedback`, for the `:columns` option of the queries in [[metabase.metabot.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::metabot-source-feedback.columns))))

(mr/def ::metabot-used-table
  "A MetabotUsedTable as selected from the app DB: every column of `:metabot_used_table`."
  [:merge
   ::metabot-used-table.columns
   [:map {:closed true}
    [:id         ms/PositiveInt]]])

(mr/def ::metabot-used-table.columns
  "What an update (or insert) of a MetabotUsedTable accepts: every column of `:metabot_used_table` except `id`, all optional."
  [:map {:closed true}
   [:message_id {:optional true} [:maybe ms/PositiveInt]]
   [:table_id   {:optional true} [:maybe ::lib.schema.id/table]]
   [:created_at {:optional true} [:maybe ms/TemporalInstantOrNow]]])

(mr/def ::metabot-used-table.create
  "What an insert of a MetabotUsedTable accepts."
  (mut/select-keys (mr/schema ::metabot-used-table.columns) [:message_id :table_id :created_at]))

(mr/def ::metabot-used-table.update
  "What an update of a MetabotUsedTable accepts: no immutable columns. `:created_at` is stamped once on insert and
  never rewritten."
  (mut/select-keys (mr/schema ::metabot-used-table.columns) [:message_id :table_id]))

(mr/def ::metabot-used-table.partial
  "A MetabotUsedTable row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::metabot-used-table [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::metabot-used-table.column
  "A column of `:metabot_used_table`, for the `:columns` option of the queries in [[metabase.metabot.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::metabot-used-table.columns))))
