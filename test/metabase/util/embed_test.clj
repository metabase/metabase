(ns ^:mb/once metabase.util.embed-test
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.test :refer :all]
   [crypto.random :as crypto-random]
   [metabase.config :as config]
   [metabase.test :as mt]
   [metabase.util.embed :as embed]))

(def ^:private ^String token-with-alg-none
  "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhZG1pbiI6dHJ1ZX0.3Dbtd6Z0yuSfw62fOzBGHyiL0BJp3pod_PZE-BBdR-I")

(deftest ^:parallel validate-token-test
  (testing "check that are token is in fact valid"
    (is (= {:admin true}
           (jwt/unsign token-with-alg-none "")))))

(deftest disallow-unsigned-tokens-test
  (testing "check that we disallow tokens signed with alg = none"
    (mt/with-temporary-setting-values [embedding-secret-key (crypto-random/hex 32)]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"JWT `alg` cannot be `none`"
           (embed/unsign token-with-alg-none))))))

(deftest show-static-embed-terms-test
  (mt/with-test-user :crowberto
    (mt/with-temporary-setting-values [show-static-embed-terms nil]
      (testing "Check if the user needs to accept the embedding licensing terms before static embedding"
        (when-not config/ee-available?
          (testing "should return true when user is OSS and has not accepted licensing terms"
            (is (= (embed/show-static-embed-terms) true)))
          (testing "should return false when user is OSS and has already accepted licensing terms"
            (embed/show-static-embed-terms! false)
            (is (= (embed/show-static-embed-terms) false))))
        (when config/ee-available?
          (testing "should always return false for EE users"
            (is (= (embed/show-static-embed-terms) false))
            (embed/show-static-embed-terms! false)
            (is (= (embed/show-static-embed-terms) false))))))))
