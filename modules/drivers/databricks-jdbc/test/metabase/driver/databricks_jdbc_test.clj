(ns metabase.driver.databricks-jdbc-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.databricks-jdbc :as databricks-jdbc]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest ^:parallel sync-test
  (testing "`driver/describe-database` implementation returns expected resutls."
    (mt/test-driver
      :databricks-jdbc
      (is (= {:tables
              #{{:name "venues", :schema "test-data", :description nil}
                {:name "checkins", :schema "test-data", :description nil}
                {:name "users", :schema "test-data", :description nil}
                {:name "people", :schema "test-data", :description nil}
                {:name "categories", :schema "test-data", :description nil}
                {:name "reviews", :schema "test-data", :description nil}
                {:name "orders", :schema "test-data", :description nil}
                {:name "products", :schema "test-data", :description nil}}}
             (driver/describe-database :databricks-jdbc (mt/db)))))))

(mt/defdataset dataset-with-ntz
  [["table_with_ntz" [{:field-name "timestamp"
                       :base-type {:native "timestamp_ntz"}}]
    [[(t/local-date-time 2024 10 20 10 20 30)]]]])

(deftest timestamp-ntz-ignored-test
  (mt/test-driver
   :databricks-jdbc
   (mt/dataset
    dataset-with-ntz
    (testing "timestamp column was ignored during sync"
      (let [columns (t2/select :model/Field :table_id (t2/select-one-fn :id :model/Table :db_id (mt/id)))]
        (is (= 1 (count columns)))
        (is (= "id" (:name (first columns)))))))))

(deftest ^:synchronized date-time->results-local-date-time-test
  (mt/test-driver
    :databricks-jdbc
    (mt/with-metadata-provider (mt/id)
      (mt/with-results-timezone-id "America/Los_Angeles"
        (let [expected (t/local-date-time 2024 8 29 10 20 30)]
          (testing "LocalDateTime is not modified"
            (is (= expected
                   (#'databricks-jdbc/date-time->results-local-date-time (t/local-date-time 2024 8 29 10 20 30)))))
          (testing "OffsetDateTime is shifted by results timezone"
            (is (= expected
                   (#'databricks-jdbc/date-time->results-local-date-time (t/offset-date-time 2024 8 29 17 20 30)))))
          (testing "ZonedDateTime is shifted by results timezone"
            (is (= expected
                   (#'databricks-jdbc/date-time->results-local-date-time (t/zoned-date-time 2024 8 29 17 20 30))))))))))

(deftest additional-options-test
  (mt/test-driver
   :databricks-jdbc
   (testing "Additional options are added to :subname key of generated spec"
     (is (re-find #";IgnoreTransactions=0$"
                  (->> {:http-path "p/a/t/h",
                        :schema-filters-type "inclusion",
                        :schema-filters-patterns "xix",
                        :access-token "xixix",
                        :host "localhost",
                        :engine "databricks-jdbc",
                        :catalog "ccc"
                        :additional-options ";IgnoreTransactions=0"}
                       (sql-jdbc.conn/connection-details->spec :databricks-jdbc)
                       :subname))))))
