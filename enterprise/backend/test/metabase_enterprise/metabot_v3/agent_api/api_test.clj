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

      (testing "Missing token returns 401"
        (is (= "Unauthenticated"
               (client/client :get 401 "agent/v1/ping"))))

      (testing "Invalid token returns 401"
        (is (= "Unauthenticated"
               (client/client :get 401 "agent/v1/ping"
                              {:request-options {:headers {"authorization" "Bearer invalid-token"}}}))))

      (testing "Token with non-existent user returns 401"
        (let [token (sign-jwt {:sub "nobody@example.com"})]
          (is (= "Unauthenticated"
                 (client/client :get 401 "agent/v1/ping"
                                {:request-options {:headers {"authorization" (str "Bearer " token)}}}))))))))

(deftest agent-api-requires-jwt-shared-secret-test
  (mt/with-additional-premium-features #{:metabot-v3}
    (testing "Returns 401 when jwt-shared-secret is not configured"
      (mt/with-temporary-setting-values [jwt-shared-secret nil]
        (let [token (sign-jwt {:sub "rasta@metabase.com"})]
          (is (= "Unauthenticated"
                 (client/client :get 401 "agent/v1/ping"
                                {:request-options {:headers {"authorization" (str "Bearer " token)}}}))))))))
