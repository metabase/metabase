(ns metabase.api-scope.data-app
  "Scope declaration for sandboxed data-app requests.

  A data-app iframe runs untrusted, admin-uploaded code. Its SDK client stamps every request
  with `X-Metabase-Client: data-app` (from trusted host-realm code the guest can't reach); the
  [[metabase.server.middleware.data-app-scope]] middleware maps that onto this scope,
  confining the request to endpoints tagged `{:scope api-scope/data-app}` — the read/query
  surface a data app needs to render. Everything else fails closed via
  [[metabase.api.macros.scope/ensure-scopes-checked]].

  `data-apps:base` is the read/query tier. It is namespaced so a later tier (say a
  `data-apps:write` covering card/dashboard saves) can be added without another rename, and
  so `data-apps:*` stays available as the wildcard that covers both — see
  [[metabase.api-scope.core/scope-matches?]].

  Endpoints tag with the var rather than the string: the scope name is a wire contract that
  has already been renamed once, and a var keeps the next rename to this one line.

  Declared here (loaded early by [[metabase.api-scope.init]]) so the scope is registered before
  any endpoint namespace resolves the tag, mirroring how metabot declares its `agent:*` scopes
  in `metabase.metabot.scope`."
  (:require
   [metabase.api-scope.core :as api-scope]
   [metabase.util.i18n :refer [deferred-tru]]))

(set! *warn-on-reflection* true)

(api-scope/defscope data-app "data-apps:base"
  (deferred-tru "Read and query access for a sandboxed data app."))
