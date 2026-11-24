(ns metabase.agent-api.schema
  "Malli schemas for the agent-api module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::agent-api-call-log
  "A AgentApiCallLog as selected from the app DB: every column of `:agent_api_call_log`."
  [:merge
   ::agent-api-call-log.update
   [:map {:closed true}
    [:id            ms/PositiveInt]]])

(mr/def ::agent-api-call-log.update
  "What an update (or insert) of a AgentApiCallLog accepts: every column of `:agent_api_call_log` except `id`, all optional."
  [:map {:closed true}
   [:created_at    {:optional true} [:maybe ms/TemporalInstant]]
   [:user_id       {:optional true} [:maybe ::lib.schema.id/user]]
   [:tenant_id     {:optional true} [:maybe ms/PositiveInt]]
   [:client_name   {:optional true} [:maybe :string]]
   [:operation     {:optional true} [:maybe :string]]
   [:status        {:optional true} [:maybe [:or :keyword :string]]]
   [:duration_ms   {:optional true} [:maybe :int]]
   [:ip_address    {:optional true} [:maybe :string]]
   [:error_message {:optional true} [:maybe :string]]])

(mr/def ::agent-api-call-log.create
  "What recording an AgentApiCallLog takes: the call's user, tenant, client, operation, outcome and duration, and the
  optional IP address and error message."
  [:map {:closed true}
   [:user_id       [:maybe ::lib.schema.id/user]]
   [:tenant_id     [:maybe ms/PositiveInt]]
   [:client_name   [:maybe :string]]
   [:operation     [:maybe :string]]
   [:status        [:or :keyword :string]]
   [:duration_ms   [:maybe :int]]
   [:ip_address    {:optional true} [:maybe :string]]
   [:error_message [:maybe :string]]])

(mr/def ::query-object
  "A query a client sends as a JSON object, validated by the representations pipeline that reads it."
  [:map {:closed false, :description "a query as a JSON object"}])
