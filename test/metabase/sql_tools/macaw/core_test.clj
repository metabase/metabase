(ns metabase.sql-tools.macaw.core-test
  (:require
   #_[metabase.sql-tools.interface :as sql-tools]
   [clojure.test :refer [deftest is testing]]
   ;; Load implementations for multimethod registration
   [metabase.sql-tools.init]
   [metabase.sql-tools.macaw.core :as sql-tools.macaw]))

(deftest ^:parallel split-compound-table-spec-test
  (let [split sql-tools.macaw/split-compound-table-spec]
    (testing "simple table name is unchanged"
      (is (= {:table "orders" :schema nil}
             (split {:table "orders" :schema nil}))))
    (testing "two-part name splits into schema + table"
      (is (= {:schema "analytics" :table "events"}
             (split {:table "analytics.events" :schema nil}))))
    (testing "three-part name takes last two as schema + table"
      (is (= {:schema "analytics" :table "events"}
             (split {:table "myproject.analytics.events" :schema nil}))))
    (testing "already has schema — no splitting"
      (is (= {:table "events" :schema "analytics"}
             (split {:table "events" :schema "analytics"}))))
    (testing "compound name with existing schema is not split"
      (is (= {:table "analytics.events" :schema "other"}
             (split {:table "analytics.events" :schema "other"}))))))

;; TODO: This must be enabled (or adjusted before we merge).
;; The macaw impl of referenced-tables-raw should be adjusted to handle those cases.
#_(deftest ^:parallel referenced-tables-raw-bigquery-compound-names-test
    (testing "Macaw referenced-tables-raw splits BigQuery-style dotted table names"
      (is (= [{:schema "analytics" :table "events"}]
             (sql-tools/referenced-tables-raw-impl :macaw :bigquery-cloud-sdk
                                                   "SELECT * FROM analytics.events")))
      (is (= [{:schema "analytics" :table "events"} {:schema "analytics" :table "users"}]
             (sql-tools/referenced-tables-raw-impl :macaw :bigquery-cloud-sdk
                                                   "SELECT * FROM analytics.events JOIN analytics.users ON events.user_id = users.id"))))
    (testing "simple table names are unaffected"
      (is (= [{:table "orders"}]
             (sql-tools/referenced-tables-raw-impl :macaw :postgres
                                                   "SELECT * FROM orders")))))
