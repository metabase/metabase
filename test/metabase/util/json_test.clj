(ns metabase.util.json-test
  (:require
   [clojure.test :refer [are deftest is]]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(deftest ^:parallel decode-does-not-retain-jackson-parser-test
  (let [result (json/decode "[1]")]
    (is (vector? result))
    (is (= [1] result))))

(deftest ^:parallel decode-document+kw-test
  (are [s expected] (= expected (json/decode-document+kw s))
    "{\"a\": [1]}"      {:a [1]}
    " {\"a\": 1} \n"    {:a 1}
    "{\"a\": \"x\ny\"}" {:a "x\ny"}
    ""                  nil)
  (are [s] (thrown? Exception (json/decode-document+kw s))
    "{\"a\": 1} and more"
    "{\"a\": 1}{\"b\": 2}"
    "[1] [2]"))
