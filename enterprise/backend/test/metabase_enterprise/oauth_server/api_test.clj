(ns metabase-enterprise.oauth-server.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.oauth-server.core :as oauth-server]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [thunk]
                      (oauth-server/reset-provider!)
                      (binding [client/*url-prefix* ""]
                        (thunk))
                      (oauth-server/reset-provider!)))

(deftest discovery-endpoint-with-feature-flag-test
  (testing "Discovery endpoint returns valid OIDC metadata when feature enabled"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (let [response (mt/user-http-request :crowberto :get 200
                                             "oauth/.well-known/openid-configuration")]
          (is (contains? response :issuer))
          (is (contains? response :authorization_endpoint))
          (is (contains? response :token_endpoint))
          (is (contains? response :jwks_uri))
          (is (contains? response :response_types_supported))
          (is (contains? response :id_token_signing_alg_values_supported))
          (is (= "http://localhost:3000" (:issuer response)))
          (is (= "http://localhost:3000/oauth/register" (:registration_endpoint response))))))))

(deftest discovery-endpoint-without-feature-flag-test
  (testing "Discovery endpoint returns 404 when feature disabled"
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :get 404
                            "oauth/.well-known/openid-configuration"))))

(deftest jwks-endpoint-with-feature-flag-test
  (testing "JWKS endpoint returns valid key set when feature enabled"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                         oauth-server-signing-key nil]
        (let [response (mt/user-http-request :crowberto :get 200 "oauth/jwks")]
          (is (contains? response :keys))
          (is (pos? (count (:keys response))))
          (let [first-key (first (:keys response))]
            (is (= "RSA" (:kty first-key)))
            (is (= "sig" (:use first-key)))))))))

(deftest jwks-endpoint-without-feature-flag-test
  (testing "JWKS endpoint returns 404 when feature disabled"
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :get 404 "oauth/jwks"))))

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
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (let [response (register-client! {"redirect_uris"               ["https://example.com/callback"]
                                            "client_name"                "Test Client"
                                            "token_endpoint_auth_method" "client_secret_basic"})]
            (is (some? (:client_id response)))
            (is (some? (:client_secret response)))
            (is (some? (:registration_access_token response)))
            (is (= ["https://example.com/callback"] (:redirect_uris response)))
            (is (= "Test Client" (:client_name response)))))))))

(deftest dynamic-register-missing-redirect-uris-test
  (testing "POST /oauth/register with missing redirect_uris returns 400"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (let [response (register-client! {"client_name" "No Redirects"}
                                         :expected-status 400)]
          (is (= "invalid_client_metadata" (:error response))))))))

(deftest dynamic-register-non-https-redirect-test
  (testing "POST /oauth/register with non-HTTPS redirect URI returns 400"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (let [response (register-client! {"redirect_uris" ["http://example.com/callback"]}
                                         :expected-status 400)]
          (is (= "invalid_client_metadata" (:error response))))))))

(deftest dynamic-register-http-localhost-allowed-test
  (testing "POST /oauth/register with HTTP localhost redirect URI is allowed"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (let [response (register-client! {"redirect_uris" ["http://localhost:8080/callback"]})]
            (is (some? (:client_id response)))
            (is (= ["http://localhost:8080/callback"] (:redirect_uris response)))))))))

(deftest dynamic-register-without-feature-flag-test
  (testing "POST /oauth/register returns 404 without feature flag"
    (mt/with-premium-features #{}
      (client/client :post 404 "oauth/register"
                     {"redirect_uris" ["https://example.com/callback"]}))))

(deftest dynamic-register-sets-registration-type-test
  (testing "Dynamically registered client has registration_type = dynamic"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (let [response  (register-client! {"redirect_uris" ["https://example.com/callback"]})
                client-id (:client_id response)
                db-client (t2/select-one :model/OAuthClient :client_id client-id)]
            (is (= "dynamic" (:registration_type db-client)))))))))

(deftest dynamic-client-read-valid-test
  (testing "GET /oauth/register/:client-id with valid registration_access_token returns 200"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (let [reg-response  (register-client! {"redirect_uris" ["https://example.com/callback"]
                                                 "client_name"   "Read Test"})
                client-id     (:client_id reg-response)
                token         (:registration_access_token reg-response)
                read-response (read-client-config client-id token)]
            (is (= client-id (:client_id read-response)))
            (is (= ["https://example.com/callback"] (:redirect_uris read-response)))))))))

(deftest dynamic-client-read-invalid-token-test
  (testing "GET /oauth/register/:client-id with invalid token returns 401"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (let [reg-response (register-client! {"redirect_uris" ["https://example.com/callback"]})
                client-id    (:client_id reg-response)
                response     (read-client-config client-id "wrong-token" :expected-status 401)]
            (is (= "invalid_token" (:error response)))))))))

(deftest dynamic-client-read-missing-token-test
  (testing "GET /oauth/register/:client-id with missing Authorization header returns 401"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (let [reg-response (register-client! {"redirect_uris" ["https://example.com/callback"]})
                client-id    (:client_id reg-response)]
            ;; Use mt/user-http-request (which doesn't set Authorization header, only session header)
            (let [response (mt/user-http-request :crowberto :get 401
                                                 (str "oauth/register/" client-id))]
              (is (= "invalid_token" (:error response))))))))))

(deftest dynamic-client-read-wrong-client-id-test
  (testing "GET /oauth/register/:client-id with wrong client-id returns 401"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (let [reg-response (register-client! {"redirect_uris" ["https://example.com/callback"]})
                token        (:registration_access_token reg-response)
                response     (read-client-config "nonexistent-client" token :expected-status 401)]
            (is (= "invalid_token" (:error response)))))))))

(deftest dynamic-client-read-without-feature-flag-test
  (testing "GET /oauth/register/:client-id returns 404 without feature flag"
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :get 404 "oauth/register/some-client-id"
                            {:request-options {:headers {"authorization" "Bearer some-token"}}}))))

;;; ----------------------------------------- Authorization Endpoint ------------------------------------------------

(defn- create-test-client!
  "Create a static OAuth client via the admin API and return the response.
   Temporarily restores the default URL prefix since the fixture clears it for /oauth/ routes."
  []
  (binding [client/*url-prefix* "/api"]
    (mt/user-http-request :crowberto :post 200
                          "ee/oauth-server/clients"
                          {:redirect_uris  ["https://example.com/callback"]
                           :client_name    "Test Auth Client"
                           :grant_types    ["authorization_code"]
                           :response_types ["code"]
                           :scopes         ["openid" "profile"]})))

(deftest authorize-valid-request-test
  (testing "GET /oauth/authorize with valid params returns consent data"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (let [client    (create-test-client!)
                client-id (:client_id client)
                response  (mt/user-http-request :crowberto :get 200
                                                "oauth/authorize"
                                                :client_id     client-id
                                                :redirect_uri  "https://example.com/callback"
                                                :response_type "code"
                                                :scope         "openid profile"
                                                :state         "test-state")]
            (is (= "Test Auth Client" (:client_name response)))
            (is (= ["openid" "profile"] (:scopes response)))
            (is (= "https://example.com/callback" (:redirect_uri response)))
            (is (= client-id (:client_id response)))
            (is (= "code" (:response_type response)))
            (is (= "test-state" (:state response)))
            (is (= "openid profile" (:scope response)))))))))

(deftest authorize-invalid-client-id-test
  (testing "GET /oauth/authorize with missing/invalid client_id returns 400"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (let [response (mt/user-http-request :crowberto :get 400
                                             "oauth/authorize"
                                             :client_id     "nonexistent-client"
                                             :redirect_uri  "https://example.com/callback"
                                             :response_type "code")]
          (is (= "invalid_request" (:error response))))))))

(deftest authorize-mismatched-redirect-uri-test
  (testing "GET /oauth/authorize with mismatched redirect_uri returns 400"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (let [client    (create-test-client!)
                client-id (:client_id client)
                response  (mt/user-http-request :crowberto :get 400
                                                "oauth/authorize"
                                                :client_id     client-id
                                                :redirect_uri  "https://evil.com/callback"
                                                :response_type "code")]
            (is (= "invalid_request" (:error response)))))))))

(deftest authorize-unauthenticated-test
  (testing "GET /oauth/authorize without session returns 401"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (let [response (client/client :get 401 "oauth/authorize"
                                      :client_id     "some-client"
                                      :redirect_uri  "https://example.com/callback"
                                      :response_type "code")]
          (is (= "unauthorized" (:error response))))))))

(deftest authorize-without-feature-flag-test
  (testing "GET /oauth/authorize returns 404 without feature flag"
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :get 404
                            "oauth/authorize"
                            :client_id     "some-client"
                            :redirect_uri  "https://example.com/callback"
                            :response_type "code"))))

;;; ----------------------------------------- Authorization Decision ------------------------------------------------

(deftest authorize-decision-approve-test
  (testing "POST /oauth/authorize/decision with approved=true returns 302 redirect with code"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (let [client    (create-test-client!)
                client-id (:client_id client)
                response  (mt/user-http-request-full-response
                           :crowberto :post "oauth/authorize/decision"
                           {:approved      true
                            :client_id     client-id
                            :redirect_uri  "https://example.com/callback"
                            :response_type "code"
                            :scope         "openid profile"
                            :state         "test-state"})
                status    (:status response)
                location  (get-in response [:headers "Location"])]
            (is (= 302 status))
            (is (some? location))
            (is (str/starts-with? location "https://example.com/callback?"))
            (is (str/includes? location "code="))
            (is (str/includes? location "state=test-state"))))))))

(deftest authorize-decision-deny-test
  (testing "POST /oauth/authorize/decision with approved=false returns 302 redirect with error"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (let [client    (create-test-client!)
                client-id (:client_id client)
                response  (mt/user-http-request-full-response
                           :crowberto :post "oauth/authorize/decision"
                           {:approved      false
                            :client_id     client-id
                            :redirect_uri  "https://example.com/callback"
                            :response_type "code"
                            :scope         "openid profile"
                            :state         "test-state"})
                status    (:status response)
                location  (get-in response [:headers "Location"])]
            (is (= 302 status))
            (is (some? location))
            (is (str/starts-with? location "https://example.com/callback?"))
            (is (str/includes? location "error=access_denied"))
            (is (str/includes? location "state=test-state"))))))))

(deftest authorize-decision-unauthenticated-test
  (testing "POST /oauth/authorize/decision without session returns 401"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (let [response (client/client :post 401 "oauth/authorize/decision"
                                      {:approved      true
                                       :client_id     "some-client"
                                       :redirect_uri  "https://example.com/callback"
                                       :response_type "code"})]
          (is (= "unauthorized" (:error response))))))))

(deftest authorize-decision-without-feature-flag-test
  (testing "POST /oauth/authorize/decision returns 404 without feature flag"
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :post 404
                            "oauth/authorize/decision"
                            {:approved      true
                             :client_id     "some-client"
                             :redirect_uri  "https://example.com/callback"
                             :response_type "code"}))))
