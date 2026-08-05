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
  [[metabase.api-scope.data-app]].")

(set! *warn-on-reflection* true)

(def ^:private client-header
  "The client-identification header the FE sets on every request (see
  `metabase/embedding/lib/auth/set-request-client-headers`)."
  "x-metabase-client")

(def ^:private data-app-client
  "The `X-Metabase-Client` value a sandboxed data app sends. Matches
  `EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader` on the FE."
  "data-app")

(def ^:private data-app-token-scopes
  "The scope set a data-app request is confined to. Matches the string registered in
  [[metabase.api-scope.data-app]] and the `{:scope \"data-app\"}` endpoint tags."
  #{"data-app"})

;; The `::unrestricted` sentinel keyword lives in `metabase.api.macros.scope`; referenced here
;; as a literal to avoid a load-time dependency on that namespace from the middleware.
(def ^:private unrestricted-scope :metabase.api.macros.scope/unrestricted)

(defn- full-access?
  "True when `token-scopes` represents an unrestricted credential — a normal session or a
  full-access bearer token. Only such requests may be narrowed by the marker; an
  already-scoped credential (an OAuth/agent token, or an MCP-UI credential — itself confined
  to a whitelist like `agent:viz:mcp-ui:query`) must not be broadened, so it stays untouched."
  [token-scopes]
  (or (nil? token-scopes)
      (contains? token-scopes unrestricted-scope)))

(defn wrap-data-app-scope
  "When a request comes from a sandboxed data app (`X-Metabase-Client: data-app`) AND is
  otherwise full-access, confine it to the `data-app` scope."
  [handler]
  (fn [request respond raise]
    (if (and (= data-app-client (get-in request [:headers client-header]))
             (full-access? (:token-scopes request)))
      (handler (assoc request :token-scopes data-app-token-scopes) respond raise)
      (handler request respond raise))))
