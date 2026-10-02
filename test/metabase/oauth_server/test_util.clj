(ns metabase.oauth-server.test-util
  "Helpers for tests that exercise the OAuth server.

  The flow helpers here drive the public `/oauth` endpoints end to end — register, consent, exchange, refresh, read
  the registration back — so that a test can assert what a client can and cannot do rather than reading a column.
  [[metabase.oauth-server.api-test]] keeps its own variants of the flow, which take the extra PKCE and RFC 8707
  parameters those tests vary; the page-scraping and credential helpers are shared from here."
  (:require
   [clojure.string :as str]
   [metabase.test :as mt]
   [metabase.test.http-client :as client])
  (:import
   (java.util Base64)))

(set! *warn-on-reflection* true)

(defmacro with-oauth-client
  "Execute `body` with a freshly registered `oauth_client` row, binding `client-id-binding` to its
   `client_id`, and delete the row when `body` exits. Save test tokens against this client id —
   see [[metabase.oauth-server.core/resolve-access-token]] for why a token needs a live client."
  [[client-id-binding] & body]
  `(mt/with-temp [:model/OAuthClient {~client-id-binding :client_id}
                  {:client_id         (str (random-uuid))
                   :redirect_uris     ["https://example.com/callback"]
                   :grant_types       ["authorization_code"]
                   :response_types    ["code"]
                   :scopes            ["openid"]
                   :registration_type "static"}]
     ~@body))

(def ^:private redirect-uri
  "The redirect URI every helper in this namespace registers and authorizes against."
  "https://example.com/callback")

;;; The `/oauth` endpoints are not under `/api`, so every helper roots the test client at the server instead.

(defn register-client!
  "Register a confidential client through the public `POST /oauth/register` (RFC 7591), asking for `scopes`.
  `oauth-server-dynamic-registration-enabled` has to be on. Returns the registration response, the only place the
  plaintext `:client_secret` and `:registration_access_token` are ever readable.

  Registering repeatedly is fine: `/oauth/register`'s per-IP throttle counts only failed attempts."
  [scopes & {:as overrides}]
  (binding [client/*url-prefix* ""]
    (client/client :post 201 "oauth/register"
                   (merge {:redirect_uris              [redirect-uri]
                           :client_name                "Test Client"
                           :grant_types                ["authorization_code" "refresh_token"]
                           :response_types             ["code"]
                           :scope                      (str/join " " scopes)
                           :token_endpoint_auth_method "client_secret_basic"}
                          overrides))))

(defn hidden-field
  "The value of the hidden form field `field` on the consent page `body`."
  [body field]
  (second (re-find (re-pattern (str "name=\"" field "\"[^>]*value=\"([^\"]*)\"")) body)))

(defn csrf-cookie
  "The consent page's CSRF cookie value, from the `:cookies` map or the `Set-Cookie` header."
  [response]
  (or (get-in response [:cookies "metabase.OAUTH_CSRF" :value])
      (let [set-cookie (get-in response [:headers "Set-Cookie"])]
        (some #(when (string? %) (second (re-find #"metabase\.OAUTH_CSRF=([a-f0-9]+)" %)))
              (cond
                (string? set-cookie)     [set-cookie]
                (sequential? set-cookie) set-cookie
                :else                    [])))))

(defn query-param
  "The value of query parameter `param` in `url`."
  [url param]
  (when-let [query (second (str/split (str url) #"\?" 2))]
    (some (fn [pair]
            (let [[k v] (str/split pair #"=" 2)]
              (when (= k param) v)))
          (str/split query #"&"))))

(defn consent-page
  "`GET /oauth/authorize` as `user` for `client-id`, requesting `scopes`. Returns the full response whatever its
  status: 200 carrying the consent page for a client that may still ask a user, and the library's own error for one
  that may not."
  [user client-id scopes]
  (binding [client/*url-prefix* ""]
    ;; `/oauth/authorize` answers a stale session with a login 302 rather than the 401 the test client retries, so
    ;; revalidate the session first, as the OAuth API test does.
    (mt/user-http-request user :get 200 "api/user/current")
    (mt/user-http-request-full-response
     user :get "oauth/authorize"
     :client_id     client-id
     :redirect_uri  redirect-uri
     :response_type "code"
     :scope         (str/join " " scopes)
     :state         "test-state")))

(defn- approve!
  "Approve the consent page in `consent` as `user`, granting every scope it offers. Returns the 302 decision
  response, whose `Location` carries the authorization code."
  [user client-id consent]
  (let [body    (:body consent)
        offered (hidden-field body "scope")]
    (binding [client/*url-prefix* ""]
      (mt/user-http-request-full-response
       user :post 302 "oauth/authorize/decision"
       {:request-options {:headers {"content-type" "application/x-www-form-urlencoded"
                                    "cookie"       (str "metabase.OAUTH_CSRF=" (csrf-cookie consent))}}}
       {:approved      "true"
        :csrf_token    (hidden-field body "csrf_token")
        :params_sig    (hidden-field body "params_sig")
        :client_id     client-id
        :redirect_uri  redirect-uri
        :response_type "code"
        :scope         offered
        :granted_scope (vec (str/split offered #" "))
        :state         "test-state"}))))

(defn basic-auth
  "An HTTP Basic `Authorization` header value for a confidential client."
  [client-id client-secret]
  (str "Basic " (.encodeToString (Base64/getEncoder)
                                 (.getBytes (str client-id ":" client-secret) "UTF-8"))))

(defn- token-request!
  "`POST /oauth/token` with form-encoded `params`, authenticating as the registered `client`."
  [client params & {:keys [expected-status] :or {expected-status 200}}]
  (binding [client/*url-prefix* ""]
    (client/client :post expected-status "oauth/token"
                   {:request-options {:headers {"content-type"  "application/x-www-form-urlencoded"
                                                "authorization" (basic-auth (:client_id client)
                                                                            (:client_secret client))}}}
                   params)))

(defn grant!
  "Drive the whole public authorization-code flow as `user` for the registered `client`: consent page, approve every
  offered scope, exchange the code. Returns the token response, carrying `:access_token` and `:refresh_token`."
  [user client scopes]
  (let [decision (approve! user (:client_id client) (consent-page user (:client_id client) scopes))]
    (token-request! client {:grant_type   "authorization_code"
                            :code         (query-param (get-in decision [:headers "Location"]) "code")
                            :redirect_uri redirect-uri})))

(defn refresh!
  "Exchange `refresh-token` for a fresh token pair as `client`, expecting `expected-status`."
  [client refresh-token & {:as opts}]
  (token-request! client {:grant_type "refresh_token" :refresh_token refresh-token} opts))

(defn read-registration
  "The RFC 7592 read of `client`'s own registration, with its `registration_access_token`."
  [client & {:keys [expected-status] :or {expected-status 200}}]
  (binding [client/*url-prefix* ""]
    (client/client :get expected-status (str "oauth/register/" (:client_id client))
                   {:request-options
                    {:headers {"authorization" (str "Bearer " (:registration_access_token client))}}})))

(defn current-user-with-bearer
  "`GET /api/user/current` with `access-token` as a bearer, expecting `expected-status`."
  [access-token & {:keys [expected-status] :or {expected-status 200}}]
  (binding [client/*url-prefix* ""]
    (client/client :get expected-status "api/user/current"
                   {:request-options {:headers {"authorization" (str "Bearer " access-token)}}})))
