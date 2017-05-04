(ns metabase.query-processor-test.unix-timestamp-test
  "Tests for UNIX timestamp support."
  (:require [metabase.query-processor-test :refer :all]
            [metabase.query-processor.expand :as ql]
            [metabase.test.data :as data]
            [metabase.test.data
             [datasets :as datasets :refer [*driver* *engine*]]
             [interface :as i]]))

;; There were 9 "sad toucan incidents" on 2015-06-02
(expect-with-non-timeseries-dbs
  (if (i/has-questionable-timezone-support? *driver*)
    10
    9)
  (count (rows (data/dataset sad-toucan-incidents
                 (data/run-query incidents
                   (ql/filter (ql/and (ql/> $timestamp "2015-06-01")
                                      (ql/< $timestamp "2015-06-03")))
                   (ql/order-by (ql/asc $timestamp)))))))

(expect-with-non-timeseries-dbs
  (cond
    (contains? #{:sqlite :crate} *engine*)
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

    ;; SQL Server, Mongo, and Redshift don't have a concept of timezone so results are all grouped by UTC
    (i/has-questionable-timezone-support? *driver*)
    [["2015-06-01T00:00:00.000Z"  6]
     ["2015-06-02T00:00:00.000Z" 10]
     ["2015-06-03T00:00:00.000Z"  4]
     ["2015-06-04T00:00:00.000Z"  9]
     ["2015-06-05T00:00:00.000Z"  9]
     ["2015-06-06T00:00:00.000Z"  8]
     ["2015-06-07T00:00:00.000Z"  8]
     ["2015-06-08T00:00:00.000Z"  9]
     ["2015-06-09T00:00:00.000Z"  7]
     ["2015-06-10T00:00:00.000Z"  9]]

    ;; Postgres, MySQL, and H2 -- grouped by DB timezone, US/Pacific in this case
    :else
    [["2015-06-01T00:00:00.000Z"  8]
     ["2015-06-02T00:00:00.000Z"  9]
     ["2015-06-03T00:00:00.000Z"  9]
     ["2015-06-04T00:00:00.000Z"  4]
     ["2015-06-05T00:00:00.000Z" 11]
     ["2015-06-06T00:00:00.000Z"  8]
     ["2015-06-07T00:00:00.000Z"  6]
     ["2015-06-08T00:00:00.000Z" 10]
     ["2015-06-09T00:00:00.000Z"  6]
     ["2015-06-10T00:00:00.000Z" 10]])
  (->> (data/dataset sad-toucan-incidents
         (data/run-query incidents
           (ql/aggregation (ql/count))
           (ql/breakout $timestamp)
           (ql/limit 10)))
       rows (format-rows-by [identity int])))
