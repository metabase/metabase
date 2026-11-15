(ns metabase.session.challenge-test
  "Round-trip tests for the MFA challenge token (JWT sign/verify)."
  (:require
   [clojure.test :refer :all]
   [metabase.session.challenge :as session.challenge]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest round-trip-test
  (testing "a signed token verifies and returns the expected claims"
    (let [token  (session.challenge/issue-challenge-token 42 :provider/password)
          claims (session.challenge/verify-challenge-token token)]
      (is (map? claims))
      (is (= 42 (:user-id claims)))
      (is (= "password" (:provider claims)))
      (is (= "mfa-challenge" (:purpose claims)))
      (is (string? (:jti claims)))
      (is (pos? (:exp claims)))))
  (testing "a tampered token returns nil"
    (let [token (session.challenge/issue-challenge-token 1 :provider/ldap)
          bad   (str token "tampered")]
      (is (nil? (session.challenge/verify-challenge-token bad)))))
  (testing "a garbage string returns nil"
    (is (nil? (session.challenge/verify-challenge-token "not-a-jwt"))))
  (testing "an empty string returns nil"
    (is (nil? (session.challenge/verify-challenge-token "")))))
