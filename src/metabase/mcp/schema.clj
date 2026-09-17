(ns metabase.mcp.schema
  "Malli schemas for the mcp module."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::mcp-feedback
  "A McpFeedback as selected from the app DB: every column of `:mcp_feedback`."
  [:merge
   ::mcp-feedback.columns
   [:map {:closed true}
    [:id                ms/PositiveInt]]])

(mr/def ::mcp-feedback.columns
  "What an update (or insert) of a McpFeedback accepts: every column of `:mcp_feedback` except `id`, all optional."
  [:map {:closed true}
   [:user_id           {:optional true} [:maybe ::lib.schema.id/user]]
   [:positive          {:optional true} [:maybe :boolean]]
   [:issue_type        {:optional true} [:maybe [:or :keyword :string]]]
   [:freeform_feedback {:optional true} [:maybe :string]]
   [:prompt            {:optional true} [:maybe :string]]
   [:query             {:optional true} [:maybe :string]]
   [:created_at        {:optional true} [:maybe ms/TemporalInstantOrNow]]])

(mr/def ::mcp-feedback.create
  "What an insert of a McpFeedback accepts."
  (mut/select-keys (mr/schema ::mcp-feedback.columns)
                   [:user_id :positive :issue_type :freeform_feedback :prompt :query :created_at]))

(mr/def ::mcp-feedback.update
  "What an update of a McpFeedback accepts: no immutable columns. `:user_id` and `:created_at` are stamped once on
  insert and never rewritten. Nothing currently updates a McpFeedback row."
  (mut/select-keys (mr/schema ::mcp-feedback.columns) [:positive :issue_type :freeform_feedback :prompt :query]))

(mr/def ::mcp-feedback.partial
  "A McpFeedback row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::mcp-feedback [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::mcp-feedback.column
  "A column of `:mcp_feedback`, for the `:columns` option of the queries in [[metabase.mcp.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::mcp-feedback.columns))))

(mr/def ::mcp-query-handle
  "A McpQueryHandle as selected from the app DB: every column of `:mcp_query_handle`."
  [:merge
   ::mcp-query-handle.columns
   [:map {:closed true}
    [:id              :string]]])

(mr/def ::mcp-query-handle.columns
  "What an update (or insert) of a McpQueryHandle accepts: every column of `:mcp_query_handle` except `id`, all optional."
  [:map {:closed true}
   [:mcp_session_id  {:optional true} [:maybe :string]]
   [:core_session_id {:optional true} [:maybe :string]]
   [:encoded_query   {:optional true} [:maybe :string]]
   [:created_at      {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:prompt          {:optional true} [:maybe :string]]])

(mr/def ::mcp-query-handle.create
  "What an insert of a McpQueryHandle accepts."
  (mut/select-keys (mr/schema ::mcp-query-handle.columns)
                   [:mcp_session_id :core_session_id :encoded_query :created_at :prompt]))

(mr/def ::mcp-query-handle.update
  "What an update of a McpQueryHandle accepts: no immutable columns. `:created_at` is stamped once on insert and
  never rewritten. Nothing currently updates a McpQueryHandle row."
  (mut/select-keys (mr/schema ::mcp-query-handle.columns) [:mcp_session_id :core_session_id :encoded_query :prompt]))

(mr/def ::mcp-query-handle.partial
  "A McpQueryHandle row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::mcp-query-handle [:map {:closed true} [:id {:optional true} :string]]])

(mr/def ::mcp-query-handle.column
  "A column of `:mcp_query_handle`, for the `:columns` option of the queries in [[metabase.mcp.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::mcp-query-handle.columns))))

(mr/def ::mcp-session-log
  "A McpSessionLog as selected from the app DB: every column of `:mcp_session_log`."
  [:merge
   ::mcp-session-log.columns
   [:map {:closed true}
    [:id             :string]]])

(mr/def ::mcp-session-log.columns
  "What an update (or insert) of a McpSessionLog accepts: every column of `:mcp_session_log` except `id`, all optional."
  [:map {:closed true}
   [:created_at     {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:ended_at       {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:user_id        {:optional true} [:maybe ::lib.schema.id/user]]
   [:tenant_id      {:optional true} [:maybe ms/PositiveInt]]
   [:client_name    {:optional true} [:maybe :string]]
   [:client_version {:optional true} [:maybe :string]]
   [:ip_address     {:optional true} [:maybe :string]]
   [:user_agent     {:optional true} [:maybe :string]]])

(mr/def ::mcp-session-log.create
  "What an insert of a McpSessionLog accepts."
  (mut/select-keys (mr/schema ::mcp-session-log.columns)
                   [:created_at :ended_at :user_id :tenant_id :client_name :client_version :ip_address
                    :user_agent]))

(mr/def ::mcp-session-log.update
  "What an update of a McpSessionLog accepts: no immutable columns. `:user_id` and `:created_at` are stamped once
  on insert and never rewritten."
  (mut/select-keys (mr/schema ::mcp-session-log.columns)
                   [:ended_at :tenant_id :client_name :client_version :ip_address :user_agent]))

(mr/def ::mcp-session-log.partial
  "A McpSessionLog row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::mcp-session-log [:map {:closed true} [:id {:optional true} :string]]])

(mr/def ::mcp-session-log.column
  "A column of `:mcp_session_log`, for the `:columns` option of the queries in [[metabase.mcp.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::mcp-session-log.columns))))

(mr/def ::mcp-tool-call-log
  "A McpToolCallLog as selected from the app DB: every column of `:mcp_tool_call_log`."
  [:merge
   ::mcp-tool-call-log.columns
   [:map {:closed true}
    [:id                   ms/PositiveInt]]])

(mr/def ::mcp-tool-call-log.columns
  "What an update (or insert) of a McpToolCallLog accepts: every column of `:mcp_tool_call_log` except `id`, all optional."
  [:map {:closed true}
   [:created_at           {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:user_id              {:optional true} [:maybe ::lib.schema.id/user]]
   [:tool_name            {:optional true} [:maybe :string]]
   [:status               {:optional true} [:maybe [:or :keyword :string]]]
   [:duration_ms          {:optional true} [:maybe :int]]
   [:error_code           {:optional true} [:maybe :int]]
   [:error_message        {:optional true} [:maybe :string]]
   [:client_name          {:optional true} [:maybe :string]]
   [:client_version       {:optional true} [:maybe :string]]
   [:tenant_id            {:optional true} [:maybe ms/PositiveInt]]
   [:ip_address           {:optional true} [:maybe :string]]
   [:user_agent           {:optional true} [:maybe :string]]
   [:sanitized_user_agent {:optional true} [:maybe :string]]])

(mr/def ::mcp-tool-call-log.create
  "What an insert of a McpToolCallLog accepts."
  (mut/select-keys (mr/schema ::mcp-tool-call-log.columns)
                   [:created_at :user_id :tool_name :status :duration_ms :error_code :error_message :client_name
                    :client_version :tenant_id :ip_address :user_agent :sanitized_user_agent]))

(mr/def ::mcp-tool-call-log.update
  "What an update of a McpToolCallLog accepts: no immutable columns. `:user_id` and `:created_at` are stamped once
  on insert and never rewritten. Nothing currently updates a McpToolCallLog row."
  (mut/select-keys (mr/schema ::mcp-tool-call-log.columns)
                   [:tool_name :status :duration_ms :error_code :error_message :client_name :client_version
                    :tenant_id :ip_address :user_agent :sanitized_user_agent]))

(mr/def ::mcp-tool-call-log.partial
  "A McpToolCallLog row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::mcp-tool-call-log [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::mcp-tool-call-log.column
  "A column of `:mcp_tool_call_log`, for the `:columns` option of the queries in [[metabase.mcp.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::mcp-tool-call-log.columns))))
