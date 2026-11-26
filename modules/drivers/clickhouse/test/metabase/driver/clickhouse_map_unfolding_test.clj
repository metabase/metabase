(ns ^:mb/driver-tests metabase.driver.clickhouse-map-unfolding-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.clickhouse-introspection :as clickhouse-introspection]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.clickhouse]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest ^:parallel unfolded-map-value-type-test
  (are [database-type expected] (= expected (clickhouse-introspection/unfolded-map-value-type database-type))
    "Map(String, String)"                      "String"
    "Map(String, UInt64)"                      "UInt64"
    "Map(LowCardinality(String), Float64)"     "Float64"
    "Map(String, DateTime64(3, 'UTC'))"        "DateTime64(3, 'UTC')"
    ;; keys that are not strings
    "Map(UInt8, String)"                       nil
    ;; values that cannot be NULL, or that have more than one value
    "Map(String, Array(Int32))"                nil
    "Map(String, Map(String, Int32))"          nil
    "Map(String, Tuple(a Int32))"              nil
    "Map(String, Nullable(String))"            nil
    "Map(String, LowCardinality(String))"      nil
    ;; not a map
    "String"                                   nil
    nil                                        nil))

(mt/defdataset map_unfolding_test
  [["placeholder"
    [{:field-name "i", :base-type {:native "Int32"}}]
    []]])

(defn- do-with-events-table!
  "Create a table `table-name` with `Map` columns in the `map_unfolding_test` dataset, with JSON unfolding `unfold?` for
  the database, sync it, and call `f` with the synced table."
  [table-name unfold? f]
  (mt/dataset map_unfolding_test
    (let [db    (mt/db)
          exec! #(metabase.test.data.clickhouse/exec-statements % (:details db))]
      (exec! [(str "DROP TABLE IF EXISTS map_unfolding_test." table-name)
              (str "CREATE TABLE map_unfolding_test." table-name " (id UInt32, attrs Map(String, String), "
                   "counts Map(String, UInt64), tags Map(String, Array(String))) ENGINE = MergeTree ORDER BY id")
              (str "INSERT INTO map_unfolding_test." table-name " VALUES "
                   "(1, {'plan': 'pro', 'os': 'mac'}, {'clicks': 3}, {'a': ['x']}), "
                   "(2, {'plan': 'free'}, {'clicks': 5, 'views': 2}, {}), "
                   "(3, {'plan': 'pro', 'it''s': 'q'}, {}, {})")])
      (try
        (mt/with-temp-vals-in-db :model/Database (:id db) {:details (assoc (:details db) :json-unfolding unfold?)}
          (sync/sync-database! (:id db))
          (f (t2/select-one :model/Table :db_id (:id db) :name table-name)))
        (finally
          (exec! [(str "DROP TABLE IF EXISTS map_unfolding_test." table-name)]))))))

(defn- fields
  "The name, base type and visibility of each active field of `table`."
  [table]
  (t2/select-fn->fn :name (juxt :base_type :visibility_type) :model/Field :table_id (:id table) :active true))

(deftest ^:synchronized map-unfolding-test
  (mt/test-driver :clickhouse
    (do-with-events-table!
     "events" true
     (fn [table]
       (testing "sync makes a field for each key of a map with string keys, and hides the map"
         (is (= {"id"              [:type/Integer :normal]
                 "attrs"           [:type/Dictionary :details-only]
                 "attrs → plan"    [:type/Text :normal]
                 "attrs → os"      [:type/Text :normal]
                 "attrs → it's"    [:type/Text :normal]
                 "counts"          [:type/Dictionary :details-only]
                 "counts → clicks" [:type/BigInteger :normal]
                 "counts → views"  [:type/BigInteger :normal]
                 ;; a map of arrays is not unfolded
                 "tags"            [:type/Dictionary :normal]}
                (fields table)))))))
  (testing "with JSON unfolding off, maps are not unfolded"
    (mt/test-driver :clickhouse
      (do-with-events-table!
       "events_not_unfolded" false
       (fn [table]
         (is (= {"id"     [:type/Integer :normal]
                 "attrs"  [:type/Dictionary :normal]
                 "counts" [:type/Dictionary :normal]
                 "tags"   [:type/Dictionary :normal]}
                (fields table))))))))
