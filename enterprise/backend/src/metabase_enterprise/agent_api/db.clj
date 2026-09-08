(ns metabase-enterprise.agent-api.db
  "Application database queries for the agent-api module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn insert-call-log! :- :int
  "Insert the AgentApiCallLog `row`."
  [row :- [:map {:closed true}
           [:id            {:optional true} ms/PositiveInt]
           [:created_at    {:optional true} ms/TemporalInstant]
           [:user_id       {:optional true} [:maybe ms/PositiveInt]]
           [:tenant_id     {:optional true} [:maybe ms/PositiveInt]]
           [:client_name   {:optional true} [:maybe :string]]
           [:operation     {:optional true} [:maybe :string]]
           [:status        {:optional true} [:maybe :string]]
           [:duration_ms   {:optional true} [:maybe :int]]
           [:ip_address    {:optional true} [:maybe :string]]
           [:error_message {:optional true} [:maybe :string]]]]
  (t2/insert! :model/AgentApiCallLog row))

(mu/defn delete-call-logs-created-before! :- :int
  "Delete the AgentApiCallLogs created before `cutoff`, returning the number deleted."
  [cutoff :- ms/TemporalInstant]
  (t2/delete! :model/AgentApiCallLog {:where [:< :created_at cutoff]}))
