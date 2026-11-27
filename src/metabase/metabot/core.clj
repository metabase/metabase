(ns metabase.metabot.core
  "API namespace for the `metabase.metabot` module."
  (:require
   [metabase.metabot.ai]
   [metabase.metabot.config]
   [metabase.metabot.scope]
   [metabase.metabot.search-models]
   [metabase.metabot.self]
   [metabase.metabot.tools.entity-details]
   [metabase.metabot.tools.util]
   [metabase.metabot.usage]
   [potemkin :as p]))

(p/import-vars
 [metabase.metabot.scope
  agent-collection-create
  agent-dashboard-create
  agent-dashboard-update
  agent-query
  agent-query-construct
  agent-query-execute
  agent-question-create
  agent-question-execute
  agent-question-update
  agent-metric-create
  agent-metric-update
  agent-resource-read
  agent-search
  agent-sql-construct
  agent-sql-create
  agent-sql-execute]
 [metabase.metabot.search-models
  entity-type->search-model
  search-model->entity-type])

(p/import-vars
 [metabase.metabot.tools.entity-details
  get-metric-details
  get-metrics-details
  get-report-details
  get-table-details
  get-tables-details]
 [metabase.metabot.tools.util
  ->result-column])

(p/import-vars
 [metabase.metabot.usage
  check-usage-limits!
  log-ai-usage!]
 [metabase.metabot.self
  known-models
  llm-call-available?
  llm-call-unavailable-reason])

;; `call-llm!` is the LLM facade: every one-call LLM feature outside Metabot calls the model through it.
(p/import-vars
 [metabase.metabot.ai
  call-llm!
  render-untrusted])

(p/import-fn metabase.metabot.ai/available? ai-feature-available?)
(p/import-fn metabase.metabot.ai/check! check-ai-feature!)
(p/import-fn metabase.metabot.config/request-audience ai-feature-request-audience)
(p/import-fn metabase.metabot.ai/unavailable-reason ai-feature-unavailable-reason)
(p/import-fn metabase.metabot.ai/sources ai-feature-sources)
(p/import-fn metabase.metabot.ai/message-sources ai-feature-message-sources)
(p/import-def metabase.metabot.ai/registry ai-feature-registry)
