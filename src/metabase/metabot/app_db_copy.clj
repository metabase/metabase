(ns metabase.metabot.app-db-copy
  "How copying the application database to another database copies Metabot records.")

(set! *warn-on-reflection* true)

(defn transform-metabot-llm-call
  "The LLM call row to write, without `usage_log_id`, since AI usage logs are not copied and the id would name no row,
  or another row, in the target database."
  [row _opts]
  (dissoc row :usage_log_id))
