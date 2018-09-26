(ns metabase.query-processor.middleware.parameters.date-test
  "Tests for datetime parameters."
  (:require [expectations :refer :all]
            [clj-time.core :as t]
            [metabase.query-processor.middleware.parameters.dates :refer :all]))

;; we hard code "now" to a specific point in time so that we can control the test output
(defn- test-date->range [value]
  (with-redefs [t/now (constantly (t/date-time 2016 06 07 12 0 0))]
    (date-string->range value nil)))

(expect {:end "2016-03-31", :start "2016-01-01"} (test-date->range "Q1-2016"))
(expect {:end "2016-02-29", :start "2016-02-01"} (test-date->range "2016-02"))
(expect {:end "2016-04-18", :start "2016-04-18"} (test-date->range "2016-04-18"))
(expect {:end "2016-04-23", :start "2016-04-18"} (test-date->range "2016-04-18~2016-04-23"))
(expect {:end "2016-04-23", :start "2016-04-18"} (test-date->range "2016-04-18~2016-04-23"))
(expect {:start "2016-04-18"}                    (test-date->range "2016-04-18~"))
(expect {:end "2016-04-18"}                      (test-date->range "~2016-04-18"))

(expect {:end "2016-06-06", :start "2016-06-04"} (test-date->range "past3days"))
(expect {:end "2016-06-07", :start "2016-06-04"} (test-date->range "past3days~"))
(expect {:end "2016-06-06", :start "2016-05-31"} (test-date->range "past7days"))
(expect {:end "2016-06-06", :start "2016-05-08"} (test-date->range "past30days"))
(expect {:end "2016-05-31", :start "2016-04-01"} (test-date->range "past2months"))
(expect {:end "2016-06-30", :start "2016-04-01"} (test-date->range "past2months~"))
(expect {:end "2016-05-31", :start "2015-05-01"} (test-date->range "past13months"))
(expect {:end "2015-12-31", :start "2015-01-01"} (test-date->range "past1years"))
(expect {:end "2016-12-31", :start "2015-01-01"} (test-date->range "past1years~"))
(expect {:end "2015-12-31", :start "2000-01-01"} (test-date->range "past16years"))

(expect {:end "2016-06-10", :start "2016-06-08"} (test-date->range "next3days"))
(expect {:end "2016-06-10", :start "2016-06-07"} (test-date->range "next3days~"))
(expect {:end "2016-06-14", :start "2016-06-08"} (test-date->range "next7days"))
(expect {:end "2016-07-07", :start "2016-06-08"} (test-date->range "next30days"))
(expect {:end "2016-08-31", :start "2016-07-01"} (test-date->range "next2months"))
(expect {:end "2016-08-31", :start "2016-06-01"} (test-date->range "next2months~"))
(expect {:end "2017-07-31", :start "2016-07-01"} (test-date->range "next13months"))
(expect {:end "2017-12-31", :start "2017-01-01"} (test-date->range "next1years"))
(expect {:end "2017-12-31", :start "2016-01-01"} (test-date->range "next1years~"))
(expect {:end "2032-12-31", :start "2017-01-01"} (test-date->range "next16years"))

(expect {:end "2016-06-07", :start "2016-06-07"} (test-date->range "thisday"))
(expect {:end "2016-06-11", :start "2016-06-05"} (test-date->range "thisweek"))
(expect {:end "2016-06-30", :start "2016-06-01"} (test-date->range "thismonth"))
(expect {:end "2016-12-31", :start "2016-01-01"} (test-date->range "thisyear"))

(expect {:end "2016-06-04", :start "2016-05-29"} (test-date->range "lastweek"))
(expect {:end "2016-05-31", :start "2016-05-01"} (test-date->range "lastmonth"))
(expect {:end "2015-12-31", :start "2015-01-01"} (test-date->range "lastyear"))
(expect {:end "2016-06-06", :start "2016-06-06"} (test-date->range "yesterday"))
(expect {:end "2016-06-07", :start "2016-06-07"} (test-date->range "today"))
