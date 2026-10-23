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
   [dev.security-lint.vocabulary :as vocab]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- reaches-name?
  "Whether any reachable function's name satisfies `pred`."
  [reaches pred]
  (boolean (some #(pred (name %)) reaches)))

(defn- ns-starts? [ns-sym prefix]
  (boolean (and ns-sym (str/starts-with? (str ns-sym) prefix))))

(defrule public-endpoint-reaches-enablement-check
  {:name        "Public endpoint that never checks public sharing is enabled"
   :enabled     false
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
   :enabled     false
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

(def ^:private embed-ns-prefixes
  ["metabase.embedding-rest.api.embed" "metabase.embedding-rest.api.preview-embed"])

(defn- embed-ns? [ns-sym] (boolean (some #(ns-starts? ns-sym %) embed-ns-prefixes)))

(def ^:private parameter-param-names
  "Parameter names under which an embed endpoint takes filter values from the caller: the query string, a
  `parameters` map, or the single value a remapping looks up."
  #{"parameters" "query-params" "value"})

(def ^:private embedding-params-enforcers
  "The functions in `api.embed.common` that apply the `embedding_params` policy: the merge every query endpoint
  goes through, the check it is built on, and the locked-constraint helper the remapping endpoints use instead."
  #{"validate-and-merge-params" "check-params-are-allowed" "locked-slug->value"})

(defrule embed-endpoint-reaches-param-validation
  {:name        "Embed endpoint that takes parameters and never validates them against embedding_params"
   :enabled     false
   :description (str "Static embedding's tenant isolation is the `embedding_params` allow-list: a `locked` "
                     "parameter comes from the signed token and the URL may not override it, a `disabled` one "
                     "nobody may supply. `validate-and-merge-params` enforces that; an endpoint that reads "
                     "`parameters` off the query string and never reaches it drops the locked filter and hands the "
                     "disabled one to the caller.")
   :remediation (str "Route the caller's parameters through `api.embed.common/validate-and-merge-params` (or a "
                     "helper that does) before the query runs.")
   :severity    :error
   :precision   :high
   :cwe         "CWE-284"
   :endpoint-rule true}
  [{:keys [node endpoint-ns reaches]}]
  (when (embed-ns? endpoint-ns)
    (when-let [params (taint/defendpoint-params node)]
      (let [names (into #{} (map ast/->str) (ast/find-nodes ast/symbol-node? params))]
        (when (and (some parameter-param-names names)
                   (not (reaches-name? reaches embedding-params-enforcers)))
          {:message (str "Embed endpoint takes " (str/join ", " (sort (filter parameter-param-names names)))
                         " and does not reach validate-and-merge-params")})))))

(def ^:private object-route
  "The routes that serve an object itself rather than its query results or its parameter values: `/card/:uuid`,
  `/dashboard/:token`. What comes back is the row, and the row has columns an anonymous viewer must not see."
  #"^/(card|dashboard|document|action)/:(uuid|token)$")

(def ^:private scrubber-name
  "How the public namespace spells its scrubbers: `remove-card-non-public-columns`, and `public-action`, which
  ends in a `select-keys` over the action's public keys."
  #"non-public|scrub|^public-(card|dashboard|document|action)$")

(defrule public-endpoint-returns-unscrubbed-object
  {:name        "Public or embed endpoint returns an object row with no scrubber on the path"
   :enabled     false
   :description (str "A Card, Dashboard, Document or Action served to an anonymous viewer carries columns they must "
                     "not see -- `dataset_query` with its native SQL, `embedding_params`, `made_public_by_id` -- "
                     "unless it goes through the namespace's scrubber (`remove-card-non-public-columns` and its "
                     "siblings).")
   :remediation "Return the object through the scrubber for its model, and add the model's scrubber if it has none."
   ;; a warning: the rule sees that a row is returned as it is and that no scrubber ran, not which columns the
   ;; row carries, and a row of a model with nothing to hide would be reported all the same
   :severity    :warning
   :precision   :medium
   :cwe         "CWE-200"
   :endpoint-rule true}
  [{:keys [node endpoint-ns reaches]}]
  ;; Keyed on the route, not on what the body returns: a query endpoint's return carries the Card's labels too,
  ;; through the function that fetched the card to run it, and grading by taint reported every query and
  ;; parameter-values endpoint in the namespace.
  (when (or (ns-starts? endpoint-ns "metabase.public-sharing-rest") (embed-ns? endpoint-ns))
    (let [route (some-> (ast/arg node 1) ast/unmeta ast/string-value)]
      (when (and route
                 (re-find object-route route)
                 (not (reaches-name? reaches #(re-find scrubber-name %))))
        {:message (str (u/upper-case-en (str/replace (ast/->str (ast/arg node 0)) #"^:" "")) " " route
                       " serves the object with no scrubber on any path")}))))

(defn- authz-name?
  "Whether a function name authorizes. Besides the throwing checks, list endpoints authorize by *filtering*, which
  restricts what a query returns rather than rejecting the request.

  See [[dev.security-lint.vocabulary/authz-names]] and [[dev.security-lint.vocabulary/visibility-filter-prefixes]]."
  [nm]
  (or (contains? vocab/authz-names nm)
      (boolean (some #(str/starts-with? nm %) vocab/visibility-filter-prefixes))))

(defrule model-read-without-authorization
  {:name        "Authenticated endpoint reads a model with no authorization on any path"
   :enabled     false
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

(def ^:private credential-verifier
  "How the functions that check a secret against a stored one are named."
  #"authenticate|verify|bcrypt|check-password|password-hash")

(defrule credential-endpoint-without-throttle
  {:name        "Credential-checking endpoint with no throttle on any path"
   :enabled     false
   :description (str "An endpoint that takes a password, a one-time code or a reset token verifies a secret, and "
                     "a secret with no rate limit is guessable: a password re-check without one lets a hijacked "
                     "session brute-force its way to a persistent password change.")
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
               ;; a verifier on the path: an endpoint that only measures a password's complexity -- `POST
               ;; /session/password-check` -- verifies nothing, and nothing there is guessable
               (reaches-name? reaches #(re-find credential-verifier %))
               ;; the throttle by its namespace, `metabase.util.throttle/check`, not by a helper's name
               (not (some #(str/includes? (str %) "throttle") reaches)))
      {:message "Endpoint verifies a credential and reaches no throttle"})))

(defrule endpoint-mounted-without-auth
  {:name        "Endpoint namespace mounted under no authentication wrapper"
   :enabled     false
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
                  ;; OAuth protocol flow and .well-known metadata; dynamic client registration is anonymous by
                  ;; RFC 7591, and what it *stores* from that anonymous body is another rule's question
                  #"oauth_server/api/"
                  #"metabot/tools/deftool\.clj$"                  ; a macro that expands to endpoints elsewhere
                  #"mcp/"                                        ; bearer token, checked in the handler
                  #"(pulse|notification)/api/unsubscribe\.clj$"  ; hash carried in the emailed link
                  #"slackbot/api"                                ; Slack request signature
                  #"scim/"                                       ; SCIM bearer token, checked by middleware
                  #"sync/api/notify"                             ; static API key
                  #"content_translation/routes\.clj$"            ; dictionary token in the URL
                  #"custom_viz_plugin/api/sandbox_host\.clj$"]}  ; the sandbox origin's static page
  [{:keys [node endpoint-ns ns-wrappers nearby siblings]}]
  ;; an endpoint whose own body demands a superuser or an application permission has demanded a session first:
  ;; both throw for an anonymous caller. The namespace is still mounted bare, but this endpoint is not the
  ;; next one added to it.
  (when-not (or (some #(re-find vocab/authenticating-wrappers %) ns-wrappers)
                (some #(contains? #{"check-superuser" "check-has-application-permission"} (name %)) nearby)
                ;; the mount is one fact about the namespace: reported once, at the first endpoint it leaves
                ;; bare, rather than once per endpoint. An earlier sibling that demands nothing itself -- its
                ;; privilege is anonymous, or a session -- already carries the finding.
                (some #(and (< (:row %) (:row (meta node)))
                            (contains? #{:anonymous :session} (:privilege %)))
                      siblings))
    {:message (str endpoint-ns " is mounted under no authentication wrapper")}))

(defrule namespace-authz-outlier
  {:name        "Endpoint gated by a session only, in a namespace whose others require more"
   :enabled     false
   :description (str "A namespace's endpoints usually share an authorization: the Slack admin namespace checks the "
                     "`:setting` application permission on every endpoint, the analytics namespace `:monitoring`. "
                     "The one endpoint that checks nothing is likely the one somebody forgot, and it does whatever "
                     "the namespace does -- posts as the bot, writes the metrics -- for any signed-in user.")
   :remediation "Add the check its siblings carry, or say in a comment why this endpoint is every user's."
   ;; a warning: a namespace can legitimately mix, and the rule reads only the consensus
   :severity    :warning
   :precision   :medium
   :cwe         "CWE-862"
   :endpoint-rule true}
  [{:keys [node method privilege siblings nearby]}]
  ;; A write that demands a session where its siblings demand more. A GET beside superuser writes is the ordinary
  ;; shape of a settings namespace -- read the list, change nothing without the grant -- so reads are left alone;
  ;; so is a write that authorizes each object it touches (`write-check` per database, per card), which the
  ;; caller-privilege axis does not count.
  (when (and (= :session privilege) (not= ":get" method) (seq siblings)
             (not (some #(contains? #{"write-check" "can-write?" "create-check" "update-check" "owner-scoped-query"}
                                    (name %))
                        nearby)))
    (let [above (filter #(contains? #{:elevated :superuser} (:privilege %)) siblings)]
      (when (and (seq above) (= (count above) (count siblings)))
        {:message (str (u/upper-case-en (str/replace (ast/->str (ast/arg node 0)) #"^:" "")) " "
                       (ast/string-value (ast/unmeta (ast/arg node 1)))
                       " is gated by a session only; its " (count siblings) " sibling"
                       (when (next siblings) "s") " all require more")}))))
