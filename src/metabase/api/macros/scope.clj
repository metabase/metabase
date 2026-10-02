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
  JWT claim, this keyword can never be confused with an externally-supplied scope string."
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
   ;; Comma-separated per RFC 7235's `#auth-param`.
   :headers {"Content-Type"     "application/json"
             "WWW-Authenticate" (str "Bearer error=\"insufficient_scope\""
                                     (when required-scope
                                       (str ", scope=" (quoted-string required-scope)))
                                     ", error_description=" (quoted-string message))}
   :body    {:error   error
             :message message}})

(defn- oauth-without-token-scopes?
  "True for a request the session middleware authenticated with an OAuth access token that carries no
   `:token-scopes`."
  [request]
  ;; Nil scopes mean scope-unaware auth only for sessions and API keys; for OAuth they must fail closed.
  (and (:authenticated-via-oauth? request)
       (empty? (:token-scopes request))))

(defn enforce-scope
  "Returns a Ring middleware that checks `:token-scopes` on the request against `required-scope` (a string).
   Passes through when `:token-scopes` is nil (normal session auth) or contains `::unrestricted`
   (session auth or unscoped JWT). Rejects an OAuth-authenticated request with no `:token-scopes`.

   On success, sets `:token-scopes-checked` on the request so that downstream [[ensure-scopes-checked]]
   middleware knows scope enforcement already happened. This allows `enforce-scope` to be applied at the
   namespace level while individual endpoints use `ensure-scopes-checked` as a safety net."
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
