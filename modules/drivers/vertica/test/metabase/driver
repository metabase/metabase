(ns metabase.driver.vertica-test
  (:require [expectations :refer [expect]]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.test.data.datasets :refer [expect-with-driver]]
            [metabase.test.util :as tu]))

(expect-with-driver :vertica
  "UTC"
  (tu/db-timezone-id))

;; make sure you can add additional connection string options (#6651)
(expect
  {:classname   "com.vertica.jdbc.Driver"
   :subprotocol "vertica"
   :subname     "//localhost:5433/birds-near-me?ConnectionLoadBalance=1"}
  (sql-jdbc.conn/connection-details->spec :vertica {:host               "localhost"
                                                    :port               5433
                                                    :db                 "birds-near-me"
                                                    :additional-options "ConnectionLoadBalance=1"}))
