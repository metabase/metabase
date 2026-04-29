(ns metabase-enterprise.workspaces.scope
  "Workspace-specific OAuth scope declarations.

  Generic scope infrastructure (registry, matching, `defscope`) lives in
  [[metabase.api-scope.core]]. This namespace declares the concrete `workspace:*`
  scopes used by workspace external access endpoints."
  (:require
   [metabase.api-scope.core :as api-scope]
   [metabase.util.i18n :refer [deferred-tru]]))

(set! *warn-on-reflection* true)

(api-scope/defscope workspace-config-read "workspace:config:read"
  (deferred-tru "Read workspace configuration"))

(api-scope/defscope workspace-metadata-read "workspace:metadata:read"
  (deferred-tru "Read workspace database metadata"))

;; Any scope starting with "workspace:" requires superuser to authorize
(api-scope/require-superuser-for-prefix! "workspace:")
