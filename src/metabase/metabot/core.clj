(ns metabase.metabot.core
  "API namespace for the `metabase.metabot` module."
  (:require
   [metabase.metabot.ai-features]
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
  llm-call-available?
  llm-call-unavailable-reason])

(p/import-vars
 [metabase.metabot.ai-features
  call!
  new-boundary
  render-untrusted])

(p/import-fn metabase.metabot.ai-features/available? ai-feature-available?)
(p/import-fn metabase.metabot.ai-features/check! check-ai-feature!)
(p/import-fn metabase.metabot.config/request-audience ai-feature-request-audience)
(p/import-fn metabase.metabot.ai-features/unavailable-reason ai-feature-unavailable-reason)
(p/import-fn metabase.metabot.ai-features/sources ai-feature-sources)
(p/import-fn metabase.metabot.ai-features/message-sources ai-feature-message-sources)
(p/import-def metabase.metabot.ai-features/registry ai-feature-registry)
