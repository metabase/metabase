(ns metabase.driver.oracle-test
  "Tests for specific behavior of the Oracle driver."
  (:require [expectations :refer :all]
            [metabase.driver :as driver]
            [metabase.driver
             [generic-sql :as sql]
             [oracle :as oracle]]
            [metabase.models
             [database :refer [Database]]
             [setting :as setting]]
            [metabase.test.data :as data]
            [metabase.test.data
             [dataset-definitions :as defs]
             [datasets :refer [expect-with-engine]]]
            [metabase.test.util :as tu])
  (:import metabase.driver.oracle.OracleDriver))

;; make sure we can connect with an SID
(expect
  {:subprotocol "oracle:thin"
   :subname     "@localhost:1521:ORCL"}
  (sql/connection-details->spec (OracleDriver.) {:host "localhost"
                                                 :port 1521
                                                 :sid  "ORCL"}))

;; no SID and not Service Name should throw an exception
(expect
  AssertionError
  (sql/connection-details->spec (OracleDriver.) {:host "localhost"
                                                 :port 1521}))

(expect
  "You must specify the SID and/or the Service Name."
  (try (sql/connection-details->spec (OracleDriver.) {:host "localhost"
                                                      :port 1521})
       (catch Throwable e
         (driver/humanize-connection-error-message (OracleDriver.) (.getMessage e)))))

;; make sure you can specify a Service Name with no SID
(expect
  {:subprotocol "oracle:thin"
   :subname     "@localhost:1521/MyCoolService"}
  (sql/connection-details->spec (OracleDriver.) {:host         "localhost"
                                                 :port         1521
                                                 :service-name "MyCoolService"}))

;; make sure you can specify a Service Name and an SID
(expect
  {:subprotocol "oracle:thin"
   :subname     "@localhost:1521:ORCL/MyCoolService"}
  (sql/connection-details->spec (OracleDriver.) {:host         "localhost"
                                                 :port         1521
                                                 :service-name "MyCoolService"
                                                 :sid          "ORCL"}))


(expect
  com.jcraft.jsch.JSchException
  (let [engine :oracle
        details {:ssl false,
                 :password "changeme",
                 :tunnel-host "localhost",
                 :tunnel-pass "BOGUS-BOGUS-BOGUS",
                 :port 12345,
                 :service-name "test",
                 :sid "asdf",
                 :host "localhost",
                 :tunnel-enabled true,
                 :tunnel-port 22,
                 :user "postgres",
                 :tunnel-user "example"}]
    (#'oracle/can-connect? details)))

(expect-with-engine :oracle
  "UTC"
  (tu/db-timezone-id))
