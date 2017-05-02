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
   :subname     "@localhost:1521:ORCL?serviceName=myservicename"
   :sid         "ORCL"}
  (sql/connection-details->spec (OracleDriver.) {:host               "localhost"
                                                 :port               1521
                                                 :sid                "ORCL"
                                                 :additional-options "serviceName=myservicename"}))
