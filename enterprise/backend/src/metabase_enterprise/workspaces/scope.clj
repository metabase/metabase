(ns metabase-enterprise.workspaces.scope
  "Scope declarations for the workspaces module."
  (:require
   [metabase.api-scope.core :as api-scope]
   [metabase.util.i18n :refer [deferred-tru]]))

(api-scope/defscope agent-workspace-read "agent:workspace:read"
  (deferred-tru "Read workspace data"))

(api-scope/defscope agent-workspace-write "agent:workspace:write"
  (deferred-tru "Write workspace data"))

(api-scope/defscope agent-workspace-execute "agent:workspace:execute"
  (deferred-tru "Execute workspace queries"))
