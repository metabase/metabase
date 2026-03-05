(ns metabase.util.i18n.common-test
  (:require
   [clojure.test :refer [are deftest]]
   [metabase.util.i18n :as i18n]))

(deftest ^:parallel join-strings-with-conjunction-test
  (are [coll expected] (= expected
                          (i18n/join-strings-with-conjunction "and" coll))
    []                nil
    ["a"]             "a"
    ["a" "b"]         "a and b"
    ["a" "b" "c"]     "a, b, and c"
    ["a" "b" "c" "d"] "a, b, c, and d"))
