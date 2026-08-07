(ns metabase.server.middleware.data-app-scope
  "Ring middleware that confines a data-app-originated request to the `data-app` scope.

  A sandboxed data app's SDK client already stamps every instance request with
  `X-Metabase-Client: data-app` (set by `setDataApp` on the FE and re-applied by the SDK's
  `useInitData` on every component mount, so it can't be dropped). Trusted host-realm code
  adds it; the membraned guest can't reach that code, and — critically — the header only ever
  *narrows* access, so it needs no cryptographic protection: forging it can only restrict the
  caller.

  When that header is present on an otherwise full-access request, this middleware sets
  `:token-scopes #{\"data-app\"}`, so the endpoint scope middleware
  ([[metabase.api.macros.scope]]) lets the request reach only endpoints tagged
  `{:scope \"data-app\"}` and fails closed everywhere else.

  It never *broadens* access: a request already carrying a restricted `:token-scopes` (an
  OAuth or agent token) is left untouched, so the header can't turn a narrow token into a
  card-query-capable one. That's why it must run after `wrap-current-user-info`, which is
  what resolves those token scopes. The scope itself is declared in
  [[metabase.api-scope.data-app]].

  Narrowed requests also carry `:data-app-scoped?`, so downstream auth middleware that
  rewrites `:token-scopes` — the agent API's, on a JWT `scope` claim — can tell a confinement
  decision made here from an absent one and refuse to widen it back out."
  (:require
   [metabase.api-scope.data-app :as api-scope.data-app]
   [metabase.api.macros.scope :as scope]
   [metabase.embedding.util :as embedding.util]))

(set! *warn-on-reflection* true)

(def ^:private data-app-token-scopes
  "The scope set a data-app request is confined to — the scope declared in
  [[metabase.api-scope.data-app]] and carried by the `{:scope \"data-app\"}` endpoint tags."
  #{api-scope.data-app/data-app})

(defn- full-access?
  "True when `token-scopes` represents an unrestricted credential — a normal session, or a
  bearer token granted access to the whole REST API. Only such requests may be narrowed by
  the marker; an already-scoped credential (an OAuth or agent token) must not be broadened,
  so it stays untouched.

  `\"*\"` counts as full access because [[metabase.api-scope.core/scope-matches?]] treats a
  granted `\"*\"` as satisfying every required scope."
  [token-scopes]
  (or (nil? token-scopes)
      (contains? token-scopes ::scope/unrestricted)
      (contains? token-scopes "*")))

(defn- narrow-to-data-app?
  "True when `request` carries the data-app client marker on a credential this may confine.

  MCP visualization iframes are excluded even though they look full-access here:
  `wrap-current-user-info` hands them `#{::scope/unrestricted}` deliberately, because their
  authorization boundary is the route allowlist in [[metabase.server.middleware.session]]
  rather than the scope set. Narrowing one would cost it the `/api/embed-mcp` routes, which
  carry no `data-app` tag, and it is already confined by that allowlist either way."
  [request]
  (and (embedding.util/has-data-app-header? request)
       (not (:mcp-ui-credential request))
       (full-access? (:token-scopes request))))

(defn wrap-data-app-scope
  "When a request comes from a sandboxed data app (`X-Metabase-Client: data-app`) AND is
  otherwise full-access, confine it to the `data-app` scope."
  [handler]
  (fn [request respond raise]
    (handler (cond-> request
               (narrow-to-data-app? request) (assoc :token-scopes     data-app-token-scopes
                                                    :data-app-scoped? true))
             respond raise)))
