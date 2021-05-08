(ns metabase.util.embed-test
  (:require [buddy.sign.jwt :as jwt]
            [clojure.test :refer :all]
            [crypto.random :as crypto-random]
            [metabase.test :as mt]
            [metabase.util.embed :as embed]))

(def ^:private ^String token-with-alg-none
  "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhZG1pbiI6dHJ1ZX0.3Dbtd6Z0yuSfw62fOzBGHyiL0BJp3pod_PZE-BBdR-I")

(deftest validate-token-test
  (testing "check that are token is in fact valid"
    (is (= {:admin true}
           (jwt/unsign token-with-alg-none "")))))

(deftest disallow-unsigned-tokens-test
  (testing "check that we disallow tokens signed with alg = none"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"JWT `alg` cannot be `none`"
         (mt/with-temporary-setting-values [embedding-secret-key (crypto-random/hex 32)]
           (embed/unsign token-with-alg-none))))))
