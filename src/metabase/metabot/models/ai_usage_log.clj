(ns metabase.metabot.models.ai-usage-log
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/AiUsageLog [_model] :ai_usage_log)

(doto :model/AiUsageLog
  (derive :metabase/model))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-ai-usage-log!
  "Record the LLM call `row`."
  [row :- ::metabot.schema/ai-usage-log.create]
  (metabot.db/insert-usage-log! row))

(mu/defn delete-ai-usage-logs-created-before!
  "Delete the AiUsageLogs created before `cutoff`, returning the number deleted."
  [cutoff :- ms/TemporalInstant]
  (metabot.db/delete-usage-logs-created-before! cutoff))

(mu/defn seed-ai-usage-log!
  "Insert the AiUsageLog `row` as given, its timestamps included, which the testing API seeds."
  [row :- ::metabot.schema/ai-usage-log.update]
  (metabot.db/insert-usage-log-row! row))

(mu/defn delete-ai-usage-logs-for-conversations!
  "Delete the AiUsageLogs of the conversations with `conversation-ids`."
  [conversation-ids :- [:sequential :string]]
  (metabot.db/delete-usage-logs-for-conversations! conversation-ids))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/AiUsageLog [_model]
  {:skip? true})
