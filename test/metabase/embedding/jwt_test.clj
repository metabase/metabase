(ns metabase.embedding.jwt-test
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.test :refer :all]
   [metabase.embedding.jwt :as embed]
   [metabase.test :as mt]
   [metabase.util.random :as u.random]))

(def ^:private ^String token-with-alg-none
  "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhZG1pbiI6dHJ1ZX0.3Dbtd6Z0yuSfw62fOzBGHyiL0BJp3pod_PZE-BBdR-I")

(deftest ^:parallel validate-token-test
  (testing "check that are token is in fact valid"
    (is (= {:admin true}
           (jwt/unsign token-with-alg-none "")))))

(deftest disallow-unsigned-tokens-test
  (testing "check that we disallow tokens signed with alg = none"
    (mt/with-temporary-setting-values [embedding-secret-key (u.random/secure-hex 32)]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"JWT `alg` cannot be `none`"
           (embed/unsign token-with-alg-none))))))
