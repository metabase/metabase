(ns metabase-enterprise.audit-app.sqlite-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.audit-app.audit :as audit]
   [metabase-enterprise.audit-app.pages.common :as common]
   [metabase-enterprise.audit-app.query-processor.middleware.handle-audit-queries :as audit-queries]
   [metabase.app-db.connection :as connection]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.db :as audit-db]
   [metabase.driver.sqlite]
   [toucan2.core :as t2])
  (:import
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)
   (java.time LocalDateTime OffsetDateTime)
   (org.sqlite SQLiteDataSource)))

(use-fixtures :each
  (fn [f]
    (let [path (Files/createTempFile "metabase-sqlite-audit-" ".db" (make-array FileAttribute 0))
          source (doto (SQLiteDataSource.) (.setUrl (str "jdbc:sqlite:" path)))]
      (try
        (mdb/with-application-db (connection/application-db :sqlite source)
          (f))
        (finally
          (Files/deleteIfExists path))))))

(deftest schema-test
  (is (= ["v_users" nil] (#'audit/host-canonical-table "V_USERS"))))

(deftest query-view-test
  (t2/query "CREATE TABLE audit_fixture (id INTEGER, first_name TEXT, last_name TEXT, email TEXT, created_at TIMESTAMP)")
  (t2/query "INSERT INTO audit_fixture VALUES (1, 'Ada', 'Lovelace', 'ada@example.com', '2026-09-24 12:34:56.123456'), (2, NULL, NULL, 'grace@example.com', NULL)")
  (t2/query "CREATE VIEW v_audit_fixture AS SELECT * FROM audit_fixture")
  (testing "The warehouse SQLite reader can read appdb views and its canonical timestamps"
    (is (= [{"id" 1 "full_name" "Ada Lovelace" "created_at" (LocalDateTime/parse "2026-09-24T12:34:56.123456")}
            {"id" 2 "full_name" "grace@example.com" "created_at" nil}]
           (common/query {:select [:u.id [(common/user-full-name :u) :full_name] :u.created_at]
                          :from [[:v_audit_fixture :u]] :order-by [:u.id]}))))
  (testing "Audit CTEs retain paging on SQLite"
    (binding [audit-queries/*additional-query-params* {:limit 1 :offset 1}]
      (is (= [{"id" 2}]
             (common/query {:with [[:audit_rows {:select [:id] :from [:v_audit_fixture]}]]
                            :select [:id] :from [:audit_rows] :order-by [:id]})))))
  (testing "The streaming audit path uses the same SQLite datasource"
    (is (= [[1] [2]]
           (into [] ((common/reducible-query {:select [:id] :from [:v_audit_fixture] :order-by [:id]})))))))

(deftest retention-test
  (t2/query "CREATE TABLE audit_fixture (id INTEGER PRIMARY KEY, timestamp TIMESTAMP)")
  (t2/query "INSERT INTO audit_fixture VALUES (1, '2026-01-01 00:00:00.000000'), (2, '2026-01-02 00:00:00.000000'), (3, '2026-09-24 00:00:00.000000')")
  (audit-db/delete-oldest-by-id-subquery! :audit_fixture :timestamp (OffsetDateTime/parse "2026-09-01T00:00:00Z") 1)
  (is (= [{:id 2} {:id 3}]
         (t2/query {:select [:id] :from [:audit_fixture] :order-by [:id]}))))
