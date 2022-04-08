(ns metabase.driver.ocient-test
  (:require [clojure.test :refer :all]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.test :as mt]
            [metabase.test.util :as tu]))

(deftest additional-connection-string-options-test
  (mt/test-driver :ocient
    (testing "Make sure you can add additional connection string options "
      (is (= {:classname   "com.ocient.jdbc.Driver"
              :subprotocol "ocient"
              :subname     "//sales-sql0:4050/metabase;loglevel=DEBUG;logfile=jdbc_trace.out"}
             (sql-jdbc.conn/connection-details->spec :ocient {:host               "sales-sql0"
                                                               :port               4050
                                                               :db                 "metabase"
                                                               :additional-options "loglevel=DEBUG;logfile=jdbc_trace.out"}))))))
