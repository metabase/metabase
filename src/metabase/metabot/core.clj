(ns metabase.metabot.core
  "API namespace for the `metabase.metabot` module."
  (:require
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
  get-report-details
  get-table-details]
 [metabase.metabot.tools.util
  ->result-column])

(p/import-vars
 [metabase.metabot.usage
  check-usage-limits!
  log-ai-usage!]
 [metabase.metabot.self
  llm-call-available?
  llm-call-unavailable-reason])

(defn do-with-all-metabot-permissions
  "Run `thunk` with every Metabot group permission granted, so the usage and permission gates in
  [[llm-call-unavailable-reason]] and the structured call path see `all-yes-permissions` instead of resolving the
  current user's groups. For callers whose own permission check (for example database write access) is the gate,
  not Metabot group membership. Instance-level gates and usage limits still apply."
  [thunk]
  (binding [metabase.metabot.scope/*current-user-metabot-permissions* metabase.metabot.scope/all-yes-permissions]
    (thunk)))
