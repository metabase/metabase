(ns metabase.mcp.schema
  "Malli schemas for the mcp module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::mcp-feedback
  "A McpFeedback as selected from the app DB: every column of `:mcp_feedback`."
  [:map {:closed true}
   [:id                ms/PositiveInt]
   [:user_id           ::lib.schema.id/user]
   [:positive          :boolean]
   [:issue_type        [:maybe [:or :keyword :string]]]
   [:freeform_feedback [:maybe :string]]
   [:prompt            [:maybe :string]]
   [:query             [:maybe :string]]
   [:created_at        ms/TemporalInstant]])

(mr/def ::mcp-feedback.update
  "What an update (or insert) of a McpFeedback accepts: every column of `:mcp_feedback` except `id`, all optional."
  [:map {:closed true}
   [:user_id           {:optional true} [:maybe ::lib.schema.id/user]]
   [:positive          {:optional true} [:maybe :boolean]]
   [:issue_type        {:optional true} [:maybe [:or :keyword :string]]]
   [:freeform_feedback {:optional true} [:maybe :string]]
   [:prompt            {:optional true} [:maybe :string]]
   [:query             {:optional true} [:maybe :string]]
   [:created_at        {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::mcp-query-handle
  "A McpQueryHandle as selected from the app DB: every column of `:mcp_query_handle`."
  [:map {:closed true}
   [:id              :string]
   [:mcp_session_id  :string]
   [:core_session_id [:maybe :string]]
   [:encoded_query   :string]
   [:created_at      ms/TemporalInstant]
   [:prompt          [:maybe :string]]])

(mr/def ::mcp-query-handle.update
  "What an update (or insert) of a McpQueryHandle accepts: every column of `:mcp_query_handle` except `id`, all optional."
  [:map {:closed true}
   [:mcp_session_id  {:optional true} [:maybe :string]]
   [:core_session_id {:optional true} [:maybe :string]]
   [:encoded_query   {:optional true} [:maybe :string]]
   [:created_at      {:optional true} [:maybe ms/TemporalInstant]]
   [:prompt          {:optional true} [:maybe :string]]])

(mr/def ::mcp-session-log
  "A McpSessionLog as selected from the app DB: every column of `:mcp_session_log`."
  [:map {:closed true}
   [:id             :string]
   [:created_at     ms/TemporalInstant]
   [:ended_at       [:maybe ms/TemporalInstant]]
   [:user_id        [:maybe ::lib.schema.id/user]]
   [:tenant_id      [:maybe ms/PositiveInt]]
   [:client_name    [:maybe :string]]
   [:client_version [:maybe :string]]
   [:ip_address     [:maybe :string]]
   [:user_agent     [:maybe :string]]])

(mr/def ::mcp-session-log.update
  "What an update (or insert) of a McpSessionLog accepts: every column of `:mcp_session_log` except `id`, all optional."
  [:map {:closed true}
   [:created_at     {:optional true} [:maybe ms/TemporalInstant]]
   [:ended_at       {:optional true} [:maybe ms/TemporalInstant]]
   [:user_id        {:optional true} [:maybe ::lib.schema.id/user]]
   [:tenant_id      {:optional true} [:maybe ms/PositiveInt]]
   [:client_name    {:optional true} [:maybe :string]]
   [:client_version {:optional true} [:maybe :string]]
   [:ip_address     {:optional true} [:maybe :string]]
   [:user_agent     {:optional true} [:maybe :string]]])

(mr/def ::mcp-tool-call-log
  "A McpToolCallLog as selected from the app DB: every column of `:mcp_tool_call_log`."
  [:map {:closed true}
   [:id                   ms/PositiveInt]
   [:created_at           ms/TemporalInstant]
   [:user_id              [:maybe ::lib.schema.id/user]]
   [:tool_name            :string]
   [:status               [:maybe [:or :keyword :string]]]
   [:duration_ms          [:maybe :int]]
   [:error_code           [:maybe :int]]
   [:error_message        [:maybe :string]]
   [:client_name          [:maybe :string]]
   [:client_version       [:maybe :string]]
   [:tenant_id            [:maybe ms/PositiveInt]]
   [:ip_address           [:maybe :string]]
   [:user_agent           [:maybe :string]]
   [:sanitized_user_agent [:maybe :string]]])

(mr/def ::mcp-tool-call-log.update
  "What an update (or insert) of a McpToolCallLog accepts: every column of `:mcp_tool_call_log` except `id`, all optional."
  [:map {:closed true}
   [:created_at           {:optional true} [:maybe ms/TemporalInstant]]
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
