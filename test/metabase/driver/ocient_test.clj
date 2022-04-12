(ns metabase.driver.ocient-test
  (:require [clojure.test :refer :all]
            [metabase.api.common :as api]
            [metabase.driver :as driver]
            [metabase.test.data.ocient :as ocient]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.util :as driver.u]
            [metabase.models.database :refer [Database]]
            [metabase.models.field :refer [Field]]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor-test.order-by-test :as qp-test.order-by-test] ; used for one SSL connectivity test
            [metabase.sync :as sync]
            metabase.sync.util
            [metabase.test :as mt]
            [metabase.test.data.interface :as tx]
            [metabase.test.data.sql.ddl :as ddl]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]
            [toucan.db :as db])
  (:import java.util.Base64))

;; (deftest additional-connection-string-options-test
;;   (mt/test-driver :ocient
;;                   (testing "Make sure you can add additional connection string options "
;;                     (is (= {:classname   "com.ocient.jdbc.Driver"
;;                             :subprotocol "ocient"
;;                             :sslmode     "disable"
;;                             :subname     "//sales-sql0:4050/metabase;loglevel=DEBUG;logfile=jdbc_trace.out"}
;;                            (sql-jdbc.conn/connection-details->spec :ocient {:host               "sales-sql0"
;;                                                                             :port               4050
;;                                                                             :db                 "metabase"
;;                                                                             :additional-options "loglevel=DEBUG;logfile=jdbc_trace.out"}))))))

;; (deftest insert-rows-ddl-test
;;   (mt/test-driver :ocient
;;                   (testing "Make sure we're generating correct DDL for Ocient to insert all rows at once."
;;                     (is (= [[(str "INSERT INTO \"public\".\"my_table\""
;;                                   " SELECT ?, 1 UNION ALL"
;;                                   " SELECT ?, 2 UNION ALL"
;;                                   " SELECT ?, 3")
;;                              "A"
;;                              "B"
;;                              "C"]]
;;                            (ddl/insert-rows-ddl-statements :ocient (hx/identifier :table "my_db" "my_table") [{:col1 "A", :col2 1}
;;                                                                                                               {:col1 "B", :col2 2}
;;                                                                                                               {:col1 "C", :col2 3}]))))))

(deftest ocient-connect-and-sync
  ;; ridiculously hacky test; hopefully it can be simplified; see inline comments for full explanations
  (mt/test-driver :ocient
                  (let [database-name "test"
                        details  (tx/dbdef->connection-details :ocient :db {:host               (tx/db-test-env-var :ocient :host "localhost")
                                                                            :port               (tx/db-test-env-var :ocient :port "4051")
                                                                            :user               (tx/db-test-env-var :ocient :user "admin@system")
                                                                            :password           (tx/db-test-env-var :ocient :password "admin")
                                                                            :database-name      (tx/format-name :ocient database-name)
                                                                            :additional-options "loglevel=TRACE;logfile=/tmp/metabase/ocient_jdbc.log"})
                        orig-user-id api/*current-user-id*]
                    (testing "Ocient can-connect? with SSL connection"
                      (is (driver/can-connect? :ocient details)))
                    (testing "Sync works with SSL connection"
                      (binding [metabase.sync.util/*log-exceptions-and-continue?* false
                                api/*current-user-id* (mt/user->id :crowberto)]
                        (mt/with-temp Database [database {:engine  :ocient,
                                                          :name    database-name,
                                                          :details details}]
                          (mt/with-db database
                            (testing " can sync correctly"
                              (sync/sync-database! database {:scan :schema})
                        ;; should be four tables from test-data
                              (is (= 4 (db/count Table :db_id (u/the-id database) :name [:like (str database-name "%")])))
                              (binding [api/*current-user-id* orig-user-id ; restore original user-id to avoid perm errors
                                  ;; we also need to rebind this dynamic var so that we can pretend "test-data" is
                                  ;; actually the name of the database, and not some variation on the :name specified
                                  ;; above, so that the table names resolve correctly in the generated query we can't
                                  ;; simply call this new temp database "test-data", because then it will no longer be
                                  ;; unique compared to the "real" "test-data" DB associated with the non-SSL (default)
                                  ;; database, and the logic within metabase.test.data.interface/metabase-instance would
                                  ;; be wrong (since we would end up with two :oracle Databases both named "test-data",
                                  ;; violating its assumptions, in case the app DB ends up in an inconsistent state)
                                        tx/*database-name-override* database-name]
                                (testing " and execute a query correctly"
                                  (qp-test.order-by-test/order-by-test)))))))))))


;; tx/defdataset-edn :sample-dataset