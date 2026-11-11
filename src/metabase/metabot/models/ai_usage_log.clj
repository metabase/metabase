(ns metabase.metabot.models.ai-usage-log
  (:require
   [metabase.toucan.core :as t2]))

(t2/define-table-name :model/AiUsageLog [_model] :ai_usage_log)

(doto :model/AiUsageLog
  (derive :metabase/model))
