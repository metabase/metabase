(ns metabase.sql-tools.macaw.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   ;; Load implementations for multimethod registration
   [metabase.sql-tools.init]
   [metabase.sql-tools.interface :as sql-tools]))

(deftest ^:parallel referenced-tables-raw-bigquery-compound-names-test
  (testing "Macaw referenced-tables-raw splits BigQuery-style dotted table names"
    (is (= [{:schema "analytics" :table "events"}]
           (sql-tools/referenced-tables-raw-impl :macaw :bigquery-cloud-sdk
                                                 "SELECT * FROM analytics.events")))
    (is (= #{{:schema "analytics" :table "events"}
             {:schema "analytics" :table "users"}}
           (set (sql-tools/referenced-tables-raw-impl :macaw :bigquery-cloud-sdk
                                                      "SELECT * FROM analytics.events JOIN analytics.users ON events.user_id = users.id")))))
  (testing "simple table names are unaffected"
    (is (= [{:table "orders"}]
           (sql-tools/referenced-tables-raw-impl :macaw :postgres
                                                 "SELECT * FROM orders")))))
