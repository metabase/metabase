(ns metabase.metabot.models.ai-usage-log
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/AiUsageLog [_model] :ai_usage_log)

(doto :model/AiUsageLog
  (derive :metabase/model))
