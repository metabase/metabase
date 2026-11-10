(ns metabase.api-scope.workspace-manager
  "Scope declaration for workspace management.

  A bearer token or API key holding only this scope reaches the `/api/ee/workspace-manager` endpoints, which tag
  themselves `{:scope api-scope/workspace-manager}`, and is refused everywhere else by
  [[metabase.api.macros.scope/ensure-scopes-checked]]. A CI job provisions workspaces with such a key without holding
  an admin key for the whole API. Those endpoints also require a superuser, so the scope narrows an admin credential
  and never widens a non-admin one.

  Declared here (loaded early by [[metabase.api-scope.init]]) so the scope is registered before any endpoint namespace
  resolves the tag, and so the session middleware can map a scoped API key onto it without depending on the OAuth
  server."
  (:require
   [metabase.api-scope.core :as api-scope]
   [metabase.util.i18n :refer [deferred-tru]]))

(set! *warn-on-reflection* true)

(api-scope/defscope workspace-manager "mb:workspace-manager"
  (deferred-tru "Create, list, rename and delete workspaces (no access to the rest of Metabase)"))
