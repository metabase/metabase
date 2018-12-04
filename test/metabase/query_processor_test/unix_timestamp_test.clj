(ns metabase.query-processor-test.unix-timestamp-test
  "Tests for UNIX timestamp support."
  (:require [metabase
             [driver :as driver]
             [query-processor-test :refer :all]]
            [metabase.query-processor-test.date-bucketing-test :as dbt]
            [metabase.test
             [data :as data]
             [util :as tu]]))

;; There were 10 "sad toucan incidents" on 2015-06-02 in UTC
(expect-with-non-timeseries-dbs
  10

  ;; There's a race condition with this test. If we happen to grab a
  ;; connection that is in a session with the timezone set to pacific,
  ;; we'll get 9 results even when the above if statement is true. It
  ;; seems to be pretty rare, but explicitly specifying UTC will make
  ;; the issue go away
  (tu/with-temporary-setting-values [report-timezone "UTC"]
    (count (rows (data/dataset sad-toucan-incidents
                   (data/run-mbql-query incidents
                     {:filter   [:= [:datetime-field $timestamp :day] "2015-06-02"]
                      :order-by [[:asc $timestamp]]}))))))

(expect-with-non-timeseries-dbs
  (cond
    (= :sqlite driver/*driver*)
    [["2015-06-01"  6]
     ["2015-06-02" 10]
     ["2015-06-03"  4]
     ["2015-06-04"  9]
     ["2015-06-05"  9]
     ["2015-06-06"  8]
     ["2015-06-07"  8]
     ["2015-06-08"  9]
     ["2015-06-09"  7]
     ["2015-06-10"  9]]

    (dbt/tz-shifted-engine-bug? driver/*driver*)
    [["2015-06-01T00:00:00.000-07:00" 6]
     ["2015-06-02T00:00:00.000-07:00" 10]
     ["2015-06-03T00:00:00.000-07:00" 4]
     ["2015-06-04T00:00:00.000-07:00" 9]
     ["2015-06-05T00:00:00.000-07:00" 9]
     ["2015-06-06T00:00:00.000-07:00" 8]
     ["2015-06-07T00:00:00.000-07:00" 8]
     ["2015-06-08T00:00:00.000-07:00" 9]
     ["2015-06-09T00:00:00.000-07:00" 7]
     ["2015-06-10T00:00:00.000-07:00" 9]]

    (supports-report-timezone? driver/*driver*)
    [["2015-06-01T00:00:00.000-07:00" 8]
     ["2015-06-02T00:00:00.000-07:00" 9]
     ["2015-06-03T00:00:00.000-07:00" 9]
     ["2015-06-04T00:00:00.000-07:00" 4]
     ["2015-06-05T00:00:00.000-07:00" 11]
     ["2015-06-06T00:00:00.000-07:00" 8]
     ["2015-06-07T00:00:00.000-07:00" 6]
     ["2015-06-08T00:00:00.000-07:00" 10]
     ["2015-06-09T00:00:00.000-07:00" 6]
     ["2015-06-10T00:00:00.000-07:00" 10]]

    :else
    [["2015-06-01T00:00:00.000Z" 6]
     ["2015-06-02T00:00:00.000Z" 10]
     ["2015-06-03T00:00:00.000Z" 4]
     ["2015-06-04T00:00:00.000Z" 9]
     ["2015-06-05T00:00:00.000Z" 9]
     ["2015-06-06T00:00:00.000Z" 8]
     ["2015-06-07T00:00:00.000Z" 8]
     ["2015-06-08T00:00:00.000Z" 9]
     ["2015-06-09T00:00:00.000Z" 7]
     ["2015-06-10T00:00:00.000Z" 9]])

  (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
    (->> (data/dataset sad-toucan-incidents
           (data/run-mbql-query incidents
             {:aggregation [[:count]]
              :breakout    [$timestamp]
              :limit       10}))
         rows (format-rows-by [identity int]))))
