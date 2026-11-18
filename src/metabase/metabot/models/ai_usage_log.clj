(ns metabase.metabot.models.ai-usage-log
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/AiUsageLog [_model] :ai_usage_log)

(doto :model/AiUsageLog
  (derive :metabase/model))

(defmethod app-db-copy/spec :model/AiUsageLog [_model]
  {:skip? true})
