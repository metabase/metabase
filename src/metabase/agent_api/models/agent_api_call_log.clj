(ns metabase.agent-api.models.agent-api-call-log
  (:require
   [metabase.agent-api.db :as agent-api.db]
   [metabase.agent-api.schema :as agent-api.schema]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/AgentApiCallLog [_model] :agent_api_call_log)

(doto :model/AgentApiCallLog
  (derive :metabase/model))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-agent-api-call-logs! :- [:sequential :map]
  "Record the Agent API calls `rows` and return the new instances, in order."
  [rows :- [:sequential ::agent-api.schema/agent-api-call-log.create]]
  (agent-api.db/insert-call-logs! rows))

(mu/defn delete-agent-api-call-logs-created-before!
  "Delete the AgentApiCallLogs created before `cutoff`, returning the number deleted."
  [cutoff :- ms/TemporalInstant]
  (agent-api.db/delete-call-logs-created-before! cutoff))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/AgentApiCallLog [_model]
  {:skip? true})
