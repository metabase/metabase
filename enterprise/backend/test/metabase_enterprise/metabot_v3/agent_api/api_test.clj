(ns metabase-enterprise.metabot-v3.agent-api.api-test
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.settings] ; for setting definitions
   [metabase.session.models.session :as session.models]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util.random :as u.random]
   [toucan2.core :as t2]))

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
          (is (= {:error   "missing_authorization"
                  :message "Authorization header is required."}
                 response))))

      (testing "Invalid authorization header format (not Bearer)"
        (let [response (client/client :get 401 "agent/v1/ping"
                                      {:request-options {:headers {"authorization" "Basic xyz"}}})]
          (is (= {:error   "invalid_authorization_format"
                  :message "Authorization header must use Bearer scheme: Authorization: Bearer <token>"}
                 response))))

      (testing "Invalid token signature"
        (let [response (client/client :get 401 "agent/v1/ping"
                                      {:request-options {:headers {"authorization" "Bearer invalid-token"}}})]
          (is (= {:error   "invalid_jwt"
                  :message "Invalid or expired JWT token."}
                 response))))

      (testing "Token missing email claim returns same error as invalid token (no information disclosure)"
        (let [token    (sign-jwt {:name "Test User"})
              response (client/client :get 401 "agent/v1/ping"
                                      {:request-options {:headers {"authorization" (str "Bearer " token)}}})]
          (is (= {:error   "invalid_jwt"
                  :message "Invalid or expired JWT token."}
                 response))))

      (testing "Token with non-existent user returns same error as invalid token (no information disclosure)"
        (let [token    (sign-jwt {:sub "nobody@example.com"})
              response (client/client :get 401 "agent/v1/ping"
                                      {:request-options {:headers {"authorization" (str "Bearer " token)}}})]
          (is (= {:error   "invalid_jwt"
                  :message "Invalid or expired JWT token."}
                 response)))))))

(deftest agent-api-requires-jwt-shared-secret-test
  (mt/with-additional-premium-features #{:metabot-v3}
    (testing "Returns 401 when jwt-shared-secret is not configured"
      (mt/with-temporary-setting-values [jwt-shared-secret nil]
        (let [token    (sign-jwt {:sub "rasta@metabase.com"})
              response (client/client :get 401 "agent/v1/ping"
                                      {:request-options {:headers {"authorization" (str "Bearer " token)}}})]
          (is (= {:error   "jwt_not_configured"
                  :message "JWT authentication is not configured. Set the JWT shared secret in admin settings."}
                 response)))))))

(deftest agent-api-expired-jwt-test
  (mt/with-additional-premium-features #{:metabot-v3}
    (mt/with-temporary-setting-values [jwt-shared-secret     test-jwt-secret
                                       agent-api-jwt-max-age 60]
      (testing "Expired JWT is rejected (iat older than max-age)"
        (let [old-iat  (- (current-epoch-seconds) 120) ; 2 minutes ago, max-age is 60s
              token    (jwt/sign {:sub "rasta@metabase.com" :iat old-iat} test-jwt-secret)
              response (client/client :get 401 "agent/v1/ping"
                                      {:request-options {:headers {"authorization" (str "Bearer " token)}}})]
          (is (= {:error   "invalid_jwt"
                  :message "Invalid or expired JWT token."}
                 response))))

      (testing "JWT within max-age is accepted"
        (let [recent-iat (- (current-epoch-seconds) 30) ; 30 seconds ago, max-age is 60s
              token      (jwt/sign {:sub "rasta@metabase.com" :iat recent-iat} test-jwt-secret)
              response   (client/client :get 200 "agent/v1/ping"
                                        {:request-options {:headers {"authorization" (str "Bearer " token)}}})]
          (is (= {:message "pong"} response)))))))

(deftest agent-api-session-token-auth-test
  (mt/with-additional-premium-features #{:metabot-v3}
    (testing "Session tokens (UUID format) are passed through to session middleware"
      (let [session-key (session.models/generate-session-key)
            _           (t2/insert! :model/Session
                                    {:id         (session.models/generate-session-id)
                                     :user_id    (mt/user->id :rasta)
                                     :session_key session-key})
            response    (client/client :get 200 "agent/v1/ping"
                                       {:request-options {:headers {"authorization" (str "Bearer " session-key)}}})]
        (is (= {:message "pong"} response))))

    (testing "Invalid session token returns 401"
      (let [fake-session-key (str (random-uuid))
            response         (client/client :get 401 "agent/v1/ping"
                                            {:request-options {:headers {"authorization" (str "Bearer " fake-session-key)}}})]
        (is (= {:error   "invalid_session"
                :message "Invalid or expired session token."}
               response))))))

(deftest agent-api-inactive-user-test
  (mt/with-additional-premium-features #{:metabot-v3}
    (mt/with-temporary-setting-values [jwt-shared-secret test-jwt-secret]
      (testing "JWT for deactivated user returns same error as invalid token (no information disclosure)"
        (mt/with-temp [:model/User {email :email} {:is_active false}]
          (let [token    (sign-jwt {:sub email})
                response (client/client :get 401 "agent/v1/ping"
                                        {:request-options {:headers {"authorization" (str "Bearer " token)}}})]
            (is (= {:error   "invalid_jwt"
                    :message "Invalid or expired JWT token."}
                   response))))))))
