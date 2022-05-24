(ns metabase.driver.ocient-test
  (:require [clojure.test :refer :all]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.test :as mt]
            [metabase.test.data.sql.ddl :as ddl]
            [metabase.util.honeysql-extensions :as hx]))

(deftest additional-connection-string-options-test
  (mt/test-driver :ocient
                  (testing "Make sure you can add additional connection string options "
                    (is (= {:classname   "com.ocient.jdbc.JDBCDriver"
                            :subprotocol "ocient"
                            :sslmode     "disable"
                            :pooling     "OFF"
                            :force       true
                            :subname     "//sales-sql0:4050/metabase;loglevel=DEBUG;logfile=jdbc_trace.out"}
                           (sql-jdbc.conn/connection-details->spec :ocient {:host               "sales-sql0"
                                                                            :port               4050
                                                                            :db                 "metabase"
                                                                            :additional-options "loglevel=DEBUG;logfile=jdbc_trace.out"}))))))

(deftest insert-rows-ddl-test
  (mt/test-driver :ocient
                  (testing "Make sure we're generating correct DDL for Ocient to insert all rows at once."
                    (is (= [[(str "INSERT INTO \"metabase\".\"my_table\""
                                  " SELECT ?, 1 UNION ALL"
                                  " SELECT ?, 2 UNION ALL"
                                  " SELECT ?, 3")
                             "A"
                             "B"
                             "C"]]
                           (ddl/insert-rows-ddl-statements :ocient (hx/identifier :table "my_db" "my_table") [{:col1 "A", :col2 1}
                                                                                                              {:col1 "B", :col2 2}
                                                                                                              {:col1 "C", :col2 3}]))))))
