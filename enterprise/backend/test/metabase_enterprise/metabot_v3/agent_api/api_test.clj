(ns metabase-enterprise.metabot-v3.agent-api.api-test
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util.random :as u.random]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(def ^:private test-jwt-secret (u.random/secure-hex 32))

(defn- current-epoch-seconds []
  (int (/ (System/currentTimeMillis) 1000)))

(defn- sign-jwt
  "Sign a JWT with the test secret. Automatically adds `iat` claim if not present,
   which is required for max-age validation."
  [claims]
  (jwt/sign (merge {:iat (current-epoch-seconds)} claims) test-jwt-secret))

(deftest agent-api-jwt-auth-test
  (mt/with-additional-premium-features #{:metabot-v3}
    (mt/with-temporary-setting-values [jwt-shared-secret test-jwt-secret]
      (testing "Valid JWT with sub claim succeeds"
        (let [token    (sign-jwt {:sub "rasta@metabase.com"})
              response (client/client :get 200 "agent/v1/ping"
                                      {:request-options {:headers {"authorization" (str "Bearer " token)}}})]
          (is (= {:message "pong"}
                 response))))

      (testing "Valid JWT with email claim (fallback) succeeds"
        (let [token    (sign-jwt {:email "rasta@metabase.com"})
              response (client/client :get 200 "agent/v1/ping"
                                      {:request-options {:headers {"authorization" (str "Bearer " token)}}})]
          (is (= {:message "pong"}
                 response))))

      (testing "Email case insensitivity - uppercase email in token"
        (let [token    (sign-jwt {:sub "RASTA@METABASE.COM"})
              response (client/client :get 200 "agent/v1/ping"
                                      {:request-options {:headers {"authorization" (str "Bearer " token)}}})]
          (is (= {:message "pong"}
                 response))))

      (testing "Email case insensitivity - mixed case email in token"
        (let [token    (sign-jwt {:sub "RaStA@MeTaBaSe.CoM"})
              response (client/client :get 200 "agent/v1/ping"
                                      {:request-options {:headers {"authorization" (str "Bearer " token)}}})]
          (is (= {:message "pong"}
                 response)))))))

(deftest agent-api-error-responses-test
  (mt/with-additional-premium-features #{:metabot-v3}
    (mt/with-temporary-setting-values [jwt-shared-secret test-jwt-secret]
      (testing "Missing authorization header"
        (let [response (client/client :get 401 "agent/v1/ping")]
          (is (= {:error "missing_authorization"
                  :message "Authorization header is required"}
                 response))))

      (testing "Invalid authorization header format (not Bearer)"
        (let [response (client/client :get 401 "agent/v1/ping"
                                      {:request-options {:headers {"authorization" "Basic xyz"}}})]
          (is (= {:error "invalid_authorization_format"
                  :message "Authorization header must be 'Bearer <token>'"}
                 response))))

      (testing "Invalid token signature"
        (let [response (client/client :get 401 "agent/v1/ping"
                                      {:request-options {:headers {"authorization" "Bearer invalid-token"}}})]
          (is (= "invalid_token" (:error response)))
          (is (string? (:message response)))))

      (testing "Token missing email claim"
        (let [token    (sign-jwt {:name "Test User"})
              response (client/client :get 401 "agent/v1/ping"
                                      {:request-options {:headers {"authorization" (str "Bearer " token)}}})]
          (is (= {:error "missing_email_claim"
                  :message "JWT token must contain 'sub' or 'email' claim"}
                 response))))

      (testing "Token with non-existent user"
        (let [token    (sign-jwt {:sub "nobody@example.com"})
              response (client/client :get 401 "agent/v1/ping"
                                      {:request-options {:headers {"authorization" (str "Bearer " token)}}})]
          (is (= {:error "invalid_credentials"
                  :message "Invalid credentials"}
                 response)))))))

(deftest agent-api-requires-jwt-shared-secret-test
  (mt/with-additional-premium-features #{:metabot-v3}
    (testing "Returns 401 when jwt-shared-secret is not configured"
      (mt/with-temporary-setting-values [jwt-shared-secret nil]
        (let [token    (sign-jwt {:sub "rasta@metabase.com"})
              response (client/client :get 401 "agent/v1/ping"
                                      {:request-options {:headers {"authorization" (str "Bearer " token)}}})]
          (is (= {:error "jwt_not_configured"
                  :message "JWT shared secret is not configured"}
                 response)))))))
