(ns metabase.jvm-util-test
  (:require
   [clojure.test :refer :all]
   [metabase.jvm-util :as jvm-u]))

(deftest ^:parallel parse-currency-test
  (are [s expected] (= expected
                       (jvm-u/parse-currency s))
    nil             nil
    ""              nil
    "   "           nil
    "$1,000"        1000.0M
    "$1,000,000"    1000000.0M
    "$1,000.00"     1000.0M
    "€1.000"        1000.0M
    "€1.000,00"     1000.0M
    "€1.000.000,00" 1000000.0M
    "-£127.54"      -127.54M
    "-127,54 €"     -127.54M
    "kr-127,54"     -127.54M
    "€ 127,54-"     -127.54M
    "¥200"          200.0M
    "¥200."         200.0M
    "$.05"          0.05M
    "0.05"          0.05M))
