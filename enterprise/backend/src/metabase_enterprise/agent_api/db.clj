(ns metabase-enterprise.agent-api.db
  "Application database queries for the agent-api module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.agent-api.schema :as agent-api.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn insert-call-log! :- :int
  "Insert the AgentApiCallLog `row`."
  [row :- ::agent-api.schema/agent-api-call-log.update]
  (t2/insert! :model/AgentApiCallLog row))

(mu/defn delete-call-logs-created-before! :- :int
  "Delete the AgentApiCallLogs created before `cutoff`, returning the number deleted."
  [cutoff :- ms/TemporalInstant]
  (t2/delete! :model/AgentApiCallLog {:where [:< :created_at cutoff]}))
