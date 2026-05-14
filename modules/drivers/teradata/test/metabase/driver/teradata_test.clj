(ns metabase.driver.teradata-test
  (:require [expectations.clojure.test :refer [defexpect expect expecting]]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]))

(def result
  (sql-jdbc.conn/connection-details->spec :teradata {:host "localhost"
                                                     :additional-options  "CONNECT_FAILURE_TTL=300,ERROR_QUERY_INTERVAL=300000,RECONNECT_INTERVAL=300,COP=OFF,REDRIVE=0"}))

(def hardcoded
  {:classname                  "com.teradata.jdbc.TeraDriver"
   :subprotocol                 "teradata"
   :subname                     "//localhost/CHARSET=UTF8,TMODE=ANSI,ENCRYPTDATA=ON,FINALIZE_AUTO_CLOSE=ON,LOB_SUPPORT=OFF,CONNECT_FAILURE_TTL=300,ERROR_QUERY_INTERVAL=300000,RECONNECT_INTERVAL=300,COP=OFF,REDRIVE=0"})

;; Check that additional JDBC options are handled correctly. This is comma separated for Teradata.
(defexpect db-test
  (expect
   hardcoded
   result))