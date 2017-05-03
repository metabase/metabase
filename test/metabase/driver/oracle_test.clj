(ns metabase.driver.oracle-test
  "Tests for specific behavior of the Oracle driver."
  (:require [expectations :refer :all]
            [metabase.driver
             [generic-sql :as sql]
             oracle])
  (:import metabase.driver.oracle.OracleDriver))

;; make sure we can set additional connection string options
(expect
  {:subprotocol "oracle:thin"
   :subname     "@localhost:1521:ORCL?serviceName=myservicename"}
  (sql/connection-details->spec (OracleDriver.) {:host               "localhost"
                                                 :port               1521
                                                 :sid                "ORCL"
                                                 :additional-options "serviceName=myservicename"}))

;; make sure we can connect with or without an SID
(expect
  {:subprotocol "oracle:thin"
   :subname     "@localhost:1521:ORCL"}
  (sql/connection-details->spec (OracleDriver.) {:host "localhost"
                                                 :port 1521
                                                 :sid  "ORCL"}))

(expect
  {:subprotocol "oracle:thin"
   :subname     "@localhost:1521"}
  (sql/connection-details->spec (OracleDriver.) {:host "localhost"
                                                 :port 1521}))
