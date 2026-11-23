(ns metabase.metabot.models.ai-usage-log
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
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

(mu/defn create-ai-usage-logs!
  "Record the LLM call `rows` in one statement."
  [rows :- [:sequential ::metabot.schema/ai-usage-log.create]]
  (when (seq rows)
    (metabot.db/insert-usage-logs! rows)))

(mu/defn ids-for-conversations :- [:sequential ms/PositiveInt]
  "The ids of the AiUsageLogs of the conversations with `conversation-ids`."
  [conversation-ids :- [:sequential :string]]
  (metabot.db/usage-log-ids-for-conversations conversation-ids))

(mu/defn delete-ai-usage-logs! :- :int
  "Delete the AiUsageLogs with `ids`, in batches in one transaction, and return the number deleted."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/with-transaction [_conn]
    (run! metabot.db/delete-usage-logs! (map vec (partition-all mdb/delete-partition-size ids))))
  (count ids))

(mu/defn seed-ai-usage-log!
  "Insert the AiUsageLog `row` as given, its timestamps included, which the testing API seeds."
  [row :- ::metabot.schema/ai-usage-log.update]
  (metabot.db/insert-usage-log-row! row))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/AiUsageLog [_model]
  {:skip? true})
