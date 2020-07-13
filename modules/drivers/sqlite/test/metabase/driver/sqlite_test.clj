(ns metabase.driver.sqlite-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.test :refer :all]
            [metabase.driver.sql-jdbc
             [connection :as sql-jdbc.conn]
             [execute :as sql-jdbc.execute]]
            [metabase
             [sync :as sync]
             [test :as mt]]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor-test :as qp.test]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.datasets :as datasets]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(deftest timezone-id-test
  (datasets/test-driver :sqlite
    (is (= "UTC"
           (tu/db-timezone-id)))))

(deftest filter-by-date-test
  "Make sure filtering against a LocalDate works correctly in SQLite"
  (datasets/test-driver :sqlite
    (is (= [[225 "2014-03-04T00:00:00Z"]
            [409 "2014-03-05T00:00:00Z"]
            [917 "2014-03-05T00:00:00Z"]
            [995 "2014-03-05T00:00:00Z"]
            [159 "2014-03-06T00:00:00Z"]
            [951 "2014-03-06T00:00:00Z"]]
           (qp.test/rows
             (data/run-mbql-query checkins
               {:fields   [$id $date]
                :filter   [:and
                           [:>= $date "2014-03-04"]
                           [:<= $date "2014-03-06"]]
                :order-by [[:asc $date]]}))
           (qp.test/rows
             (data/run-mbql-query checkins
               {:fields   [$id $date]
                :filter   [:between $date "2014-03-04" "2014-03-07"]
                :order-by [[:asc $date]]}))))))

(defn- table-fingerprint
  [{:keys [fields name]}]
  {:name   name
   :fields (map #(select-keys % [:name :base_type]) fields)})

(deftest type-inference-for-views
  (mt/test-driver :sqlite
    (testing "Make sure we correctly infer complex types in views (#8630, #9276, #12191, #12547, #10681)"
      (let [details (mt/dbdef->connection-details :sqlite :db {:database-name "views_test"})
            spec    (sql-jdbc.conn/connection-details->spec :sqlite details)]
        (mt/with-temp Database [{db-id :id :as database} {:engine :sqlite, :details (assoc details :dbname "viwes_test")}]
          (doseq [statement ["create table if not exists src(id integer, time text);"
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
                 (->> (hydrate (db/select Table :db_id db-id {:order-by [:name]}) :fields)
                      (map table-fingerprint))))
          (doseq [statement ["CREATE TABLE IF NOT EXISTS groupby_test (
                             id INTEGER	primary key unique,
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
                 (->> (hydrate (db/select Table :db_id db-id
                                          {:where    [:in :name ["groupby_test" "v_groupby_test"]]
                                           :order-by [:name]}) :fields)
                      (map table-fingerprint)))))))))
