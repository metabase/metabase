(ns metabase.agent-api.models.agent-api-call-log
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/AgentApiCallLog [_model] :agent_api_call_log)

(doto :model/AgentApiCallLog
  (derive :metabase/model))

(defmethod app-db-copy/spec :model/AgentApiCallLog [_model]
  {:skip? true})
