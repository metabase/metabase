(ns metabase.query-processor-test.date-bucketing-test
  "Tests for date bucketing."
  (:require [metabase
             [driver :as driver]
             [query-processor-test :refer :all]
             [util :as u]]
            [metabase.query-processor.expand :as ql]
            [metabase.test.data :as data]
            [metabase.test.data
             [dataset-definitions :as defs]
             [datasets :as datasets :refer [*driver* *engine*]]
             [interface :as i]]))

(defn- ->long-if-number [x]
  (if (number? x)
    (long x)
    x))

(defn- sad-toucan-incidents-with-bucketing [unit]
  (->> (data/with-db (data/get-or-create-database! defs/sad-toucan-incidents)
         (data/run-query incidents
           (ql/aggregation (ql/count))
           (ql/breakout (ql/datetime-field $timestamp unit))
           (ql/limit 10)))
       rows (format-rows-by [->long-if-number int])))

(expect-with-non-timeseries-dbs
  (cond
    (contains? #{:sqlite :crate} *engine*)
    [["2015-06-01 10:31:00" 1]
     ["2015-06-01 16:06:00" 1]
     ["2015-06-01 17:23:00" 1]
     ["2015-06-01 18:55:00" 1]
     ["2015-06-01 21:04:00" 1]
     ["2015-06-01 21:19:00" 1]
     ["2015-06-02 02:13:00" 1]
     ["2015-06-02 05:37:00" 1]
     ["2015-06-02 08:20:00" 1]
     ["2015-06-02 11:11:00" 1]]

    (contains? #{:redshift :sqlserver :bigquery :mongo :postgres :vertica :h2 :oracle :presto} *engine*)
    [["2015-06-01T10:31:00.000Z" 1]
     ["2015-06-01T16:06:00.000Z" 1]
     ["2015-06-01T17:23:00.000Z" 1]
     ["2015-06-01T18:55:00.000Z" 1]
     ["2015-06-01T21:04:00.000Z" 1]
     ["2015-06-01T21:19:00.000Z" 1]
     ["2015-06-02T02:13:00.000Z" 1]
     ["2015-06-02T05:37:00.000Z" 1]
     ["2015-06-02T08:20:00.000Z" 1]
     ["2015-06-02T11:11:00.000Z" 1]]

    :else
    [["2015-06-01T03:31:00.000Z" 1]
     ["2015-06-01T09:06:00.000Z" 1]
     ["2015-06-01T10:23:00.000Z" 1]
     ["2015-06-01T11:55:00.000Z" 1]
     ["2015-06-01T14:04:00.000Z" 1]
     ["2015-06-01T14:19:00.000Z" 1]
     ["2015-06-01T19:13:00.000Z" 1]
     ["2015-06-01T22:37:00.000Z" 1]
     ["2015-06-02T01:20:00.000Z" 1]
     ["2015-06-02T04:11:00.000Z" 1]])
  (sad-toucan-incidents-with-bucketing :default))

(expect-with-non-timeseries-dbs
  (cond
    (contains? #{:sqlite :crate} *engine*)
    [["2015-06-01 10:31:00" 1]
     ["2015-06-01 16:06:00" 1]
     ["2015-06-01 17:23:00" 1]
     ["2015-06-01 18:55:00" 1]
     ["2015-06-01 21:04:00" 1]
     ["2015-06-01 21:19:00" 1]
     ["2015-06-02 02:13:00" 1]
     ["2015-06-02 05:37:00" 1]
     ["2015-06-02 08:20:00" 1]
     ["2015-06-02 11:11:00" 1]]

    (i/has-questionable-timezone-support? *driver*)
    [["2015-06-01T10:31:00.000Z" 1]
     ["2015-06-01T16:06:00.000Z" 1]
     ["2015-06-01T17:23:00.000Z" 1]
     ["2015-06-01T18:55:00.000Z" 1]
     ["2015-06-01T21:04:00.000Z" 1]
     ["2015-06-01T21:19:00.000Z" 1]
     ["2015-06-02T02:13:00.000Z" 1]
     ["2015-06-02T05:37:00.000Z" 1]
     ["2015-06-02T08:20:00.000Z" 1]
     ["2015-06-02T11:11:00.000Z" 1]]

    :else
    [["2015-06-01T03:31:00.000Z" 1]
     ["2015-06-01T09:06:00.000Z" 1]
     ["2015-06-01T10:23:00.000Z" 1]
     ["2015-06-01T11:55:00.000Z" 1]
     ["2015-06-01T14:04:00.000Z" 1]
     ["2015-06-01T14:19:00.000Z" 1]
     ["2015-06-01T19:13:00.000Z" 1]
     ["2015-06-01T22:37:00.000Z" 1]
     ["2015-06-02T01:20:00.000Z" 1]
     ["2015-06-02T04:11:00.000Z" 1]])
  (sad-toucan-incidents-with-bucketing :minute))

(expect-with-non-timeseries-dbs
  [[0 5]
   [1 4]
   [2 2]
   [3 4]
   [4 4]
   [5 3]
   [6 5]
   [7 1]
   [8 1]
   [9 1]]
  (sad-toucan-incidents-with-bucketing :minute-of-hour))

(expect-with-non-timeseries-dbs
  (cond
    (contains? #{:sqlite :crate} *engine*)
    [["2015-06-01 10:00:00" 1]
     ["2015-06-01 16:00:00" 1]
     ["2015-06-01 17:00:00" 1]
     ["2015-06-01 18:00:00" 1]
     ["2015-06-01 21:00:00" 2]
     ["2015-06-02 02:00:00" 1]
     ["2015-06-02 05:00:00" 1]
     ["2015-06-02 08:00:00" 1]
     ["2015-06-02 11:00:00" 1]
     ["2015-06-02 13:00:00" 1]]

    (i/has-questionable-timezone-support? *driver*)
    [["2015-06-01T10:00:00.000Z" 1]
     ["2015-06-01T16:00:00.000Z" 1]
     ["2015-06-01T17:00:00.000Z" 1]
     ["2015-06-01T18:00:00.000Z" 1]
     ["2015-06-01T21:00:00.000Z" 2]
     ["2015-06-02T02:00:00.000Z" 1]
     ["2015-06-02T05:00:00.000Z" 1]
     ["2015-06-02T08:00:00.000Z" 1]
     ["2015-06-02T11:00:00.000Z" 1]
     ["2015-06-02T13:00:00.000Z" 1]]

    :else
    [["2015-06-01T03:00:00.000Z" 1]
     ["2015-06-01T09:00:00.000Z" 1]
     ["2015-06-01T10:00:00.000Z" 1]
     ["2015-06-01T11:00:00.000Z" 1]
     ["2015-06-01T14:00:00.000Z" 2]
     ["2015-06-01T19:00:00.000Z" 1]
     ["2015-06-01T22:00:00.000Z" 1]
     ["2015-06-02T01:00:00.000Z" 1]
     ["2015-06-02T04:00:00.000Z" 1]
     ["2015-06-02T06:00:00.000Z" 1]])
  (sad-toucan-incidents-with-bucketing :hour))

(expect-with-non-timeseries-dbs
  (if (i/has-questionable-timezone-support? *driver*)
    [[0 13] [1 8] [2 4] [3  7] [4  5] [5 13] [6 10] [7 8] [8 9] [9 7]]
    [[0  8] [1 9] [2 7] [3 10] [4 10] [5  9] [6  6] [7 5] [8 7] [9 7]])
  (sad-toucan-incidents-with-bucketing :hour-of-day))

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
  (sad-toucan-incidents-with-bucketing :day))

(expect-with-non-timeseries-dbs
  (if (i/has-questionable-timezone-support? *driver*)
    [[1 28] [2 38] [3 29] [4 27] [5 24] [6 30] [7 24]]
    [[1 29] [2 36] [3 33] [4 29] [5 13] [6 38] [7 22]])
  (sad-toucan-incidents-with-bucketing :day-of-week))

(expect-with-non-timeseries-dbs
  (if (i/has-questionable-timezone-support? *driver*)
    [[1 6] [2 10] [3 4] [4 9] [5  9] [6 8] [7 8] [8  9] [9 7] [10  9]]
    [[1 8] [2  9] [3 9] [4 4] [5 11] [6 8] [7 6] [8 10] [9 6] [10 10]])
  (sad-toucan-incidents-with-bucketing :day-of-month))

(expect-with-non-timeseries-dbs
  (if (i/has-questionable-timezone-support? *driver*)
    [[152 6] [153 10] [154 4] [155 9] [156  9] [157  8] [158 8] [159  9] [160 7] [161  9]]
    [[152 8] [153  9] [154 9] [155 4] [156 11] [157  8] [158 6] [159 10] [160 6] [161 10]])
  (sad-toucan-incidents-with-bucketing :day-of-year))

(expect-with-non-timeseries-dbs
  (cond
    (contains? #{:sqlite :crate} *engine*)
    [["2015-05-31" 46]
     ["2015-06-07" 47]
     ["2015-06-14" 40]
     ["2015-06-21" 60]
     ["2015-06-28" 7]]

    (i/has-questionable-timezone-support? *driver*)
    [["2015-05-31T00:00:00.000Z" 46]
     ["2015-06-07T00:00:00.000Z" 47]
     ["2015-06-14T00:00:00.000Z" 40]
     ["2015-06-21T00:00:00.000Z" 60]
     ["2015-06-28T00:00:00.000Z" 7]]

    :else
    [["2015-05-31T00:00:00.000Z" 49]
     ["2015-06-07T00:00:00.000Z" 47]
     ["2015-06-14T00:00:00.000Z" 39]
     ["2015-06-21T00:00:00.000Z" 58]
     ["2015-06-28T00:00:00.000Z" 7]])
  (sad-toucan-incidents-with-bucketing :week))

(expect-with-non-timeseries-dbs
  ;; Not really sure why different drivers have different opinions on these </3
  (cond
    (contains? #{:sqlserver :sqlite :crate :oracle} *engine*)
    [[23 54] [24 46] [25 39] [26 61]]

    (contains? #{:mongo :redshift :bigquery :postgres :vertica :h2 :presto} *engine*)
    [[23 46] [24 47] [25 40] [26 60] [27 7]]

    :else
    [[23 49] [24 47] [25 39] [26 58] [27 7]])
  (sad-toucan-incidents-with-bucketing :week-of-year))

(expect-with-non-timeseries-dbs
  [[(if (contains? #{:sqlite :crate} *engine*) "2015-06-01", "2015-06-01T00:00:00.000Z") 200]]
  (sad-toucan-incidents-with-bucketing :month))

(expect-with-non-timeseries-dbs
  [[6 200]]
  (sad-toucan-incidents-with-bucketing :month-of-year))

(expect-with-non-timeseries-dbs
  [[(if (contains? #{:sqlite :crate} *engine*) "2015-04-01", "2015-04-01T00:00:00.000Z") 200]]
  (sad-toucan-incidents-with-bucketing :quarter))

(expect-with-non-timeseries-dbs
  [[2 200]]
  (sad-toucan-incidents-with-bucketing :quarter-of-year))

(expect-with-non-timeseries-dbs
  [[2015 200]]
  (sad-toucan-incidents-with-bucketing :year))

;; RELATIVE DATES
(defn- database-def-with-timestamps [interval-seconds]
  (i/create-database-definition (str "a-checkin-every-" interval-seconds "-seconds")
    ["checkins"
     [{:field-name "timestamp"
       :base-type  :type/DateTime}]
     (vec (for [i (range -15 15)]
            ;; Create timestamps using relative dates (e.g. `DATEADD(second, -195, GETUTCDATE())` instead of generating `java.sql.Timestamps` here so
            ;; they'll be in the DB's native timezone. Some DBs refuse to use the same timezone we're running the tests from *cough* SQL Server *cough*
            [(u/prog1 (driver/date-interval *driver* :second (* i interval-seconds))
               (assert <>))]))]))

(def ^:private checkins:4-per-minute (partial database-def-with-timestamps 15))
(def ^:private checkins:4-per-hour   (partial database-def-with-timestamps (* 60 15)))
(def ^:private checkins:1-per-day    (partial database-def-with-timestamps (* 60 60 24)))

(defn- count-of-grouping [db field-grouping & relative-datetime-args]
  (-> (data/with-temp-db [_ db]
        (data/run-query checkins
          (ql/aggregation (ql/count))
          (ql/filter (ql/= (ql/datetime-field $timestamp field-grouping)
                           (apply ql/relative-datetime relative-datetime-args)))))
      first-row first int))

;; HACK - Don't run these tests against BigQuery because the databases need to be loaded every time the tests are ran and loading data into BigQuery is mind-bogglingly slow.
;;        Don't worry, I promise these work though!

;; Don't run the minute tests against Oracle because the Oracle tests are kind of slow and case CI to fail randomly when it takes so long to load the data that the times are
;; no longer current (these tests pass locally if your machine isn't as slow as the CircleCI ones)
(expect-with-non-timeseries-dbs-except #{:bigquery :oracle} 4 (count-of-grouping (checkins:4-per-minute) :minute "current"))
(expect-with-non-timeseries-dbs-except #{:bigquery :oracle} 4 (count-of-grouping (checkins:4-per-minute) :minute -1 "minute"))
(expect-with-non-timeseries-dbs-except #{:bigquery :oracle} 4 (count-of-grouping (checkins:4-per-minute) :minute  1 "minute"))

(expect-with-non-timeseries-dbs-except #{:bigquery} 4 (count-of-grouping (checkins:4-per-hour) :hour "current"))
(expect-with-non-timeseries-dbs-except #{:bigquery} 4 (count-of-grouping (checkins:4-per-hour) :hour -1 "hour"))
(expect-with-non-timeseries-dbs-except #{:bigquery} 4 (count-of-grouping (checkins:4-per-hour) :hour  1 "hour"))

(expect-with-non-timeseries-dbs-except #{:bigquery} 1 (count-of-grouping (checkins:1-per-day) :day "current"))
(expect-with-non-timeseries-dbs-except #{:bigquery} 1 (count-of-grouping (checkins:1-per-day) :day -1 "day"))
(expect-with-non-timeseries-dbs-except #{:bigquery} 1 (count-of-grouping (checkins:1-per-day) :day  1 "day"))

(expect-with-non-timeseries-dbs-except #{:bigquery} 7 (count-of-grouping (checkins:1-per-day) :week "current"))

;; SYNTACTIC SUGAR
(expect-with-non-timeseries-dbs-except #{:bigquery}
  1
  (-> (data/with-temp-db [_ (checkins:1-per-day)]
        (data/run-query checkins
          (ql/aggregation (ql/count))
          (ql/filter (ql/time-interval $timestamp :current :day))))
      first-row first int))

(expect-with-non-timeseries-dbs-except #{:bigquery}
  7
  (-> (data/with-temp-db [_ (checkins:1-per-day)]
        (data/run-query checkins
          (ql/aggregation (ql/count))
          (ql/filter (ql/time-interval $timestamp :last :week))))
      first-row first int))

;; Make sure that when referencing the same field multiple times with different units we return the one
;; that actually reflects the units the results are in.
;; eg when we breakout by one unit and filter by another, make sure the results and the col info
;; use the unit used by breakout
(defn- date-bucketing-unit-when-you [& {:keys [breakout-by filter-by with-interval]
                                        :or   {with-interval :current}}]
  (let [results (data/with-temp-db [_ (checkins:1-per-day)]
                  (data/run-query checkins
                    (ql/aggregation (ql/count))
                    (ql/breakout (ql/datetime-field $timestamp breakout-by))
                    (ql/filter (ql/time-interval $timestamp with-interval filter-by))))]
    {:rows (or (-> results :row_count)
               (throw (ex-info "Query failed!" results)))
     :unit (-> results :data :cols first :unit)}))

(expect-with-non-timeseries-dbs-except #{:bigquery}
  {:rows 1, :unit :day}
  (date-bucketing-unit-when-you :breakout-by "day", :filter-by "day"))

(expect-with-non-timeseries-dbs-except #{:bigquery}
  {:rows 7, :unit :day}
  (date-bucketing-unit-when-you :breakout-by "day", :filter-by "week"))

(expect-with-non-timeseries-dbs-except #{:bigquery}
  {:rows 1, :unit :week}
  (date-bucketing-unit-when-you :breakout-by "week", :filter-by "day"))

(expect-with-non-timeseries-dbs-except #{:bigquery}
  {:rows 1, :unit :quarter}
  (date-bucketing-unit-when-you :breakout-by "quarter", :filter-by "day"))

(expect-with-non-timeseries-dbs-except #{:bigquery}
  {:rows 1, :unit :hour}
  (date-bucketing-unit-when-you :breakout-by "hour", :filter-by "day"))

;; make sure if you use a relative date bucket in the past (e.g. "past 2 months") you get the correct amount of rows (#3910)
(expect-with-non-timeseries-dbs-except #{:bigquery}
  {:rows 2, :unit :day}
  (date-bucketing-unit-when-you :breakout-by "day", :filter-by "day", :with-interval -2))

(expect-with-non-timeseries-dbs-except #{:bigquery}
  {:rows 2, :unit :day}
  (date-bucketing-unit-when-you :breakout-by "day", :filter-by "day", :with-interval 2))
