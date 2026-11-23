(ns metabase.agent-api.models.agent-api-call-log
  (:require
   [metabase.agent-api.db :as agent-api.db]
   [metabase.agent-api.schema :as agent-api.schema]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/AgentApiCallLog [_model] :agent_api_call_log)

(doto :model/AgentApiCallLog
  (derive :metabase/model))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-agent-api-call-logs! :- [:sequential :map]
  "Record the Agent API calls `rows` in one transaction and return the new instances, in order."
  [rows :- [:sequential ::agent-api.schema/agent-api-call-log.create]]
  (app-db/create-batched! :model/AgentApiCallLog rows {}))

(def call-log-ids-created-before
  "The ids of the AgentApiCallLogs created before a cutoff, see [[agent-api.db/call-log-ids-created-before]]."
  agent-api.db/call-log-ids-created-before)

(mu/defn delete-agent-api-call-logs! :- :nil
  "Delete the AgentApiCallLogs with `ids` in one transaction."
  [ids :- [:sequential ms/PositiveInt]]
  (app-db/delete-batched! :model/AgentApiCallLog ids {}))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/AgentApiCallLog [_model]
  {:skip? true})
