(ns metabase.auth-identity.mfa-token-test
  (:require
   [clojure.test :refer :all]
   [metabase.auth-identity.mfa-token :as mfa-token]))

(set! *warn-on-reflection* true)

(deftest create-and-verify-test
  (testing "round-trip: create then verify returns the same user-id"
    (let [user-id 42
          token   (mfa-token/create-mfa-token user-id)
          result  (mfa-token/verify-mfa-token token)]
      (is (= {:user-id user-id} result))))

  (testing "token is a non-empty string"
    (let [token (mfa-token/create-mfa-token 1)]
      (is (string? token))
      (is (pos? (count token))))))

(deftest verify-invalid-token-test
  (testing "rejects a garbage token"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Invalid or expired MFA token"
                          (mfa-token/verify-mfa-token "not-a-valid-jwt"))))

  (testing "rejects a tampered token"
    (let [token (mfa-token/create-mfa-token 1)]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Invalid or expired MFA token"
                            (mfa-token/verify-mfa-token (str token "x")))))))

(deftest verify-different-users-test
  (testing "different user IDs produce different tokens"
    (let [token1 (mfa-token/create-mfa-token 1)
          token2 (mfa-token/create-mfa-token 2)]
      (is (not= token1 token2))
      (is (= {:user-id 1} (mfa-token/verify-mfa-token token1)))
      (is (= {:user-id 2} (mfa-token/verify-mfa-token token2))))))

(deftest single-use-enforcement-test
  (testing "a token cannot be used twice (replay prevention)"
    (let [token (mfa-token/create-mfa-token 99)]
      (is (= {:user-id 99} (mfa-token/verify-mfa-token token)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"MFA token has already been used"
                            (mfa-token/verify-mfa-token token))))))
