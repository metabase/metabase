(ns metabase.agent-api.schema
  "Malli schemas for the agent-api module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::agent-api-call-log
  "A AgentApiCallLog as selected from the app DB: every column of `:agent_api_call_log`."
  [:map {:closed true}
   [:id            ms/PositiveInt]
   [:created_at    ms/TemporalInstant]
   [:user_id       [:maybe ::lib.schema.id/user]]
   [:tenant_id     [:maybe ms/PositiveInt]]
   [:client_name   [:maybe :string]]
   [:operation     [:maybe :string]]
   [:status        [:maybe [:or :keyword :string]]]
   [:duration_ms   [:maybe :int]]
   [:ip_address    [:maybe :string]]
   [:error_message [:maybe :string]]])

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
