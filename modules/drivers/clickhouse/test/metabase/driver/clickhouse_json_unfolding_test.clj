(ns ^:mb/driver-tests metabase.driver.clickhouse-json-unfolding-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test :as qp]
   [metabase.sync.core :as sync]
   [metabase.sync.field-values :as sync.field-values]
   [metabase.test :as mt]
   [metabase.test.data.clickhouse]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mt/defdataset json_unfolding_test
  [["placeholder"
    [{:field-name "i", :base-type {:native "Int32"}}]
    []]])

(defn- do-with-json-table!
  "Create a table with a `JSON` column in the `json_unfolding_test` dataset, sync it, and call `f` with the synced
  table. The table name is `events` by default."
  ([f]
   (do-with-json-table! "events" f))
  ([table-name f]
   (mt/dataset json_unfolding_test
     (let [db      (mt/db)
           details (mt/dbdef->connection-details :clickhouse :db {:database-name "json_unfolding_test"})
           exec!   #(metabase.test.data.clickhouse/exec-statements % details)
           table   (str "json_unfolding_test." table-name)]
       (exec! [(str "DROP TABLE IF EXISTS " table)
               (str "CREATE TABLE " table " (id UInt32, payload JSON) ENGINE = MergeTree ORDER BY id")
               (str "INSERT INTO " table " VALUES "
                    "(1, '{\"user\": {\"name\": \"ann\", \"age\": 30, \"plan\": \"pro\"}, \"price\": 12.5, \"paid\": true, "
                    "\"created\": \"2024-01-02 10:00:00\"}'), "
                    "(2, '{\"user\": {\"name\": \"bob\", \"age\": 41, \"plan\": \"free\"}, \"price\": 0, \"paid\": false, "
                    "\"created\": \"2024-01-02 18:30:00\"}'), "
                    "(3, '{\"user\": {\"name\": \"cat\", \"age\": 25, \"plan\": \"pro\"}, \"price\": 30, \"paid\": true, "
                    "\"created\": \"2024-01-03 09:15:00\"}'), "
                    "(4, '{\"user\": {\"name\": \"dan\", \"plan\": \"team\"}, \"price\": 99.9, \"paid\": true, "
                    "\"created\": \"2024-01-05 23:59:00\"}')")])
       (try
         (sync/sync-database! (:id db))
         (f (t2/select-one :model/Table :db_id (:id db) :name table-name :active true))
         (finally
           (exec! [(str "DROP TABLE IF EXISTS " table)])))))))

(deftest ^:synchronized json-unfolding-test
  (mt/test-driver :clickhouse
    (is (driver/database-supports? :clickhouse :nested-field-columns (mt/db)))
    (do-with-json-table!
     (fn [table]
       (testing "sync makes a field for each JSON path"
         (is (= {["payload" "created"]        :type/DateTime
                 ["payload" "paid"]           :type/Boolean
                 ["payload" "price"]          :type/Number
                 ["payload" "user" "age"]     :type/Integer
                 ["payload" "user" "name"]    :type/Text
                 ["payload" "user" "plan"]    :type/Text}
                (into {}
                      (map (juxt :nfc_path :base_type))
                      (t2/select :model/Field :table_id (:id table) :nfc_path [:not= nil])))))
       (let [mp    (mt/metadata-provider)
             field (fn [field-name]
                     (lib.metadata/field mp (t2/select-one-pk :model/Field :table_id (:id table) :name field-name)))
             query (lib/query mp (lib.metadata/table mp (:id table)))]
         (testing "group by, sum and avg on JSON paths"
           (is (= [["free" 1 0.0 41.0]
                   ["pro" 2 42.5 27.5]
                   ["team" 1 99.9 nil]]
                  (-> query
                      (lib/breakout (field "payload → user → plan"))
                      (lib/aggregate (lib/count))
                      (lib/aggregate (lib/sum (field "payload → price")))
                      (lib/aggregate (lib/avg (field "payload → user → age")))
                      (lib/order-by (field "payload → user → plan"))
                      qp/process-query
                      mt/rows))))
         (testing "filter on JSON paths"
           (is (= [[1 "ann"] [3 "cat"]]
                  (-> query
                      (lib/filter (lib/= (field "payload → paid") true))
                      (lib/filter (lib/< (field "payload → price") 50))
                      (lib/with-fields [(field "id") (field "payload → user → name")])
                      (lib/order-by (field "id"))
                      qp/process-query
                      mt/rows))))
         (testing "group by day on a JSON path"
           (is (= [["2024-01-02T00:00:00Z" 2]
                   ["2024-01-03T00:00:00Z" 1]
                   ["2024-01-05T00:00:00Z" 1]]
                  (-> query
                      (lib/breakout (lib/with-temporal-bucket (field "payload → created") :day))
                      (lib/aggregate (lib/count))
                      qp/process-query
                      mt/rows))))
         (testing "a JSON path compiles to a cast of the subcolumn"
           (is (=? [::h2x/typed
                    [::h2x/typed
                     [:cast
                      [::h2x/identifier :field ["json_unfolding_test" "events" "payload" "user" "plan"]]
                      [::h2x/raw-type-name "Nullable(String)"]]
                     any?]
                    any?]
                   (qp.store/with-metadata-provider mp
                     (sql.qp/->honeysql :clickhouse (lib/ref (field "payload → user → plan")))))))
         (testing "field values of a JSON path"
           (let [plan (field "payload → user → plan")]
             (t2/insert! :model/FieldValues {:field_id (:id plan), :type :full, :values []})
             (sync.field-values/update-field-values-for-table! (t2/select-one :model/Table :id (:id table)))
             (is (= ["free" "pro" "team"]
                    (t2/select-one-fn :values :model/FieldValues :field_id (:id plan), :type :full))))))))))

(deftest ^:synchronized json-unfolding-table-with-database-name-test
  (testing "sync unfolds JSON when the table and the database have the same name"
    (mt/test-driver :clickhouse
      (do-with-json-table!
       "json_unfolding_test"
       (fn [table]
         (is (= #{["payload" "created"] ["payload" "paid"] ["payload" "price"]
                  ["payload" "user" "age"] ["payload" "user" "name"] ["payload" "user" "plan"]}
                (t2/select-fn-set :nfc_path :model/Field :table_id (:id table) :nfc_path [:not= nil]))))))))

(deftest ^:synchronized sample-json-row-honeysql-test
  (testing "with PKs, the sample query reads the first and last rows, with each JSON value as JSON text"
    (mt/test-driver :clickhouse
      (do-with-json-table!
       (fn [_table]
         (let [field   #(h2x/identifier :field "json_unfolding_test" "events" %)
               [sql]   (sql.qp/format-honeysql
                        :clickhouse
                        (sql-jdbc.sync/sample-json-row-honeysql
                         :clickhouse
                         (h2x/identifier :table "json_unfolding_test" "events")
                         [(field "payload")]
                         [(field "id")]))]
           (is (= #{"ann" "bob" "cat" "dan"}
                  (into #{}
                        (map #(get-in (json/decode (first %)) ["user" "name"]))
                        (mt/rows (qp/process-query (mt/native-query {:query sql}))))))))))))

(deftest ^:synchronized sample-json-row-honeysql-non-unique-pk-test
  (testing "the sample has a limited number of rows when many rows have the same PK: ClickHouse PKs are not unique"
    (mt/test-driver :clickhouse
      (mt/dataset json_unfolding_test
        (let [details (:details (mt/db))
              exec!   #(metabase.test.data.clickhouse/exec-statements % details)
              field   #(h2x/identifier :field "json_unfolding_test" "same_pk" %)
              [sql]   (sql.qp/format-honeysql
                       :clickhouse
                       (sql-jdbc.sync/sample-json-row-honeysql
                        :clickhouse
                        (h2x/identifier :table "json_unfolding_test" "same_pk")
                        [(field "payload")]
                        [(field "tenant")]))]
          (try
            (exec! ["DROP TABLE IF EXISTS json_unfolding_test.same_pk"
                    (str "CREATE TABLE json_unfolding_test.same_pk (tenant UInt32, payload JSON) "
                         "ENGINE = MergeTree ORDER BY tenant")
                    (str "INSERT INTO json_unfolding_test.same_pk "
                         "SELECT 1, concat('{\"a\": ', toString(number), '}') FROM numbers(1500)")])
            (is (= 500
                   (count (mt/rows (qp/process-query (mt/native-query {:query sql}))))))
            (finally
              (exec! ["DROP TABLE IF EXISTS json_unfolding_test.same_pk"]))))))))

(deftest ^:synchronized json-path-value-of-other-type-test
  (testing "a value that does not have the type of the field gives NULL, and the query does not fail"
    (mt/test-driver :clickhouse
      (mt/dataset json_unfolding_test
        (let [value (fn [base-type json]
                      (let [[expr] (sql.qp/format-honeysql
                                    :clickhouse
                                    {:select [[(sql.qp/json-query :clickhouse
                                                                  (h2x/identifier :field "j → a")
                                                                  {:nfc-path ["j" "a"], :base-type base-type})
                                               :v]]})
                            sql    (format "%s FROM (SELECT CAST('%s' AS JSON) AS j)" expr json)]
                        (ffirst (mt/rows (qp/process-query (mt/native-query {:query sql}))))))]
          (doseq [[base-type json expected] [[:type/Integer "{\"a\": 7}"                    7]
                                             [:type/Integer "{\"a\": \"x\"}"                nil]
                                             [:type/Integer "{\"a\": [1]}"                  nil]
                                             [:type/Integer "{\"a\": 18446744073709551615}" nil]
                                             [:type/Float   "{\"a\": 1.5}"                  1.5]
                                             [:type/Float   "{\"a\": [1]}"                  nil]
                                             [:type/Boolean "{\"a\": true}"                 true]
                                             [:type/Boolean "{\"a\": \"maybe\"}"            nil]
                                             [:type/Text    "{\"a\": \"x\"}"                "x"]]]
            (testing (str base-type " " json)
              (is (= expected (value base-type json))))))))))

(deftest ^:synchronized json-unfolding-of-field-synced-before-json-support-test
  (testing "a JSON column synced before JSON support keeps its paths on every later sync"
    (mt/test-driver :clickhouse
      (do-with-json-table!
       (fn [table]
         (let [nfc-paths #(t2/select-fn-set :nfc_path :model/Field
                                            :table_id (:id table)
                                            :active   true
                                            :nfc_path [:not= nil])
               paths     (nfc-paths)]
           (is (= 6 (count paths)))
           ;; the field as a sync before JSON support made it
           (t2/delete! :model/Field
                       :table_id (:id table)
                       :nfc_path [:not= nil])
           (t2/update! :model/Field {:table_id (:id table)
                                     :name     "payload"}
                       {:base_type       :type/*
                        :effective_type  :type/*
                        :json_unfolding  false
                        :visibility_type :normal})
           (dotimes [_ 2]
             (sync/sync-database! (:id (mt/db)))
             (is (=? {:base_type       :type/JSON
                      :json_unfolding  true
                      :visibility_type :details-only}
                     (t2/select-one :model/Field
                                    :table_id (:id table)
                                    :name     "payload")))
             (is (= paths (nfc-paths))))))))))
