(ns metabase.agent-api.models.agent-api-call-log
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/AgentApiCallLog [_model] :agent_api_call_log)

(doto :model/AgentApiCallLog
  (derive :metabase/model))
