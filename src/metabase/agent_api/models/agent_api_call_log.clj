(ns metabase.agent-api.models.agent-api-call-log
  (:require
   [metabase.toucan.core :as t2]))

(t2/define-table-name :model/AgentApiCallLog [_model] :agent_api_call_log)

(doto :model/AgentApiCallLog
  (derive :metabase/model))
