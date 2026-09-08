(ns dev.security-lint.rules.endpoints
  "Invariants about what an endpoint must, or must not, transitively reach.

  These are a different shape from every other rule: they fire once per `defendpoint` form and ask a question
  about the call graph, not about one call site. That is what lets them see a check that lives two helpers down --
  which is where this codebase keeps them, and why a per-file grep for the same invariants reports dozens of
  false gaps."
  (:require
   [clojure.string :as str]
   [dev.security-lint.ast :as ast]
   [dev.security-lint.rule :refer [defrule]]
   [dev.security-lint.taint :as taint]
   [dev.security-lint.vocabulary :as vocab]))

(set! *warn-on-reflection* true)

(defn- reaches-name?
  "Whether any reachable function's name satisfies `pred`."
  [reaches pred]
  (boolean (some #(pred (name %)) reaches)))

(defn- ns-starts? [ns-sym prefix]
  (boolean (and ns-sym (str/starts-with? (str ns-sym) prefix))))

(defrule public-endpoint-reaches-enablement-check
  {:name        "Public endpoint that never checks public sharing is enabled"
   :description (str "Every endpoint under the public-sharing API must reach `check-public-sharing-enabled`, "
                     "or it serves content when an admin has turned public sharing off.")
   :remediation "Call `public-sharing.validation/check-public-sharing-enabled` at the top of the endpoint."
   :severity    :error
   :precision   :high
   :cwe         "CWE-284"
   :endpoint-rule true}
  [{:keys [endpoint-ns reaches]}]
  (when (and (ns-starts? endpoint-ns "metabase.public-sharing-rest")
             (not (reaches-name? reaches #(= % "check-public-sharing-enabled"))))
    {:message "Public endpoint does not reach check-public-sharing-enabled"}))

(defrule embed-endpoint-reaches-token-verification
  {:name        "Embed endpoint that never verifies its token"
   :description (str "Every endpoint under the embedding API takes a signed token and must reach the unsigning "
                     "chokepoint, or it trusts whatever the token claims.")
   :remediation "Route the token through `unsign-and-translate-ids` (or `embed/unsign`) before using its claims."
   :severity    :error
   :precision   :high
   :cwe         "CWE-287"
   :endpoint-rule true}
  [{:keys [endpoint-ns reaches]}]
  ;; Only the namespaces whose endpoints take a signed token. `embedding-rest.api.theme` lives under the same
  ;; prefix but is ordinary admin CRUD with no token at all, and scoping by prefix reported all seven of its
  ;; endpoints.
  (when (and (or (ns-starts? endpoint-ns "metabase.embedding-rest.api.embed")
                 (ns-starts? endpoint-ns "metabase.embedding-rest.api.preview-embed"))
             (not (reaches-name? reaches #(str/includes? % "unsign"))))
    {:message "Embed endpoint does not reach a token-unsigning function"}))

(defn- authz-name?
  "Whether a function name authorizes. Besides the throwing checks, list endpoints authorize by *filtering*, which
  restricts what a query returns rather than rejecting the request.

  See [[dev.security-lint.vocabulary/authz-names]] and [[dev.security-lint.vocabulary/visibility-filter-prefixes]]."
  [nm]
  (or (contains? vocab/authz-names nm)
      (boolean (some #(str/starts-with? nm %) vocab/visibility-filter-prefixes))))

(defrule model-read-without-authorization
  {:name        "Authenticated endpoint reads a model with no authorization on any path"
   :description (str "The endpoint transitively reaches a Toucan select but no permission check at all -- not "
                     "`read-check`, `can-read?`, `check-superuser` or any of the others. Endpoints scoped to the "
                     "current user by construction are a legitimate exception, which is why this is a note.")
   :remediation (str "Obtain the object through `api/read-check` or `api/write-check`, which fetch it and throw "
                     "403 if the current user may not see it.")
   ;; A note with low precision on purpose: the invariant is real but the shape has known-good exceptions
   ;; (per-user key/value stores, anonymous-with-hash unsubscribe links). Measure, then tighten.
   :severity    :note
   :precision   :low
   :cwe         "CWE-862"
   :endpoint-rule true
   ;; Endpoints that authenticate by something other than the session, which no closure from the endpoint can
   ;; see. Each entry names the mechanism; an unexplained addition here is a finding being hidden.
   :exempt-files [#"public_sharing_rest/"           ; public uuid
                  #"embedding_rest/"                ; signed embed token
                  #"embedding_hub/"                 ; signed embed token
                  #"scim/v2/api\.clj$"              ; SCIM bearer token, checked by middleware
                  #"session/api\.clj$"              ; login: there is no user yet
                  #"(pulse|notification)/api/unsubscribe\.clj$" ; hash carried in the emailed link
                  #"oauth_server/api/"              ; OAuth protocol flow
                  #"mcp/callback_api\.clj$"         ; OAuth callback
                  #"sync/api/notify\.clj$"          ; API-key authenticated
                  #"testing_api/"]}                 ; test-only endpoints
  [{:keys [reaches ns-middleware]}]
  (when (and (some #(and (= "toucan2.core" (namespace %))
                         (str/starts-with? (name %) "select"))
                   reaches)
             (not (reaches-name? reaches authz-name?))
             ;; `(ns-handler *ns* api/+check-superuser ...)` authorizes every endpoint in the namespace at the
             ;; router, which no closure from the endpoint itself can reach
             (not (some #(str/starts-with? (name %) "+check") ns-middleware)))
    {:message "Endpoint reaches a model select but no authorization check on any path"}))

(defrule credential-endpoint-without-throttle
  {:name        "Credential-checking endpoint with no throttle on any path"
   :description (str "An endpoint that takes a password, a one-time code or a reset token verifies a secret, and "
                     "a secret with no rate limit is guessable. The password re-check on `PUT /api/user/:id/password` "
                     "let a hijacked session brute-force its way to a persistent password change.")
   :remediation "Check a `metabase.util.throttle` throttler keyed on the account before verifying the credential."
   :severity    :warning
   :precision   :medium
   :cwe         "CWE-307"
   :endpoint-rule true
   ;; a signed embed token is not a credential anyone guesses
   :exempt-files [#"public_sharing_rest/" #"embedding_rest/" #"embedding_hub/"]}
  [{:keys [node reaches]}]
  (when-let [params (taint/defendpoint-params node)]
    (when (and (re-find vocab/credential-params (ast/->str params))
               (not (reaches-name? reaches #(str/includes? % "throttle"))))
      {:message "Endpoint verifies a credential and reaches no throttle"})))

(defrule endpoint-mounted-without-auth
  {:name        "Endpoint namespace mounted under no authentication wrapper"
   :description (str "A namespace mounted without `+auth` serves every endpoint in it to anyone, and relies on "
                     "each handler to check for a session by hand. Where that holds it holds by convention: the "
                     "next endpoint added to the namespace is reachable unauthenticated until someone notices.")
   :remediation (str "Wrap the mount in `+auth` (or `+static-apikey`), or list the namespace among the anonymous "
                     "ones in this rule's exemptions with a word on what authenticates it instead.")
   :severity    :warning
   :precision   :medium
   :cwe         "CWE-306"
   :endpoint-rule true
   ;; Namespaces that are anonymous by design. Each entry says what stands in for a session.
   :exempt-files [#"public_sharing_rest/"                        ; public uuid
                  #"embedding_rest/api/(embed|preview_embed)"    ; signed embed token
                  #"embedding_hub/"                              ; signed embed token
                  #"session/api\.clj$"                           ; login
                  #"sso/api"                                     ; SSO handshake
                  #"setup_rest/"                                 ; setup token, first run only
                  #"product_feedback/"                           ; anonymous feedback
                  #"frontend_errors/"                            ; anonymous error reports, throttled
                  #"analytics/api/proxy"                         ; anonymous analytics proxy
                  #"api/util\.clj$"                              ; health and version
                  #"geojson/"                                    ; public map data
                  #"testing_api/"                                ; test builds only
                  #"oauth_server/api/"                           ; OAuth protocol flow and .well-known metadata
                  #"metabot/tools/deftool\.clj$"                  ; a macro that expands to endpoints elsewhere
                  #"mcp/"                                        ; bearer token, checked in the handler
                  #"(pulse|notification)/api/unsubscribe\.clj$"  ; hash carried in the emailed link
                  #"slackbot/api"                                ; Slack request signature
                  #"scim/"                                       ; SCIM bearer token, checked by middleware
                  #"sync/api/notify"                             ; static API key
                  #"content_translation/routes\.clj$"            ; dictionary token in the URL
                  #"custom_viz_plugin/api/sandbox_host\.clj$"]}  ; the sandbox origin's static page
  [{:keys [endpoint-ns ns-wrappers nearby]}]
  ;; an endpoint whose own body demands a superuser or an application permission has demanded a session first:
  ;; both throw for an anonymous caller. The namespace is still mounted bare, but this endpoint is not the
  ;; next one added to it.
  (when-not (or (some #(re-find vocab/authenticating-wrappers %) ns-wrappers)
                (some #(contains? #{"check-superuser" "check-has-application-permission"} (name %)) nearby))
    {:message (str endpoint-ns " is mounted under no authentication wrapper")}))
