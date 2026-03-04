(ns metabase.api.macros.scope
  "OAuth-style scope enforcement for API endpoints.

  Endpoints declare their required scope via `defendpoint` metadata (e.g. `{:scope \"agent:workspaces\"}`).
  A per-endpoint middleware rejects requests whose token doesn't carry the required scope.

  Endpoints that do NOT declare `:scope` automatically reject requests carrying `:token-scopes`,
  ensuring that scoped tokens can only reach endpoints that explicitly opt in.

  Scopes are space-delimited strings (mirroring OAuth's `scope` semantics) and support hierarchical
  wildcards: `agent:*` covers `agent:workspaces`."
  (:require
   [clojure.string :as str]))

(defn parse-scopes
  "Parse a space-delimited OAuth scope string into a set of scope strings.
   Returns nil if `scope-string` is nil."
  [scope-string]
  (when scope-string
    (into #{} (str/split (str/trim scope-string) #"\s+"))))

(defn scope-satisfied?
  "Check if `token-scopes` (a set) satisfies `required-scope` (a string).
   Supports hierarchical wildcards: `\"agent:*\"` covers `\"agent:workspaces\"`."
  [token-scopes required-scope]
  (boolean
   (or (contains? token-scopes "*")
       (contains? token-scopes required-scope)
       ;; Check wildcards: "agent:*" matches "agent:workspaces"
       (let [parts (str/split required-scope #":")]
         (some (fn [i]
                 (contains? token-scopes
                            (str (str/join ":" (take i parts)) ":*")))
               (range 1 (count parts)))))))

(defn enforce-scope
  "Returns a Ring middleware that checks `:token-scopes` on the request against `required-scope` (a string).
   If `:token-scopes` is nil (normal session auth), the request passes through unrestricted.

   On success, sets `:token-scopes-checked` on the request so that downstream [[ensure-scopes-checked]]
   middleware knows scope enforcement already happened. This allows `enforce-scope` to be applied at the
   namespace level while individual endpoints use `ensure-scopes-checked` as a safety net."
  [required-scope]
  (fn [handler]
    (fn [request respond raise]
      (let [token-scopes (:token-scopes request)]
        (if (or (nil? token-scopes)
                (scope-satisfied? token-scopes required-scope))
          (handler (cond-> request
                     token-scopes (assoc :token-scopes-checked true))
                   respond raise)
          (respond {:status  403
                    :headers {"Content-Type" "application/json"}
                    :body    {:error   "insufficient_scope"
                              :message (str "Token does not have required scope: " required-scope)}}))))))

(def ensure-scopes-checked
  "Security middleware that prevents scoped authorization tokens from accessing endpoints that have not
   declared a required scope. When authorization is scoped (i.e. `:token-scopes` is present on the request),
   only endpoints with an explicit `:scope` in their metadata — or that sit behind a namespace-level
   [[enforce-scope]] middleware — should be reachable. This middleware is applied automatically by
   `defendpoint` to any endpoint without `:scope` metadata to enforce that invariant.

   Passes through when:
   - `:token-scopes` is nil (normal session auth, no scoped token)
   - `:token-scopes-checked` is true ([[enforce-scope]] already ran, e.g. at the namespace level)"
  (fn [handler]
    (fn [request respond raise]
      (if (and (:token-scopes request)
               (not (:token-scopes-checked request)))
        (respond {:status  403
                  :headers {"Content-Type" "application/json"}
                  :body    {:error   "scope_not_permitted"
                            :message "Scoped tokens cannot access this endpoint."}})
        (handler request respond raise)))))
