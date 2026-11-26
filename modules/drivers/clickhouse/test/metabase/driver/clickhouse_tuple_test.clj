(ns ^:mb/driver-tests metabase.driver.clickhouse-tuple-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver.clickhouse-introspection :as clickhouse-introspection]
   [metabase.query-processor.test :as qp]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [taoensso.nippy :as nippy]))

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

(deftest ^:parallel tuple-elements-test
  (are [database-type expected] (= expected (clickhouse-introspection/tuple-elements database-type))
    "Tuple(lat Float64, lon Float64)"
    [["lat" "Float64"] ["lon" "Float64"]]

    "Tuple(name String, addr Tuple(city String, zip Nullable(String)), `my key` Enum8('a,b' = 1))"
    [["name" "String"] ["addr" "Tuple(city String, zip Nullable(String))"] ["my key" "Enum8('a,b' = 1)"]]

    ;; an escaped character in a quoted name
    "Tuple(`it\\`s` Int32, z Int32)"
    [["it`s" "Int32"] ["z" "Int32"]]

    ;; elements with no names
    "Tuple(String, Int32)"                          nil
    "Tuple(Nullable(String), DateTime64(3, 'UTC'))" nil
    "Tuple(Enum8('a b' = 1), Int32)"                nil
    "Tuple()"                                       nil
    ;; not a tuple
    "Array(Tuple(a String))"                        nil
    "String"                                        nil
    nil                                             nil))

(defn- tuple-value
  "The value of the SQL `expression` in the results of a native query."
  [expression]
  (-> (mt/native-query {:query (format "SELECT %s AS t" expression)})
      qp/process-query
      mt/rows
      ffirst))

(deftest ^:parallel tuple-values-test
  (mt/test-driver :clickhouse
    (are [expression expected] (= expected (json/encode (tuple-value expression)))
      ;; a tuple with named elements is a map
      "CAST((43.6, -79.4), 'Tuple(lat Float64, lon Float64)')"
      "{\"lat\":43.6,\"lon\":-79.4}"

      "CAST(('cafe', ('Toronto', NULL)), 'Tuple(name String, addr Tuple(city String, zip Nullable(String)))')"
      "{\"name\":\"cafe\",\"addr\":{\"city\":\"Toronto\",\"zip\":null}}"

      ;; a tuple with elements that have no names is a list
      "('a', (1, NULL))"
      "[\"a\",[1,null]]"

      ;; arrays, maps and objects inside a tuple
      "CAST(([('k', 7)], map('a', tuple(1))), 'Tuple(items Array(Tuple(sku String, n Int32)), m Map(String, Tuple(x Int32)))')"
      "{\"items\":[{\"sku\":\"k\",\"n\":7}],\"m\":{\"a\":{\"x\":1}}}"

      "CAST(('x', '1.2.3.4', (1.5, 2.5)), 'Tuple(kind Nullable(Enum8(''x'' = 1)), ip IPv4, p Point)')"
      "{\"kind\":\"x\",\"ip\":\"1.2.3.4\",\"p\":[1.5,2.5]}"

      ;; the elements keep their order
      "CAST((1, 2, 3, 4, 5, 6, 7, 8, 9, 10), 'Tuple(j Int8, i Int8, h Int8, g Int8, f Int8, e Int8, d Int8, c Int8, b Int8, a Int8)')"
      "{\"j\":1,\"i\":2,\"h\":3,\"g\":4,\"f\":5,\"e\":6,\"d\":7,\"c\":8,\"b\":9,\"a\":10}")))

(deftest ^:parallel tuple-values-serialization-test
  (mt/test-driver :clickhouse
    (testing "the results cache can serialize the values in a tuple"
      (let [value (tuple-value "(CAST('x', 'Enum8(''x'' = 1)'), map('a', 1), CAST('{\"a\": 1}', 'JSON'))")]
        (is (= ["x" {"a" 1} {"a" 1}]
               value
               (nippy/thaw (nippy/freeze value))))))
    (testing "a tuple with named elements keeps their order in the results cache"
      (let [value (tuple-value "CAST((1, 2, 3, 4, 5, 6, 7, 8, 9, 10), 'Tuple(j Int8, i Int8, h Int8, g Int8, f Int8, e Int8, d Int8, c Int8, b Int8, a Int8)')")]
        (is (= ["j" "i" "h" "g" "f" "e" "d" "c" "b" "a"]
               (keys value)
               (keys (nippy/thaw (nippy/freeze value)))))))))
