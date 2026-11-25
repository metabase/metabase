(ns ^:mb/driver-tests metabase.driver.clickhouse-tuple-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver.clickhouse-introspection :as clickhouse-introspection]))

(set! *warn-on-reflection* true)

(deftest ^:parallel type-arguments-test
  (are [type-name database-type expected] (= expected (clickhouse-introspection/type-arguments type-name database-type))
    "Array"    "Array(Int32)"                                 ["Int32"]
    "Map"      "Map(String, Tuple(a Int32, b Int32))"         ["String" "Tuple(a Int32, b Int32)"]
    "Nullable" "Nullable(DateTime64(3, 'UTC'))"               ["DateTime64(3, 'UTC')"]
    ;; commas, parentheses and escaped characters in quotes
    "Tuple"    "Tuple(`a, b` Int32, k Enum8('c\\')(d' = 1))"  ["`a, b` Int32" "k Enum8('c\\')(d' = 1)"]
    ;; another type
    "Map"      "Array(Int32)"                                 nil
    "Array"    "String"                                       nil
    "Array"    nil                                            nil))

(deftest ^:parallel type-arguments-long-string-test
  (let [enum-type (format "Enum8('%s' = 1)" (str/join (repeat 20000 "a")))]
    (is (= [enum-type] (clickhouse-introspection/type-arguments "Array" (format "Array(%s)" enum-type))))))
