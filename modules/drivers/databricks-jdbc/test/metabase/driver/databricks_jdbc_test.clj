(ns metabase.driver.databricks-jdbc-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.databricks-jdbc :as databricks-jdbc]
   [metabase.test :as mt]))

(deftest ^:parallel sync-test
  (testing "`driver/describe-database` implementation returns expected resutls."
    (mt/test-driver
     :databricks-jdbc
     (is (= {:tables
             #{{:name "venues", :schema "test-data", :description ""}
               {:name "checkins", :schema "test-data", :description ""}
               {:name "users", :schema "test-data", :description ""}
               {:name "people", :schema "test-data", :description ""}
               {:name "categories", :schema "test-data", :description ""}
               {:name "reviews", :schema "test-data", :description ""}
               {:name "orders", :schema "test-data", :description ""}
               {:name "products", :schema "test-data", :description ""}}}
            (driver/describe-database :databricks-jdbc (mt/db)))))))

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
