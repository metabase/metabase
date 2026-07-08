(ns metabase.util.json-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(deftest ^:parallel decode-does-not-retain-jackson-parser-test
  (let [result (json/decode "[1]")]
    (is (vector? result))
    (is (= [1] result))))
