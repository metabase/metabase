(ns metabase-enterprise.product-analytics.token-test
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.test :refer :all]
   [metabase-enterprise.product-analytics.token :as pa.token]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest create-and-verify-round-trip-test
  (testing "A signed token can be verified and claims match"
    (mt/with-temporary-setting-values [product-analytics-session-secret nil]
      (let [token  (pa.token/create-session-token 42 7 "site-abc")
            claims (pa.token/verify-session-token token)]
        (is (some? claims))
        (is (= 42 (:session-id claims)))
        (is (= 7 (:visit-id claims)))
        (is (= "site-abc" (:website-id claims)))))))

(deftest verify-returns-nil-for-tampered-token-test
  (testing "Tampered token returns nil"
    (mt/with-temporary-setting-values [product-analytics-session-secret nil]
      (let [token (pa.token/create-session-token 1 2 "w")]
        (is (nil? (pa.token/verify-session-token (str token "tampered"))))))))

(deftest verify-returns-nil-for-expired-token-test
  (testing "Expired token (iat 25h in past) returns nil"
    (mt/with-temporary-setting-values [product-analytics-session-secret nil]
      ;; Force a secret to exist
      (pa.token/create-session-token 1 1 "w")
      (let [secret (pa.token/product-analytics-session-secret)
            iat    (- (quot (System/currentTimeMillis) 1000) (* 25 3600))
            token  (jwt/sign {:session-id 1 :visit-id 1 :website-id "w" :iat iat}
                             secret
                             {:alg :hs256})]
        (is (nil? (pa.token/verify-session-token token)))))))

(deftest verify-returns-nil-for-wrong-secret-test
  (testing "Token signed with a different secret returns nil"
    (mt/with-temporary-setting-values [product-analytics-session-secret nil]
      (let [token (jwt/sign {:session-id 1 :visit-id 1 :website-id "w"}
                            "wrong-secret-that-is-not-the-real-one"
                            {:alg :hs256})]
        (is (nil? (pa.token/verify-session-token token)))))))

(deftest verify-returns-nil-for-empty-token-test
  (testing "nil and empty string both return nil"
    (mt/with-temporary-setting-values [product-analytics-session-secret nil]
      (is (nil? (pa.token/verify-session-token nil)))
      (is (nil? (pa.token/verify-session-token ""))))))

(deftest auto-generates-secret-when-not-set-test
  (testing "Secret is auto-generated and persisted on first use"
    (mt/with-temporary-setting-values [product-analytics-session-secret nil]
      (is (nil? (pa.token/product-analytics-session-secret)))
      (let [token (pa.token/create-session-token 99 1 "auto")]
        (is (some? token))
        (is (some? (pa.token/product-analytics-session-secret)))
        (is (some? (pa.token/verify-session-token token)))))))
