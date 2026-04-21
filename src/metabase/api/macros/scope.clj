(ns metabase.api.macros.scope
  "OAuth-style scope enforcement for API endpoints.

  Endpoints declare their required scope via `defendpoint` metadata (e.g. `{:scope \"agent:workspaces\"}`).
  A per-endpoint middleware rejects requests whose token doesn't carry the required scope.

  Endpoints that do NOT declare `:scope` automatically reject requests carrying `:token-scopes`,
  ensuring that scoped tokens can only reach endpoints that explicitly opt in.

  Scopes are space-delimited strings (mirroring OAuth's `scope` semantics) and support hierarchical
  wildcards: `agent:*` covers `agent:workspaces`.

  The `::unrestricted` keyword is used as a sentinel in `:token-scopes` to indicate an unrestricted token
  (session auth or unscoped JWT). Unlike `\"*\"` which is a valid wildcard scope that could appear in a
  JWT claim, this keyword can never be confused with an externally-supplied scope string."
  (:require
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
   Supports hierarchical wildcards: `\"agent:*\"` covers `\"agent:workspaces\"`."
  [token-scopes required-scope]
  (api-scope/scope-matches? token-scopes required-scope))

(defn enforce-scope
  "Returns a Ring middleware that checks `:token-scopes` on the request against `required-scope` (a string).
   Passes through when `:token-scopes` is nil (normal session auth) or contains `::unrestricted`
   (session auth or unscoped JWT).

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
        (if (or (nil? token-scopes)
                (contains? token-scopes ::unrestricted)
                (scope-satisfied? token-scopes required-scope))
          (handler (cond-> request
                     token-scopes (assoc :token-scopes-checked true))
                   respond raise)
          (do (log/warnf "Scope check failed — required: %s, granted: %s" required-scope token-scopes)
              (respond {:status  403
                        :headers {"Content-Type" "application/json"}
                        :body    {:error   "unsupported_scope"
                                  :message "Insufficient scope for this operation."}})))))))

(defn ensure-scopes-checked
  "Security middleware that prevents scoped authorization tokens from accessing endpoints that have not
   declared a required scope. When authorization is scoped (i.e. `:token-scopes` is present on the request),
   only endpoints with an explicit `:scope` in their metadata — or that sit behind a namespace-level
   [[enforce-scope]] middleware — should be reachable. This middleware is applied automatically by
   `defendpoint` to any endpoint without `:scope` metadata to enforce that invariant.

   Passes through when:
   - `:token-scopes` is nil (request did not go through scope-aware auth)
   - `:token-scopes` contains `::unrestricted` (session auth or unscoped JWT)
   - `:token-scopes-checked` is true ([[enforce-scope]] already ran, e.g. at the namespace level)"
  [handler]
  (fn [request respond raise]
    (let [token-scopes (:token-scopes request)]
      (if (or (nil? token-scopes)
              (contains? token-scopes ::unrestricted)
              (:token-scopes-checked request))
        (handler request respond raise)
        (respond {:status  403
                  :headers {"Content-Type" "application/json"}
                  :body    {:error   "scope_not_permitted"
                            :message "Scoped tokens cannot access this endpoint."}})))))
