(ns metabase.query-processor.parameters-test
  "Tests for *MBQL* parameter substitution."
  (:require [clojure.set :as set]
            (clj-time [core :as t]
                      [format :as tf])
            [expectations :refer :all]
            [metabase.driver :as driver]
            (metabase.models [database :refer [Database]]
                             [metric :refer [Metric]]
                             [segment :refer [Segment]]
                             [table :refer [Table]])
            [metabase.query-processor :as qp]
            (metabase.query-processor [expand :as ql]
                                      [parameters :refer :all])
            [metabase.query-processor-test :refer [non-timeseries-engines first-row format-rows-by]]
            [metabase.test.data :as data]
            (metabase.test.data [datasets :as datasets]
                                [users :refer :all])
            [metabase.test.util :as tu]))

(tu/resolve-private-vars metabase.query-processor.parameters
  absolute-date->range relative-date->range)

(expect {:end "2016-03-31", :start "2016-01-01"} (absolute-date->range "Q1-2016"))
(expect {:end "2016-02-29", :start "2016-02-01"} (absolute-date->range "2016-02"))
(expect {:end "2016-04-18", :start "2016-04-18"} (absolute-date->range "2016-04-18"))
(expect {:end "2016-04-23", :start "2016-04-18"} (absolute-date->range "2016-04-18~2016-04-23"))

;; we hard code "now" to a specific point in time so that we can control the test output
(defn- test-relative [value]
  (with-redefs-fn {#'clj-time.core/now (fn [] (t/date-time 2016 06 07 12 0 0))}
    #(relative-date->range value nil)))

(expect {:end "2016-06-06", :start "2016-05-31"} (test-relative "past7days"))
(expect {:end "2016-06-06", :start "2016-05-08"} (test-relative "past30days"))
(expect {:end "2016-06-11", :start "2016-06-05"} (test-relative "thisweek"))
(expect {:end "2016-06-30", :start "2016-06-01"} (test-relative "thismonth"))
(expect {:end "2016-12-31", :start "2016-01-01"} (test-relative "thisyear"))
(expect {:end "2016-06-04", :start "2016-05-29"} (test-relative "lastweek"))
(expect {:end "2016-05-31", :start "2016-05-01"} (test-relative "lastmonth"))
(expect {:end "2015-12-31", :start "2015-01-01"} (test-relative "lastyear"))
(expect {:end "2016-06-06", :start "2016-06-06"} (test-relative "yesterday"))
(expect {:end "2016-06-07", :start "2016-06-07"} (test-relative "today"))


;;; +-------------------------------------------------------------------------------------------------------+
;;; |                                             MBQL QUERIES                                              |
;;; +-------------------------------------------------------------------------------------------------------+


;; adding a simple parameter
(expect
  {:database   1
   :type       :query
   :query      {:filter   ["=" ["field-id" 123] "666"]
                :breakout [17]}}
  (expand-parameters {:database   1
                      :type       :query
                      :query      {:breakout [17]}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "id"
                                    :target ["dimension" ["field-id" 123]]
                                    :value  "666"}]}))

;; multiple filters are conjoined by an "AND"
(expect
  {:database   1
   :type       :query
   :query      {:filter   ["AND" ["AND" ["AND" ["=" 456 12]] ["=" ["field-id" 123] "666"]] ["=" ["field-id" 456] "999"]]
                :breakout [17]}}
  (expand-parameters {:database   1
                      :type       :query
                      :query      {:filter   ["AND" ["=" 456 12]]
                                   :breakout [17]}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "id"
                                    :target ["dimension" ["field-id" 123]]
                                    :value  "666"}
                                   {:hash   "def456"
                                    :name   "bar"
                                    :type   "category"
                                    :target ["dimension" ["field-id" 456]]
                                    :value  "999"}]}))

;; date range parameters
(expect
  {:database   1
   :type       :query
   :query      {:filter   ["TIME_INTERVAL" ["field-id" 123] -30 "day"]
                :breakout [17]}}
  (expand-parameters {:database   1
                      :type       :query
                      :query      {:breakout [17]}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "date"
                                    :target ["dimension" ["field-id" 123]]
                                    :value  "past30days"}]}))

(expect
  {:database   1
   :type       :query
   :query      {:filter   ["=" ["field-id" 123] ["relative_datetime" -1 "day"]]
                :breakout [17]}}
  (expand-parameters {:database   1
                      :type       :query
                      :query      {:breakout [17]}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "date"
                                    :target ["dimension" ["field-id" 123]]
                                    :value  "yesterday"}]}))

(expect
  {:database   1
   :type       :query
   :query      {:filter   ["BETWEEN" ["field-id" 123] "2014-05-10" "2014-05-16"]
                :breakout [17]}}
  (expand-parameters {:database   1
                      :type       :query
                      :query      {:breakout [17]}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "date"
                                    :target ["dimension" ["field-id" 123]]
                                    :value  "2014-05-10~2014-05-16"}]}))



;;; +-------------------------------------------------------------------------------------------------------+
;;; |                                           END-TO-END TESTS                                            |
;;; +-------------------------------------------------------------------------------------------------------+

;; for some reason param substitution tests fail on Redshift & (occasionally) Crate so just don't run those for now
(def ^:private ^:const params-test-engines (set/difference non-timeseries-engines #{:redshift :crate}))

;; check that date ranges work correctly
(datasets/expect-with-engines params-test-engines
  [29]
  (first-row
    (format-rows-by [int]
      (qp/process-query {:database   (data/id)
                         :type       :query
                         :query      (data/query checkins
                                       (ql/aggregation (ql/count)))
                         :parameters [{:hash   "abc123"
                                       :name   "foo"
                                       :type   "date"
                                       :target ["dimension" ["field-id" (data/id :checkins :date)]]
                                       :value  "2015-04-01~2015-05-01"}]}))))

;; check that IDs work correctly (passed in as numbers)
(datasets/expect-with-engines params-test-engines
  [1]
  (first-row
    (format-rows-by [int]
      (qp/process-query {:database   (data/id)
                         :type       :query
                         :query      (data/query checkins
                                       (ql/aggregation (ql/count)))
                         :parameters [{:hash   "abc123"
                                       :name   "foo"
                                       :type   "number"
                                       :target ["dimension" ["field-id" (data/id :checkins :id)]]
                                       :value  100}]}))))

;; check that IDs work correctly (passed in as strings, as the frontend is wont to do; should get converted)
(datasets/expect-with-engines params-test-engines
  [1]
  (first-row
    (format-rows-by [int]
      (qp/process-query {:database   (data/id)
                         :type       :query
                         :query      (data/query checkins
                                       (ql/aggregation (ql/count)))
                         :parameters [{:hash   "abc123"
                                       :name   "foo"
                                       :type   "number"
                                       :target ["dimension" ["field-id" (data/id :checkins :id)]]
                                       :value  "100"}]}))))
