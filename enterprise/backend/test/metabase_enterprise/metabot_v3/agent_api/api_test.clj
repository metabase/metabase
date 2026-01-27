(ns metabase-enterprise.metabot-v3.agent-api.api-test
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.test :refer :all]
   [environ.core :as env]
   [java-time.api :as t]
   [metabase-enterprise.metabot-v3.settings] ; for setting definitions
   [metabase.session.models.session :as session.models]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util.random :as u.random]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private test-jwt-secret (u.random/secure-hex 32))

(defn- current-epoch-seconds []
  (int (/ (System/currentTimeMillis) 1000)))

(defn- sign-jwt
  "Sign a JWT with the test secret. Automatically adds `iat` claim if not present,
   which is required for max-age validation."
  [claims]
  (jwt/sign (merge {:iat (current-epoch-seconds)} claims) test-jwt-secret))

(defmacro with-agent-api-setup!
  "Sets up JWT authentication for Agent API tests. Uses test-helpers-set-global-values!
   to ensure settings are visible to the HTTP server thread."
  [& body]
  `(mt/test-helpers-set-global-values!
     (mt/with-additional-premium-features #{:metabot-v3 :sso-jwt}
       (mt/with-temporary-setting-values [~'jwt-shared-secret ~'test-jwt-secret]
         ~@body))))

(defn- auth-headers
  ([]
   (auth-headers "rasta@metabase.com"))
  ([email]
   {"authorization" (str "Bearer " (sign-jwt {:sub email}))}))

(deftest agent-api-jwt-auth-test
  (with-agent-api-setup!
    (testing "Valid JWT with sub claim succeeds"
      (is (= {:message "pong"}
             (client/client :get 200 "agent/v1/ping"
                            {:request-options {:headers (auth-headers)}}))))

    (testing "Valid JWT with email claim (fallback) succeeds"
      (let [token    (sign-jwt {:email "rasta@metabase.com"})
            response (client/client :get 200 "agent/v1/ping"
                                    {:request-options {:headers {"authorization" (str "Bearer " token)}}})]
        (is (= {:message "pong"}
               response))))

    (testing "Email case insensitivity - uppercase email in token"
      (is (= {:message "pong"}
             (client/client :get 200 "agent/v1/ping"
                            {:request-options {:headers (auth-headers "RASTA@METABASE.COM")}}))))

    (testing "Email case insensitivity - mixed case email in token"
      (is (= {:message "pong"}
             (client/client :get 200 "agent/v1/ping"
                            {:request-options {:headers (auth-headers "RaStA@MeTaBaSe.CoM")}}))))

    (testing "Bearer scheme is case-insensitive (uppercase BEARER)"
      (let [token    (sign-jwt {:sub "rasta@metabase.com"})
            response (client/client :get 200 "agent/v1/ping"
                                    {:request-options {:headers {"authorization" (str "BEARER " token)}}})]
        (is (= {:message "pong"}
               response))))

    (testing "Bearer scheme is case-insensitive (mixed case)"
      (let [token    (sign-jwt {:sub "rasta@metabase.com"})
            response (client/client :get 200 "agent/v1/ping"
                                    {:request-options {:headers {"authorization" (str "BeArEr " token)}}})]
        (is (= {:message "pong"}
               response))))))

(deftest agent-api-error-responses-test
  (with-agent-api-setup!
    (testing "Missing authorization header (no session, no JWT)"
      (let [response (client/client :get 401 "agent/v1/ping")]
        (is (= {:error   "missing_authorization"
                :message "Authentication required. Use X-Metabase-Session header or Authorization: Bearer <jwt>."}
               response))))

    (testing "Invalid authorization header format (not Bearer)"
      (let [response (client/client :get 401 "agent/v1/ping"
                                    {:request-options {:headers {"authorization" "Basic xyz"}}})]
        (is (= {:error   "invalid_authorization_format"
                :message "Authorization header must use Bearer scheme: Authorization: Bearer <jwt>"}
               response))))

    (testing "Empty bearer token"
      (let [response (client/client :get 401 "agent/v1/ping"
                                    {:request-options {:headers {"authorization" "Bearer "}}})]
        (is (= {:error   "invalid_jwt"
                :message "Invalid or expired JWT token."}
               response))))

    (testing "Whitespace-only bearer token"
      (let [response (client/client :get 401 "agent/v1/ping"
                                    {:request-options {:headers {"authorization" "Bearer    "}}})]
        (is (= {:error   "invalid_jwt"
                :message "Invalid or expired JWT token."}
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
      (is (= {:error   "invalid_jwt"
              :message "Invalid or expired JWT token."}
             (client/client :get 401 "agent/v1/ping"
                            {:request-options {:headers (auth-headers "nobody@example.com")}}))))))

(deftest agent-api-requires-jwt-shared-secret-test
  (mt/test-helpers-set-global-values!
    (mt/with-additional-premium-features #{:metabot-v3 :sso-jwt}
      (testing "Returns 401 when jwt-shared-secret is not configured"
        (mt/with-temporary-setting-values [jwt-shared-secret nil]
          (is (= {:error   "jwt_not_configured"
                  :message "JWT authentication is not configured. Set the JWT shared secret in admin settings."}
                 (client/client :get 401 "agent/v1/ping"
                                {:request-options {:headers (auth-headers)}}))))))))

(deftest agent-api-expired-jwt-test
  (mt/test-helpers-set-global-values!
    (mt/with-additional-premium-features #{:metabot-v3 :sso-jwt}
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
            (is (= {:message "pong"} response))))))))

(deftest agent-api-session-token-auth-test
  (mt/test-helpers-set-global-values!
    (mt/with-additional-premium-features #{:metabot-v3}
      (testing "Session tokens via X-Metabase-Session header authenticate successfully"
        (let [session-key (session.models/generate-session-key)
              _           (t2/insert! :model/Session
                                      {:id          (session.models/generate-session-id)
                                       :user_id     (mt/user->id :rasta)
                                       :session_key session-key})
              response    (client/client :get 200 "agent/v1/ping"
                                         {:request-options {:headers {"x-metabase-session" session-key}}})]
          (is (= {:message "pong"} response))))

      (testing "Invalid session token returns 401"
        (let [fake-session-key (str (random-uuid))
              response         (client/client :get 401 "agent/v1/ping"
                                              {:request-options {:headers {"x-metabase-session" fake-session-key}}})]
          ;; Invalid session means standard middleware doesn't set metabase-user-id,
          ;; so our middleware sees no auth and returns missing_authorization
          (is (= {:error   "missing_authorization"
                  :message "Authentication required. Use X-Metabase-Session header or Authorization: Bearer <jwt>."}
                 response)))))))

(deftest agent-api-inactive-user-test
  (with-agent-api-setup!
    (testing "JWT for deactivated user returns same error as invalid token (no information disclosure)"
      (mt/with-temp [:model/User {email :email} {:is_active false}]
        (is (= {:error   "invalid_jwt"
                :message "Invalid or expired JWT token."}
               (client/client :get 401 "agent/v1/ping"
                              {:request-options {:headers (auth-headers email)}})))))))

(deftest agent-api-expired-session-test
  (testing "Expired sessions are rejected by the standard session middleware"
    (mt/test-helpers-set-global-values!
      (mt/with-additional-premium-features #{:metabot-v3}
        ;; Set max-session-age to 1 minute for this test
        (with-redefs [env/env (assoc env/env :max-session-age "1")]
          (let [session-key (session.models/generate-session-key)
                old-time    (t/minus (t/instant) (t/minutes 2))]
            (mt/with-temp [:model/Session _ {:user_id     (mt/user->id :rasta)
                                             :session_key session-key
                                             :created_at  old-time}]
              (testing "Session older than max-session-age is rejected"
                (is (= {:error   "missing_authorization"
                        :message "Authentication required. Use X-Metabase-Session header or Authorization: Bearer <jwt>."}
                       (client/client :get 401 "agent/v1/ping"
                                      {:request-options {:headers {"x-metabase-session" session-key}}})))))))))))
