(ns metabase.oauth-server.api.oauth
  "OAuth protocol endpoints. Mounted under `/oauth/`."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.mac :as mac]
   [buddy.core.nonce :as nonce]
   [clojure.string :as str]
   [metabase.api.macros :as api.macros]
   [metabase.oauth-server.consent-page :as consent-page]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.oauth-server.settings :as oauth-settings]
   [metabase.request.core :as request]
   [metabase.system.core :as system]
   [metabase.util.log :as log]
   [metabase.util.throttle :as u.throttle]
   [oidc-provider.core :as oidc]
   [oidc-provider.protocol :as proto]
   [oidc-provider.registration :as reg]
   [oidc-provider.util :as oidc-util]
   [ring.util.response :as response]
   [throttle.core :as throttle])
  (:import
   (clojure.lang ExceptionInfo)
   (java.net URLEncoder)))

(set! *warn-on-reflection* true)

(def ^:private csrf-cookie-name "metabase.OAUTH_CSRF")

(defn- generate-csrf-token
  "Generate a random 32-hex-char CSRF token."
  []
  (codecs/bytes->hex (nonce/random-bytes 16)))

(defn- csrf-cookie-opts
  "Cookie options for the CSRF cookie. Sets `:secure` when site-url is HTTPS."
  [max-age]
  (cond-> {:http-only true
           :same-site :strict
           :path      "/oauth/authorize"
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

(defn- redirect-authorization-decision
  "Issue a 302 redirect for an approved or denied authorization decision, clearing the CSRF cookie."
  [provider parsed approved request]
  (let [url (if approved
              (oidc/authorize provider parsed (str (:metabase-user-id request)))
              (oidc/deny-authorization provider parsed "access_denied" "User denied the request"))]
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
  [_route-params _query-params body :- :any
   request]
  (if-not (oauth-settings/oauth-server-dynamic-registration-enabled)
    {:status  403
     :headers {"Content-Type" "application/json"}
     :body    {"error" "registration_not_supported"}}
    (with-throttling-429 [registration-throttler (request/ip-address request)]
      (or (when-let [provider (oauth-server/get-provider)]
            (if (nil? body)
              {:status  400
               :headers {"Content-Type" "application/json"}
               :body    {"error"             "invalid_client_metadata"
                         "error_description" "Invalid or missing JSON body"}}
              (try
                ;; MCP clients frequently omit application_type, scope, and may request
                ;; unsupported grant types. We are required to support poorly-configured
                ;; clients, so we apply sensible defaults here:
                ;; - application_type defaults to "native" (not the RFC default "web") so
                ;;   CLI tools and desktop apps can use HTTP loopback redirects.
                ;; - scope defaults to all provider-supported scopes when not specified.
                (let [body       (cond-> body
                                   (not (contains? body :application_type))
                                   (assoc :application_type "native")
                                   (not (contains? body :scope))
                                   (assoc :scope (str/join " " (oauth-server/all-agent-scopes)))
                                   ;; Remove client_credentials grant type — tokens issued without a
                                   ;; user context are unusable for MCP (validate-bearer-token requires
                                   ;; a valid user-id).
                                   (contains? body :grant_types)
                                   (update :grant_types (fn [gts] (vec (remove #{"client_credentials"} gts)))))
                      response   (oidc/dynamic-register-client provider body)
                      client-id  (:client_id response)]
                  ;; Mark as dynamically registered (the library doesn't know about registration_type)
                  (proto/update-client (:client-store provider) client-id {:registration-type "dynamic"})
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
  [{:keys [client-id]}
   _query-params _body
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

(api.macros/defendpoint :get "/authorize"
  :- [:map [:status [:enum 200 302 400 404]] [:body [:or :string :map]]]
  "Handles the authorization endpoint (GET /oauth/authorize)."
  [_route-params query-params _body
   request]
  (if-not (:metabase-user-id request)
    {:status  302
     :headers {"Location" (login-redirect-url request)}
     :body    ""}
    (or (when-let [provider (oauth-server/get-provider)]
          (try
            (let [parsed       (oidc/parse-authorization-request provider query-params)
                  client       (proto/get-client (:client-store provider) (:client_id parsed))
                  csrf-token   (generate-csrf-token)
                  oauth-params (select-keys parsed oauth-param-keys)
                  params-sig   (sign-oauth-params csrf-token oauth-params)]
              (-> {:status  200
                   :headers {"Content-Type" "text/html; charset=utf-8"}
                   :body    (consent-page/render-consent-page
                             {:client-name  (some-> (:client-name client) (truncate 64))
                              :client-id    (:client_id parsed)
                              :nonce        (:nonce request)
                              :csrf-token   csrf-token
                              :params-sig   params-sig
                              :oauth-params oauth-params})}
                  (response/set-cookie csrf-cookie-name csrf-token (csrf-cookie-opts 600))))
            (catch ExceptionInfo e
              (log/warn e "OAuth authorize request failed")
              {:status  400
               :headers {"Content-Type" "application/json"}
               :body    {:error             "invalid_request"
                         :error_description "The authorization request is invalid."}})))
        {:status 404 :body {:error "not_found"}})))

(api.macros/defendpoint :post "/authorize/decision"
  :- [:map [:status [:enum 302 400 401 403 404 429]] [:body [:or :string :map]]]
  "Handles the authorization decision (POST /oauth/authorize/decision)."
  [_route-params _query-params body
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
                    (let [parsed        (oidc/parse-authorization-request provider auth-params)
                          ;; Verify the HMAC against the *parsed* params (same normalized form as the consent page).
                          ;; This must happen after parsing to ensure form-encoding round-trips don't cause mismatches.
                          parsed-params (select-keys parsed oauth-param-keys)]
                      (if (or (str/blank? params-sig)
                              (not (re-matches #"[a-fA-F0-9]+" params-sig))
                              (odd? (count params-sig))
                              (not (verify-oauth-params-signature cookie-token parsed-params params-sig)))
                        {:status  403
                         :headers {"Content-Type" "application/json"}
                         :body    {:error "params_tampered"}}
                        (redirect-authorization-decision provider parsed approved request)))
                    (catch ExceptionInfo e
                      (log/warn e "OAuth authorization decision failed")
                      {:status  400
                       :headers {"Content-Type" "application/json"}
                       :body    {:error             "invalid_request"
                                 :error_description "The authorization request is invalid."}}))))))
          {:status 404 :body {:error "not_found"}}))))

(api.macros/defendpoint :post "/token"
  :- [:map [:status [:enum 200 400 401 404 429]] [:body :map]]
  "Handles the token endpoint (POST /oauth/token)."
  [_route-params _query-params body
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
                (let [response (oidc/token-request provider body authorization-header)]
                  {:status  200
                   :headers {"Content-Type"  "application/json"
                             "Cache-Control" "no-store"
                             "Pragma"        "no-cache"}
                   :body    response})
                (catch ExceptionInfo e
                  (log/warn e "OAuth token request failed")
                  (let [data  (ex-data e)
                        error (or (:error data) "invalid_request")]
                    {:status  (if (= error "invalid_client") 401 400)
                     :headers {"Content-Type"  "application/json"
                               "Cache-Control" "no-store"
                               "Pragma"        "no-cache"}
                     :body    {:error             error
                               :error_description (or (:error_description data) "The token request is invalid.")}})))))
          {:status 404 :body {:error "not_found"}}))))

(api.macros/defendpoint :post "/revoke"
  :- [:map [:status [:enum 200 404]]]
  "Handles the token revocation endpoint (POST /oauth/revoke) per RFC 7009."
  [_route-params _query-params _body
   request]
  (or (when-let [provider (oauth-server/get-provider)]
        ((oidc/revocation-handler provider) request))
      {:status 404 :body {:error "not_found"}}))
