(ns metabase.util.embed-test
  (:require [expectations :refer :all]
            [metabase.util.embed :as embed]))

;; check that we disallow tokens signed with alg = none
(expect
  clojure.lang.ExceptionInfo
  (embed/unsign "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhZG1pbiI6dHJ1ZX0.hGR6ufA7hbxH4RVyh26Z8Lz96LkarlYh3nLe2fqAOe0")) ; token with alg = none
