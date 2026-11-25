(ns ^:mb/driver-tests metabase.driver.clickhouse-tuple-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver.clickhouse-introspection :as clickhouse-introspection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.test :as qp]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.clickhouse]
   [metabase.util.json :as json]
   [taoensso.nippy :as nippy]
   [toucan2.core :as t2]))

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
    (testing "the results cache can serialize the keys of a map"
      (let [value (tuple-value (str "(map(CAST('a', 'Enum8(''a'' = 1)'), 1),"
                                    " map(toIPv4('1.2.3.4'), 2),"
                                    " map(tuple(1, 'x'), 3))"))]
        (is (= [{"a" 1} {"1.2.3.4" 2} {[1 "x"] 3}]
               value
               (nippy/thaw (nippy/freeze value))))))
    (testing "a tuple with named elements keeps their order in the results cache"
      (let [value (tuple-value "CAST((1, 2, 3, 4, 5, 6, 7, 8, 9, 10), 'Tuple(j Int8, i Int8, h Int8, g Int8, f Int8, e Int8, d Int8, c Int8, b Int8, a Int8)')")]
        (is (= ["j" "i" "h" "g" "f" "e" "d" "c" "b" "a"]
               (keys value)
               (keys (nippy/thaw (nippy/freeze value)))))))))

(mt/defdataset tuple_test
  [["placeholder"
    [{:field-name "i", :base-type {:native "Int32"}}]
    []]])

(defn- do-with-tuple-table!
  "Create a table `places` with named `Tuple` columns in the `tuple_test` dataset, sync it, and call `f` with the
  synced table."
  [f]
  (mt/dataset tuple_test
    (let [db      (mt/db)
          details (mt/dbdef->connection-details :clickhouse :db {:database-name "tuple_test"})
          exec!   #(metabase.test.data.clickhouse/exec-statements % details)]
      (exec! ["DROP TABLE IF EXISTS tuple_test.places"
              (str "CREATE TABLE tuple_test.places (id UInt32, loc Tuple(lat Float64, lon Float64), "
                   "info Tuple(name String, addr Tuple(city String, zip Nullable(String))), pair Tuple(String, Int32)) "
                   "ENGINE = MergeTree ORDER BY id")
              (str "INSERT INTO tuple_test.places VALUES "
                   "(1, (43.6, -79.4), ('cafe', ('Toronto', 'M5V')), ('a', 1)), "
                   "(2, (45.5, -73.6), ('bar', ('Montreal', NULL)), ('b', 2)), "
                   "(3, (43.7, -79.3), ('deli', ('Toronto', NULL)), ('c', 3))")])
      (try
        (sync/sync-database! (:id db))
        (f (t2/select-one :model/Table :db_id (:id db) :name "places"))
        (finally
          (exec! ["DROP TABLE IF EXISTS tuple_test.places"]))))))

(defn- field-paths
  "Map of each field's path of names (e.g. `[\"info\" \"addr\" \"city\"]`) to its base type."
  [table]
  (let [fields (t2/select :model/Field :table_id (:id table) :active true)
        by-id  (into {} (map (juxt :id identity)) fields)
        path   (fn path [{:keys [parent_id] field-name :name}]
                 (conj (if parent_id (path (by-id parent_id)) []) field-name))]
    (into {} (map (juxt path :base_type)) fields)))

(deftest ^:synchronized named-tuple-nested-fields-test
  (mt/test-driver :clickhouse
    (do-with-tuple-table!
     (fn [table]
       (testing "sync makes a nested field for each element of a named tuple"
         (is (= {["id"]                   :type/Integer
                 ["loc"]                  :type/Dictionary
                 ["loc" "lat"]            :type/Float
                 ["loc" "lon"]            :type/Float
                 ["info"]                 :type/Dictionary
                 ["info" "name"]          :type/Text
                 ["info" "addr"]          :type/Dictionary
                 ["info" "addr" "city"]   :type/Text
                 ["info" "addr" "zip"]    :type/Text
                 ["pair"]                 :type/*}
                (field-paths table))))
       (let [mp    (mt/metadata-provider)
             field (fn [field-name parent-name]
                     (let [parent-id (t2/select-one-pk :model/Field :table_id (:id table) :name parent-name)]
                       (lib.metadata/field mp (t2/select-one-pk :model/Field :table_id (:id table)
                                                                :name field-name :parent_id parent-id))))
             query (lib/query mp (lib.metadata/table mp (:id table)))]
         (testing "group by, filter and aggregate on tuple elements"
           (is (= [["Toronto" 2 43.7]]
                  (mt/rows
                   (qp/process-query
                    (-> query
                        (lib/filter (lib/< (field "lon" "loc") -75))
                        (lib/breakout (field "city" "addr"))
                        (lib/aggregate (lib/count))
                        (lib/aggregate (lib/max (field "lat" "loc"))))))))))))))
