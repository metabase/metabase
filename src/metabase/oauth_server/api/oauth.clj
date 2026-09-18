(ns metabase.oauth-server.api.oauth
  "OAuth protocol endpoints. Mounted under `/oauth/`."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.mac :as mac]
   [buddy.core.nonce :as nonce]
   [clojure.string :as str]
   [metabase.api-scope.core :as api-scope]
   [metabase.api.macros :as api.macros]
   [metabase.mcp.core :as mcp]
   [metabase.oauth-server.consent-page :as consent-page]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.oauth-server.models.oauth-client-event :as client-event]
   [metabase.oauth-server.settings :as oauth-settings]
   [metabase.request.core :as request]
   [metabase.server.middleware.security :as mw.security]
   [metabase.system.core :as system]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [metabase.util.throttle :as u.throttle]
   [oidc-provider.core :as oidc]
   [oidc-provider.protocol :as proto]
   [oidc-provider.registration :as reg]
   [oidc-provider.util :as oidc-util]
   [ring.util.response :as response]
   [throttle.core :as throttle])
  (:import
   (clojure.lang ExceptionInfo)
   (java.net URI URISyntaxException URLEncoder)))

(set! *warn-on-reflection* true)

(def ^:private csrf-cookie-name "metabase.OAUTH_CSRF")

(defn- generate-csrf-token
  "Generate a random 32-hex-char CSRF token."
  []
  (codecs/bytes->hex (nonce/random-bytes 16)))

(defn- site-path-prefix
  "Path component of site-url with no trailing slash (e.g. `/metabase` when Metabase is hosted
   under a subpath), or an empty string when site-url has no path or is unset."
  []
  (or (some-> (system/site-url) (URI.) (.getPath) (str/replace #"/$" "") not-empty)
      ""))

(defn- csrf-cookie-opts
  "Cookie options for the CSRF cookie. Sets `:secure` when site-url is HTTPS.
   The cookie `:path` is the path the *browser* sees, so it must include the subpath prefix
   when Metabase is hosted under one — otherwise the cookie is never sent back with the
   consent form POST and CSRF validation fails."
  [max-age]
  (cond-> {:http-only true
           :same-site :strict
           :path      (str (site-path-prefix) "/oauth/authorize")
           :max-age   max-age}
    (some-> (system/site-url) (str/starts-with? "https"))
    (assoc :secure true)))

(defn- canonical-params-string
  "Deterministic serialization of oauth-params for HMAC signing.
   Sorts by key name, uses pr-str for values to avoid ambiguity with special characters."
  [oauth-params]
  (->> oauth-params
       (remove (comp nil? val))
       (sort-by (comp name key))
       (map (fn [[k v]] (str (name k) "=" (pr-str v))))
       (str/join "\n")))

(defn- sign-oauth-params
  "HMAC-SHA256 the canonical oauth-params string using the CSRF token as key."
  [csrf-token oauth-params]
  (codecs/bytes->hex
   (mac/hash (canonical-params-string oauth-params)
             {:key csrf-token :alg :hmac+sha256})))

(defn- verify-oauth-params-signature
  "Verify that the HMAC signature matches the oauth-params."
  [csrf-token oauth-params signature]
  (mac/verify (canonical-params-string oauth-params)
              (codecs/hex->bytes signature)
              {:key csrf-token :alg :hmac+sha256}))

(def ^:private oauth-param-keys
  "The set of OAuth authorization parameters that are signed and verified."
  [:client_id
   :code_challenge
   :code_challenge_method
   :nonce
   :redirect_uri
   :resource
   :response_type
   :scope
   :state])

(defn- truncate
  "Truncate a string to `max-len` characters, appending \"...\" if truncated."
  [s max-len]
  {:pre [(> max-len 3)]}
  (if (> (count s) max-len)
    (str (subs s 0 (- max-len 3)) "...")
    s))

(def ^:private consent-scope-order
  "The MCP v2 scopes in the order the consent page lists them, least to most harmful."
  ["agent:resource:read"
   "agent:content:read"
   "agent:query:run"
   "agent:content:write"
   "agent:sql:run"
   "agent:delivery:write"])

(defn- scope-tokens
  "Split a space-separated OAuth `scope` value into its distinct scope strings, in first-seen order. Returns nil when
   blank.

   Deduplicating here is what keeps a repeated scope out of the granted token: the decision filters the grant from this
   list, so a duplicate left in it would be stored twice."
  [scope-param]
  (some-> scope-param str str/trim not-empty (str/split #"\s+") distinct vec))

(defn- requested-scope-descriptions
  "Turn the space-separated OAuth `scope` value into a vector of `{:scope :description :full-access? :locked?}` maps for
   the consent page, so the user sees exactly what the client is asking for. Scopes in [[consent-scope-order]] come
   first in that order, then the rest in request order. `:locked?` marks an MCP baseline scope, which is always granted;
   every other scope starts unticked. Falls back to the raw scope string when a scope has no registered human-readable
   description. Returns nil when no scope was requested."
  [scope-param]
  (when-let [scopes (scope-tokens scope-param)]
    (let [rank     (zipmap consent-scope-order (range))
          baseline (set (mcp/v2-baseline-scopes))]
      (->> scopes
           ;; `sort-by` is stable, so unranked scopes keep their request order
           (sort-by #(rank % (count rank)))
           (mapv (fn [s]
                   {:scope        s
                    :description  (or (some-> (api-scope/scope-description s) str) s)
                    ;; Flag the broad first-party grant so the consent page can warn about it without
                    ;; hardcoding the scope string in the view.
                    :full-access? (= s oauth-server/full-access-scope)
                    :locked?      (contains? baseline s)}))))))

(defn- form-values
  "A form field that may repeat, as a vector: Ring decodes one value to a string and several to a vector."
  [v]
  (cond
    (nil? v)        []
    (sequential? v) (vec v)
    :else           [v]))

(defn- granted-scopes
  "The scopes an approved decision grants, in offered order: every `offered` scope the user `chosen`, plus every
   offered MCP baseline scope, which the consent page shows as always granted. Returns nil when `chosen` names a scope
   that was not offered."
  [offered chosen]
  (when (every? (set offered) chosen)
    (filterv (some-fn (set chosen) (set (mcp/v2-baseline-scopes))) offered)))

;;; ------------------------------------------- Error descriptions ------------------------------------------------

;;; Fixed strings, never echoing what the request sent, and within the RFC 6749 section 5.2 character set.

(def ^:private invalid-authorization-request-description "The authorization request is invalid.")

(def ^:private invalid-token-request-description "The token request is invalid.")

(def ^:private invalid-target-description
  "The resource parameter must be an absolute URI without a fragment.")

(def ^:private narrowed-away-scope-description
  "The requested scopes are not accepted by the requested resource.")

(defn- authorization-server-metadata-url
  "Absolute URL of the RFC 8414 authorization server metadata document, which lists `scopes_supported`."
  []
  (str (system/site-url) "/.well-known/oauth-authorization-server"))

(defn- unsupported-scopes-description
  "The `error_description` for a registration naming a scope that is not registered."
  []
  (str "The request contained unsupported scopes. Request only scopes listed in scopes_supported at "
       (authorization-server-metadata-url)))

(defn- no-supported-scopes-description
  "The `error_description` for an authorization request in which no requested scope is registered."
  []
  (str "None of the requested scopes are supported. Request only scopes listed in scopes_supported at "
       (authorization-server-metadata-url)))

(defn- missing-scope-description
  "The `error_description` for an authorization request with no scope."
  []
  (str "The request must include a scope. Request only scopes listed in scopes_supported at "
       (authorization-server-metadata-url)))

(defn- empty-scope-description
  "The `error_description` for a client registration whose `scope` is present but empty."
  []
  (str "The scope must not be empty. Omit scope, or include only scopes listed in scopes_supported at "
       (authorization-server-metadata-url)))

(defn- invalid-client-metadata-response
  "The RFC 7591 `invalid_client_metadata` 400 for a registration this endpoint refuses before the library sees it."
  [description]
  {:status  400
   :headers {"Content-Type" "application/json"}
   :body    {"error"             "invalid_client_metadata"
             "error_description" description}})

;;; -------------------------------------------- Resource indicators ----------------------------------------------

(defn- malformed-resource?
  "True when any `resource` indicator (a string, or a sequence of strings) is not an absolute URI without a fragment,
   as RFC 8707 section 2 requires."
  [resource]
  ;; oidc-provider validates resource indicators by constructing a `java.net.URI`, so an unparseable one reaches the
  ;; endpoints as a URISyntaxException rather than the ex-info they catch. Checked here before the library sees it,
  ;; which also lets every malformed indicator be answered with the description saying what a valid one looks like.
  (boolean
   (some (fn [r]
           (try
             (let [uri (URI. (str r))]
               (or (not (.isAbsolute uri))
                   (some? (.getFragment uri))))
             (catch URISyntaxException _
               true)))
         (if (string? resource) [resource] resource))))

(defn- check-resource-indicators!
  "Throw the RFC 8707 `invalid_target` error when any `resource` indicator is malformed."
  [resource]
  (when (malformed-resource? resource)
    (throw (ex-info "resource is not a valid indicator" {:error             "invalid_target"
                                                         :error-description invalid-target-description}))))

(defn- redirect-authorization-decision
  "Issue a 302 redirect for an approved or denied authorization decision, clearing the CSRF cookie."
  [provider parsed approved request]
  (let [url (if approved
              (oidc/authorize provider parsed (str (:metabase-user-id request)))
              (oidc/deny-authorization provider parsed "access_denied" "User denied the request"))]
    ;; Record an audit event for the user's decision on this client's registration.
    (client-event/record-decision! (:client_id parsed) (:metabase-user-id request) approved)
    (-> {:status  302
         :headers {"Location" url}
         :body    ""}
        (response/set-cookie csrf-cookie-name "" (csrf-cookie-opts 0)))))

(defn- login-redirect-url
  "Build a redirect URL to the login page that will redirect back to the given path after login.
   Only allows redirecting back to OAuth paths to prevent open-redirect attacks."
  [request]
  (let [site-url    (system/site-url)
        uri         (:uri request)
        query       (:query-string request)
        return-path (when (str/starts-with? uri "/oauth/")
                      (if query (str uri "?" query) uri))
        redirect    (if return-path
                      (str site-url "/auth/login?redirect=" (URLEncoder/encode ^String return-path "UTF-8"))
                      (str site-url "/auth/login"))]
    redirect))

;;; ------------------------------------------------ Throttling ---------------------------------------------------

(def ^:private one-minute-ms (* 60 1000))
(def ^:private one-hour-ms (* 60 one-minute-ms))

;; /oauth/token is the highest-risk endpoint: unauthenticated, accepts client credentials,
;; and is the primary target for brute-forcing client secrets or replaying authorization codes.
;; Per-client_id is tight (one agent per client)
(def ^:private token-client-throttler
  (throttle/make-throttler :client-id :attempts-threshold 10 :attempt-ttl-ms one-hour-ms))

;; Per-IP is wider to accommodate many agents behind NAT each doing their own token refresh cycle.
(def ^:private token-ip-throttler
  (throttle/make-throttler :ip-address :attempts-threshold 50 :attempt-ttl-ms one-hour-ms))

;; /oauth/register is unauthenticated and creates server-side state (client records). Without
;; throttling, an attacker can exhaust storage or generate unlimited client_id/secret pairs. Per-IP
;; only since there's no identity at registration time. Threshold allows burst setup of several
;; agents without enabling sustained spam.
(def ^:private registration-throttler
  (throttle/make-throttler :ip-address :attempts-threshold 10 :attempt-ttl-ms one-minute-ms))

;; /oauth/authorize/decision is lower risk (requires authentication + CSRF token), but a
;; compromised session could automate consent-granting. A per-user cap limits the blast radius
;; while allowing setup of many agents in a single session.
(def ^:private authorize-decision-throttler
  (throttle/make-throttler :user-id :attempts-threshold 20 :attempt-ttl-ms one-hour-ms))

(defmacro ^:private with-throttling-429
  "Like [[throttle/with-throttling]], but turns a throttle exception into an
   OAuth-flavoured 429 response (`too_many_requests`) with Retry-After."
  {:style/indent 1}
  [bindings & body]
  `(try
     (throttle/with-throttling ~bindings ~@body)
     (catch ExceptionInfo e#
       (if (u.throttle/throttle-exception? e#)
         (u.throttle/throttle-response e# {:error             "too_many_requests"
                                           :error_description (ex-message e#)})
         (throw e#)))))

;;; ------------------------------------------------ Endpoints ----------------------------------------------------

(api.macros/defendpoint :post "/register"
  :- [:map [:status [:enum 201 400 403 404 429]] [:body :any]]
  "Handles dynamic client registration (RFC 7591)."
  [_route-params
   _query-params
   body :- [:maybe {:decode/api {:enter (fn [body] (when (map? body) body))}}
            ;; the RFC 7591 client metadata we keep -- see the column list in `metabase.oauth-server.store`
            [:map {:closed true}
             [:application_type           {:optional true} [:maybe :string]]
             [:client_name                {:optional true} [:maybe :string]]
             [:client_uri                 {:optional true} [:maybe :string]]
             [:contacts                   {:optional true} [:maybe [:sequential :string]]]
             [:grant_types                {:optional true} [:maybe [:sequential :string]]]
             [:logo_uri                   {:optional true} [:maybe :string]]
             [:redirect_uris              {:optional true} [:maybe [:sequential :string]]]
             [:response_types             {:optional true} [:maybe [:sequential :string]]]
             [:scope                      {:optional true} [:maybe :string]]
             [:token_endpoint_auth_method {:optional true} [:maybe :string]]]]
   request]
  (if-not (oauth-settings/oauth-server-dynamic-registration-enabled)
    {:status  403
     :headers {"Content-Type" "application/json"}
     :body    {"error" "registration_not_supported"}}
    (with-throttling-429 [registration-throttler (request/ip-address request)]
      (or (when-let [provider (oauth-server/get-provider)]
            (cond
              (nil? body)
              (invalid-client-metadata-response "Invalid or missing JSON body")

              ;; Only an omitted `scope` gets the default below; an empty one would register a client that
              ;; can never authorize.
              (and (contains? body :scope) (str/blank? (:scope body)))
              (invalid-client-metadata-response (empty-scope-description))

              ;; A client's registered scopes are the ceiling /authorize checks requests against, so a
              ;; self-nominated wildcard such as `*` would later be granted as one.
              (not (oauth-server/all-scopes-registered? (:scope body)))
              (invalid-client-metadata-response (unsupported-scopes-description))

              :else
              (try
                ;; MCP clients frequently omit application_type, scope, and may request
                ;; unsupported grant types. We are required to support poorly-configured
                ;; clients, so we apply sensible defaults here:
                ;; - application_type defaults to "native" (not the RFC default "web") so
                ;;   CLI tools and desktop apps can use HTTP loopback redirects.
                ;; - scope defaults to every scope any surface advertises. That is a ceiling on
                ;;   what the client may later request, not a grant (see
                ;;   [[metabase.oauth-server.core/default-grant-scopes]]), and clients derive what
                ;;   to request from discovery metadata rather than from this value.
                (let [body       (cond-> body
                                   (not (contains? body :application_type))
                                   (assoc :application_type "native")
                                   (not (contains? body :scope))
                                   (assoc :scope (str/join " " (oauth-server/default-grant-scopes)))
                                   ;; Remove client_credentials grant type — tokens issued without a
                                   ;; user context are unusable for MCP (validate-bearer-token requires
                                   ;; a valid user-id).
                                   (contains? body :grant_types)
                                   (update :grant_types (fn [gts] (vec (remove #{"client_credentials"} gts)))))
                      response   (oidc/dynamic-register-client provider body)
                      client-id  (:client_id response)]
                  ;; Mark as dynamically registered (the library doesn't know about registration_type)
                  (proto/update-client (:client-store provider) client-id {:registration-type "dynamic"})
                  ;; Open the audit trail for this DCR client with a pending decision.
                  (client-event/record-registration! client-id)
                  {:status  201
                   :headers {"Content-Type" "application/json"}
                   :body    response})
                (catch ExceptionInfo e
                  (reg/registration-error-response
                   (ex-message e)
                   (:error_description (ex-data e)))))))
          {:status 404 :body {:error "not_found"}}))))

(api.macros/defendpoint :get "/register/:client-id"
  :- [:map [:status [:enum 200 401 404]] [:body :map]]
  "Handles client configuration read (RFC 7592)."
  [{:keys [client-id]} :- [:map {:closed true}
                           [:client-id ms/NonBlankString]]
   _query-params
   _body
   request]
  (or (when-let [provider (oauth-server/get-provider)]
        (let [token (oauth-server/extract-bearer-token request)]
          (if (str/blank? token)
            {:status  401
             :headers {"Content-Type" "application/json"}
             :body    {"error" "invalid_token"}}
            (let [{:keys [status body]} (oidc/dynamic-read-client provider client-id token)]
              {:status  status
               :headers {"Content-Type" "application/json"}
               :body    body}))))
      {:status 404 :body {:error "not_found"}}))

(defn- authorization-error-code
  "The RFC 6749 section 4.1.2.1 (or RFC 8707) `error` code for the ex-data of an exception thrown while validating an
   authorization request."
  [{:keys [oauth-error error] :as data}]
  (or oauth-error
      ;; oidc-provider names a code only for its PKCE and resource-indicator errors; its response_type and scope
      ;; errors are told apart by the data they carry, and malformed parameters carry neither.
      error
      (cond
        (contains? data :response-type) "unsupported_response_type"
        (contains? data :requested)     "invalid_scope"
        :else                           "invalid_request")))

(defn- error-description
  "The `error_description` for an exception's ex-data: the one it carries, else `fallback`."
  [data fallback]
  (or (:error-description data)
      (:error_description data)
      fallback))

(defn- scope-to-grant
  "The scope a parsed authorization request may be granted: its requested scopes filtered to the registered ones,
   then narrowed to the `resource` indicator it names. Throws `ex-info` carrying `:oauth-error` and
   `:error-description` when the request names no scope, when none of its scopes are registered, or when none of
   them survive narrowing.

   Applied by both the consent page and the decision endpoint. The consent form's signature proves only that the
   form was not tampered with by a third party: it is keyed by the CSRF token the page shows the user, so the user
   can re-sign anything. The endpoint that issues the code has to apply these rules itself.

   Never returns a blank scope. The decision endpoint leans on that: it answers a nil grant with 403
   `params_tampered`, which is only the right status while the sole way to reach it is a choice naming an unoffered
   scope. A blank offer would make an honest approval look like tampering."
  [parsed]
  {:post [(not (str/blank? %))]}
  (let [;; A scope-less request would otherwise mint a token with no scopes.
        _          (when (str/blank? (:scope parsed))
                     (throw (ex-info "no scope was requested"
                                     {:oauth-error       "invalid_scope"
                                      :error-description (missing-scope-description)})))
        ;; A client can hold an unregistered scope from before registration validated them, and `scope-matches?`
        ;; would honor `*` or `agent:*` as a wildcard grant, so one must never survive. Dropping rather than
        ;; refusing (RFC 6749 section 3.3) keeps a client that still holds a since-deprecated scope able to
        ;; re-authorize, and the refusal would reach a browser tab rather than the client program. Filtered
        ;; before narrowing, so a request is treated the same with and without `resource`.
        registered (oauth-server/registered-scopes-only (:scope parsed))
        _          (when-not registered
                     (throw (ex-info "no requested scope is a registered scope"
                                     {:oauth-error       "invalid_scope"
                                      :error-description (no-supported-scopes-description)})))
        narrowed   (oauth-server/narrow-scope-to-resource (:resource parsed) registered)]
    ;; Nothing surviving means the client asked exclusively for scopes this resource does not
    ;; accept: dropping the parameter there renders a consent screen listing nothing and mints a
    ;; zero-scope token, which looks like success while authorizing nothing on the resource the
    ;; client named. RFC 6749 section 4.1.2.1 has an error for it.
    (when-not narrowed
      (throw (ex-info "no requested scope is accepted by the named resource"
                      {:oauth-error       "invalid_scope"
                       :error-description narrowed-away-scope-description
                       :resource          (:resource parsed)})))
    narrowed))

(defn- authorization-consent-response
  "Validate the authorization request `query-params` and return the consent page response, which sets the CSRF
   cookie. Throws `ex-info` when the request is invalid; its data may carry `:oauth-error` and `:error-description`."
  [provider query-params request]
  (let [_            (check-resource-indicators! (:resource query-params))
        ;; A blank scope is dropped so the provider validates the rest of the request first; the missing scope is
        ;; then reported as `invalid_scope` by [[scope-to-grant]].
        parsed       (oidc/parse-authorization-request provider
                                                       (cond-> query-params
                                                         (str/blank? (:scope query-params)) (dissoc :scope)))
        ;; Narrowed before signing, so the signature binds the granted scope through the consent form round-trip.
        parsed       (assoc parsed :scope (scope-to-grant parsed))
        client       (proto/get-client (:client-store provider) (:client_id parsed))
        csrf-token   (generate-csrf-token)
        oauth-params (select-keys parsed oauth-param-keys)
        params-sig   (sign-oauth-params csrf-token oauth-params)]
    (-> {:status                               200
         :headers                              {"Content-Type" "text/html; charset=utf-8"}
         ;; the page's inline script is nonce'd, so it needs the nonce in `script-src`
         mw.security/script-nonce-response-key true
         :body                                 (consent-page/render-consent-page
                                                {:client-name  (some-> (:client-name client) (truncate 64))
                                                 :nonce        (:nonce request)
                                                 :csrf-token   csrf-token
                                                 :params-sig   params-sig
                                                 :scopes       (requested-scope-descriptions (:scope oauth-params))
                                                 :oauth-params oauth-params})}
        (response/set-cookie csrf-cookie-name csrf-token (csrf-cookie-opts 600)))))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case]}
(api.macros/defendpoint :get "/authorize"
  :- [:map [:status [:enum 200 302 400 404]] [:body [:or :string :map]]]
  "Handles the authorization endpoint (GET /oauth/authorize)."
  [_route-params
   query-params :- [:map {:closed true}
                    [:client_id             {:optional true} [:maybe :string]]
                    [:response_type         {:optional true} [:maybe :string]]
                    [:redirect_uri          {:optional true} [:maybe :string]]
                    [:scope                 {:optional true} [:maybe :string]]
                    [:state                 {:optional true} [:maybe :string]]
                    [:code_challenge        {:optional true} [:maybe :string]]
                    [:code_challenge_method {:optional true} [:maybe :string]]
                    [:nonce                 {:optional true} [:maybe :string]]
                    [:resource              {:optional true} [:maybe [:or :string [:sequential :string]]]]]
   _body
   request]
  (if-not (:metabase-user-id request)
    {:status  302
     :headers {"Location" (login-redirect-url request)}
     :body    ""}
    (or (when-let [provider (oauth-server/get-provider)]
          (try
            (authorization-consent-response provider query-params request)
            (catch ExceptionInfo e
              (log/warnf "OAuth authorize request failed: %s" (ex-message e))
              ;; Reported to the user in their own browser, never by redirecting to the client's redirect URI.
              ;; Dynamic registration is unauthenticated, so a client can register any redirect URI it likes, and
              ;; redirecting errors there would turn a link on this host into a zero-click open redirector
              ;; (RFC 9700 section 4.11).
              (let [data  (ex-data e)
                    error (authorization-error-code data)]
                {:status  400
                 :headers {"Content-Type" "application/json"}
                 :body    {:error             error
                           :error_description (error-description data invalid-authorization-request-description)}}))))
        {:status 404 :body {:error "not_found"}})))

(api.macros/defendpoint :post "/authorize/decision"
  :- [:map [:status [:enum 302 400 401 403 404 429]] [:body [:or :string :map]]]
  "Handles the authorization decision (POST /oauth/authorize/decision)."
  [_route-params
   _query-params
   body :- [:map {:closed true, :decode/api {:enter (fn [body] (if (map? body) body {}))}}
            [:csrf_token            {:optional true} [:maybe :string]]
            [:params_sig            {:optional true} [:maybe :string]]
            [:approved              {:optional true} [:maybe :string]]
            [:client_id             {:optional true} [:maybe :string]]
            [:response_type         {:optional true} [:maybe :string]]
            [:redirect_uri          {:optional true} [:maybe :string]]
            [:scope                 {:optional true} [:maybe :string]]
            [:granted_scope         {:optional true} [:maybe [:or :string [:sequential :string]]]]
            [:state                 {:optional true} [:maybe :string]]
            [:code_challenge        {:optional true} [:maybe :string]]
            [:code_challenge_method {:optional true} [:maybe :string]]
            [:nonce                 {:optional true} [:maybe :string]]
            [:resource              {:optional true} [:maybe [:or :string [:sequential :string]]]]]
   request]
  (if-not (:metabase-user-id request)
    {:status  401
     :headers {"Content-Type" "application/json"}
     :body    {:error "unauthorized"}}
    (with-throttling-429 [authorize-decision-throttler (:metabase-user-id request)]
      (or (when-let [provider (oauth-server/get-provider)]
            (let [cookie-token (get-in request [:cookies csrf-cookie-name :value])
                  form-token   (some-> (:csrf_token body) str)
                  auth-params  (select-keys body oauth-param-keys)
                  params-sig   (some-> (:params_sig body) str)]
              (if (or (str/blank? cookie-token)
                      (str/blank? form-token)
                      (not (oidc-util/constant-time-eq? cookie-token form-token)))
                {:status  403
                 :headers {"Content-Type" "application/json"}
                 :body    {:error "csrf_validation_failed"}}
                (let [approved (= "true" (str (:approved body)))]
                  (try
                    (check-resource-indicators! (:resource auth-params))
                    (let [parsed        (oidc/parse-authorization-request provider auth-params)
                          ;; Verify the HMAC against the *parsed* params (same normalized form as the consent page).
                          ;; This must happen after parsing to ensure form-encoding round-trips don't cause mismatches.
                          parsed-params (select-keys parsed oauth-param-keys)
                          signature-ok? (and (not (str/blank? params-sig))
                                             (some? (re-matches #"[a-fA-F0-9]+" params-sig))
                                             (even? (count params-sig))
                                             (verify-oauth-params-signature cookie-token parsed-params params-sig))
                          ;; The signature says the form was not tampered with by a third party, not that its
                          ;; scope was ever validated: it is keyed by the CSRF token printed on the consent page,
                          ;; so the user can re-sign anything. This is where the code is issued, so the scope
                          ;; rules apply here too. A denial grants nothing and needs none of them. Evaluated only
                          ;; once the signature holds, so a forged form is still answered `params_tampered`.
                          offered       (when (and signature-ok? approved)
                                          (scope-tokens (scope-to-grant parsed)))
                          ;; The offered scope is what the consent page showed; the user's ticked boxes are
                          ;; unsigned, so they may only narrow the offer.
                          granted       (when (and signature-ok? approved)
                                          (granted-scopes offered (form-values (:granted_scope body))))]
                      (cond
                        (or (not signature-ok?)
                            ;; A choice naming a scope the consent page never offered.
                            (and approved (nil? granted)))
                        {:status  403
                         :headers {"Content-Type" "application/json"}
                         :body    {:error "params_tampered"}}

                        ;; Nothing granted would mint a token that can do nothing.
                        (and approved (empty? granted))
                        {:status  400
                         :headers {"Content-Type" "application/json"}
                         :body    {:error             "invalid_request"
                                   :error_description "No scope was selected."}}

                        :else
                        (redirect-authorization-decision provider
                                                         (cond-> parsed
                                                           approved
                                                           (assoc :scope (str/join " " granted)))
                                                         approved
                                                         request)))
                    (catch ExceptionInfo e
                      (log/warnf "OAuth authorization decision failed: %s" (ex-message e))
                      {:status  400
                       :headers {"Content-Type" "application/json"}
                       :body    {:error             "invalid_request"
                                 :error_description invalid-authorization-request-description}}))))))
          {:status 404 :body {:error "not_found"}}))))

(api.macros/defendpoint :post "/token"
  :- [:map [:status [:enum 200 400 401 404 429]] [:body :map]]
  "Handles the token endpoint (POST /oauth/token)."
  [_route-params
   _query-params
   body :- [:map {:closed true, :decode/api {:enter (fn [body] (if (map? body) body {}))}}
            [:grant_type    {:optional true} [:maybe :string]]
            [:code          {:optional true} [:maybe :string]]
            [:redirect_uri  {:optional true} [:maybe :string]]
            [:refresh_token {:optional true} [:maybe :string]]
            [:client_id     {:optional true} [:maybe :string]]
            [:client_secret {:optional true} [:maybe :string]]
            [:scope         {:optional true} [:maybe :string]]
            [:code_verifier {:optional true} [:maybe :string]]
            [:resource      {:optional true} [:maybe [:or :string [:sequential :string]]]]]
   request]
  (let [ip-address (request/ip-address request)
        ;; Fall back to IP when client_id isn't in the body (e.g. confidential clients using
        ;; HTTP Basic auth) to avoid pooling unrelated clients into a shared throttle bucket.
        client-id  (or (:client_id body) ip-address)]
    (with-throttling-429 [token-client-throttler client-id
                          token-ip-throttler     ip-address]
      (or (when-let [provider (oauth-server/get-provider)]
            (let [authorization-header (get-in request [:headers "authorization"])]
              (try
                (check-resource-indicators! (:resource body))
                (let [response (oidc/token-request provider body authorization-header)]
                  {:status  200
                   :headers {"Content-Type"  "application/json"
                             "Cache-Control" "no-store"
                             "Pragma"        "no-cache"}
                   :body    response})
                (catch ExceptionInfo e
                  (log/warnf "OAuth token request failed: %s" (ex-message e))
                  (let [data  (ex-data e)
                        error (or (:error data) "invalid_request")]
                    {:status  (if (= error "invalid_client") 401 400)
                     :headers {"Content-Type"  "application/json"
                               "Cache-Control" "no-store"
                               "Pragma"        "no-cache"}
                     :body    {:error             error
                               :error_description (error-description data invalid-token-request-description)}})))))
          {:status 404 :body {:error "not_found"}}))))

(api.macros/defendpoint :post "/revoke"
  :- [:map [:status [:enum 200 404]]]
  "Handles the token revocation endpoint (POST /oauth/revoke) per RFC 7009."
  [_route-params
   _query-params
   _body :- [:map {:closed true :decode/api {:enter (fn [body] (if (map? body) body {}))}}
             [:token           {:optional true} [:maybe :string]]
             [:token_type_hint {:optional true} [:maybe :string]]
             [:client_id       {:optional true} [:maybe :string]]
             [:client_secret   {:optional true} [:maybe :string]]]
   request]
  (or (when-let [provider (oauth-server/get-provider)]
        ((oidc/revocation-handler provider) request))
      {:status 404 :body {:error "not_found"}}))
