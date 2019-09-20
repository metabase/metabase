(ns metabase.query-processor.middleware.parameters.native.substitution-test
  (:require [expectations :refer [expect]]
            [metabase.driver :as driver]
            [metabase.query-processor.middleware.parameters.native.substitution :as substitution]))

;; make sure we handle quotes inside names correctly!
(expect
  {:replacement-snippet     "\"test-data\".\"PUBLIC\".\"checkins\".\"date\""
   :prepared-statement-args nil}
  (driver/with-driver :h2
    (#'substitution/honeysql->replacement-snippet-info :test-data.PUBLIC.checkins.date)))
