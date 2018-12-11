(ns metabase.driver.oracle-test
  "Tests for specific behavior of the Oracle driver."
  (:require [expectations :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.test.data.datasets :refer [expect-with-driver]]
            [metabase.test.util :as tu]
            [metabase.test.util.log :as tu.log]))

;; make sure we can connect with an SID
(expect
  {:classname                   "oracle.jdbc.OracleDriver"
   :subprotocol                 "oracle:thin"
   :subname                     "@localhost:1521:ORCL"
   :oracle.jdbc.J2EE13Compliant true}
  (sql-jdbc.conn/connection-details->spec :oracle {:host "localhost"
                                                   :port 1521
                                                   :sid  "ORCL"}))

;; no SID and not Service Name should throw an exception
(expect
  AssertionError
  (sql-jdbc.conn/connection-details->spec :oracle {:host "localhost"
                                                   :port 1521}))

(expect
  "You must specify the SID and/or the Service Name."
  (try (sql-jdbc.conn/connection-details->spec :oracle {:host "localhost"
                                                        :port 1521})
       (catch Throwable e
         (driver/humanize-connection-error-message :oracle (.getMessage e)))))

;; make sure you can specify a Service Name with no SID
(expect
  {:classname                   "oracle.jdbc.OracleDriver"
   :subprotocol                 "oracle:thin"
   :subname                     "@localhost:1521/MyCoolService"
   :oracle.jdbc.J2EE13Compliant true}
  (sql-jdbc.conn/connection-details->spec :oracle {:host         "localhost"
                                                   :port         1521
                                                   :service-name "MyCoolService"}))

;; make sure you can specify a Service Name and an SID
(expect
  {:classname                   "oracle.jdbc.OracleDriver"
   :subprotocol                 "oracle:thin"
   :subname                     "@localhost:1521:ORCL/MyCoolService"
   :oracle.jdbc.J2EE13Compliant true}
  (sql-jdbc.conn/connection-details->spec :oracle {:host         "localhost"
                                                   :port         1521
                                                   :service-name "MyCoolService"
                                                   :sid          "ORCL"}))


(expect
  com.jcraft.jsch.JSchException
  (let [engine  :oracle
        details {:ssl            false
                 :password       "changeme"
                 :tunnel-host    "localhost"
                 :tunnel-pass    "BOGUS-BOGUS-BOGUS"
                 :port           12345
                 :service-name   "test"
                 :sid            "asdf"
                 :host           "localhost"
                 :tunnel-enabled true
                 :tunnel-port    22
                 :user           "postgres"
                 :tunnel-user    "example"}]
    (tu.log/suppress-output
      (driver/can-connect? :oracle details))))

(expect-with-driver :oracle
  "UTC"
  (tu/db-timezone-id))
