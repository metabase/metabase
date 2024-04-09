(ns metabase.driver.sqlite-test
  (:require
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.query-processor-test-util :as sql.qp-test-util]
   [metabase.models.database :refer [Database]]
   [metabase.models.table :refer [Table]]
   [metabase.query-processor :as qp]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(deftest timezone-id-test
  (mt/test-driver :sqlite
    (is (= "UTC"
           (driver/db-default-timezone :sqlite (mt/db))))))

(deftest filter-by-date-test
  (testing "Make sure filtering against a LocalDate works correctly in SQLite"
    (mt/test-driver :sqlite
      (is (= [[225 "2014-03-04T00:00:00Z"]
              [409 "2014-03-05T00:00:00Z"]
              [917 "2014-03-05T00:00:00Z"]
              [995 "2014-03-05T00:00:00Z"]
              [159 "2014-03-06T00:00:00Z"]
              [951 "2014-03-06T00:00:00Z"]]
             (mt/rows
              (mt/run-mbql-query checkins
                {:fields   [$id $date]
                 :filter   [:and
                            [:>= $date "2014-03-04"]
                            [:<= $date "2014-03-06"]]
                 :order-by [[:asc $date]]}))
             (mt/rows
              (mt/run-mbql-query checkins
                {:fields   [$id $date]
                 :filter   [:between $date "2014-03-04" "2014-03-07"]
                 :order-by [[:asc $date]]})))))))

(defn- table-fingerprint
  [{:keys [fields name]}]
  {:name   name
   :fields (map #(select-keys % [:name :base_type]) fields)})

(deftest type-inference-for-views
  (mt/test-driver :sqlite
    (testing "Make sure we correctly infer complex types in views (#8630, #9276, #12191, #12547, #10681)"
      (let [details (mt/dbdef->connection-details :sqlite :db {:database-name "views_test"})
            spec    (sql-jdbc.conn/connection-details->spec :sqlite details)]
        (t2.with-temp/with-temp [Database {db-id :id :as database} {:engine :sqlite, :details (assoc details :dbname "views_test")}]
          (doseq [statement ["drop view if exists v_groupby_test;"
                             "drop table if exists groupby_test;"
                             "drop view if exists v_src;"
                             "drop table if exists src;"
                             "create table if not exists src(id integer, time text);"
                             "create view if not exists v_src as select id, strftime('%s', time) as time from src;"
                             "insert into src values(1, '2020-03-01 12:20:35');"]]
            (jdbc/execute! spec [statement]))
          (sync/sync-database! database)
          (is (= [{:name "src"
                   :fields [{:name      "id"
                             :base_type :type/Integer}
                            {:name      "time"
                             :base_type :type/Text}]}
                  {:name "v_src"
                   :fields [{:name      "id"
                             :base_type :type/Integer}
                            {:name      "time"
                             :base_type :type/Text}]}]
                 (->> (t2/hydrate (t2/select Table :db_id db-id {:order-by [:name]}) :fields)
                      (map table-fingerprint))))
          (doseq [statement ["drop view if exists v_groupby_test;"
                             "drop table if exists groupby_test;"
                             "CREATE TABLE IF NOT EXISTS groupby_test (
                             id INTEGER primary key unique,
                             symbol VARCHAR,
                             dt DATETIME,
                             value FLOAT);"
                             "INSERT INTO groupby_test (symbol, dt, value) VALUES ('T', '2020-01-01', 0);"
                             "INSERT INTO groupby_test (symbol, dt, value) VALUES ('T', '2020-01-02', 2);"
                             "INSERT INTO groupby_test (symbol, dt, value) VALUES ('T', '2020-01-03', 4);"
                             "INSERT INTO groupby_test (symbol, dt, value) VALUES ('S', '2019-01-01', 10);"
                             "CREATE VIEW IF NOT EXISTS v_groupby_test AS
                              SELECT
                               symbol,
                               sum(value) as totalValue
                              FROM groupby_test
                              GROUP BY symbol
                              ORDER by dt;"]]
            (jdbc/execute! spec [statement]))
          (sync/sync-database! database)
          (is (= [{:name "groupby_test"
                   :fields [{:name      "id"
                             :base_type :type/Integer}
                            {:name      "symbol"
                             :base_type :type/Text}
                            {:name      "dt"
                             :base_type :type/DateTime}
                            {:name      "value"
                             :base_type :type/Float}]}
                  {:name "v_groupby_test"
                   :fields [{:name      "symbol"
                             :base_type :type/Text}
                            {:name      "totalValue"
                             :base_type :type/Float}]}]
                 (->> (t2/hydrate (t2/select Table :db_id db-id
                                          {:where    [:in :name ["groupby_test" "v_groupby_test"]]
                                           :order-by [:name]}) :fields)
                      (map table-fingerprint)))))))))

(defn- default-table-result [table-name]
  {:name        table-name
   :schema      nil
   :description nil})

(deftest timestamp-test-db
  (let [driver :sqlite]
    (mt/test-driver driver
      (let [db-name "timestamp_test"
            details (mt/dbdef->connection-details :sqlite :db {:database-name db-name})]
        (doseq [stmt ["DROP TABLE IF EXISTS timestamp_table;"
                      "CREATE TABLE timestamp_table (created_at timestamp);"
                      "INSERT INTO timestamp_table (created_at) VALUES (datetime('now'));"]]
          (jdbc/execute! (sql-jdbc.conn/connection-details->spec driver details)
                         [stmt]))
        (t2.with-temp/with-temp [Database db {:engine driver :details (assoc details :dbname db-name)}]
          (sync/sync-database! db)
          (mt/with-db db
            (testing "timestamp columns"
              (testing "database should be synced"
                (is (= {:tables (set (map default-table-result ["timestamp_table"]))}
                       (driver/describe-database driver db))))

              (testing "timestamp column should exist"
                (is (= {:name "timestamp_table"
                        :schema nil
                        :fields #{{:name                       "created_at"
                                   :database-type              "TIMESTAMP"
                                   :base-type                  :type/DateTime
                                   :database-position          0
                                   :database-required          false
                                   :json-unfolding             false
                                   :database-is-auto-increment false}}}
                       (driver/describe-table driver db (t2/select-one Table :id (mt/id :timestamp_table)))))))))))))

(deftest select-query-datetime
  (mt/test-driver :sqlite
    (let [db-name "datetime_test"
          details (mt/dbdef->connection-details :sqlite :db {:database-name db-name})]
      (doseq [stmt ["DROP TABLE IF EXISTS datetime_table;"
                    "CREATE TABLE datetime_table (
                      test_case varchar,
                      col_timestamp timestamp,
                      col_date date,
                      col_datetime datetime);"
                    "INSERT INTO datetime_table
                      (test_case,         col_timestamp,             col_date,      col_datetime) VALUES
                      ('epoch',           1629865104000,             1629849600000, 1629865104000),
                      ('iso8601-ms',      '2021-08-25 04:18:24.111', null,          '2021-08-25 04:18:24.111'),
                      ('iso8601-no-ms',   '2021-08-25 04:18:24',     null,          '2021-08-25 04:18:24'),
                      ('iso8601-no-time', null,                      '2021-08-25',  null),
                      ('null',            null,                      null,          null);"]]
        (jdbc/execute! (sql-jdbc.conn/connection-details->spec :sqlite details)
                       [stmt]))
      (t2.with-temp/with-temp [Database db {:engine :sqlite :details (assoc details :dbname db-name)}]
        (sync/sync-database! db)
        ;; In SQLite, you can actually store any value in any date/timestamp column,
        ;; let's test only values we'd reasonably run into.
        ;; Caveat: TIMESTAMP stored as string doesn't get parsed and is returned as-is by the driver,
        ;;         some upper layer will handle it.
        (mt/with-db db
          (testing "select datetime stored as unix epoch"
            (is (= [["2021-08-25T04:18:24Z"   ; TIMESTAMP
                     "2021-08-25T00:00:00Z"   ; DATE
                     "2021-08-25T04:18:24Z"]] ; DATETIME
                   (mt/rows
                    (mt/run-mbql-query datetime_table
                      {:fields [$col_timestamp $col_date $col_datetime]
                       :filter [:= $test_case "epoch"]})))))
          (testing "select datetime stored as string with milliseconds"
            (is (= [["2021-08-25T04:18:24.111Z"   ; TIMESTAMP (raw string)
                     "2021-08-25T04:18:24.111Z"]] ; DATETIME
                   (mt/rows
                    (mt/run-mbql-query datetime_table
                      {:fields [$col_timestamp $col_datetime]
                       :filter [:= $test_case "iso8601-ms"]})))))
          (testing "select datetime stored as string without milliseconds"
            (is (= [["2021-08-25T04:18:24Z"   ; TIMESTAMP (raw string)
                     "2021-08-25T04:18:24Z"]] ; DATETIME
                   (mt/rows
                    (mt/run-mbql-query datetime_table
                      {:fields [$col_timestamp $col_datetime]
                       :filter [:= $test_case "iso8601-no-ms"]})))))
          (testing "select date stored as string without time"
            (is (= [["2021-08-25T00:00:00Z"]] ; DATE
                   (mt/rows
                    (mt/run-mbql-query datetime_table
                      {:fields [$col_date]
                       :filter [:= $test_case "iso8601-no-time"]})))))
          (testing "select NULL"
            (is (= [[nil nil nil]]
                   (mt/rows
                    (mt/run-mbql-query datetime_table
                      {:fields [$col_timestamp $col_date $col_datetime]
                       :filter [:= $test_case "null"]}))))))))))

(deftest duplicate-identifiers-test
  (testing "Make sure duplicate identifiers (even with different cases) get unique aliases"
    (mt/test-driver :sqlite
      (mt/dataset test-data
        (is (= '{:select   [source.CATEGORY_2 AS CATEGORY
                            COUNT (*)         AS count]
                 :from     [{:select [products.category       AS category
                                      products.category || ?  AS CATEGORY_2]
                             :from   [products]}
                            AS source]
                 :group-by [source.CATEGORY_2]
                 :order-by [source.CATEGORY_2 ASC]
                 :limit    [1]}
               (sql.qp-test-util/query->sql-map
                (mt/mbql-query products
                  {:expressions {:CATEGORY [:concat $category "2"]}
                   :breakout    [:expression :CATEGORY]
                   :aggregation [:count]
                   :order-by    [[:asc [:expression :CATEGORY]]]
                   :limit       1}))))))))

(deftest disallow-fdw-to-other-databases-test
  (testing "Don't allow connections to other SQLite databases with ATTACH DATABASE (https://github.com/metabase/metaboat/issues/152)"
    (mt/test-driver :sqlite
      ;; force creation of the sample dataset file
      (mt/dataset test-data
        (mt/id))
      (let [file (io/file "test-data.sqlite")
            path (.getAbsolutePath file)]
        (is (.exists file))
        (testing "Attach the sample dataset as an FDW called fdw_test"
          (testing "Detach it if it already exists from a previous test run"
            (u/ignore-exceptions
              (qp/process-query (mt/native-query {:query "DETACH DATABASE fdw_test;"}))))
          (testing "Attempting to attach it should fail"
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"SQL error or missing database \(too many attached databases - max 0\)"
                 (qp/process-query (mt/native-query {:query (format "ATTACH DATABASE 'file:%s' as fdw_test;" path)}))))))
        (testing "Attempt to query the FDW -- shouldn't work"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"SQL error or missing database \(no such table: fdw_test\.products\)"
               (qp/process-query (mt/native-query {:query "SELECT count(*) FROM fdw_test.products;"})))))))))
