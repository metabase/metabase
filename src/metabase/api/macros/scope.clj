(ns metabase.api.macros.scope
  "OAuth-style scope enforcement for API endpoints.

  Endpoints declare their required scope via `defendpoint` metadata (e.g. `{:scope \"agent:query\"}`).
  A per-endpoint middleware rejects requests whose token doesn't carry the required scope.

  Endpoints that do NOT declare `:scope` automatically reject requests carrying `:token-scopes`,
  ensuring that scoped tokens can only reach endpoints that explicitly opt in.

  Scopes are space-delimited strings (mirroring OAuth's `scope` semantics) and support hierarchical
  wildcards: `agent:*` covers `agent:query`.

  The `::unrestricted` keyword is used as a sentinel in `:token-scopes` to indicate an unrestricted token
  (session auth or unscoped JWT). Unlike `\"*\"` which is a valid wildcard scope that could appear in a
  JWT claim, this keyword can never be confused with an externally-supplied scope string.

  `::mcp-ui` is a second such sentinel, for the MCP Apps iframe credential. It is deliberately NOT
  `::unrestricted`: the credential authenticates a narrow, purpose-limited surface, and stamping it
  unrestricted meant that anything which reached an endpoint outside that surface arrived with full
  privilege. Carrying `::mcp-ui` instead makes the default failure closed — it satisfies no endpoint's
  declared `:scope`, and `ensure-scopes-checked` refuses it on endpoints that declare none — so such a
  request is rejected rather than served. Being a keyword, it can never be requested, granted, or named on
  a consent screen."
  (:require
   [clojure.string :as str]
   [metabase.api-scope.core :as api-scope]
   [metabase.config.core :as config]
   [metabase.util.log :as log]))

(defn parse-scopes
  "Parse a space-delimited OAuth scope string into a set of scope strings.
   Returns nil if `scope-string` is nil, blank, or not a string."
  [scope-string]
  (api-scope/parse-scopes scope-string))

(defn scope-satisfied?
  "Check if `token-scopes` (a set) satisfies `required-scope` (a string).
   Supports hierarchical wildcards: `\"agent:*\"` covers `\"agent:query\"`."
  [token-scopes required-scope]
  (api-scope/scope-matches? token-scopes required-scope))

(defn- quoted-string
  "`s` as a double-quoted auth-param value: `\"` becomes `'`, `\\` becomes `/`, and every character outside
   printable ASCII becomes `?`."
  [s]
  ;; Replaced rather than backslash-escaped: RFC 6750 section 3 excludes `\"` and `\\` from `scope` and
  ;; `error_description` values outright, so an escaped quote is still invalid there.
  (str "\""
       (-> (str s)
           (str/replace #"[^\x20-\x7E]" "?")
           (str/replace "\"" "'")
           (str/replace "\\" "/"))
       "\""))

(defn- insufficient-scope-response
  "A 403 JSON response with `error` and `message`, carrying an RFC 6750 `insufficient_scope` `WWW-Authenticate`
   challenge that names `required-scope` as `scope` when non-nil and uses `message` as `error_description`."
  [error message required-scope]
  {:status  403
   ;; Comma-separated per RFC 7235's `#auth-param`, in the order the MCP transport's challenge uses.
   :headers {"Content-Type"     "application/json"
             "WWW-Authenticate" (str "Bearer error=\"insufficient_scope\""
                                     (when required-scope
                                       (str ", scope=" (quoted-string required-scope)))
                                     ", error_description=" (quoted-string message))}
   :body    {:error   error
             :message message}})

(defn- oauth-without-token-scopes?
  "True for a request the session middleware authenticated with an OAuth access token that carries no
   `:token-scopes`. Nil scopes mean scope-unaware auth only for sessions and API keys; for OAuth they must fail
   closed."
  [request]
  (and (:authenticated-via-oauth? request)
       (empty? (:token-scopes request))))

(defn enforce-scope
  "Returns a Ring middleware that checks `:token-scopes` on the request against `required-scope` (a string).
   Passes through when `:token-scopes` is nil (normal session auth) or contains `::unrestricted`
   (session auth or unscoped JWT). Rejects an OAuth-authenticated request with no `:token-scopes`.

   On success, sets `:token-scopes-checked` on the request so that downstream [[ensure-scopes-checked]]
   middleware knows scope enforcement already happened. This allows `enforce-scope` to be applied at the
   namespace level while individual endpoints use `ensure-scopes-checked` as a safety net.

   Also passes an MCP Apps UI credential (`::mcp-ui`) whose request is already `:token-scopes-checked`.
   That credential is not an OAuth token and an endpoint's declared `:scope` is not the vocabulary that
   confines it: [[metabase.mcp.ui-surface/request-surface]] is, and it is strictly narrower — a handful of
   routes, each priced in the MCP scope the minting session had to hold. The stamp is set only when that
   gate passes, so honouring it here defers to a route-specific decision that already happened rather than
   waiving one. Without this, declaring a `:scope` on any route of that surface silently 403s the iframe
   while every other caller is unaffected, and the iframe just stops rendering.

   Deliberately conditioned on `::mcp-ui` rather than on the stamp alone. `enforce-scope` sets the stamp
   itself on success, so trusting it unconditionally would make every per-endpoint `:scope` a no-op
   underneath a namespace-level `enforce-scope`."
  [required-scope]
  ;; Dev-time warning only — fires at middleware construction (load time), not per-request.
  ;; The middleware is returned regardless; this just surfaces unregistered scopes early.
  (when (and config/is-dev? (not (api-scope/registered-scope? required-scope)))
    (log/warnf "Unregistered scope in endpoint: %s" required-scope))
  (fn [handler]
    (fn [request respond raise]
      (let [token-scopes (:token-scopes request)]
        (if (and (not (oauth-without-token-scopes? request))
                 (or (nil? token-scopes)
                     (contains? token-scopes ::unrestricted)
                     (and (contains? token-scopes ::mcp-ui)
                          (:token-scopes-checked request))
                     (scope-satisfied? token-scopes required-scope)))
          (handler (cond-> request
                     token-scopes (assoc :token-scopes-checked true))
                   respond raise)
          (do (log/warnf "Scope check failed — required: %s, granted: %s" required-scope token-scopes)
              (respond (insufficient-scope-response "unsupported_scope"
                                                    "Insufficient scope for this operation."
                                                    required-scope))))))))

(defn ensure-scopes-checked
  "Security middleware that prevents scoped authorization tokens from accessing endpoints that have not
   declared a required scope. When authorization is scoped (i.e. `:token-scopes` is present on the request),
   only endpoints with an explicit `:scope` in their metadata — or that sit behind a namespace-level
   [[enforce-scope]] middleware — should be reachable. This middleware is applied automatically by
   `defendpoint` to any endpoint without `:scope` metadata to enforce that invariant.

   Passes through when:
   - `:token-scopes` is nil (request did not go through scope-aware auth)
   - `:token-scopes` contains `::unrestricted` (session auth or unscoped JWT)
   - `:token-scopes-checked` is true ([[enforce-scope]] already ran, e.g. at the namespace level)

   None of these apply to an OAuth-authenticated request with no `:token-scopes`, which is always rejected."
  [handler]
  (fn [request respond raise]
    (let [token-scopes (:token-scopes request)]
      (if (and (not (oauth-without-token-scopes? request))
               (or (nil? token-scopes)
                   (contains? token-scopes ::unrestricted)
                   (:token-scopes-checked request)))
        (handler request respond raise)
        (respond (insufficient-scope-response "scope_not_permitted"
                                              "Scoped tokens cannot access this endpoint."
                                              nil))))))
