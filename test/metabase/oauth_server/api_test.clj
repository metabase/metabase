(ns metabase.oauth-server.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
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
;; kondo flags it because of the `!` suffix in a fixture.
#_{:clj-kondo/ignore [:metabase/validate-deftest]}
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
  (testing "GET /.well-known/oauth-protected-resource/api/mcp returns correct metadata"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [response (mt/user-http-request :crowberto :get 200
                                           ".well-known/oauth-protected-resource/api/mcp")]
        (is (=? {:resource                "http://localhost:3000/api/mcp"
                 :authorization_servers   ["http://localhost:3000"]
                 :bearer_methods_supported ["header"]}
                response))))))

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
                        :scopes             ["profile"]
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
                         :scope         "profile"
                         :state         "test-state")
              body      (:body response)]
          (is (str/includes? (get-in response [:headers "Content-Type"]) "text/html"))
          (is (str/includes? body "Test Auth Client"))
          (is (str/includes? body "profile"))
          (is (str/includes? body client-id))
          (is (str/includes? body "test-state"))
          (is (str/includes? body "/oauth/authorize/decision")))))))

(deftest authorize-invalid-client-id-test
  (testing "GET /oauth/authorize with missing/invalid client_id returns 400"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [response (mt/user-http-request :crowberto :get 400
                                           "oauth/authorize"
                                           :client_id     "nonexistent-client"
                                           :redirect_uri  "https://example.com/callback"
                                           :response_type "code")]
        (is (= "invalid_request" (:error response)))))))

(deftest authorize-mismatched-redirect-uri-test
  (testing "GET /oauth/authorize with mismatched redirect_uri returns 400"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [client    (create-test-client!)
              client-id (:client_id client)
              response  (mt/user-http-request :crowberto :get 400
                                              "oauth/authorize"
                                              :client_id     client-id
                                              :redirect_uri  "https://evil.com/callback"
                                              :response_type "code")]
          (is (= "invalid_request" (:error response))))))))

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
          :scope         "profile"
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
                             :scope         "profile"
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
                             :scope         "profile"
                             :state         "test-state"}
                            302
                            :csrf-cookie csrf-cookie)
              location     (get-in response [:headers "Location"])]
          (is (some? location))
          (is (str/starts-with? location "https://example.com/callback?"))
          (is (str/includes? location "error=access_denied"))
          (is (str/includes? location "state=test-state")))))))

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
                          :scope         "profile"
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
                             :scope         "profile"
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
                             :scope         "profile"
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
                             :scope         "profile"
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
                             :scope         "profile"
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
                       :scope         "profile"
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
                                                  :scopes         ["profile"]})
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
                              :scope         "profile"
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
                             :scope         "profile"
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
                           :scope         "profile"
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
                         :scope         "profile"
                         :state         "test-state")
              body      (:body response)]
          (is (not (str/includes? body "<script>alert('xss')</script>"))
              "Raw script tags must not appear in the consent page")
          (is (str/includes? body "&lt;script&gt;")
              "Script tags should be HTML-escaped"))))))
