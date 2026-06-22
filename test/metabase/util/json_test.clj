(ns metabase.util.json-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

;; Regression guard for the parser-retention leak: `cheshire/parse-string` returns a lazy seq for a top-level
;; array that pins the Jackson parser (~8KB) until realized; we use `parse-string-strict` so it's eager. Every
;; Field's `nfc_path` is a JSON array, so a lazy result would leak a parser per field (>1GB on wide tables).
(deftest ^:parallel decode-eager-test
  (testing "top-level arrays decode to a fully-realized vector, NOT a lazy seq"
    (is (vector? (json/decode "[1, 2, 3]")))
    (is (not (instance? clojure.lang.LazySeq (json/decode "[1, 2, 3]"))))
    (is (= [1 2 3] (json/decode "[1, 2, 3]")))
    (is (vector? (json/decode "[]")))
    (is (every? vector? (json/decode "[[1], [2, 3]]")))))
