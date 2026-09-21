(ns metabase.oauth-server.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.config.core :as config]
   [metabase.mcp.core :as mcp]
   [metabase.oauth-server.api.oauth :as api.oauth]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [oidc-provider.util :as oidc-util]
   [toucan2.core :as t2])
  (:import
   (java.net URLEncoder)
   (java.security MessageDigest)
   (java.util Base64)))

;; reset-provider! is safe here — it resets a local atom, no global side effects.
(use-fixtures :each (fn [thunk]
                      (oauth-server/reset-provider!)
                      (binding [client/*url-prefix* ""]
                        (thunk))
                      (oauth-server/reset-provider!)))

(deftest discovery-endpoint-test
  (testing "Discovery endpoint returns valid OAuth metadata"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (let [response (mt/user-http-request :crowberto :get 200
                                           ".well-known/oauth-authorization-server")]
        (is (=? {:issuer                 "http://localhost:3000"
                 :authorization_endpoint string?
                 :token_endpoint         string?
                 :response_types_supported sequential?
                 :registration_endpoint  "http://localhost:3000/oauth/register"}
                response))
        (is (nil? (:jwks_uri response)))
        (is (nil? (:id_token_signing_alg_values_supported response)))))))

(deftest protected-resource-metadata-test
  (testing "each MCP path advertises *itself* as the OAuth protected resource (RFC 9728), so a strict
            client connecting via an alias sees a resource value matching the URL it hit"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (doseq [path ["/api/metabase-mcp" "/api/mcp"]]
        (testing path
          (let [response (mt/user-http-request :crowberto :get 200
                                               (str ".well-known/oauth-protected-resource" path))]
            (is (=? {:resource                 (str "http://localhost:3000" path)
                     :authorization_servers    ["http://localhost:3000"]
                     :bearer_methods_supported ["header"]
                     :scopes_supported         sequential?}
                    response))))))))

(deftest protected-resource-metadata-advertises-the-baseline-test
  (testing "GHY-4543: every protected-resource endpoint, including the bare one, advertises only the baseline. Claude
            Code and the Claude connectors take their first-login scope from `scopes_supported` here; every tool is
            still listed, and a call needing more is answered with a 403 `insufficient_scope` step-up. The baseline
            must be accepted by the `:resource` the document names, or the first login is narrowed away; asserted
            against that `:resource` rather than the URL requested, so the two cannot drift."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (doseq [url [".well-known/oauth-protected-resource"
                   ".well-known/oauth-protected-resource/api/metabase-mcp"
                   ".well-known/oauth-protected-resource/api/mcp"]]
        (testing url
          (let [response      (mt/user-http-request :crowberto :get 200 url)
                resource-path (str/replace (:resource response) "http://localhost:3000" "")]
            (is (= #{"agent:content:read" "agent:query:run" "agent:resource:read"}
                   (set (:scopes_supported response))))
            (is (empty? (remove (set (oauth-server/mcp-resource-scopes resource-path))
                                (:scopes_supported response))))))))))

(deftest authorization-server-metadata-stays-wide-test
  (testing "GHY-4543: the RFC 8414 document keeps advertising every v2 scope, alongside the rest of the default grant.
            Codex requests exactly this list on every login and never steps up, so narrowing it would strand Codex
            at the baseline."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [advertised (set (:scopes_supported (mt/user-http-request :crowberto :get 200
                                                                     ".well-known/oauth-authorization-server")))]
        (doseq [scope ["agent:content:read" "agent:content:write" "agent:query:run"
                       "agent:sql:run" "agent:delivery:write" "agent:resource:read"]]
          (testing scope
            (is (contains? advertised scope))))
        (is (= (set (oauth-server/supported-scopes)) advertised))))))

(deftest protected-resource-metadata-bare-path-test
  (testing "GET /.well-known/oauth-protected-resource (no resource suffix) serves JSON advertising the canonical resource (BOT-1617)"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [response (mt/user-http-request :crowberto :get 200
                                           ".well-known/oauth-protected-resource")]
        (is (=? {:resource                 "http://localhost:3000/api/metabase-mcp"
                 :authorization_servers    ["http://localhost:3000"]
                 :bearer_methods_supported ["header"]}
                response))
        (testing "the bare path is the one clients probe, so it advertises the same baseline as the canonical
                  path it names, and none of the retired per-entity agent-API scopes"
          (is (= #{"agent:content:read" "agent:query:run" "agent:resource:read"}
                 (set (:scopes_supported response))))
          (is (not (contains? (set (:scopes_supported response)) "agent:question:create"))))))))

(deftest discovery-endpoint-rebuilds-on-site-url-change-test
  (testing "Discovery advertises endpoints for the *current* site-url, even after it changes (BOT-1617)"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (is (=? {:issuer "http://localhost:3000"}
              (mt/user-http-request :crowberto :get 200 ".well-known/oauth-authorization-server"))))
    (mt/with-temporary-setting-values [site-url "https://mb.example.com"]
      (is (=? {:issuer                "https://mb.example.com"
               :authorization_endpoint "https://mb.example.com/oauth/authorize"
               :token_endpoint         "https://mb.example.com/oauth/token"}
              (mt/user-http-request :crowberto :get 200 ".well-known/oauth-authorization-server"))))))

;;; ----------------------------------------- Dynamic Client Registration ----------------------------------------------

(defn- register-client!
  "Helper to register a dynamic client via POST /oauth/register."
  [body & {:keys [expected-status] :or {expected-status 201}}]
  (client/client :post expected-status "oauth/register" body))

(defn- read-client-config
  "Helper to read client config via GET /oauth/register/:client-id with bearer token."
  [client-id token & {:keys [expected-status] :or {expected-status 200}}]
  (client/client :get expected-status (str "oauth/register/" client-id)
                 {:request-options {:headers {"authorization" (str "Bearer " token)}}}))

(deftest dynamic-register-valid-test
  (testing "POST /oauth/register with valid metadata returns 201 with credentials"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [response (register-client! {:redirect_uris               ["https://example.com/callback"]
                                          :client_name                "Test Client"
                                          :token_endpoint_auth_method "client_secret_basic"})]
          (is (=? {:client_id                 string?
                   :client_secret             string?
                   :registration_access_token string?
                   :redirect_uris             ["https://example.com/callback"]
                   :client_name               "Test Client"}
                  response)))))))

(deftest dynamic-register-missing-redirect-uris-test
  (testing "POST /oauth/register with missing redirect_uris returns 400"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (let [response (register-client! {:client_name "No Redirects"}
                                       :expected-status 400)]
        (is (=? {:error "invalid_client_metadata"} response))))))

(deftest dynamic-register-non-https-redirect-test
  (testing "POST /oauth/register with non-HTTPS redirect URI returns 400"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (let [response (register-client! {:redirect_uris ["http://example.com/callback"]}
                                       :expected-status 400)]
        (is (=? {:error "invalid_client_metadata"} response))))))

(deftest dynamic-register-native-http-localhost-allowed-test
  (testing "POST /oauth/register with application_type=native allows HTTP localhost redirect URI"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [response (register-client! {:redirect_uris    ["http://localhost:8080/callback"]
                                          :application_type "native"})]
          (is (=? {:client_id     string?
                   :redirect_uris ["http://localhost:8080/callback"]}
                  response)))))))

(deftest dynamic-register-sets-registration-type-test
  (testing "Dynamically registered client has registration_type = dynamic"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [response  (register-client! {:redirect_uris ["https://example.com/callback"]})
              client-id (:client_id response)
              db-client (t2/select-one :model/OAuthClient :client_id client-id)]
          (is (= "dynamic" (:registration_type db-client))))))))

(deftest dynamic-register-records-registered-event-test
  (testing "POST /oauth/register records a `registered` audit event with no user for the new client"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [response  (register-client! {:redirect_uris ["https://example.com/callback"]})
              client-pk (t2/select-one-pk :model/OAuthClient :client_id (:client_id response))
              events    (t2/select :model/OAuthClientEvent :oauth_client_id client-pk)]
          (is (= 1 (count events)) "Exactly one client event row should have been created")
          (is (= "registered" (:event_type (first events))))
          (is (nil? (:user_id (first events)))))))))

(deftest dynamic-client-read-valid-test
  (testing "GET /oauth/register/:client-id with valid registration_access_token returns 200"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [reg-response  (register-client! {:redirect_uris ["https://example.com/callback"]
                                               :client_name   "Read Test"})
              client-id     (:client_id reg-response)
              token         (:registration_access_token reg-response)
              read-response (read-client-config client-id token)]
          (is (=? {:client_id     client-id
                   :redirect_uris ["https://example.com/callback"]}
                  read-response)))))))

(deftest dynamic-client-read-invalid-token-test
  (testing "GET /oauth/register/:client-id with invalid token returns 401"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [reg-response (register-client! {:redirect_uris ["https://example.com/callback"]})
              client-id    (:client_id reg-response)
              response     (read-client-config client-id "wrong-token" :expected-status 401)]
          (is (= "invalid_token" (:error response))))))))

(deftest dynamic-client-read-missing-token-test
  (testing "GET /oauth/register/:client-id with missing Authorization header returns 401"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [reg-response (register-client! {:redirect_uris ["https://example.com/callback"]})
              client-id    (:client_id reg-response)]
          ;; Use mt/user-http-request (which doesn't set Authorization header, only session header)
          (is (= "invalid_token"
                 (:error (mt/user-http-request :crowberto :get 401
                                               (str "oauth/register/" client-id))))))))))

(deftest dynamic-client-read-wrong-client-id-test
  (testing "GET /oauth/register/:client-id with wrong client-id returns 401"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [reg-response (register-client! {:redirect_uris ["https://example.com/callback"]})
              token        (:registration_access_token reg-response)
              response     (read-client-config "nonexistent-client" token :expected-status 401)]
          (is (= "invalid_token" (:error response))))))))

;;; --------------------------------- Dynamic Registration Security Tests -----------------------------------------

(deftest dynamic-register-disabled-test
  (testing "POST /oauth/register returns 403 when dynamic registration is disabled"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled false]
      (let [response (register-client! {:redirect_uris ["https://example.com/callback"]}
                                       :expected-status 403)]
        (is (= "registration_not_supported" (:error response)))))))

(deftest dynamic-register-rejects-unregistered-scopes-test
  (testing "GHY-4542: registration is unauthenticated, and a client's registered scopes are the ceiling
            `/oauth/authorize` checks requests against. Storing a self-nominated `*` or `agent:*` lets the
            client request it later and receive a token `scope-matches?` treats as a wildcard grant, so
            any scope that is not a registered scope is rejected before anything is stored. The error
            points the client at the metadata document listing the supported scopes and does not echo
            what it sent."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (doseq [scope ["*" "agent:*" "bogus" "agent:content:read *" "agent:ü\"x\\"]]
          (testing (pr-str scope)
            (let [before   (t2/count :model/OAuthClient)
                  response (register-client! {:redirect_uris ["https://example.com/callback"]
                                              :scope         scope}
                                             :expected-status 400)]
              (is (= {:error             "invalid_client_metadata"
                      :error_description (str "The request contained unsupported scopes. Request only scopes listed "
                                              "in scopes_supported at "
                                              "http://localhost:3000/.well-known/oauth-authorization-server")}
                     response)
                  "the description tells the client where the supported scopes are listed, without echoing what it
                   sent, and stays within the RFC 6749 section 5.2 character set")
              (is (= before (t2/count :model/OAuthClient))
                  "no client is stored"))))))))

(deftest dynamic-register-rejects-empty-scope-test
  (testing "GHY-4542: a client that sends `scope` but leaves it empty would register with no scopes and could
            never authorize, since /oauth/authorize requires a scope. That is rejected rather than silently
            replaced with the default ceiling, which is reserved for a client that omits `scope` entirely
            (pinned in `dynamic-register-accepts-registered-scopes-test`)."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        ;; `nil` is encoded as JSON null. Were the key dropped in decoding, the client would get the default
        ;; ceiling and a 201.
        (doseq [body [{:redirect_uris ["https://example.com/callback"] :scope nil}
                      {:redirect_uris ["https://example.com/callback"] :scope ""}
                      {:redirect_uris ["https://example.com/callback"] :scope "   "}]]
          (testing (pr-str body)
            (let [before   (t2/count :model/OAuthClient)
                  response (register-client! body :expected-status 400)]
              (is (= {:error             "invalid_client_metadata"
                      :error_description (str "The scope must not be empty. Omit scope, or include only scopes "
                                              "listed in scopes_supported at "
                                              "http://localhost:3000/.well-known/oauth-authorization-server")}
                     response))
              (is (= before (t2/count :model/OAuthClient))
                  "no client is stored"))))
        (testing "`scope` is a space-delimited string, so an empty JSON array fails the body schema"
          (let [before (t2/count :model/OAuthClient)]
            (register-client! {:redirect_uris ["https://example.com/callback"] :scope []}
                              :expected-status 400)
            (is (= before (t2/count :model/OAuthClient))
                "no client is stored")))))))

(deftest dynamic-register-accepts-registered-scopes-test
  (testing "GHY-4542: rejecting unregistered scopes must not reject registered ones"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (testing "an explicit set of registered scopes is stored as sent"
          (let [response (register-client! {:redirect_uris ["https://example.com/callback"]
                                            :scope         "agent:content:read agent:query:run"})]
            (is (= #{"agent:content:read" "agent:query:run"}
                   (set (:scopes (t2/select-one :model/OAuthClient :client_id (:client_id response))))))))
        (testing "`mb:full` is registered, and the Metabase CLI registers with it explicitly"
          (let [response (register-client! {:redirect_uris ["https://example.com/callback"]
                                            :scope         oauth-server/full-access-scope})]
            (is (= #{oauth-server/full-access-scope}
                   (set (:scopes (t2/select-one :model/OAuthClient :client_id (:client_id response))))))))
        (testing "omitting `scope` still registers the client with the default ceiling"
          (let [response (register-client! {:redirect_uris ["https://example.com/callback"]})]
            (is (= (set (oauth-server/default-grant-scopes))
                   (set (:scopes (t2/select-one :model/OAuthClient :client_id (:client_id response))))))))))))

(deftest discovery-registration-endpoint-disabled-test
  (testing "Discovery document omits registration_endpoint when DCR is disabled"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled false]
      (let [response (mt/user-http-request :crowberto :get 200
                                           ".well-known/oauth-authorization-server")]
        (is (not (contains? response :registration_endpoint)))))))

(deftest discovery-registration-endpoint-enabled-test
  (testing "Discovery document includes registration_endpoint when DCR is enabled"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (let [response (mt/user-http-request :crowberto :get 200
                                           ".well-known/oauth-authorization-server")]
        (is (= "http://localhost:3000/oauth/register" (:registration_endpoint response)))))))

;;; ----------------------------------------- Authorization Endpoint ------------------------------------------------

(defn- create-test-client!
  "Insert a static OAuth client directly into the database and return a map
   with the client fields plus the plaintext `:client_secret`."
  ([]
   (create-test-client! {}))
  ([overrides]
   (let [client-secret (oidc-util/generate-client-secret)
         defaults      {:client_id          (str (random-uuid))
                        :client_type        "confidential"
                        :client_secret_hash (oidc-util/hash-client-secret client-secret)
                        :redirect_uris      ["https://example.com/callback"]
                        :client_name        "Test Auth Client"
                        :grant_types        ["authorization_code" "refresh_token"]
                        :response_types     ["code"]
                        :scopes             ["agent:content:read"]
                        :application_type   "web"
                        :registration_type  "static"}
         [inserted]    (t2/insert-returning-instances! :model/OAuthClient (merge defaults overrides))]
     (assoc inserted :client_secret client-secret))))

(deftest authorize-valid-request-test
  (testing "GET /oauth/authorize with valid params returns HTML consent page"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client    (create-test-client!)
              client-id (:client_id client)
              response  (mt/user-http-request-full-response
                         :crowberto :get 200 "oauth/authorize"
                         :client_id     client-id
                         :redirect_uri  "https://example.com/callback"
                         :response_type "code"
                         :scope         "agent:content:read"
                         :state         "test-state")
              body      (:body response)]
          (is (str/includes? (get-in response [:headers "Content-Type"]) "text/html"))
          (is (str/includes? body "Test Auth Client"))
          (is (str/includes? body "agent:content:read"))
          (is (str/includes? body client-id))
          (is (str/includes? body "test-state"))
          (is (str/includes? body "/oauth/authorize/decision")))))))

(defn- authorize-request!
  "GET /oauth/authorize as crowberto with the query `params` key-value pairs, expecting `expected-status`. Returns the
   full response."
  [expected-status & params]
  (apply mt/user-http-request-full-response :crowberto :get expected-status "oauth/authorize" params))

(def ^:private invalid-request-description "The authorization request is invalid.")

(def ^:private invalid-target-description
  "The resource parameter must be an absolute URI without a fragment.")

(def ^:private invalid-token-request-description "The token request is invalid.")

(deftest authorize-invalid-client-id-test
  (testing "GHY-4542: a missing or unknown client identifier is answered with a 400 in the user's browser, with no
            redirect anywhere, even when the request also carries a second error."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (doseq [client-params [[:client_id "nonexistent-client"] [:client_id ""] []]]
        (testing (pr-str client-params)
          (let [response (apply authorize-request! 400
                                :redirect_uri  "https://example.com/callback"
                                :response_type "code"
                                :scope         "*"
                                :state         "test-state"
                                client-params)]
            (is (= "invalid_request" (get-in response [:body :error])))
            (is (nil? (get-in response [:headers "Location"])))))))))

(deftest authorize-mismatched-redirect-uri-test
  (testing "GHY-4542: a redirect_uri that is missing, or is not registered for the requesting client (matched
            exactly, so a trailing slash, an added query, or another client's registration all count as
            unregistered), is answered with a 400 in the user's browser and no Location header."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client-id (:client_id (create-test-client!))]
          (create-test-client! {:redirect_uris ["https://other.example.com/callback"]})
          (doseq [redirect-params [[:redirect_uri "https://evil.com/callback"]
                                   [:redirect_uri "https://example.com/callback/"]
                                   [:redirect_uri "https://example.com/callback?next=https://evil.com"]
                                   ;; registered, but for a different client
                                   [:redirect_uri "https://other.example.com/callback"]
                                   [:redirect_uri ""]
                                   []]]
            (testing (pr-str redirect-params)
              (let [response (apply authorize-request! 400
                                    :client_id     client-id
                                    :response_type "code"
                                    :scope         "*"
                                    :state         "test-state"
                                    redirect-params)]
                (is (= "invalid_request" (get-in response [:body :error])))
                (is (nil? (get-in response [:headers "Location"])))))))))))

(deftest authorize-request-errors-name-their-rfc-error-code-test
  (testing "GHY-4542: every authorize error is a 400 JSON body in the user's browser, and each names the RFC 6749
            section 4.1.2.1 (or RFC 8707) code for what was wrong. oidc-provider labels its response_type and scope
            failures only in the data it throws, which is what these codes are derived from."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client-id        (:client_id (create-test-client!))
              public-client-id (:client_id (create-test-client! {:client_type "public"}))]
          (doseq [[description error params]
                  [["an unsupported response_type"
                    "unsupported_response_type" [:client_id client-id :response_type "token"
                                                 :scope "agent:content:read"]]
                   ["a missing response_type"
                    "invalid_request" [:client_id client-id :scope "agent:content:read"]]
                   ["a scope the client did not register"
                    "invalid_scope" [:client_id client-id :response_type "code" :scope "agent:sql:execute"]]
                   ["a public client without PKCE"
                    "invalid_request" [:client_id public-client-id :response_type "code"
                                       :scope "agent:content:read"]]
                   ["code_challenge_method without code_challenge"
                    "invalid_request" [:client_id client-id :response_type "code" :scope "agent:content:read"
                                       :code_challenge_method "S256"]]
                   ["an unsupported code_challenge_method"
                    "invalid_request" [:client_id client-id :response_type "code" :scope "agent:content:read"
                                       :code_challenge "abc" :code_challenge_method "plain"]]
                   ["a relative resource indicator"
                    "invalid_target" [:client_id client-id :response_type "code" :scope "agent:content:read"
                                      :resource "not-absolute"]]
                   ["a resource indicator with a fragment"
                    "invalid_target" [:client_id client-id :response_type "code" :scope "agent:content:read"
                                      :resource "http://localhost:3000/api/mcp#fragment"]]]]
            (testing description
              (let [response (apply authorize-request! 400
                                    :redirect_uri "https://example.com/callback"
                                    :state        "test-state"
                                    params)]
                (is (= {:error             error
                        ;; every `invalid_target`, however the indicator is wrong, says what a valid one looks like
                        :error_description (if (= error "invalid_target")
                                             invalid-target-description
                                             invalid-request-description)}
                       (:body response)))
                (is (nil? (get-in response [:headers "Location"])))))))))))

(deftest authorize-unauthenticated-test
  (testing "GET /oauth/authorize without session redirects to login page"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [response (client/client-full-response :get 302 "oauth/authorize"
                                                  :client_id     "some-client"
                                                  :redirect_uri  "https://example.com/callback"
                                                  :response_type "code")]
        (is (str/starts-with? (get-in response [:headers "Location"])
                              "http://localhost:3000/auth/login?redirect="))))))

;;; ----------------------------------------- Authorization Decision ------------------------------------------------

(defn- get-consent-page!
  "GET the consent page and return the full response (including CSRF cookie).
   Accepts optional extra query params (e.g. PKCE code_challenge)."
  ([user client-id]
   (get-consent-page! user client-id nil))
  ([user client-id extra-params]
   (apply mt/user-http-request-full-response
          user :get 200 "oauth/authorize"
          :client_id     client-id
          :redirect_uri  "https://example.com/callback"
          :response_type "code"
          :scope         "agent:content:read"
          :state         "test-state"
          (mapcat identity extra-params))))

(defn- hidden-field-extractor
  "Returns a function that extracts a hidden form field's hex value from HTML."
  [field-name]
  (let [pattern (re-pattern (str "name=\"" field-name "\"[^>]*value=\"([a-f0-9]+)\""))]
    (fn [body] (second (re-find pattern body)))))

(def ^:private extract-csrf-token-from-consent (hidden-field-extractor "csrf_token"))

(def ^:private extract-params-sig-from-consent (hidden-field-extractor "params_sig"))

(defn- extract-csrf-cookie
  "Extract the CSRF cookie value from the response.
   Checks both the :cookies map and the Set-Cookie header (which may be a string or vector of strings)."
  [response]
  (or
   ;; Try :cookies map first (set by ring.util.response/set-cookie, before wrap-cookies processing)
   (get-in response [:cookies "metabase.OAUTH_CSRF" :value])
   ;; Fall back to parsing Set-Cookie header
   (let [set-cookie (get-in response [:headers "Set-Cookie"])
         cookies    (cond
                      (string? set-cookie)     [set-cookie]
                      (sequential? set-cookie) (vec set-cookie)
                      :else                    [])]
     (some #(when (string? %) (second (re-find #"metabase\.OAUTH_CSRF=([a-f0-9]+)" %))) cookies))))

(defn- form-post-decision!
  "POST form-encoded params to /oauth/authorize/decision as an authenticated user."
  [user params expected-status & {:keys [csrf-cookie]}]
  (mt/user-http-request-full-response
   user :post expected-status "oauth/authorize/decision"
   {:request-options {:headers {"content-type" "application/x-www-form-urlencoded"
                                "cookie"       (when csrf-cookie
                                                 (str "metabase.OAUTH_CSRF=" csrf-cookie))}}}
   params))

(deftest authorize-decision-approve-test
  (testing "POST /oauth/authorize/decision with approved=true returns 302 redirect with code"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client       (create-test-client!)
              client-id    (:client_id client)
              consent-resp (get-consent-page! :crowberto client-id)
              consent-body (:body consent-resp)
              csrf-token   (extract-csrf-token-from-consent consent-body)
              csrf-cookie  (extract-csrf-cookie consent-resp)
              params-sig   (extract-params-sig-from-consent consent-body)
              response     (form-post-decision!
                            :crowberto
                            {:approved      "true"
                             :csrf_token    csrf-token
                             :params_sig    params-sig
                             :client_id     client-id
                             :redirect_uri  "https://example.com/callback"
                             :response_type "code"
                             :scope         "agent:content:read"
                             :granted_scope "agent:content:read"
                             :state         "test-state"}
                            302
                            :csrf-cookie csrf-cookie)
              location     (get-in response [:headers "Location"])]
          (is (string? csrf-token) "Consent page should contain a CSRF token")
          (is (string? csrf-cookie) "Response should contain a CSRF cookie")
          (is (= csrf-token csrf-cookie) "Cookie and form token should match")
          (is (string? location) "Should have a Location header")
          (is (str/starts-with? location "https://example.com/callback?"))
          (is (str/includes? location "code="))
          (is (str/includes? location "state=test-state")))))))

(deftest authorize-decision-deny-test
  (testing "POST /oauth/authorize/decision with approved=false returns 302 redirect with error"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client       (create-test-client!)
              client-id    (:client_id client)
              consent-resp (get-consent-page! :crowberto client-id)
              consent-body (:body consent-resp)
              csrf-token   (extract-csrf-token-from-consent consent-body)
              csrf-cookie  (extract-csrf-cookie consent-resp)
              params-sig   (extract-params-sig-from-consent consent-body)
              response     (form-post-decision!
                            :crowberto
                            {:approved      "false"
                             :csrf_token    csrf-token
                             :params_sig    params-sig
                             :client_id     client-id
                             :redirect_uri  "https://example.com/callback"
                             :response_type "code"
                             :scope         "agent:content:read"
                             :state         "test-state"}
                            302
                            :csrf-cookie csrf-cookie)
              location     (get-in response [:headers "Location"])]
          (is (some? location))
          (is (str/starts-with? location "https://example.com/callback?"))
          (is (str/includes? location "error=access_denied"))
          (is (str/includes? location "state=test-state")))))))

;;; -------------------------------------- Subpath hosting (GIT-10551) ---------------------------------------------

;; Metabase doesn't officially support being hosted under a subpath, but the OAuth consent flow is entirely
;; driven by site-url, so these tests pin the parts of the flow the *browser* sees — the consent form action,
;; the CSRF cookie path, and the login redirect — to subpath-aware values. The server never sees the subpath
;; (the reverse proxy strips it), so the routes themselves are unchanged.

(defn- extract-csrf-cookie-path
  "Extract the Path attribute of the CSRF cookie from the response.
   Checks both the :cookies map and the Set-Cookie header (which may be a string or vector of strings)."
  [response]
  (or (get-in response [:cookies "metabase.OAUTH_CSRF" :path])
      (let [set-cookie (get-in response [:headers "Set-Cookie"])
            cookies    (cond
                         (string? set-cookie)     [set-cookie]
                         (sequential? set-cookie) (vec set-cookie)
                         :else                    [])]
        (some #(when (and (string? %) (str/includes? % "metabase.OAUTH_CSRF="))
                 (second (re-find #"Path=([^;]+)" %)))
              cookies))))

(deftest csrf-cookie-path-follows-site-url-test
  (doseq [[site-url expected-path] {"http://localhost:3000"              "/oauth/authorize"
                                    "http://localhost:3000/metabase"     "/metabase/oauth/authorize"
                                    "http://localhost:3000/metabase/"    "/metabase/oauth/authorize"
                                    "http://localhost:3000/bi/metabase"  "/bi/metabase/oauth/authorize"}]
    (testing (str "site-url " site-url)
      (mt/with-temporary-setting-values [site-url site-url]
        (is (= expected-path (:path (#'api.oauth/csrf-cookie-opts 600))))))))

(deftest subpath-consent-flow-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000/metabase"]
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [client       (create-test-client!)
            client-id    (:client_id client)
            consent-resp (get-consent-page! :crowberto client-id)
            consent-body (:body consent-resp)]
        (testing "the consent form posts to the absolute, subpath-prefixed decision URL"
          (is (str/includes? consent-body
                             "action=\"http://localhost:3000/metabase/oauth/authorize/decision\"")))
        (testing "the CSRF cookie path includes the subpath so the browser sends the cookie with the form POST"
          (is (= "/metabase/oauth/authorize" (extract-csrf-cookie-path consent-resp))))
        (testing "the consent -> decision flow still round-trips"
          (let [csrf-token  (extract-csrf-token-from-consent consent-body)
                csrf-cookie (extract-csrf-cookie consent-resp)
                params-sig  (extract-params-sig-from-consent consent-body)
                response    (form-post-decision!
                             :crowberto
                             {:approved      "true"
                              :csrf_token    csrf-token
                              :params_sig    params-sig
                              :client_id     client-id
                              :redirect_uri  "https://example.com/callback"
                              :response_type "code"
                              :scope         "agent:content:read"
                              :granted_scope "agent:content:read"
                              :state         "test-state"}
                             302
                             :csrf-cookie csrf-cookie)
                location    (get-in response [:headers "Location"])]
            (is (str/starts-with? location "https://example.com/callback?"))
            (is (str/includes? location "code="))
            (testing "the decision response clears the CSRF cookie at the same subpath-prefixed path
                      (a clear at a different path would leave the old cookie shadowing the next flow)"
              (is (= "/metabase/oauth/authorize" (extract-csrf-cookie-path response))))))))))

(deftest subpath-login-redirect-test
  (testing "unauthenticated GET /oauth/authorize under a subpath"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000/metabase"]
      (let [response (client/client-full-response :get 302 "oauth/authorize"
                                                  :client_id     "some-client"
                                                  :redirect_uri  "https://example.com/callback"
                                                  :response_type "code")
            location (get-in response [:headers "Location"])]
        (testing "the login page URL carries the subpath"
          (is (str/starts-with? location "http://localhost:3000/metabase/auth/login?redirect=")))
        (testing "the redirect param stays basename-relative — the SPA router re-adds the subpath"
          (is (str/includes? location (str "redirect=" (URLEncoder/encode "/oauth/authorize" "UTF-8")))))))))

(defn- approve-or-deny!
  "Drive the consent + decision flow for `client-id` and return the decision response.
   `approved?` chooses approve vs deny."
  [user client-id approved?]
  (let [consent-resp (get-consent-page! user client-id)
        consent-body (:body consent-resp)]
    (form-post-decision!
     user
     {:approved      (str approved?)
      :csrf_token    (extract-csrf-token-from-consent consent-body)
      :params_sig    (extract-params-sig-from-consent consent-body)
      :client_id     client-id
      :redirect_uri  "https://example.com/callback"
      :response_type "code"
      :scope         "agent:content:read"
      :granted_scope "agent:content:read"
      :state         "test-state"}
     302
     :csrf-cookie (extract-csrf-cookie consent-resp))))

(deftest authorize-decision-records-approved-event-test
  (testing "Approving a registration records a separate `approved` event stamped with the deciding user"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client (create-test-client!)]
          (approve-or-deny! :crowberto (:client_id client) true)
          (let [events (t2/select :model/OAuthClientEvent :oauth_client_id (:id client))]
            (is (= 1 (count events)))
            (is (= "approved" (:event_type (first events))))
            (is (= (mt/user->id :crowberto) (:user_id (first events))))))))))

(deftest authorize-decision-records-denied-event-test
  (testing "Denying a registration records a separate `denied` event stamped with the deciding user"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client (create-test-client!)]
          (approve-or-deny! :crowberto (:client_id client) false)
          (let [events (t2/select :model/OAuthClientEvent :oauth_client_id (:id client))]
            (is (= 1 (count events)))
            (is (= "denied" (:event_type (first events))))
            (is (= (mt/user->id :crowberto) (:user_id (first events))))))))))

(deftest authorize-decision-csrf-missing-test
  (testing "POST /oauth/authorize/decision without CSRF token returns 403"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client    (create-test-client!)
              client-id (:client_id client)
              response  (form-post-decision!
                         :crowberto
                         {:approved      "true"
                          :client_id     client-id
                          :redirect_uri  "https://example.com/callback"
                          :response_type "code"
                          :scope         "agent:content:read"
                          :state         "test-state"}
                         403)]
          (is (= "csrf_validation_failed" (:error (:body response)))))))))

(deftest authorize-decision-csrf-mismatch-test
  (testing "POST /oauth/authorize/decision with mismatched CSRF token returns 403"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client       (create-test-client!)
              client-id    (:client_id client)
              consent-resp (get-consent-page! :crowberto client-id)
              csrf-cookie  (extract-csrf-cookie consent-resp)
              response     (form-post-decision!
                            :crowberto
                            {:approved      "true"
                             :csrf_token    "00000000000000000000000000000000"
                             :client_id     client-id
                             :redirect_uri  "https://example.com/callback"
                             :response_type "code"
                             :scope         "agent:content:read"
                             :state         "test-state"}
                            403
                            :csrf-cookie csrf-cookie)]
          (is (= "csrf_validation_failed" (:error (:body response)))))))))

(deftest authorize-decision-params-tampered-test
  (testing "POST /oauth/authorize/decision with tampered state returns 403 params_tampered"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client       (create-test-client!)
              client-id    (:client_id client)
              consent-resp (get-consent-page! :crowberto client-id)
              consent-body (:body consent-resp)
              csrf-token   (extract-csrf-token-from-consent consent-body)
              csrf-cookie  (extract-csrf-cookie consent-resp)
              params-sig   (extract-params-sig-from-consent consent-body)
              response     (form-post-decision!
                            :crowberto
                            {:approved      "true"
                             :csrf_token    csrf-token
                             :params_sig    params-sig
                             :client_id     client-id
                             :redirect_uri  "https://example.com/callback"
                             :response_type "code"
                             :scope         "agent:content:read"
                             :state         "tampered-state"}  ;; tampered state
                            403
                            :csrf-cookie csrf-cookie)]
          (is (= "params_tampered" (:error (:body response)))))))))

(deftest authorize-decision-missing-params-sig-test
  (testing "POST /oauth/authorize/decision with missing params_sig returns 403 params_tampered"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client       (create-test-client!)
              client-id    (:client_id client)
              consent-resp (get-consent-page! :crowberto client-id)
              consent-body (:body consent-resp)
              csrf-token   (extract-csrf-token-from-consent consent-body)
              csrf-cookie  (extract-csrf-cookie consent-resp)
              response     (form-post-decision!
                            :crowberto
                            {:approved      "true"
                             :csrf_token    csrf-token
                             ;; no params_sig
                             :client_id     client-id
                             :redirect_uri  "https://example.com/callback"
                             :response_type "code"
                             :scope         "agent:content:read"
                             :state         "test-state"}
                            403
                            :csrf-cookie csrf-cookie)]
          (is (= "params_tampered" (:error (:body response)))))))))

(deftest authorize-decision-non-hex-params-sig-test
  (testing "POST /oauth/authorize/decision with non-hex params_sig returns 403 params_tampered"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client       (create-test-client!)
              client-id    (:client_id client)
              consent-resp (get-consent-page! :crowberto client-id)
              consent-body (:body consent-resp)
              csrf-token   (extract-csrf-token-from-consent consent-body)
              csrf-cookie  (extract-csrf-cookie consent-resp)
              response     (form-post-decision!
                            :crowberto
                            {:approved      "true"
                             :csrf_token    csrf-token
                             :params_sig    "zzzz-not-hex!"
                             :client_id     client-id
                             :redirect_uri  "https://example.com/callback"
                             :response_type "code"
                             :scope         "agent:content:read"
                             :state         "test-state"}
                            403
                            :csrf-cookie csrf-cookie)]
          (is (= "params_tampered" (:error (:body response)))))))))

(deftest authorize-decision-unauthenticated-test
  (testing "POST /oauth/authorize/decision without session returns 401"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [response (client/client :post 401 "oauth/authorize/decision"
                                    {:request-options {:headers {"content-type" "application/x-www-form-urlencoded"}}}
                                    {:approved      "true"
                                     :client_id     "some-client"
                                     :redirect_uri  "https://example.com/callback"
                                     :response_type "code"})]
        (is (= "unauthorized" (:error response)))))))

;;; ----------------------------------------- Token Endpoint -------------------------------------------------------

(defn- extract-query-param
  "Extract a query parameter value from a URL string."
  [url param-name]
  (when-let [query (second (str/split url #"\?" 2))]
    (->> (str/split query #"&")
         (some (fn [pair]
                 (let [[k v] (str/split pair #"=" 2)]
                   (when (= k param-name) v)))))))

(defn- authorize-and-get-code!
  "Complete the authorize flow and return the authorization code.
   Creates a client, authorizes, and extracts the code from the redirect."
  [client-id]
  (let [consent-resp (get-consent-page! :crowberto client-id)
        body         (:body consent-resp)
        csrf-token   (extract-csrf-token-from-consent body)
        csrf-cookie  (extract-csrf-cookie consent-resp)
        params-sig   (extract-params-sig-from-consent body)
        response     (form-post-decision!
                      :crowberto
                      {:approved      "true"
                       :csrf_token    csrf-token
                       :params_sig    params-sig
                       :client_id     client-id
                       :redirect_uri  "https://example.com/callback"
                       :response_type "code"
                       :scope         "agent:content:read"
                       :granted_scope "agent:content:read"
                       :state         "test-state"}
                      302
                      :csrf-cookie csrf-cookie)
        location     (get-in response [:headers "Location"])]
    (extract-query-param location "code")))

(defn- token-request!
  "POST to /oauth/token with form-encoded params."
  [params & {:keys [expected-status authorization]
             :or   {expected-status 200}}]
  (let [request-options (cond-> {:headers {"content-type" "application/x-www-form-urlencoded"}}
                          authorization (assoc-in [:headers "authorization"] authorization))]
    (client/client :post expected-status "oauth/token"
                   {:request-options request-options}
                   params)))

(set! *warn-on-reflection* true)

(defn- basic-auth-header
  "Build an HTTP Basic auth header value."
  [client-id client-secret]
  (str "Basic " (.encodeToString (Base64/getEncoder)
                                 (.getBytes (str client-id ":" client-secret) "UTF-8"))))

(deftest token-auth-code-full-flow-test
  (testing "Authorization code grant -- full flow returns tokens"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [test-client   (create-test-client!)
              client-id     (:client_id test-client)
              client-secret (:client_secret test-client)
              code          (authorize-and-get-code! client-id)]
          (is (some? code) "Should get an authorization code")
          (is (=? {:access_token  string?
                   :token_type    "Bearer"
                   :expires_in    pos-int?
                   :refresh_token string?
                   :scope         string?}
                  (token-request!
                   {:grant_type    "authorization_code"
                    :code          code
                    :redirect_uri  "https://example.com/callback"}
                   :authorization (basic-auth-header client-id client-secret)))
              "Should return full token response"))))))

(deftest token-auth-code-invalid-code-test
  (testing "Authorization code grant -- invalid code returns error"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [test-client   (create-test-client!)
              client-id     (:client_id test-client)
              client-secret (:client_secret test-client)
              response      (token-request!
                             {:grant_type    "authorization_code"
                              :code          "bogus-code"
                              :redirect_uri  "https://example.com/callback"}
                             :expected-status 400
                             :authorization (basic-auth-header client-id client-secret))]
          (is (=? {:error string?} response)))))))

(deftest token-auth-code-wrong-client-test
  (testing "Authorization code grant -- wrong client gets error"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client-a      (create-test-client!)
              client-b      (create-test-client! {:redirect_uris  ["https://other.com/callback"]
                                                  :client_name    "Other Client"
                                                  :grant_types    ["authorization_code"]
                                                  :response_types ["code"]
                                                  :scopes         ["agent:content:read"]})
              code          (authorize-and-get-code! (:client_id client-a))
              response      (token-request!
                             {:grant_type    "authorization_code"
                              :code          code
                              :redirect_uri  "https://example.com/callback"}
                             :expected-status 400
                             :authorization (basic-auth-header (:client_id client-b) (:client_secret client-b)))]
          (is (=? {:error string?} response)))))))

(deftest token-refresh-grant-test
  (testing "Refresh token grant -- returns new access token"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [test-client    (create-test-client!)
              client-id      (:client_id test-client)
              client-secret  (:client_secret test-client)
              code           (authorize-and-get-code! client-id)
              token-response (token-request!
                              {:grant_type    "authorization_code"
                               :code          code
                               :redirect_uri  "https://example.com/callback"}
                              :authorization (basic-auth-header client-id client-secret))
              refresh-response (token-request!
                                {:grant_type    "refresh_token"
                                 :refresh_token (:refresh_token token-response)}
                                :authorization (basic-auth-header client-id client-secret))]
          (is (=? {:access_token string?
                   :token_type   "Bearer"
                   :expires_in   pos-int?}
                  refresh-response)))))))

(deftest refresh-token-has-expiry-test
  (testing "Refresh tokens are stored with an expiry derived from oauth-server-refresh-token-ttl"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                       oauth-server-refresh-token-ttl 7200]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [test-client    (create-test-client!)
              client-id      (:client_id test-client)
              client-secret  (:client_secret test-client)
              code           (authorize-and-get-code! client-id)
              token-response (token-request!
                              {:grant_type    "authorization_code"
                               :code          code
                               :redirect_uri  "https://example.com/callback"}
                              :authorization (basic-auth-header client-id client-secret))]
          (is (some? (:refresh_token token-response)))
          (let [db-token (t2/select-one :model/OAuthRefreshToken :client_id client-id)]
            (is (some? db-token) "Refresh token should be stored in the database")
            (is (some? (:expiry db-token)) "Refresh token should have an expiry set")
            (when (:expiry db-token)
              (let [now-ms    (System/currentTimeMillis)
                    ;; expiry should be ~7200s from now; allow 60s tolerance
                    expected  (* 7200 1000)
                    actual    (- (:expiry db-token) now-ms)]
                (is (< (abs (- actual expected)) 60000)
                    (str "Refresh token expiry should be ~7200s from now, got "
                         (/ actual 1000.0) "s"))))))))))

(deftest dcr-strips-client-credentials-grant-type-test
  (testing "Dynamic client registration strips client_credentials from grant_types"
    ;; client_credentials tokens have no user context (user_id = NULL) which makes
    ;; them unusable for MCP — validate-bearer-token requires a valid integer user-id.
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [response (mt/user-http-request :crowberto :post 201 "oauth/register"
                                             {:client_name   "CC Client"
                                              :redirect_uris ["https://example.com/callback"]
                                              :grant_types   ["authorization_code" "client_credentials"]})]
          (is (= ["authorization_code"] (:grant_types response))))))))

(deftest token-wrong-client-secret-test
  (testing "Token request with wrong client secret returns 400"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [test-client (create-test-client!)
              client-id   (:client_id test-client)
              response    (token-request!
                           {:grant_type    "authorization_code"
                            :code          "some-code"
                            :redirect_uri  "https://example.com/callback"}
                           :expected-status 400
                           :authorization (basic-auth-header client-id "wrong-secret"))]
          (is (=? {:error string?} response)))))))

(deftest token-missing-grant-type-test
  (testing "Missing grant_type -- returns 400"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [test-client (create-test-client!)
              response    (token-request!
                           {}
                           :expected-status 400
                           :authorization (basic-auth-header (:client_id test-client) (:client_secret test-client)))]
          (is (=? {:error string?} response)))))))

(deftest token-basic-auth-test
  (testing "Client auth via Basic header works"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [test-client   (create-test-client!)
              client-id     (:client_id test-client)
              client-secret (:client_secret test-client)
              code          (authorize-and-get-code! client-id)
              response      (token-request!
                             {:grant_type   "authorization_code"
                              :code         code
                              :redirect_uri "https://example.com/callback"}
                             :authorization (basic-auth-header client-id client-secret))]
          (is (=? {:access_token string?
                   :token_type   "Bearer"}
                  response)))))))

;;; ----------------------------------------- PKCE Tests -------------------------------------------------------

(defn- pkce-s256-challenge
  "Compute a S256 PKCE code challenge from a code verifier."
  [^String code-verifier]
  (let [digest (.digest (MessageDigest/getInstance "SHA-256") (.getBytes code-verifier "US-ASCII"))]
    (-> (Base64/getUrlEncoder)
        .withoutPadding
        (.encodeToString digest))))

(defn- authorize-and-get-code-with-params!
  "Complete the authorize flow with extra decision params and return the authorization code."
  [client-id extra-params]
  (let [consent-resp (get-consent-page! :crowberto client-id extra-params)
        body         (:body consent-resp)
        csrf-token   (extract-csrf-token-from-consent body)
        csrf-cookie  (extract-csrf-cookie consent-resp)
        params-sig   (extract-params-sig-from-consent body)
        response     (form-post-decision!
                      :crowberto
                      (merge {:approved      "true"
                              :csrf_token    csrf-token
                              :params_sig    params-sig
                              :client_id     client-id
                              :redirect_uri  "https://example.com/callback"
                              :response_type "code"
                              :scope         "agent:content:read"
                              :granted_scope "agent:content:read"
                              :state         "test-state"}
                             extra-params)
                      302
                      :csrf-cookie csrf-cookie)
        location     (get-in response [:headers "Location"])]
    (extract-query-param location "code")))

(deftest token-auth-code-pkce-s256-test
  (testing "Authorization code grant with S256 PKCE succeeds"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [test-client    (create-test-client!)
              client-id      (:client_id test-client)
              client-secret  (:client_secret test-client)
              code-verifier  "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
              code-challenge (pkce-s256-challenge code-verifier)
              code           (authorize-and-get-code-with-params!
                              client-id
                              {:code_challenge        code-challenge
                               :code_challenge_method "S256"})]
          (is (string? code) "Should get an authorization code")
          (is (=? {:access_token string?
                   :token_type   "Bearer"
                   :expires_in   pos-int?}
                  (token-request!
                   {:grant_type    "authorization_code"
                    :code          code
                    :redirect_uri  "https://example.com/callback"
                    :code_verifier code-verifier}
                   :authorization (basic-auth-header client-id client-secret)))))))))

(deftest token-auth-code-pkce-missing-verifier-test
  (testing "Authorization code grant with PKCE but missing code_verifier returns error"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [test-client    (create-test-client!)
              client-id      (:client_id test-client)
              client-secret  (:client_secret test-client)
              code-verifier  "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
              code-challenge (pkce-s256-challenge code-verifier)
              code           (authorize-and-get-code-with-params!
                              client-id
                              {:code_challenge        code-challenge
                               :code_challenge_method "S256"})
              response       (token-request!
                              {:grant_type    "authorization_code"
                               :code          code
                               :redirect_uri  "https://example.com/callback"}
                              :expected-status 400
                              :authorization (basic-auth-header client-id client-secret))]
          (is (=? {:error string?} response)))))))

;;; ----------------------------------------- Expired / Revoked Token Tests ------------------------------------

(deftest token-auth-code-expired-code-test
  (testing "Authorization code grant with expired code returns error"
    (mt/with-temporary-setting-values [site-url                            "http://localhost:3000"
                                       oauth-server-authorization-code-ttl 1]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [test-client   (create-test-client!)
              client-id     (:client_id test-client)
              client-secret (:client_secret test-client)
              code          (authorize-and-get-code! client-id)]
          (is (string? code) "Should get an authorization code")
          (Thread/sleep 1500)
          (is (=? {:error string?}
                  (token-request!
                   {:grant_type    "authorization_code"
                    :code          code
                    :redirect_uri  "https://example.com/callback"}
                   :expected-status 400
                   :authorization (basic-auth-header client-id client-secret)))))))))

;;; ------------------------------------------ Revocation Endpoint -----------------------------------------------

(defn- revoke-request!
  "POST to /oauth/revoke with form-encoded params."
  [params & {:keys [expected-status authorization]
             :or   {expected-status 200}}]
  (let [request-options (cond-> {:headers {"content-type" "application/x-www-form-urlencoded"}}
                          authorization (assoc-in [:headers "authorization"] authorization))]
    (client/client :post expected-status "oauth/revoke"
                   {:request-options request-options}
                   params)))

(deftest token-refresh-resource-outside-the-grant-keeps-the-generic-description-test
  (testing "GHY-4542: oidc-provider raises `invalid_target` for a refresh whose `resource` is not in the original
            grant, carrying no description of its own. That is a well-formed absolute URI, so answering it with the
            description for an unparseable one would send the client chasing a syntax problem it does not have: only
            this endpoint's own resource check knows the URI was malformed."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [{:keys [client_id client_secret]} (create-test-client!)
              granted-resource (str "http://localhost:3000" (mcp/mcp-canonical-path))
              consent-resp     (authorize-request! 200
                                                   :client_id     client_id
                                                   :redirect_uri  "https://example.com/callback"
                                                   :response_type "code"
                                                   :scope         "agent:content:read"
                                                   :resource      granted-resource
                                                   :state         "test-state")
              body             (:body consent-resp)
              decision         (form-post-decision!
                                :crowberto
                                {:approved      "true"
                                 :csrf_token    (extract-csrf-token-from-consent body)
                                 :params_sig    (extract-params-sig-from-consent body)
                                 :client_id     client_id
                                 :redirect_uri  "https://example.com/callback"
                                 :response_type "code"
                                 ;; the MCP resource accepts it, so narrowing leaves it as requested
                                 :scope         "agent:content:read"
                                 :resource      granted-resource
                                 :state         "test-state"}
                                302
                                :csrf-cookie (extract-csrf-cookie consent-resp))
              tokens           (token-request! {:grant_type   "authorization_code"
                                                :code         (extract-query-param
                                                               (get-in decision [:headers "Location"]) "code")
                                                :redirect_uri "https://example.com/callback"}
                                               :authorization (basic-auth-header client_id client_secret))]
          (is (some? (:refresh_token tokens)) "the original grant carries the resource it was issued for")
          (is (= {:error             "invalid_target"
                  :error_description invalid-token-request-description}
                 (token-request! {:grant_type    "refresh_token"
                                  :refresh_token (:refresh_token tokens)
                                  :resource      "https://other.example.com/api/mcp"}
                                 :expected-status 400
                                 :authorization (basic-auth-header client_id client_secret)))))))))

(deftest token-refresh-revoked-token-test
  (testing "Refresh token grant with revoked refresh token returns error"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [test-client    (create-test-client!)
              client-id      (:client_id test-client)
              client-secret  (:client_secret test-client)
              code           (authorize-and-get-code! client-id)
              token-response (token-request!
                              {:grant_type    "authorization_code"
                               :code          code
                               :redirect_uri  "https://example.com/callback"}
                              :authorization (basic-auth-header client-id client-secret))
              refresh-token  (:refresh_token token-response)]
          ;; Revoke via the revocation endpoint (tokens are hashed in the DB)
          (revoke-request!
           {:token refresh-token}
           :authorization (basic-auth-header client-id client-secret))
          (let [response (token-request!
                          {:grant_type    "refresh_token"
                           :refresh_token refresh-token}
                          :expected-status 400
                          :authorization (basic-auth-header client-id client-secret))]
            (is (=? {:error string?} response))))))))

(deftest revocation-valid-token-test
  (testing "Revocation returns 200 for a valid access token"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [test-client   (create-test-client!)
              client-id     (:client_id test-client)
              client-secret (:client_secret test-client)
              code          (authorize-and-get-code! client-id)
              token-resp    (token-request!
                             {:grant_type    "authorization_code"
                              :code          code
                              :redirect_uri  "https://example.com/callback"}
                             :authorization (basic-auth-header client-id client-secret))
              access-token  (:access_token token-resp)]
          (is (some? access-token))
          (revoke-request!
           {:token access-token}
           :authorization (basic-auth-header client-id client-secret)))))))

(deftest revocation-unknown-token-test
  (testing "Revocation returns 200 for an unknown token (RFC 7009 S2.2)"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [test-client   (create-test-client!)
              client-id     (:client_id test-client)
              client-secret (:client_secret test-client)]
          (revoke-request!
           {:token "nonexistent-token"}
           :authorization (basic-auth-header client-id client-secret)))))))

(deftest discovery-includes-revocation-endpoint-test
  (testing "Discovery document includes revocation_endpoint"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (let [response (mt/user-http-request :crowberto :get 200
                                           ".well-known/oauth-authorization-server")]
        (is (= "http://localhost:3000/oauth/revoke"
               (:revocation_endpoint response)))))))

;;; ----------------------------------------- Bearer Token Parsing ---------------------------------------------------

(deftest extract-bearer-token-test
  (testing "standard Bearer token"
    (is (= "abc123" (oauth-server/extract-bearer-token {:headers {"authorization" "Bearer abc123"}}))))
  (testing "case-insensitive prefix"
    (is (= "TOKEN" (oauth-server/extract-bearer-token {:headers {"authorization" "bearer TOKEN"}}))))
  (testing "trims whitespace after prefix"
    (is (= "TOKEN" (oauth-server/extract-bearer-token {:headers {"authorization" "Bearer  TOKEN"}}))))
  (testing "Bearer with no token returns empty string"
    (is (= "" (oauth-server/extract-bearer-token {:headers {"authorization" "Bearer "}}))))
  (testing "missing header returns nil"
    (is (nil? (oauth-server/extract-bearer-token {:headers {}}))))
  (testing "empty header returns nil"
    (is (nil? (oauth-server/extract-bearer-token {:headers {"authorization" ""}}))))
  (testing "non-Bearer scheme returns nil"
    (is (nil? (oauth-server/extract-bearer-token {:headers {"authorization" "Basic abc123"}})))))

;;; ----------------------------------------- State Round-Trip -------------------------------------------------------

(deftest authorize-state-special-characters-test
  (testing "OAuth state with special characters survives the authorize round-trip"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        ;; Test that special characters in state survive the authorize → consent → decision
        ;; round-trip. Includes `/`, `=`, `&`, and space. Literal `+` is excluded because
        ;; codec/url-encode (RFC 3986) doesn't percent-encode it, so ring's query parser
        ;; decodes it as space. We can't pre-encode it as `%2B` either — codec/url-encode
        ;; double-escapes the `%` to `%252B`. In a real client flow, `+` is sent as `%2B`
        ;; and round-trips correctly.
        (let [state         "abc/=&foo=bar baz"
              client        (create-test-client!)
              client-id     (:client_id client)
              consent-resp  (mt/user-http-request-full-response
                             :crowberto :get 200 "oauth/authorize"
                             :client_id     client-id
                             :redirect_uri  "https://example.com/callback"
                             :response_type "code"
                             :scope         "agent:content:read"
                             :state         state)
              consent-body  (:body consent-resp)
              csrf-token    (extract-csrf-token-from-consent consent-body)
              csrf-cookie   (extract-csrf-cookie consent-resp)
              params-sig    (extract-params-sig-from-consent consent-body)]
          (is (some? params-sig) "Should extract params_sig from consent page")
          (let [response (form-post-decision!
                          :crowberto
                          {:approved      "true"
                           :csrf_token    csrf-token
                           :params_sig    params-sig
                           :client_id     client-id
                           :redirect_uri  "https://example.com/callback"
                           :response_type "code"
                           :scope         "agent:content:read"
                           :granted_scope "agent:content:read"
                           :state         state}
                          302
                          :csrf-cookie csrf-cookie)
                location (get-in response [:headers "Location"])]
            (is (str/includes? location "state="))
            (is (str/includes? location (URLEncoder/encode state "UTF-8")))))))))

;;; ----------------------------------------- Consent Page Security --------------------------------------------------

(deftest consent-page-xss-client-name-test
  (testing "Client name with HTML/script tags is escaped in the consent page"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [xss-name  "<script>alert('xss')</script>"
              client    (create-test-client! {:client_name xss-name})
              client-id (:client_id client)
              response  (mt/user-http-request-full-response
                         :crowberto :get 200 "oauth/authorize"
                         :client_id     client-id
                         :redirect_uri  "https://example.com/callback"
                         :response_type "code"
                         :scope         "agent:content:read"
                         :state         "test-state")
              body      (:body response)]
          (is (not (str/includes? body "<script>alert('xss')</script>"))
              "Raw script tags must not appear in the consent page")
          (is (str/includes? body "&lt;script&gt;")
              "Script tags should be HTML-escaped"))))))

;;; ----------------------------------- RFC 8707 resource narrowing -----------------------------------

(defn- extract-hidden-field
  "Extract an arbitrary hidden form field's value from the consent page HTML."
  [field-name body]
  (second (re-find (re-pattern (str "name=\"" field-name "\"[^>]*value=\"([^\"]*)\"")) body)))

(deftest authorize-narrows-scope-to-mcp-resource-test
  (testing "an RFC 8707 `resource` indicator naming the MCP surface narrows the grant to the
            scopes that surface accepts, so the consent screen asks for what the token can actually
            be used for rather than everything the client registered"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [wide         "agent:content:read agent:question:create agent:sql:execute"
              ;; the v2 path: the aliases still reach v1, whose tools gate on the agent-API scopes
              mcp-uri      (str "http://localhost:3000" (mcp/mcp-canonical-path))
              client-id    (:client_id (create-test-client!
                                        {:scopes ["agent:content:read" "agent:question:create"
                                                  "agent:sql:execute"]}))
              consent-resp (mt/user-http-request-full-response
                            :crowberto :get 200 "oauth/authorize"
                            :client_id     client-id
                            :redirect_uri  "https://example.com/callback"
                            :response_type "code"
                            :scope         wide
                            :resource      mcp-uri
                            :state         "test-state")
              body         (:body consent-resp)
              shown-scope  (extract-hidden-field "scope" body)]
          (testing "the v2 scope survives and the agent-API-only scopes are gone"
            (is (= "agent:content:read" shown-scope))
            (is (not (str/includes? body "agent:question:create")))
            (is (not (str/includes? body "agent:sql:execute"))))
          (testing "approving the narrowed request still verifies — narrowing happens before the
                    params are signed, so the consent form round-trips intact"
            (let [response (form-post-decision!
                            :crowberto
                            {:approved      "true"
                             :csrf_token    (extract-csrf-token-from-consent body)
                             :params_sig    (extract-params-sig-from-consent body)
                             :client_id     client-id
                             :redirect_uri  "https://example.com/callback"
                             :response_type "code"
                             :scope         shown-scope
                             :resource      mcp-uri
                             :state         "test-state"}
                            302
                            :csrf-cookie (extract-csrf-cookie consent-resp))]
              (is (str/includes? (get-in response [:headers "Location"]) "code="))))
          (testing "a client cannot re-widen the scope on the way back: the signature covers the
                    narrowed params, so posting the original wide scope is rejected as tampering"
            (let [response (form-post-decision!
                            :crowberto
                            {:approved      "true"
                             :csrf_token    (extract-csrf-token-from-consent body)
                             :params_sig    (extract-params-sig-from-consent body)
                             :client_id     client-id
                             :redirect_uri  "https://example.com/callback"
                             :response_type "code"
                             :scope         wide
                             :resource      mcp-uri
                             :state         "test-state"}
                            403
                            :csrf-cookie (extract-csrf-cookie consent-resp))]
              (is (= "params_tampered" (get-in response [:body :error]))))))))))

(deftest authorize-legacy-mcp-client-can-request-v2-scopes-test
  (testing (str "GHY-4343: a client that registered against a shipped v0.60-v0.63 release snapshotted only the "
                "pre-v2 per-entity agent scopes, and `validate-scope` rejects any requested scope absent from that "
                "snapshot, so a user forced to re-authorize is answered with a 400 `invalid_scope` JSON body "
                "rendered raw in their browser tab and has no in-product recovery path. "
                "`WidenDynamicOAuthClientScopesForMcpV2` unions the six v2 scopes into every dynamically registered "
                "client's snapshot so the request validates and reaches consent.")
    ;; GHY-4543: reading a dynamic client now adds the six v2 scopes whatever the registration setting says, so the
    ;; request reaches consent with or without the migration applied. Registration is disabled so only that MCP part
    ;; of the ceiling applies. A static client carrying the same legacy snapshot is the control: it is never widened,
    ;; so it shows what the stored snapshot alone decides.
    (mt/with-temporary-setting-values [site-url                                  "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled false]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [legacy-scopes ["agent:question:create" "agent:sql:construct" "agent:viz:mcp-ui:query"]
              v2-scopes     ["agent:content:read" "agent:content:write" "agent:query:run"
                             "agent:sql:run" "agent:delivery:write" "agent:resource:read"]
              authorize!    (fn [client-id expected-status]
                              (mt/user-http-request-full-response
                               :crowberto :get expected-status "oauth/authorize"
                               :client_id     client-id
                               :redirect_uri  "https://example.com/callback"
                               :response_type "code"
                               :scope         (str/join " " v2-scopes)
                               :state         "test-state"))
              consent!      (fn [response]
                              (is (str/includes? (get-in response [:headers "Content-Type"]) "text/html")
                                  "the user sees a consent page, not a JSON error body rendered in their browser tab")
                              (is (str/includes? (:body response) "agent:content:read")
                                  "and the six v2 scopes are what they are consenting to"))
              static-id     (:client_id (create-test-client! {:scopes legacy-scopes}))
              dynamic-id    (:client_id (create-test-client! {:scopes            legacy-scopes
                                                              :registration_type "dynamic"}))]
          (testing "control: the six v2 scopes are refused against the legacy snapshot alone"
            (is (= {:error             "invalid_scope"
                    :error_description invalid-request-description}
                   (:body (authorize! static-id 400)))))
          (testing "before the migration, the dynamic client reaches consent because reading it widens it"
            (consent! (authorize! dynamic-id 200)))
          ;; Apply what the migration applies. The change class itself is exercised against the changelog in
          ;; `metabase.app-db.custom-migrations-test`; what this test owns is the authorize consequence.
          (t2/update! :model/OAuthClient {:client_id dynamic-id}
                      {:scopes (into legacy-scopes v2-scopes)})
          (testing "after the migration, the same request still reaches consent"
            (consent! (authorize! dynamic-id 200))))))))

(defn- first-non-mcp-default-scope
  "A scope in the default grant ceiling that the MCP surface does not accept."
  []
  (first (remove (set (mcp/v2-scopes)) (oauth-server/default-grant-scopes))))

(deftest grant-ceiling-widens-only-dynamic-clients-test
  (testing (str "GHY-4543: only a dynamically registered client is widened. It always gains the MCP scopes, and the "
                "rest of the default ceiling only while dynamic registration is enabled. A static client may request "
                "exactly what it was registered for.")
    (let [not-mcp   (first-non-mcp-default-scope)
          authorize (fn [registration-type registration-enabled? scope]
                      (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                                         oauth-server-dynamic-registration-enabled
                                                         registration-enabled?]
                        (t2/with-transaction [_conn nil {:rollback-only true}]
                          ;; see [[register-then-authorize-mcp!]] for why the session is revalidated first
                          (mt/user-http-request :crowberto :get 200 "api/user/current")
                          (let [client-id (:client_id (create-test-client!
                                                       {:scopes            ["agent:content:read"]
                                                        :registration_type registration-type}))]
                            (mt/user-http-request-full-response
                             :crowberto :get "oauth/authorize"
                             :client_id     client-id
                             :redirect_uri  "https://example.com/callback"
                             :response_type "code"
                             :scope         scope
                             :state         "test-state")))))
          consent?  (fn [response] (is (= 200 (:status response)) (pr-str (:body response))))
          refused?  (fn [response]
                      (is (= 400 (:status response)))
                      (is (= "invalid_scope" (get-in response [:body :error]))))]
      (is (some? not-mcp) "the default ceiling holds a scope the MCP surface does not accept")
      (testing "control: a static client reaches consent for the scope it registered for"
        (consent? (authorize "static" true "agent:content:read")))
      (testing "a static client is not widened"
        (refused? (authorize "static" true "agent:content:write")))
      (testing "while registration is enabled, a dynamic client reaches consent for any ceiling scope"
        (consent? (authorize "dynamic" true "agent:content:write"))
        (consent? (authorize "dynamic" true not-mcp)))
      (testing "while registration is disabled, a dynamic client still reaches consent for an MCP scope"
        (consent? (authorize "dynamic" false "agent:content:write")))
      (testing "but not for the rest of the ceiling"
        (refused? (authorize "dynamic" false not-mcp))))))

(deftest grant-ceiling-widening-respects-mcp-kill-switch-test
  (testing (str "GHY-4543: the MCP-scope widening stops when an admin turns MCP off. `agent:resource:read` is an MCP "
                "surface scope and also the declared scope of `POST /api/agent/v1/read-resource`, which a separate "
                "lever (`agent-api-enabled`) gates — so widening onto it with MCP off hands a dynamic client a scope "
                "its registration never included, and with the agent API on, a live endpoint to spend it at.")
    (let [authorize (fn [mcp-on?]
                      (mt/with-temporary-setting-values [site-url                                  "http://localhost:3000"
                                                         mcp-enabled?                              mcp-on?
                                                         ;; off in both cases, so the only widening under test is the
                                                         ;; unconditional MCP one, not the wider default ceiling
                                                         oauth-server-dynamic-registration-enabled false]
                        (t2/with-transaction [_conn nil {:rollback-only true}]
                          ;; see [[register-then-authorize-mcp!]] for why the session is revalidated first
                          (mt/user-http-request :crowberto :get 200 "api/user/current")
                          (let [client-id (:client_id (create-test-client!
                                                       {:scopes            ["agent:content:read"]
                                                        :registration_type "dynamic"}))]
                            (mt/user-http-request-full-response
                             :crowberto :get "oauth/authorize"
                             :client_id     client-id
                             :redirect_uri  "https://example.com/callback"
                             :response_type "code"
                             :scope         "agent:resource:read"
                             :state         "test-state")))))]
      (testing "with MCP enabled a dynamic client is widened onto the MCP scopes and reaches consent"
        (let [response (authorize true)]
          (is (= 200 (:status response)) (pr-str (:body response)))))
      (testing "with MCP disabled it is not widened, so the scope is refused"
        (let [response (authorize false)]
          (is (= 400 (:status response)))
          (is (= "invalid_scope" (get-in response [:body :error]))))))))

(deftest authorize-error-never-redirects-to-a-client-registered-uri-test
  (testing "GHY-4542: dynamic client registration is unauthenticated, so anyone can register a client whose
            redirect_uri points at their own site. If /oauth/authorize delivered its errors by redirecting there,
            a single link on the trusted Metabase host would send any logged-in user straight off-site with no
            consent step: a zero-click open redirector. RFC 9700 section 4.11 says to answer with an error rather
            than redirect when the redirect URI is not trusted, so every authorize error is a 400 rendered in the
            user's own browser and never carries a Location header."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [off-site  "https://evil.example/callback"
              client-id (:client_id (create-test-client! {:redirect_uris [off-site]}))]
          (doseq [[label params]
                  [["an unregistered scope"                [:response_type "code" :scope "*"]]
                   ["no scope at all"                      [:response_type "code"]]
                   ["a scope the client did not register"  [:response_type "code" :scope "agent:sql:execute"]]
                   ["an unsupported response_type"         [:response_type "token" :scope "agent:content:read"]]
                   ["a malformed resource indicator"       [:response_type "code" :scope "agent:content:read"
                                                            :resource "http://bad uri"]]]]
            (testing label
              (let [response (apply authorize-request! 400
                                    :client_id    client-id
                                    :redirect_uri off-site
                                    :state        "test-state"
                                    params)]
                (is (nil? (get-in response [:headers "Location"])))
                (is (not (str/includes? (pr-str (:headers response)) off-site))
                    "no response header names the client's off-site redirect URI")))))))))

(deftest authorize-rejects-fully-narrowed-scope-test
  (testing "when every requested scope is one the named resource does not accept, answer RFC 6749
            `invalid_scope` rather than dropping the parameter. Dropping it renders a consent screen
            listing no permissions and mints a zero-scope token: a handshake that looks successful but
            authorizes nothing, with nothing telling the operator the resource rejected what was asked for."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client-id (:client_id (create-test-client!
                                     {:scopes ["agent:question:create" "agent:sql:execute"]}))
              response  (authorize-request! 400
                                            :client_id     client-id
                                            ;; both are v1-only: the v2 resource accepts neither
                                            :scope         "agent:question:create agent:sql:execute"
                                            :redirect_uri  "https://example.com/callback"
                                            :response_type "code"
                                            :resource      (str "http://localhost:3000" (mcp/mcp-canonical-path))
                                            :state         "test-state")]
          (is (= {:error             "invalid_scope"
                  :error_description "The requested scopes are not accepted by the requested resource."}
                 (:body response))))))))

(deftest authorize-drops-unregistered-scopes-test
  (testing "GHY-4542: a scope that is not registered via `defscope` is dropped from the request rather than
            refusing it. A client that registered a wildcard such as `*` before registration validated scopes can
            still request it, and `scope-matches?` would honor it as a wildcard grant, so it must not survive; but
            refusing outright strands the user on a JSON error in a browser tab while the client waits, and breaks
            step-up for a client legitimately holding a scope we have since deprecated (`agent:table:read` and
            friends shipped in v0.60-v0.61). RFC 6749 section 3.3 allows issuing a narrower scope than was asked
            for. Filtering happens before resource narrowing, so the two compose."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (doseq [[label registered requested resource expected absent]
                [["a wildcard alongside a registered scope"
                  ["agent:content:read" "*"] "agent:content:read *" nil "agent:content:read" []]
                 ["a hierarchical wildcard alongside a registered scope"
                  ["agent:content:read" "agent:*"] "agent:* agent:content:read" nil "agent:content:read" []]
                 ["a scope deprecated since the client registered"
                  ["agent:content:read" "agent:table:read"] "agent:table:read agent:content:read" nil
                  "agent:content:read" ["agent:table:read"]]
                 ["several survivors, keeping the requested order"
                  ["agent:content:read" "agent:question:create" "agent:table:read"]
                  "agent:table:read agent:content:read agent:question:create" nil
                  "agent:content:read agent:question:create" ["agent:table:read"]]
                 ["a resource indicator narrowing the survivors further"
                  ["agent:content:read" "agent:question:create" "agent:table:read"]
                  "agent:table:read agent:content:read agent:question:create"
                  (str "http://localhost:3000" (mcp/mcp-canonical-path))
                  "agent:content:read" ["agent:table:read" "agent:question:create"]]]]
          (testing label
            (let [client-id (:client_id (create-test-client! {:scopes registered}))
                  response  (apply authorize-request! 200
                                   :client_id     client-id
                                   :redirect_uri  "https://example.com/callback"
                                   :response_type "code"
                                   :scope         requested
                                   :state         "test-state"
                                   (when resource [:resource resource]))
                  body      (:body response)]
              (is (= expected (extract-hidden-field "scope" body))
                  "the signed scope carries exactly the surviving scopes")
              (doseq [scope absent]
                (is (not (str/includes? body scope))
                    "a dropped scope is nowhere on the consent page")))))))))

(deftest authorize-dropping-unregistered-scopes-never-widens-test
  (testing "GHY-4542: dropping an unregistered scope must narrow the grant, never widen it. `*` is honored as a
            wildcard on the granted side by `scope-matches?`, so a token that still carried it would pass every
            endpoint that declares a scope. Followed through consent, the decision, and the token exchange."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [{:keys [client_id client_secret]} (create-test-client! {:scopes ["*" "agent:content:read"]})
              consent-resp (authorize-request! 200
                                               :client_id     client_id
                                               :redirect_uri  "https://example.com/callback"
                                               :response_type "code"
                                               :scope         "* agent:content:read"
                                               :state         "test-state")
              body         (:body consent-resp)
              granted      (extract-hidden-field "scope" body)]
          (is (= "agent:content:read" granted))
          (let [decision (form-post-decision!
                          :crowberto
                          {:approved      "true"
                           :csrf_token    (extract-csrf-token-from-consent body)
                           :params_sig    (extract-params-sig-from-consent body)
                           :client_id     client_id
                           :redirect_uri  "https://example.com/callback"
                           :response_type "code"
                           :scope         granted
                           :state         "test-state"}
                          302
                          :csrf-cookie (extract-csrf-cookie consent-resp))
                code     (extract-query-param (get-in decision [:headers "Location"]) "code")
                token    (token-request! {:grant_type   "authorization_code"
                                          :code         code
                                          :redirect_uri "https://example.com/callback"}
                                         :authorization (basic-auth-header client_id client_secret))]
            (is (= "agent:content:read" (:scope token))
                "the minted token carries only the registered scope")))))))

(defn- sign-decision-params
  "Sign `oauth-params` with `csrf-token` exactly as the consent page does, so a hand-built form carries a signature
   the decision endpoint accepts."
  [csrf-token oauth-params]
  (#'api.oauth/sign-oauth-params csrf-token oauth-params))

(deftest authorize-decision-enforces-scope-rules-test
  (testing "GHY-4542: the HMAC over the consent form is keyed by the CSRF token, which is printed on the page the
            user is looking at, so the user can recompute it over whatever scope they like. The signature proves no
            third party tampered with the form; it does not prove the scope was ever validated. /authorize/decision
            is the endpoint that issues the code, so it applies the scope rules itself: drop unregistered scopes,
            refuse when none survive, and grant exactly what is left."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        ;; as :rasta, so this test's decisions don't share :crowberto's per-user decision throttle with the rest of
        ;; the namespace
        (let [{:keys [client_id client_secret]} (create-test-client!
                                                 {:scopes ["*" "agent:content:read" "agent:table:read"]})
              consent-resp (get-consent-page! :rasta client_id)
              csrf-token   (extract-csrf-token-from-consent (:body consent-resp))
              csrf-cookie  (extract-csrf-cookie consent-resp)
              approve!     (fn [scope expected-status]
                             (let [params (cond-> {:client_id     client_id
                                                   :redirect_uri  "https://example.com/callback"
                                                   :response_type "code"
                                                   :state         "test-state"}
                                            scope (assoc :scope scope))]
                               (form-post-decision!
                                :rasta
                                (assoc params
                                       :approved   "true"
                                       :csrf_token csrf-token
                                       :params_sig (sign-decision-params csrf-token params))
                                expected-status
                                :csrf-cookie csrf-cookie)))
              refused      {:error             "invalid_request"
                            :error_description "The authorization request is invalid."}]
          (testing "a correctly signed approval of a registered scope still issues a code"
            (let [response (approve! "agent:content:read" 302)]
              (is (some? (extract-query-param (get-in response [:headers "Location"]) "code")))))
          (testing "a re-signed wildcard is dropped, so the code is issued for the registered scope alone and the
                    token it buys carries no wildcard"
            (let [response (approve! "* agent:content:read" 302)
                  code     (extract-query-param (get-in response [:headers "Location"]) "code")
                  token    (token-request! {:grant_type   "authorization_code"
                                            :code         code
                                            :redirect_uri "https://example.com/callback"}
                                           :authorization (basic-auth-header client_id client_secret))]
              (is (= "agent:content:read" (:scope token)))))
          (testing "a re-signed request whose scopes are all unregistered is refused, since dropping leaves nothing"
            (is (= refused (:body (approve! "*" 400))))
            (is (= refused (:body (approve! "agent:table:read" 400)))))
          (testing "a re-signed request with no usable scope at all is refused"
            (doseq [scope [nil "" "   "]]
              (testing (pr-str scope)
                (let [response (approve! scope 400)]
                  (is (= refused (:body response)))
                  (is (nil? (get-in response [:headers "Location"]))))))))))))

(deftest authorize-rejects-a-request-whose-scopes-are-all-unregistered-test
  (testing "GHY-4542: dropping unregistered scopes cannot leave a request with none, because a scope-less token is
            indistinguishable downstream from scope-unaware auth. When nothing survives the filter the request is
            refused with `invalid_scope` and a description distinct from the resource-narrowing one, so the two are
            diagnosable, pointing at the metadata document without echoing what the client sent."
    (doseq [site-url ["http://localhost:3000" "http://localhost:3000/metabase"]]
      (testing (str "site-url " site-url)
        (mt/with-temporary-setting-values [site-url site-url]
          (t2/with-transaction [_conn nil {:rollback-only true}]
            (doseq [[registered requested] [[["*"] "*"]
                                            [["agent:*"] "agent:*"]
                                            ;; shipped in v0.60-v0.61 and since removed, so older DCR clients hold it
                                            [["agent:table:read"] "agent:table:read"]]
                    resource [nil (str site-url (mcp/mcp-canonical-path))]]
              (testing (pr-str {:requested requested :resource resource})
                (let [client-id   (:client_id (create-test-client! {:scopes registered}))
                      response    (apply authorize-request! 400
                                         :client_id     client-id
                                         :redirect_uri  "https://example.com/callback"
                                         :response_type "code"
                                         :scope         requested
                                         :state         "test-state"
                                         (when resource [:resource resource]))
                      description (str (get-in response [:body :error_description]))]
                  (is (= {:error             "invalid_scope"
                          :error_description (str "None of the requested scopes are supported. Request only scopes "
                                                  "listed in scopes_supported at " site-url
                                                  "/.well-known/oauth-authorization-server")}
                         (:body response))
                      "the description points at the metadata document, including the site-url subpath")
                  (is (not (str/includes? description requested))
                      "the description does not echo the rejected scopes")
                  (is (re-matches #"[\x20-\x21\x23-\x5B\x5D-\x7E]*" description)
                      "the description stays within the RFC 6749 section 5.2 error_description character set")
                  (is (nil? (get-in response [:headers "Location"]))))))))))))

(deftest authorize-rejects-missing-scope-test
  (testing "GHY-4542: a request with no scope used to render a consent screen listing no permissions and
            mint a token with no scopes. Nothing downstream should have to tell a scope-less OAuth token
            apart from scope-unaware auth, so /authorize answers `invalid_scope` instead, whether `scope`
            is absent, empty, or whitespace, and with or without a `resource` indicator."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client-id (:client_id (create-test-client! {:scopes ["agent:content:read"]}))]
          (doseq [scope-params [[] [:scope ""] [:scope "   "]]
                  resource     [nil (str "http://localhost:3000" (mcp/mcp-canonical-path))]]
            (testing (pr-str {:scope-params scope-params :resource resource})
              (let [response (apply authorize-request! 400
                                    :client_id     client-id
                                    :redirect_uri  "https://example.com/callback"
                                    :response_type "code"
                                    :state         "test-state"
                                    (concat scope-params
                                            (when resource [:resource resource])))]
                (is (= {:error             "invalid_scope"
                        :error_description (str "The request must include a scope. Request only scopes listed in "
                                                "scopes_supported at "
                                                "http://localhost:3000/.well-known/oauth-authorization-server")}
                       (:body response)))))))))))

(deftest mb-full-client-can-still-authorize-test
  (testing "removing `mb:full` from the advertised sets must not break a first-party client that
            registered with it explicitly. That works only because oidc-provider validates a
            requested scope against the client's own registered `:scopes`, never against the
            provider's `:scopes-supported` -- which feeds the discovery document alone. Pinning the
            dependency here: if that ever changes, un-advertising a scope silently starts rejecting
            the clients that legitimately hold it."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client-id (:client_id (create-test-client! {:scopes [oauth-server/full-access-scope]}))]
          (testing "the scope is advertised nowhere"
            (is (not (contains? (set (oauth-server/supported-scopes)) oauth-server/full-access-scope)))
            (is (not (contains? (set (oauth-server/default-grant-scopes)) oauth-server/full-access-scope))))
          (testing "yet the consent screen still renders for a client registered with it"
            (is (mt/user-http-request :crowberto :get 200 "oauth/authorize"
                                      :client_id     client-id
                                      :redirect_uri  "https://example.com/callback"
                                      :response_type "code"
                                      :scope         oauth-server/full-access-scope
                                      :state         "test-state"))))))))

;;; ------------------------------------- Malformed resource indicators -------------------------------------

(def ^:private malformed-resources
  "`resource` values containing an entry that is not a parseable URI at all, as opposed to one that parses but is
   relative or has a fragment."
  ["http://bad uri"
   ["http://localhost:3000/api/mcp" "http://bad uri"]])

(deftest authorize-malformed-resource-is-invalid-target-test
  (testing "GHY-4542: an unparseable `resource` indicator made oidc-provider throw a URISyntaxException that nothing
            caught, answering a client input error with a 500. It is now a 400 naming the RFC 8707 section 2
            `invalid_target` code, like any other invalid resource indicator."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client-id (:client_id (create-test-client!))]
          (doseq [resource malformed-resources]
            (testing (pr-str resource)
              (let [response (authorize-request! 400
                                                 :client_id     client-id
                                                 :redirect_uri  "https://example.com/callback"
                                                 :response_type "code"
                                                 :scope         "agent:content:read"
                                                 :state         "test-state"
                                                 :resource      resource)]
                (is (= {:error             "invalid_target"
                        :error_description invalid-target-description}
                       (:body response)))
                (is (nil? (get-in response [:headers "Location"])))))))))))

(deftest authorize-decision-malformed-resource-is-invalid-request-test
  (testing "GHY-4542: the decision endpoint's parameters are untrusted until their signature verifies, so an
            unparseable `resource` there is a 400 `invalid_request` rather than a 500, and never a redirect"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client-id    (:client_id (create-test-client!))
              consent-resp (get-consent-page! :crowberto client-id)
              consent-body (:body consent-resp)]
          (doseq [resource malformed-resources]
            (testing (pr-str resource)
              (let [response (form-post-decision!
                              :crowberto
                              {:approved      "true"
                               :csrf_token    (extract-csrf-token-from-consent consent-body)
                               :params_sig    (extract-params-sig-from-consent consent-body)
                               :client_id     client-id
                               :redirect_uri  "https://example.com/callback"
                               :response_type "code"
                               :scope         "agent:content:read"
                               :state         "test-state"
                               :resource      resource}
                              400
                              :csrf-cookie (extract-csrf-cookie consent-resp))]
                (is (= {:error             "invalid_request"
                        :error_description "The authorization request is invalid."}
                       (:body response)))
                (is (nil? (get-in response [:headers "Location"])))))))))))

(deftest token-malformed-resource-is-invalid-target-test
  (testing "GHY-4542: an unparseable `resource` indicator at the token endpoint is an RFC 8707 `invalid_target` 400
            in the RFC 6749 section 5.2 error shape, not a 500"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [{:keys [client_id client_secret]} (create-test-client!)]
          (doseq [resource malformed-resources]
            (testing (pr-str resource)
              (is (= {:error             "invalid_target"
                      :error_description invalid-target-description}
                     (token-request! {:grant_type   "authorization_code"
                                      :code         "some-code"
                                      :redirect_uri "https://example.com/callback"
                                      :resource     resource}
                                     :expected-status 400
                                     :authorization (basic-auth-header client_id client_secret)))))))))))
;;; ------------------------------- Registration scope vs. the authorization ceiling -------------------------------

(def ^:private v2-scope-set
  #{"agent:content:read" "agent:content:write" "agent:query:run"
    "agent:sql:run" "agent:delivery:write" "agent:resource:read"})

(defn- mcp-resource-uri []
  (str "http://localhost:3000" (mcp/mcp-canonical-path)))

(defn- register-mcp-client!
  "Register a confidential DCR client with `registration` merged into the body. Returns the registration response."
  [registration]
  (register-client! (merge {:redirect_uris              ["https://example.com/callback"]
                            :client_name                "Step-up Client"
                            :token_endpoint_auth_method "client_secret_basic"}
                           registration)))

(defn- get-mcp-consent-page!
  "GET `/oauth/authorize` as crowberto for `scope` against the canonical MCP resource. Returns the full response,
  whatever its status."
  [client-id scope]
  ;; `/oauth/authorize` answers a stale session with a login 302, which the test client does not
  ;; retry the way it retries a 401. A session cached from an earlier rolled-back transaction would
  ;; turn every authorize below into that redirect, so revalidate it here first.
  (mt/user-http-request :crowberto :get 200 "api/user/current")
  (mt/user-http-request-full-response
   :crowberto :get "oauth/authorize"
   :client_id     client-id
   :redirect_uri  "https://example.com/callback"
   :response_type "code"
   :scope         scope
   :resource      (mcp-resource-uri)
   :state         "test-state"))

(defn- offered-scopes
  "The offered scopes signed into the consent page in `consent-resp`, in order."
  [consent-resp]
  (some-> (extract-hidden-field "scope" (:body consent-resp)) (str/split #" ")))

(defn- post-mcp-decision!
  "Approve the MCP consent page in `consent-resp`, echoing its signed fields back with `granted` (a seq of scope
  strings, or nil to send no choice) as the user's choice. Returns the full decision response."
  [client-id consent-resp granted expected-status]
  (let [body (:body consent-resp)]
    (form-post-decision!
     :crowberto
     (cond-> {:approved      "true"
              :csrf_token    (extract-csrf-token-from-consent body)
              :params_sig    (extract-params-sig-from-consent body)
              :client_id     client-id
              :redirect_uri  "https://example.com/callback"
              :response_type "code"
              :scope         (extract-hidden-field "scope" body)
              :resource      (mcp-resource-uri)
              :state         "test-state"}
       (seq granted) (assoc :granted_scope (vec granted)))
     expected-status
     :csrf-cookie (extract-csrf-cookie consent-resp))))

(defn- exchange-code!
  "Exchange the authorization code in `decision`'s redirect for tokens. Returns the token response body."
  [{:keys [client_id client_secret]} decision]
  (token-request! {:grant_type   "authorization_code"
                   :code         (extract-query-param (get-in decision [:headers "Location"]) "code")
                   :redirect_uri "https://example.com/callback"
                   :resource     (mcp-resource-uri)}
                  :authorization (basic-auth-header client_id client_secret)))

(defn- register-then-authorize-mcp!
  "Register a confidential DCR client with `registration` merged into the body, then run the whole
  authorization-code flow as crowberto for `scope` against the canonical MCP resource, ticking every offered scope.
  Returns `{:authorize <consent-page response>, :token <token response or nil>}`; `:token` is nil when the
  authorize request did not reach the consent page."
  [registration scope]
  (let [client       (register-mcp-client! registration)
        consent-resp (get-mcp-consent-page! (:client_id client) scope)]
    {:authorize consent-resp
     :token     (when (= 200 (:status consent-resp))
                  (exchange-code! client (post-mcp-decision! (:client_id client) consent-resp
                                                             (offered-scopes consent-resp) 302)))}))

(defn- token-scope-set [token-response]
  (some-> (:scope token-response) (str/split #" ") set))

(def ^:private v2-baseline-scope-set
  #{"agent:content:read" "agent:query:run" "agent:resource:read"})

(deftest registration-scope-does-not-narrow-step-up-test
  (testing (str "GHY-4543: Claude Code registers with the scope it read from the protected-resource metadata, then "
                "steps up on the *same* client_id with the wider scope from a 403 `insufficient_scope` challenge. "
                "If the registration `scope` were that client's ceiling, the step-up `/authorize` would be refused "
                "and the user could never reach write, SQL, or delivery.")
    (mt/with-temporary-setting-values [site-url                                  "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [{:keys [authorize token]} (register-then-authorize-mcp!
                                         {:scope "agent:content:read agent:query:run agent:resource:read"}
                                         (str/join " " (sort v2-scope-set)))]
          (testing "the step-up request reaches the consent page"
            (is (= 200 (:status authorize)) (pr-str (:body authorize)))
            (is (str/includes? (get-in authorize [:headers "Content-Type"]) "text/html")))
          (testing "and the token carries every requested v2 scope"
            (is (= v2-scope-set (some-> (:scope token) (str/split #" ") set)))))))))

(deftest registration-without-scope-uses-default-ceiling-test
  (testing (str "GHY-4543: a client that omits `scope` at registration may authorize for every v2 scope. Pins the "
                "default ceiling that step-up relies on.")
    (mt/with-temporary-setting-values [site-url                                  "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [{:keys [authorize token]} (register-then-authorize-mcp! {} (str/join " " (sort v2-scope-set)))]
          (is (= 200 (:status authorize)) (pr-str (:body authorize)))
          (is (= v2-scope-set (some-> (:scope token) (str/split #" ") set))))))))

(deftest registration-with-wide-scope-can-authorize-for-it-test
  (testing (str "GHY-4543: the Claude Desktop native connector registers a *new* client whose `scope` is the "
                "challenged wider set, then authorizes for that set on the new client.")
    (mt/with-temporary-setting-values [site-url                                  "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [wide                      (str/join " " (sort v2-scope-set))
              {:keys [authorize token]} (register-then-authorize-mcp! {:scope wide} wide)]
          (is (= 200 (:status authorize)) (pr-str (:body authorize)))
          (is (= v2-scope-set (some-> (:scope token) (str/split #" ") set))))))))

(deftest registration-scope-step-up-is-still-narrowed-to-resource-test
  (testing (str "GHY-4543: widening a dynamic client's ceiling happens before RFC 8707 narrowing, so a step-up that "
                "names the MCP resource is still trimmed to the scopes that resource accepts.")
    (mt/with-temporary-setting-values [site-url                                  "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [not-mcp                   (first (remove v2-scope-set (oauth-server/default-grant-scopes)))
              {:keys [authorize token]} (register-then-authorize-mcp!
                                         {:scope "agent:content:read agent:query:run agent:resource:read"}
                                         (str/join " " (conj (sort v2-scope-set) not-mcp)))]
          (is (some? not-mcp) "the default ceiling holds a scope the MCP resource does not accept")
          (is (= 200 (:status authorize)) (pr-str (:body authorize)))
          (is (= v2-scope-set (some-> (:scope token) (str/split #" ") set))))))))

(defn- register-then-authorize-without-resource!
  "Register a DCR client with `registration` merged into the body and GET `/oauth/authorize` for `scope` as
  crowberto, sending no RFC 8707 resource indicator. Returns the authorize response."
  [registration scope]
  (let [{:keys [client_id]} (register-client! (merge {:redirect_uris              ["https://example.com/callback"]
                                                      :token_endpoint_auth_method "client_secret_basic"}
                                                     registration))]
    ;; see [[register-then-authorize-mcp!]] for why the session is revalidated first
    (mt/user-http-request :crowberto :get 200 "api/user/current")
    (mt/user-http-request-full-response
     :crowberto :get "oauth/authorize"
     :client_id     client_id
     :redirect_uri  "https://example.com/callback"
     :response_type "code"
     :scope         scope
     :state         "test-state")))

(deftest dynamic-client-ceiling-still-bounds-requests-test
  (testing (str "GHY-4543: a narrow registration is widened to the default ceiling, not beyond it. A client that "
                "omits the resource indicator is not narrowed, so the ceiling is what refuses these.")
    (mt/with-temporary-setting-values [site-url                                  "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (testing "control: the same flow reaches consent for a scope inside the default ceiling"
          (let [response (register-then-authorize-without-resource!
                          {:scope "agent:content:read agent:query:run agent:resource:read"}
                          "agent:content:write")]
            (is (= 200 (:status response)) (pr-str (:body response)))))
        (doseq [scope [oauth-server/full-access-scope "*" "agent:*" "bogus:nonsense"]]
          (testing scope
            (let [response (register-then-authorize-without-resource!
                            {:scope "agent:content:read agent:query:run agent:resource:read"}
                            scope)]
              (is (= 400 (:status response)))
              (is (= "invalid_scope" (get-in response [:body :error]))))))))))

(deftest dynamic-client-registered-with-extra-scope-keeps-it-test
  (testing (str "GHY-4543: the ceiling is the registration `scope` *plus* the default, so a first-party client that "
                "registers for `mb:full`, which the default deliberately omits, can still authorize for it.")
    (mt/with-temporary-setting-values [site-url                                  "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [response (register-then-authorize-without-resource!
                        {:scope oauth-server/full-access-scope}
                        (str oauth-server/full-access-scope " agent:content:read"))]
          (is (= 200 (:status response)) (pr-str (:body response))))))))

;;; ---------------------------------------------- Per-scope consent -----------------------------------------------

(def ^:private all-v2-scopes
  (str/join " " (sort v2-scope-set)))

(deftest decision-mints-only-chosen-scopes-test
  (testing (str "GHY-4555: a client requests all six v2 scopes and the user ticks only `agent:content:write`. The "
                "token carries that plus the always-granted baseline, and neither the token response nor the stored "
                "token holds the scopes the user left unticked.")
    (mt/with-temporary-setting-values [site-url                                  "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client       (register-mcp-client! {})
              consent-resp (get-mcp-consent-page! (:client_id client) all-v2-scopes)
              expected     (conj v2-baseline-scope-set "agent:content:write")]
          (is (= v2-scope-set (set (offered-scopes consent-resp))) "the page offers all six")
          (let [token  (exchange-code! client (post-mcp-decision! (:client_id client) consent-resp
                                                                  ["agent:content:write"] 302))
                stored (:scopes (oauth-server/resolve-access-token (:access_token token)))]
            (testing "the token response `scope` names exactly the granted scopes (RFC 6749 section 3.3)"
              (is (= expected (token-scope-set token))))
            (testing "the stored token carries the same scopes"
              (is (= expected stored))
              (is (not-any? #{"agent:sql:run" "agent:delivery:write"} stored)))))))))

(deftest decision-rejects-choice-outside-offered-scopes-test
  (testing (str "GHY-4555: the signed `scope` is what was offered and the user's choice travels in an unsigned field, "
                "so a choice naming anything outside the offered set is rejected as tampering instead of widening "
                "the grant.")
    (mt/with-temporary-setting-values [site-url                                  "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client       (register-mcp-client! {})
              consent-resp (get-mcp-consent-page!
                            (:client_id client)
                            "agent:content:read agent:query:run agent:resource:read agent:content:write")]
          (doseq [granted [["agent:sql:run"]
                           ["agent:content:write" "agent:delivery:write"]
                           [oauth-server/full-access-scope]
                           ["agent:content:write agent:sql:run"]
                           [""]]]
            (testing (pr-str granted)
              (let [response (post-mcp-decision! (:client_id client) consent-resp granted 403)]
                (is (= "params_tampered" (get-in response [:body :error])))
                (is (nil? (get-in response [:headers "Location"])) "no code is issued")))))))))

(deftest decision-rejects-empty-grant-test
  (testing (str "GHY-4555: approving with nothing chosen when no baseline scope was offered would mint a token with "
                "no scope. The page disables Authorize in that case, and the server refuses it too.")
    (mt/with-temporary-setting-values [site-url                                  "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (testing "a non-baseline scope requested without a resource indicator"
          (let [client-id    (:client_id (create-test-client! {:scopes ["agent:content:write"]}))
                consent-resp (mt/user-http-request-full-response
                              :crowberto :get 200 "oauth/authorize"
                              :client_id     client-id
                              :redirect_uri  "https://example.com/callback"
                              :response_type "code"
                              :scope         "agent:content:write"
                              :state         "test-state")
                consent-body (:body consent-resp)
                response     (form-post-decision!
                              :crowberto
                              {:approved      "true"
                               :csrf_token    (extract-csrf-token-from-consent consent-body)
                               :params_sig    (extract-params-sig-from-consent consent-body)
                               :client_id     client-id
                               :redirect_uri  "https://example.com/callback"
                               :response_type "code"
                               :scope         "agent:content:write"
                               :state         "test-state"}
                              400
                              :csrf-cookie (extract-csrf-cookie consent-resp))]
            (is (= "invalid_request" (get-in response [:body :error])))
            (is (nil? (get-in response [:headers "Location"])) "no code is issued")))
        (testing "MCP scopes outside the baseline"
          (let [client       (register-mcp-client! {})
                consent-resp (get-mcp-consent-page! (:client_id client) "agent:content:write agent:sql:run")
                response     (post-mcp-decision! (:client_id client) consent-resp nil 400)]
            (is (= "invalid_request" (get-in response [:body :error])))))))))

(deftest decision-always-grants-offered-baseline-test
  (testing (str "GHY-4555: the baseline scopes are ticked and locked on the page, and a disabled checkbox is not "
                "submitted, so the server grants every offered baseline scope whatever the form sends.")
    (mt/with-temporary-setting-values [site-url                                  "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (testing "all six offered, nothing chosen: the token carries the baseline"
          (let [client       (register-mcp-client! {})
                consent-resp (get-mcp-consent-page! (:client_id client) all-v2-scopes)
                token        (exchange-code! client (post-mcp-decision! (:client_id client) consent-resp nil 302))]
            (is (= v2-baseline-scope-set (token-scope-set token)))))
        (testing "only the baseline scopes that were offered are granted"
          (let [client       (register-mcp-client! {})
                consent-resp (get-mcp-consent-page! (:client_id client) "agent:query:run agent:content:write")
                token        (exchange-code! client (post-mcp-decision! (:client_id client) consent-resp nil 302))]
            (is (= #{"agent:query:run"} (token-scope-set token)))))))))

(deftest reauthorize-offers-declined-scope-again-test
  (testing (str "GHY-4555: a declined scope is not remembered. Re-authorizing the same client offers it again, and "
                "ticking it this time grants it.")
    (mt/with-temporary-setting-values [site-url                                  "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client  (register-mcp-client! {})
              initial (get-mcp-consent-page! (:client_id client) all-v2-scopes)
              token   (exchange-code! client (post-mcp-decision! (:client_id client) initial
                                                                 ["agent:content:write"] 302))]
          (is (not (contains? (token-scope-set token) "agent:sql:run")))
          (let [again (get-mcp-consent-page! (:client_id client) all-v2-scopes)]
            (is (= v2-scope-set (set (offered-scopes again))) "the declined scopes are offered again")
            (let [token (exchange-code! client (post-mcp-decision! (:client_id client) again
                                                                   ["agent:sql:run"] 302))]
              (is (= (conj v2-baseline-scope-set "agent:sql:run") (token-scope-set token))))))))))

(defn- consent-checkboxes
  "The `{:scope <value> :checked? :disabled?}` of each scope checkbox on the consent page `body`, in page order."
  [body]
  (for [tag (re-seq #"<input[^>]*type=\"checkbox\"[^>]*>" body)]
    {:scope     (second (re-find #"value=\"([^\"]*)\"" tag))
     :checked?  (boolean (re-find #"\schecked[\s=/>]" tag))
     :disabled? (boolean (re-find #"\sdisabled[\s=/>]" tag))}))

(deftest consent-page-scope-order-test
  (testing (str "GHY-4555: the six v2 scopes are listed least to most harmful whatever order they were requested in, "
                "and any other requested scope follows in request order")
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        ;; a registered non-v2 scope: GHY-4542 drops unregistered scopes before the page is rendered
        (let [not-v2    (first-non-mcp-default-scope)
              requested [not-v2 "agent:delivery:write" "agent:sql:run" oauth-server/full-access-scope
                         "agent:content:write" "agent:query:run" "agent:content:read" "agent:resource:read"]
              client-id (:client_id (create-test-client! {:scopes requested}))
              body      (:body (mt/user-http-request-full-response
                                :crowberto :get 200 "oauth/authorize"
                                :client_id     client-id
                                :redirect_uri  "https://example.com/callback"
                                :response_type "code"
                                :scope         (str/join " " requested)
                                :state         "test-state"))]
          (is (= ["agent:resource:read" "agent:content:read" "agent:query:run"
                  "agent:content:write" "agent:sql:run" "agent:delivery:write"
                  not-v2 oauth-server/full-access-scope]
                 (map :scope (consent-checkboxes body))))
          (testing "the baseline is ticked and locked; everything else, `mb:full` included, starts unticked"
            (is (= {"agent:resource:read"          [true true]
                    "agent:content:read"           [true true]
                    "agent:query:run"              [true true]
                    "agent:content:write"          [false false]
                    "agent:sql:run"                [false false]
                    "agent:delivery:write"         [false false]
                    not-v2                         [false false]
                    oauth-server/full-access-scope [false false]}
                   (into {} (map (juxt :scope (juxt :checked? :disabled?))) (consent-checkboxes body))))))))))

(deftest consent-scope-order-covers-v2-scopes-test
  (testing "GHY-4555: the consent order ranks exactly the v2 scopes, so a new v2 scope is not silently listed last"
    (is (= (set (mcp/v2-scopes)) (set @#'api.oauth/consent-scope-order)))
    (is (= (count (mcp/v2-scopes)) (count @#'api.oauth/consent-scope-order)))))

(deftest consent-page-opts-into-script-nonce-test
  (testing (str "GHY-4568: the consent page's inline script needs a `script-src` nonce. Dev mode allows "
                "'unsafe-inline' and adds no nonce, so a response that forgot to opt in would work locally and have "
                "its script blocked in production. Outside dev mode, the CSP header's nonce must be the one on the "
                "page's script tag.")
    (with-redefs [config/is-dev? false]
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (let [client-id    (:client_id (create-test-client!))
                response     (get-consent-page! :crowberto client-id)
                header-nonce (some->> (get-in response [:headers "Content-Security-Policy"])
                                      (re-find #"script-src[^;]*'nonce-([^']+)'")
                                      second)
                body-nonce   (some->> (:body response)
                                      (re-find #"<script nonce=\"([^\"]+)\">")
                                      second)]
            (is (seq header-nonce) "the CSP header's script-src carries a nonce")
            (is (seq body-nonce) "the page has a nonce'd script tag")
            (is (= header-nonce body-nonce))))))))

;;; ------------------------------------------ Unticking a held scope --------------------------------------------

(defn- register-app-client!
  "Register a confidential DCR client named `client-name` whose only redirect is `redirect-uri` and which may use
  refresh tokens. Returns the registration response."
  [client-name redirect-uri]
  (register-client! {:redirect_uris              [redirect-uri]
                     :client_name                client-name
                     :grant_types                ["authorization_code" "refresh_token"]
                     :response_types             ["code"]
                     :token_endpoint_auth_method "client_secret_basic"}))

(defn- consent-page-at!
  "GET `/oauth/authorize` as `user` for `client-id` redirecting to `redirect-uri`, requesting `scope` (every v2 scope by
  default) against the canonical MCP resource. Returns the full 200 response."
  ([user client-id redirect-uri]
   (consent-page-at! user client-id redirect-uri all-v2-scopes))
  ([user client-id redirect-uri scope]
   ;; see [[get-mcp-consent-page!]] for why the session is revalidated first
   (mt/user-http-request user :get 200 "api/user/current")
   (mt/user-http-request-full-response
    user :get 200 "oauth/authorize"
    :client_id     client-id
    :redirect_uri  redirect-uri
    :response_type "code"
    :scope         scope
    :resource      (mcp-resource-uri)
    :state         "test-state")))

(defn- insert-token!
  "Insert a `model` (`:model/OAuthAccessToken` or `:model/OAuthRefreshToken`) row for `user` on `client-id` holding
  `scopes`, live for an hour unless `overrides` say otherwise."
  [model user client-id scopes & {:as overrides}]
  (t2/insert! model (merge {:token     (str (random-uuid))
                            :user_id   (mt/user->id user)
                            :client_id client-id
                            :scope     (vec scopes)
                            :expiry    (+ (System/currentTimeMillis) (* 60 60 1000))}
                           overrides)))

(defn- checkbox-states
  "`scope` -> `[checked? disabled?]` for each scope checkbox on the consent page in `response`."
  [response]
  (into {} (map (juxt :scope (juxt :checked? :disabled?))) (consent-checkboxes (:body response))))

(def ^:private baseline-locked
  {"agent:resource:read" [true true]
   "agent:content:read"  [true true]
   "agent:query:run"     [true true]})

(deftest consent-page-does-not-pre-tick-held-scopes-test
  (testing (str "GHY-4555: a step-up asks for held plus required scopes, and every non-baseline scope is offered "
                "unticked even when the user already holds it on a live token of the same client. Pre-ticking a held "
                "scope needs to know which connection is stepping up, which the consent page cannot tell (GHY-4627). "
                "The baseline stays ticked and locked.")
    (mt/with-temporary-setting-values [site-url                                  "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [redirect            "https://example.com/callback"
              held                (conj v2-baseline-scope-set "agent:content:write")
              {:keys [client_id]} (register-app-client! "Step-up Client" redirect)]
          (insert-token! :model/OAuthAccessToken :crowberto client_id held)
          (insert-token! :model/OAuthRefreshToken :crowberto client_id held :expiry nil)
          (is (= (merge baseline-locked
                        {"agent:content:write"  [false false]
                         "agent:sql:run"        [false false]
                         "agent:delivery:write" [false false]})
                 (checkbox-states (consent-page-at! :crowberto client_id redirect)))))))))

(defn- authorize-at!
  "Run the consent flow as crowberto for the registered `client` at `redirect-uri`, requesting `scope` and ticking
  exactly `granted`, then exchange the code. Returns the token response."
  [client redirect-uri scope granted]
  (let [consent  (consent-page-at! :crowberto (:client_id client) redirect-uri scope)
        body     (:body consent)
        decision (form-post-decision!
                  :crowberto
                  (cond-> {:approved      "true"
                           :csrf_token    (extract-csrf-token-from-consent body)
                           :params_sig    (extract-params-sig-from-consent body)
                           :client_id     (:client_id client)
                           :redirect_uri  redirect-uri
                           :response_type "code"
                           :scope         (extract-hidden-field "scope" body)
                           :resource      (mcp-resource-uri)
                           :state         "test-state"}
                    (seq granted) (assoc :granted_scope (vec granted)))
                  302
                  :csrf-cookie (extract-csrf-cookie consent))]
    (token-request! {:grant_type   "authorization_code"
                     :code         (extract-query-param (get-in decision [:headers "Location"]) "code")
                     :redirect_uri redirect-uri
                     :resource     (mcp-resource-uri)}
                    :authorization (basic-auth-header (:client_id client) (:client_secret client)))))

(defn- access-token-scopes
  "The scope set the bearer `token-response`'s access token resolves to, or nil when it no longer resolves."
  [token-response]
  (:scopes (oauth-server/resolve-access-token (:access_token token-response))))

(defn- live-refresh-scopes
  "The scope sets of the unrevoked refresh tokens of `client`."
  [client]
  (set (map (comp set :scope) (t2/select :model/OAuthRefreshToken :client_id (:client_id client) :revoked_at nil))))

(defn- refresh!
  "Refresh `token-response` for `client`. Returns the response body."
  [client token-response]
  (token-request! {:grant_type "refresh_token" :refresh_token (:refresh_token token-response)}
                  :authorization (basic-auth-header (:client_id client) (:client_secret client))))

(def ^:private claude-redirect "https://claude.ai/api/mcp/auth_callback")

(deftest untick-leaves-other-live-tokens-alone-test
  (testing (str "GHY-4555: a consent decision governs only the token this authorization mints. Unticking a scope the "
                "same app already holds must not narrow or revoke that app's other live tokens: the authorization code "
                "and the approved event are already persisted when the decision returns, dynamic registration lets "
                "anyone register a client carrying another app's redirect, and a code issued before the untick would "
                "mint the scope back anyway. Taking a granted permission away is a separate flow.")
    (mt/with-temporary-setting-values [site-url                                  "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [held     (conj v2-baseline-scope-set "agent:content:write")
              window-a (register-app-client! "Claude" claude-redirect)
              token-a  (authorize-at! window-a claude-redirect all-v2-scopes ["agent:content:write"])
              ;; the Claude connector registers a new client for the step-up, which leaves out content:write
              window-b (register-app-client! "Claude" claude-redirect)
              step-up  (str/join " " (conj (sort v2-baseline-scope-set) "agent:content:write" "agent:sql:run"))]
          (is (= held (access-token-scopes token-a)))
          (is (= [false false] (get (checkbox-states (consent-page-at! :crowberto (:client_id window-b)
                                                                       claude-redirect step-up))
                                    "agent:content:write"))
              "content:write is offered, unticked and tickable, so leaving it out narrows this authorization")
          (let [token-b (authorize-at! window-b claude-redirect step-up ["agent:sql:run"])]
            (is (= (conj v2-baseline-scope-set "agent:sql:run") (token-scope-set token-b))
                "the new token carries only what was ticked")
            (testing "the other window's access and refresh tokens keep the unticked scope"
              (is (= held (access-token-scopes token-a)))
              (is (= #{held} (live-refresh-scopes window-a))))
            (testing "and its refresh token still mints it"
              (is (= held (token-scope-set (refresh! window-a token-a)))))))))))

(deftest decision-stores-a-repeated-scope-once-test
  (testing (str "GHY-4555: a client may repeat a scope in its `scope` parameter. The consent page lists it once, and "
                "the grant is filtered from the offered list, so a duplicate left there would be stored twice.")
    (mt/with-temporary-setting-values [site-url                                  "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled true]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client  (register-app-client! "Claude" claude-redirect)
              scope   "agent:content:write agent:query:run agent:content:write"
              consent (consent-page-at! :crowberto (:client_id client) claude-redirect scope)
              _       (authorize-at! client claude-redirect scope ["agent:content:write"])
              row     (t2/select-one :model/OAuthAccessToken :client_id (:client_id client))]
          (is (= ["agent:query:run" "agent:content:write"]
                 (map :scope (consent-checkboxes (:body consent))))
              "the page lists the repeated scope once")
          (is (= ["agent:content:write" "agent:query:run"] (vec (:scope row)))
              "the stored token holds it once"))))))

(deftest registration-disabled-baseline-client-can-step-up-test
  (testing (str "GHY-4543: Claude Code registers with the baseline scopes and steps up on the same client_id. Turning "
                "dynamic registration off blocks new clients, but must not turn that step-up into a raw 400 for a "
                "client registered before it was turned off.")
    (mt/with-temporary-setting-values [site-url                                  "http://localhost:3000"
                                       oauth-server-dynamic-registration-enabled false]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        ;; see [[register-then-authorize-mcp!]] for why the session is revalidated first
        (mt/user-http-request :crowberto :get 200 "api/user/current")
        (let [mcp-uri   (str "http://localhost:3000" (mcp/mcp-canonical-path))
              not-mcp   (first-non-mcp-default-scope)
              ;; what `POST /oauth/register` stores for a client that registered with the baseline `scope`
              client-id (:client_id (create-test-client! {:scopes            (vec (mcp/v2-baseline-scopes))
                                                          :registration_type "dynamic"}))
              authorize (fn [scope & resource]
                          (apply mt/user-http-request-full-response
                                 :crowberto :get "oauth/authorize"
                                 :client_id     client-id
                                 :redirect_uri  "https://example.com/callback"
                                 :response_type "code"
                                 :scope         scope
                                 :state         "test-state"
                                 resource))]
          (is (some? not-mcp) "the default ceiling holds a scope the MCP surface does not accept")
          (testing "the client reaches consent for all six v2 scopes against the MCP resource"
            (let [response (authorize (str/join " " (sort v2-scope-set)) :resource mcp-uri)]
              (is (= 200 (:status response)) (pr-str (:body response)))
              (is (= v2-scope-set (some-> (extract-hidden-field "scope" (:body response)) (str/split #" ") set)))))
          ;; No resource indicator, so nothing is narrowed and the ceiling alone decides.
          (testing "the client cannot request an agent-API scope outside its registration"
            (let [response (authorize not-mcp)]
              (is (= 400 (:status response)))
              (is (= "invalid_scope" (get-in response [:body :error]))))))))))
