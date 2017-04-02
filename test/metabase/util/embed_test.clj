(ns metabase.util.embed-test
  (:require [buddy.sign.jwt :as jwt]
            [crypto.random :as crypto-random]
            [expectations :refer :all]
            [metabase.test.util :as tu]
            [metabase.util.embed :as embed]))

(def ^:private ^String token-with-alg-none
  "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhZG1pbiI6dHJ1ZX0.3Dbtd6Z0yuSfw62fOzBGHyiL0BJp3pod_PZE-BBdR-I")

;; check that are token is in fact valid
(expect
  {:admin true}
  (jwt/unsign token-with-alg-none ""))

;; check that we disallow tokens signed with alg = none
(expect
  clojure.lang.ExceptionInfo
  (tu/with-temporary-setting-values [embedding-secret-key (crypto-random/hex 32)]
    (embed/unsign token-with-alg-none)))
