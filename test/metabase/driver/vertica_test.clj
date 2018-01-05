(ns metabase.driver.vertica-test
  (:require [expectations :refer [expect]]
            [metabase.driver.vertica :as vertica]
            [metabase.test.data.datasets :refer [expect-with-engine]]
            [metabase.test.util :as tu]))

(expect-with-engine :vertica
  "UTC"
  (tu/db-timezone-id))

;; make sure you can add additional connection string options (#6651)
(expect
  {:classname   "com.vertica.jdbc.Driver"
   :subprotocol "vertica"
   :subname     "//localhost:5433/birds-near-me?ConnectionLoadBalance=1"}
  (#'vertica/connection-details->spec {:host               "localhost"
                                       :port               5433
                                       :db                 "birds-near-me"
                                       :additional-options "ConnectionLoadBalance=1"}))
