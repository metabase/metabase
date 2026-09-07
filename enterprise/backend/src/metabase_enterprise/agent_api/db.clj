(ns metabase-enterprise.agent-api.db
  "Application database queries for the agent-api module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn insert-call-log!
  "Insert the AgentApiCallLog `row`."
  [row]
  (t2/insert! :model/AgentApiCallLog row))

(defn delete-call-logs-created-before!
  "Delete the AgentApiCallLogs created before `cutoff`, returning the number deleted."
  [cutoff]
  (t2/delete! :model/AgentApiCallLog {:where [:< :created_at cutoff]}))
