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

(deftest additional-connection-string-options-test
  (mt/test-driver :ocient
                  (testing "Make sure you can add additional connection string options "
                    (is (= {:classname   "com.ocient.jdbc.Driver"
                            :subprotocol "ocient"
                            :sslmode     "disable"
                            :subname     "//sales-sql0:4050/metabase;loglevel=DEBUG;logfile=jdbc_trace.out"}
                           (sql-jdbc.conn/connection-details->spec :ocient {:host               "sales-sql0"
                                                                            :port               4050
                                                                            :db                 "metabase"
                                                                            :additional-options "loglevel=DEBUG;logfile=jdbc_trace.out"}))))))

