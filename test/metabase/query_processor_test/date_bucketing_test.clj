(ns metabase.query-processor-test.date-bucketing-test
  "The below tests cover the various date bucketing/grouping scenarios that we support. There are are always two
  timezones in play when querying using these date bucketing features. The most visible is how timestamps are returned
  to the user. With no report timezone specified, the JVM's timezone is used to represent the timestamps regardless of
  timezone of the database. Specifying a report timezone (if the database supports it) will return the timestamps in
  that timezone (manifesting itself as an offset for that time). Using the JVM timezone that doesn't match the
  database timezone (assuming the database doesn't support a report timezone) can lead to incorrect results.

  The second place timezones can impact this is calculations in the database. A good example of this is grouping
  something by day. In that case, the start (or end) of the day will be different depending on what timezone the
  database is in. The start of the day in pacific time is 7 (or 8) hours earlier than UTC. This means there might be a
  different number of results depending on what timezone we're in. Report timezone lets the user specify that, and it
  gets pushed into the database so calculations are made in that timezone.

  If a report timezone is specified and the database supports it, the JVM timezone should have no impact on queries or
  their results."
  (:require [clj-time
             [core :as time]
             [format :as tformat]]
            [metabase
             [driver :as driver]
             [query-processor-test :refer :all]
             [util :as u]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data
             [dataset-definitions :as defs]
             [datasets :as datasets :refer [*driver* *engine*]]
             [interface :as i]]
            [metabase.util.date :as du])
  (:import org.joda.time.DateTime))

(defn- ->long-if-number [x]
  (if (number? x)
    (long x)
    x))

(defn tz-shifted-engine-bug?
  "Returns true if `engine` is affected by the bug originally observed in
  Oracle (https://github.com/metabase/metabase/issues/5789) but later found in Redshift and Snowflake. The timezone is
  applied correctly, but the date operations that we use aren't using that timezone. This function is used to
  differentiate Oracle from the other report-timezone databases until that bug can get fixed. Redshift and Snowflake
  also have this issue."
  [engine]
  (contains? #{:snowflake :oracle :redshift} engine))

(defn- sad-toucan-incidents-with-bucketing
  "Returns 10 sad toucan incidents grouped by `UNIT`"
  ([unit]
   (->> (data/with-db (data/get-or-create-database! defs/sad-toucan-incidents)
          (data/run-mbql-query incidents
            {:aggregation [[:count]]
             :breakout    [[:datetime-field $timestamp unit]]
             :limit       10}))
        rows (format-rows-by [->long-if-number int])))
  ([unit tz]
   (tu/with-temporary-setting-values [report-timezone (.getID tz)]
     (sad-toucan-incidents-with-bucketing unit))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; Timezones and date formatters used by all date tests
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def ^:private pacific-tz (time/time-zone-for-id "America/Los_Angeles"))
(def ^:private eastern-tz (time/time-zone-for-id "America/New_York"))
(def ^:private utc-tz     (time/time-zone-for-id "UTC"))

(defn- source-date-formatter
  "Create a date formatter, interpretting the datestring as being in `tz`"
  [tz]
  (tformat/with-zone (tformat/formatters :date-hour-minute-second-fraction) tz))

(defn- result-date-formatter
  "Create a formatter for converting a date to `tz` and in the format that the query processor would return"
  [tz]
  (tformat/with-zone (tformat/formatters :date-time) tz))

(def ^:private result-date-formatter-without-tz
  "sqlite and crate return date strings that do not include their timezone, this formatter is useful for those DBs"
  (tformat/formatters :mysql))

(def ^:private date-formatter-without-time
  "sqlite and crate return dates that do not include their time, this formatter is useful for those DBs"
  (tformat/formatters :date))

(defn- adjust-date
  "Parses `dates` using `source-formatter` and convert them to a string via `result-formatter`"
  [source-formatter result-formatter dates]
   (map (comp #(tformat/unparse result-formatter %)
              #(tformat/parse source-formatter %))
        dates))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; Default grouping tests
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def ^:private sad-toucan-dates
  "This is the first 10 sad toucan dates when converted from millis since epoch in the UTC timezone. The timezone is
  left off of the timezone string so that we can emulate how certain conversions work in the code today. As an
  example, the UTC dates in Oracle are interpreted as the reporting timezone when they're UTC"
  ["2015-06-01T10:31:00.000"
   "2015-06-01T16:06:00.000"
   "2015-06-01T17:23:00.000"
   "2015-06-01T18:55:00.000"
   "2015-06-01T21:04:00.000"
   "2015-06-01T21:19:00.000"
   "2015-06-02T02:13:00.000"
   "2015-06-02T05:37:00.000"
   "2015-06-02T08:20:00.000"
   "2015-06-02T11:11:00.000"])

(defn- sad-toucan-result
  "Creates a sad toucan resultset using the given `source-formatter` and `result-formatter`. Pairs the dates with the
  record counts."
  [source-formatter result-formatter]
  (mapv vector
        (adjust-date source-formatter result-formatter sad-toucan-dates)
        (repeat 1)))

;; Bucket sad toucan events by their default bucketing, which is the full datetime value
(expect-with-non-timeseries-dbs
  (cond
    ;; Timezone is omitted by these databases
    (contains? #{:sqlite :crate} *engine*)
    (sad-toucan-result (source-date-formatter utc-tz) result-date-formatter-without-tz)

    ;; There's a bug here where we are reading in the UTC time as pacific, so we're 7 hours off
    (tz-shifted-engine-bug? *engine*)
    (sad-toucan-result (source-date-formatter pacific-tz) (result-date-formatter pacific-tz))

    ;; When the reporting timezone is applied, the same datetime value is returned, but set in the pacific timezone
    (supports-report-timezone? *engine*)
    (sad-toucan-result (source-date-formatter utc-tz) (result-date-formatter pacific-tz))

    ;; Databases that don't support report timezone will always return the time using the JVM's timezone setting Our
    ;; tests force UTC time, so this should always be UTC
    :else
    (sad-toucan-result (source-date-formatter utc-tz) (result-date-formatter utc-tz)))
  (sad-toucan-incidents-with-bucketing :default pacific-tz))

;; Buckets sad toucan events like above, but uses the eastern timezone as the report timezone
(expect-with-non-timeseries-dbs
  (cond
    ;; These databases are always in UTC so aren't impacted by changes in report-timezone
    (contains? #{:sqlite :crate} *engine*)
    (sad-toucan-result (source-date-formatter utc-tz) result-date-formatter-without-tz)

    (tz-shifted-engine-bug? *engine*)
    (sad-toucan-result (source-date-formatter eastern-tz) (result-date-formatter eastern-tz))

    ;; The time instant is the same as UTC (or pacific) but should be offset by the eastern timezone
    (supports-report-timezone? *engine*)
    (sad-toucan-result (source-date-formatter utc-tz) (result-date-formatter eastern-tz))

    ;; The change in report timezone has no affect on this group
    :else
    (sad-toucan-result (source-date-formatter utc-tz) (result-date-formatter utc-tz)))

  (sad-toucan-incidents-with-bucketing :default eastern-tz))

;; Changes the JVM timezone from UTC to Pacific, this test isn't run on H2 as the database stores it's timezones in
;; the JVM timezone (UTC on startup). When we change that timezone, it then assumes the data was also stored in that
;; timezone. This leads to incorrect results. In this example it applies the pacific offset twice
;;
;; The exclusions here are databases that give incorrect answers when the JVM timezone doesn't match the databases
;; timezone
(expect-with-non-timeseries-dbs-except #{:h2 :sqlserver :redshift :sparksql :mongo}
  (cond
    (contains? #{:sqlite :crate} *engine*)
    (sad-toucan-result (source-date-formatter utc-tz) result-date-formatter-without-tz)

    (tz-shifted-engine-bug? *engine*)
    (sad-toucan-result (source-date-formatter eastern-tz) (result-date-formatter eastern-tz))

    ;; The JVM timezone should have no impact on a database that uses a report timezone
    (supports-report-timezone? *engine*)
    (sad-toucan-result (source-date-formatter utc-tz) (result-date-formatter eastern-tz))

    :else
    (sad-toucan-result (source-date-formatter utc-tz) (result-date-formatter pacific-tz)))

  (tu/with-jvm-tz pacific-tz
    (sad-toucan-incidents-with-bucketing :default eastern-tz)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; Grouping by minute tests
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; This dataset doesn't have multiple events in a minute, the results are the same as the default grouping
(expect-with-non-timeseries-dbs
  (cond
    (contains? #{:sqlite :crate} *engine*)
    (sad-toucan-result (source-date-formatter utc-tz) result-date-formatter-without-tz)

    (tz-shifted-engine-bug? *engine*)
    (sad-toucan-result (source-date-formatter pacific-tz) (result-date-formatter pacific-tz))

    (supports-report-timezone? *engine*)
    (sad-toucan-result (source-date-formatter utc-tz) (result-date-formatter pacific-tz))

    :else
    (sad-toucan-result (source-date-formatter utc-tz) (result-date-formatter utc-tz)))
  (sad-toucan-incidents-with-bucketing :minute pacific-tz))

;; Grouping by minute of hour is not affected by timezones
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
  (sad-toucan-incidents-with-bucketing :minute-of-hour pacific-tz))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; Grouping by hour tests
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def ^:private sad-toucan-dates-grouped-by-hour
  "This is the first 10 groupings of sad toucan dates at the same hour when converted from millis since epoch in the UTC
  timezone. The timezone is left off of the timezone string so that we can emulate how certain conversions are broken
  in the code today. As an example, the UTC dates in Oracle are interpreted as the reporting timezone when they're
  UTC"
  ["2015-06-01T10:00:00.000"
   "2015-06-01T16:00:00.000"
   "2015-06-01T17:00:00.000"
   "2015-06-01T18:00:00.000"
   "2015-06-01T21:00:00.000"
   "2015-06-02T02:00:00.000"
   "2015-06-02T05:00:00.000"
   "2015-06-02T08:00:00.000"
   "2015-06-02T11:00:00.000"
   "2015-06-02T13:00:00.000"])

(defn- results-by-hour
  "Creates a sad toucan resultset using the given `source-formatter` and `result-formatter`. Pairs the dates with the
  the record counts"
  [source-formatter result-formatter]
  (mapv vector
        (adjust-date source-formatter result-formatter sad-toucan-dates-grouped-by-hour)
        [1 1 1 1 2 1 1 1 1 1]))

;; For this test, the results are the same for each database, but the
;; formatting of the time for that given count is different depending
;; on whether the database supports a report timezone and what
;; timezone that database is in
(expect-with-non-timeseries-dbs
  (cond
    (contains? #{:sqlite :crate} *engine*)
    (results-by-hour (source-date-formatter utc-tz)
                     result-date-formatter-without-tz)

    (tz-shifted-engine-bug? *engine*)
    (results-by-hour (source-date-formatter pacific-tz) (result-date-formatter pacific-tz))

    (supports-report-timezone? *engine*)
    (results-by-hour (source-date-formatter utc-tz) (result-date-formatter pacific-tz))

    :else
    (results-by-hour (source-date-formatter utc-tz) (result-date-formatter utc-tz)))

  (sad-toucan-incidents-with-bucketing :hour pacific-tz))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; Grouping by hour of day tests
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; The counts are affected by timezone as the times are shifted back
;; by 7 hours. These count changes can be validated by matching the
;; first three results of the pacific results to the last three of the
;; UTC results (i.e. pacific is 7 hours back of UTC at that time)
(expect-with-non-timeseries-dbs
  (if (and (not (tz-shifted-engine-bug? *engine*))
           (supports-report-timezone? *engine*))
    [[0 8] [1 9] [2 7] [3 10] [4 10] [5 9] [6 6] [7 5] [8 7] [9 7]]
    [[0 13] [1 8] [2 4] [3 7] [4 5] [5 13] [6 10] [7 8] [8 9] [9 7]])
  (sad-toucan-incidents-with-bucketing :hour-of-day pacific-tz))

;; With all databases in UTC, the results should be the same for all DBs
(expect-with-non-timeseries-dbs
  [[0 13] [1 8] [2 4] [3 7] [4 5] [5 13] [6 10] [7 8] [8 9] [9 7]]
  (sad-toucan-incidents-with-bucketing :hour-of-day utc-tz))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; Grouping by day tests
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- offset-time
  "Add to `date` offset from UTC found in `tz`"
  [tz date]
  (time/minus date
              (time/seconds
               (/ (.getOffset tz date) 1000))))

(defn- find-events-in-range
  "Find the number of sad toucan events between `start-date-str` and `end-date-str`"
  [start-date-str end-date-str]
  (-> (data/with-db (data/get-or-create-database! defs/sad-toucan-incidents)
        (data/run-mbql-query incidents
          {:aggregation [[:count]]
           :breakout    [[:datetime-field $timestamp :day]]
           :filter      [:between
                         [:datetime-field $timestamp :default]
                         start-date-str
                         end-date-str]}))
      rows
      first
      second
      (or 0)))

(defn- new-events-after-tz-shift
  "Given a `date-str` and a `tz`, how many new events would appear if the time were shifted by the offset in `tz`. This
  function is useful for figuring out what the counts would be if the database was in that timezone"
  [date-str tz]
  (let [date-obj (tformat/parse (tformat/formatters :date) date-str)
        next-day (time/plus date-obj (time/days 1))
        unparse-utc #(tformat/unparse (result-date-formatter utc-tz) %)]
    (-
     ;; Once the time is shifted to `TZ`, how many new events will this add
     (find-events-in-range (unparse-utc next-day) (unparse-utc (offset-time tz next-day)))
     ;; Subtract the number of events that we will loose with the timezone shift
     (find-events-in-range (unparse-utc date-obj) (unparse-utc (offset-time tz date-obj))))))

;; This test uses H2 (in UTC) to determine the difference in number of
;; events in UTC time vs pacific time. It does this using a the UTC
;; dataset and some math to figure out if our 24 hour window is
;; shifted 7 hours back, how many events to we gain and lose. Although
;; this test is technically covered by the other grouping by day
;; tests, it's useful for debugging to answer why row counts change
;; when the timezone shifts by removing timezones and the related
;; database settings
(datasets/expect-with-engines #{:h2}
  [2 -1 5 -5 2 0 -2 1 -1 1]
  (map #(new-events-after-tz-shift (str "2015-06-" %) pacific-tz)
       ["01" "02" "03" "04" "05" "06" "07" "08" "09" "10"]))

(def ^:private sad-toucan-events-grouped-by-day
  ["2015-06-01"
   "2015-06-02"
   "2015-06-03"
   "2015-06-04"
   "2015-06-05"
   "2015-06-06"
   "2015-06-07"
   "2015-06-08"
   "2015-06-09"
   "2015-06-10"])

(defn- results-by-day
  "Creates a sad toucan resultset using the given `source-formatter` and `result-formatter`. Pairs the dates with the
  record counts supplied in `counts`"
  [source-formatter result-formatter counts]
  (mapv vector
        (adjust-date source-formatter result-formatter sad-toucan-events-grouped-by-day)
        counts))

(expect-with-non-timeseries-dbs
  (if (contains? #{:sqlite :crate} *engine*)
    (results-by-day date-formatter-without-time
                    date-formatter-without-time
                    [6 10 4 9 9 8 8 9 7 9])
    (results-by-day date-formatter-without-time
                    (result-date-formatter utc-tz)
                    [6 10 4 9 9 8 8 9 7 9]))

  (sad-toucan-incidents-with-bucketing :day utc-tz))

(expect-with-non-timeseries-dbs
  (cond
    (contains? #{:sqlite :crate} *engine*)
    (results-by-day date-formatter-without-time
                    date-formatter-without-time
                    [6 10 4 9 9 8 8 9 7 9])

    (tz-shifted-engine-bug? *engine*)
    (results-by-day (tformat/with-zone date-formatter-without-time pacific-tz)
                    (result-date-formatter pacific-tz)
                    [6 10 4 9 9 8 8 9 7 9])

    (supports-report-timezone? *engine*)
    (results-by-day (tformat/with-zone date-formatter-without-time pacific-tz)
                    (result-date-formatter pacific-tz)
                    [8 9 9 4 11 8 6 10 6 10])

    :else
    (results-by-day (tformat/with-zone date-formatter-without-time utc-tz)
                    (result-date-formatter utc-tz)
                    [6 10 4 9 9 8 8 9 7 9]))

  (sad-toucan-incidents-with-bucketing :day pacific-tz))

;; This test provides a validation of how many events are gained or
;; lost when the timezone is shifted to eastern, similar to the test
;; above with pacific
(datasets/expect-with-engines #{:h2}
  [1 -1 3 -3 3 -2 -1 0 1 1]
  (map #(new-events-after-tz-shift (str "2015-06-" %) eastern-tz)
       ["01" "02" "03" "04" "05" "06" "07" "08" "09" "10"]))

;; Similar to the pacific test above, just validating eastern timezone shifts
(expect-with-non-timeseries-dbs
  (cond
    (contains? #{:sqlite :crate} *engine*)
    (results-by-day date-formatter-without-time
                    date-formatter-without-time
                    [6 10 4 9 9 8 8 9 7 9])

    (tz-shifted-engine-bug? *engine*)
    (results-by-day (tformat/with-zone date-formatter-without-time eastern-tz)
                    (result-date-formatter eastern-tz)
                    [6 10 4 9 9 8 8 9 7 9])

    (supports-report-timezone? *engine*)
    (results-by-day (tformat/with-zone date-formatter-without-time eastern-tz)
                    (result-date-formatter eastern-tz)
                    [7 9 7 6 12 6 7 9 8 10])

    :else
    (results-by-day  date-formatter-without-time
                     (result-date-formatter utc-tz)
                     [6 10 4 9 9 8 8 9 7 9]))

  (sad-toucan-incidents-with-bucketing :day eastern-tz))

;; This tests out the JVM timezone's impact on the results. For databases supporting a report timezone, this should
;; have no affect on the results. When no report timezone is used it should convert dates to the JVM's timezone
;;
;; H2 doesn't support us switching timezones after the dates have been stored. This causes H2 to (incorrectly) apply
;; the timezone shift twice, so instead of -07:00 it will become -14:00. Leaving out the test rather than validate
;; wrong results.
;;
;; The exclusions here are databases that give incorrect answers when the JVM timezone doesn't match the databases
;; timezone
(expect-with-non-timeseries-dbs-except #{:h2 :sqlserver :redshift :sparksql :mongo}
  (cond
    (contains? #{:sqlite :crate} *engine*)
    (results-by-day date-formatter-without-time
                    date-formatter-without-time
                    [6 10 4 9 9 8 8 9 7 9])

    (tz-shifted-engine-bug? *engine*)
    (results-by-day (tformat/with-zone date-formatter-without-time pacific-tz)
                    (result-date-formatter pacific-tz)
                    [6 10 4 9 9 8 8 9 7 9])

    (supports-report-timezone? *engine*)
    (results-by-day (tformat/with-zone date-formatter-without-time pacific-tz)
                    (result-date-formatter pacific-tz)
                    [8 9 9 4 11 8 6 10 6 10])

    :else
    (results-by-day (tformat/with-zone date-formatter-without-time utc-tz)
                    (result-date-formatter pacific-tz)
                    [6 10 4 9 9 8 8 9 7 9]))

  (tu/with-jvm-tz pacific-tz
    (sad-toucan-incidents-with-bucketing :day pacific-tz)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; Grouping by day-of-week tests
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(expect-with-non-timeseries-dbs
  (if (and (not (tz-shifted-engine-bug? *engine*))
           (supports-report-timezone? *engine*))
    [[1 29] [2 36] [3 33] [4 29] [5 13] [6 38] [7 22]]
    [[1 28] [2 38] [3 29] [4 27] [5 24] [6 30] [7 24]])
  (sad-toucan-incidents-with-bucketing :day-of-week pacific-tz))

(expect-with-non-timeseries-dbs
  [[1 28] [2 38] [3 29] [4 27] [5 24] [6 30] [7 24]]
  (sad-toucan-incidents-with-bucketing :day-of-week utc-tz))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; Grouping by day-of-month tests
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(expect-with-non-timeseries-dbs
  (if (and (not (tz-shifted-engine-bug? *engine*))
           (supports-report-timezone? *engine*))
    [[1 8] [2 9] [3 9] [4 4] [5 11] [6 8] [7 6] [8 10] [9 6] [10 10]]
    [[1 6] [2 10] [3 4] [4 9] [5  9] [6 8] [7 8] [8  9] [9 7] [10  9]])
  (sad-toucan-incidents-with-bucketing :day-of-month pacific-tz))

(expect-with-non-timeseries-dbs
  [[1 6] [2 10] [3 4] [4 9] [5  9] [6 8] [7 8] [8  9] [9 7] [10  9]]
  (sad-toucan-incidents-with-bucketing :day-of-month utc-tz))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; Grouping by day-of-month tests
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(expect-with-non-timeseries-dbs
  (if (and (not (tz-shifted-engine-bug? *engine*))
           (supports-report-timezone? *engine*))
    [[152 8] [153 9] [154 9] [155 4] [156 11] [157 8] [158 6] [159 10] [160 6] [161 10]]
    [[152 6] [153 10] [154 4] [155 9] [156  9] [157  8] [158 8] [159  9] [160 7] [161  9]])
  (sad-toucan-incidents-with-bucketing :day-of-year pacific-tz))

(expect-with-non-timeseries-dbs
  [[152 6] [153 10] [154 4] [155 9] [156  9] [157  8] [158 8] [159  9] [160 7] [161  9]]
  (sad-toucan-incidents-with-bucketing :day-of-year utc-tz))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; Grouping by week tests
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- results-by-week
  "Creates a sad toucan resultset using the given `source-formatter` and `result-formatter`. Pairs the dates with the
  record counts supplied in `counts`"
  [source-formatter result-formatter counts]
  (mapv vector
        (adjust-date source-formatter result-formatter ["2015-05-31"
                                                        "2015-06-07"
                                                        "2015-06-14"
                                                        "2015-06-21"
                                                        "2015-06-28"])
        counts))

(expect-with-non-timeseries-dbs
  (if (contains? #{:sqlite :crate} *engine*)
    (results-by-week date-formatter-without-time
                     date-formatter-without-time
                     [46 47 40 60 7])
    (results-by-week date-formatter-without-time
                     (result-date-formatter utc-tz)
                     [46 47 40 60 7]))

  (sad-toucan-incidents-with-bucketing :week utc-tz))

(defn- new-weekly-events-after-tz-shift
  "Finds the change in sad toucan events if the timezone is shifted to `tz`"
  [date-str tz]
  (let [date-obj (tformat/parse (tformat/formatters :date) date-str)
        next-week (time/plus date-obj (time/days 7))
        unparse-utc #(tformat/unparse (result-date-formatter utc-tz) %)]
    (-
     ;; Once the time is shifted to `TZ`, how many new events will this add
     (find-events-in-range (unparse-utc next-week) (unparse-utc (offset-time tz next-week)))
     ;; Subtract the number of events that we will loose with the timezone shift
     (find-events-in-range (unparse-utc date-obj) (unparse-utc (offset-time tz date-obj))))))

;; This test helps in debugging why event counts change with a given timezone. It queries only a UTC H2 datatabase to
;; find how those counts would change if time was in pacific time. The results of this test are also in the UTC test
;; above and pacific test below, but this is still useful for debugging as it doesn't involve changing timezones or
;; database settings
(datasets/expect-with-engines #{:h2}
  [3 0 -1 -2 0]
  (map #(new-weekly-events-after-tz-shift % pacific-tz)
       ["2015-05-31" "2015-06-07" "2015-06-14" "2015-06-21" "2015-06-28"]))

;; Sad toucan incidents by week. Databases in UTC that don't support report timezones will be the same as the UTC test
;; above. Databases that support report timezone will have different counts as the week starts and ends 7 hours
;; earlier
(expect-with-non-timeseries-dbs
  (cond
    (contains? #{:sqlite :crate} *engine*)
    (results-by-week date-formatter-without-time
                     date-formatter-without-time
                     [46 47 40 60 7])

    (tz-shifted-engine-bug? *engine*)
    (results-by-week (tformat/with-zone date-formatter-without-time pacific-tz)
                     (result-date-formatter pacific-tz)
                     [46 47 40 60 7])

    (supports-report-timezone? *engine*)
    (results-by-week (tformat/with-zone date-formatter-without-time pacific-tz)
                     (result-date-formatter pacific-tz)
                     [49 47 39 58 7])

    :else
    (results-by-week date-formatter-without-time
                     (result-date-formatter utc-tz)
                     [46 47 40 60 7]))

  (sad-toucan-incidents-with-bucketing :week pacific-tz))

;; Similar to above this test finds the difference in event counts for each week if we were in the eastern timezone
(datasets/expect-with-engines #{:h2}
  [1 1 -1 -1 0]
  (map #(new-weekly-events-after-tz-shift % eastern-tz)
       ["2015-05-31" "2015-06-07" "2015-06-14" "2015-06-21" "2015-06-28"]))

;; Tests eastern timezone grouping by week, UTC databases don't change, databases with reporting timezones need to
;; account for the 4-5 hour difference
(expect-with-non-timeseries-dbs
  (cond
    (contains? #{:sqlite :crate} *engine*)
    (results-by-week date-formatter-without-time
                     date-formatter-without-time
                     [46 47 40 60 7])

    (tz-shifted-engine-bug? *engine*)
    (results-by-week (tformat/with-zone date-formatter-without-time eastern-tz)
                     (result-date-formatter eastern-tz)
                     [46 47 40 60 7])

    (supports-report-timezone? *engine*)
    (results-by-week (tformat/with-zone date-formatter-without-time eastern-tz)
                     (result-date-formatter eastern-tz)
                     [47 48 39 59 7])

    :else
    (results-by-week date-formatter-without-time
                     (result-date-formatter utc-tz)
                     [46 47 40 60 7]))

  (sad-toucan-incidents-with-bucketing :week eastern-tz))

;; Setting the JVM timezone will change how the datetime results are displayed but don't impact the calculation of the
;; begin/end of the week
;;
;; The exclusions here are databases that give incorrect answers when the JVM timezone doesn't match the databases
;; timezone
(expect-with-non-timeseries-dbs-except #{:h2 :sqlserver :redshift :sparksql :mongo}
  (cond
    (contains? #{:sqlite :crate} *engine*)
    (results-by-week date-formatter-without-time
                     date-formatter-without-time
                     [46 47 40 60 7])

    (tz-shifted-engine-bug? *engine*)
    (results-by-week (tformat/with-zone date-formatter-without-time pacific-tz)
                     (result-date-formatter pacific-tz)
                     [46 47 40 60 7])

    (supports-report-timezone? *engine*)
    (results-by-week (tformat/with-zone date-formatter-without-time pacific-tz)
                     (result-date-formatter pacific-tz)
                     [49 47 39 58 7])

    :else
    (results-by-week date-formatter-without-time
                     (result-date-formatter pacific-tz)
                     [46 47 40 60 7]))
  (tu/with-jvm-tz pacific-tz
    (sad-toucan-incidents-with-bucketing :week pacific-tz)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; Grouping by week-of-year tests
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(expect-with-non-timeseries-dbs
  ;; Not really sure why different drivers have different opinions on these </3
  (cond
    (= :snowflake *engine*)
    [[22 46] [23 47] [24 40] [25 60] [26 7]]

    (contains? #{:sqlserver :sqlite :crate :oracle :sparksql} *engine*)
    [[23 54] [24 46] [25 39] [26 61]]

    (and (supports-report-timezone? *engine*)
         (not (= :redshift *engine*)))
    [[23 49] [24 47] [25 39] [26 58] [27 7]]

    :else
    [[23 46] [24 47] [25 40] [26 60] [27 7]])
  (sad-toucan-incidents-with-bucketing :week-of-year pacific-tz))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; Grouping by month tests
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; All of the sad toucan events in the test data fit in June. The results are the same on all databases and the only
;; difference is how the beginning of hte month is represented, since we always return times with our dates
(expect-with-non-timeseries-dbs
  [[(cond
      (contains? #{:sqlite :crate} *engine*)
      "2015-06-01"

      (supports-report-timezone? *engine*)
      "2015-06-01T00:00:00.000-07:00"

      :else
      "2015-06-01T00:00:00.000Z")
    200]]
  (sad-toucan-incidents-with-bucketing :month pacific-tz))

(expect-with-non-timeseries-dbs
  [[(cond
      (contains? #{:sqlite :crate} *engine*)
      "2015-06-01"

      (supports-report-timezone? *engine*)
      "2015-06-01T00:00:00.000-04:00"

      :else
      "2015-06-01T00:00:00.000Z")
    200]]
  (sad-toucan-incidents-with-bucketing :month eastern-tz))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; Grouping by month-of-year tests
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(expect-with-non-timeseries-dbs
  [[6 200]]
  (sad-toucan-incidents-with-bucketing :month-of-year pacific-tz))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; Grouping by quarter tests
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(expect-with-non-timeseries-dbs
  [[(cond (contains? #{:sqlite :crate} *engine*)
          "2015-04-01"

          (supports-report-timezone? *engine*)
          "2015-04-01T00:00:00.000-07:00"

          :else
          "2015-04-01T00:00:00.000Z")
    200]]
  (sad-toucan-incidents-with-bucketing :quarter pacific-tz))

(expect-with-non-timeseries-dbs
  [[(cond (contains? #{:sqlite :crate} *engine*)
          "2015-04-01"

          (supports-report-timezone? *engine*)
          "2015-04-01T00:00:00.000-04:00"

          :else
          "2015-04-01T00:00:00.000Z")
    200]]
  (sad-toucan-incidents-with-bucketing :quarter eastern-tz))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; Grouping by quarter-of-year tests
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(expect-with-non-timeseries-dbs
  [[2 200]]
  (sad-toucan-incidents-with-bucketing :quarter-of-year pacific-tz))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; Grouping by year tests
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(expect-with-non-timeseries-dbs
  [[2015 200]]
  (sad-toucan-incidents-with-bucketing :year pacific-tz))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; Relative date tests
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; RELATIVE DATES
(defn- database-def-with-timestamps [interval-seconds]
  (i/create-database-definition (str "a-checkin-every-" interval-seconds "-seconds")
    ["checkins"
     [{:field-name "timestamp"
       :base-type  :type/DateTime}]
     (vec (for [i (range -15 15)]
            ;; Create timestamps using relative dates (e.g. `DATEADD(second, -195, GETUTCDATE())` instead of
            ;; generating `java.sql.Timestamps` here so they'll be in the DB's native timezone. Some DBs refuse to use
            ;; the same timezone we're running the tests from *cough* SQL Server *cough*
            [(u/prog1 (driver/date-interval *driver* :second (* i interval-seconds))
               (assert <>))]))]))

(def ^:private checkins:4-per-minute (partial database-def-with-timestamps 15))
(def ^:private checkins:4-per-hour   (partial database-def-with-timestamps (* 60 15)))
(def ^:private checkins:1-per-day    (partial database-def-with-timestamps (* 60 60 24)))

(defn- count-of-grouping [db field-grouping & relative-datetime-args]
  (-> (data/with-temp-db [_ db]
        (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :filter      [:=
                         [:datetime-field $timestamp field-grouping]
                         (cons :relative-datetime relative-datetime-args)]}))
      first-row first int))

;; HACK - Don't run these tests against BigQuery/etc. because the databases need to be loaded every time the tests are ran
;;        and loading data into BigQuery/etc. is mind-bogglingly slow. Don't worry, I promise these work though!

;; Don't run the minute tests against Oracle because the Oracle tests are kind of slow and case CI to fail randomly
;; when it takes so long to load the data that the times are no longer current (these tests pass locally if your
;; machine isn't as slow as the CircleCI ones)
(expect-with-non-timeseries-dbs-except #{:snowflake :bigquery :oracle} 4 (count-of-grouping (checkins:4-per-minute) :minute "current"))

(expect-with-non-timeseries-dbs-except #{:snowflake :bigquery :oracle} 4 (count-of-grouping (checkins:4-per-minute) :minute -1 "minute"))
(expect-with-non-timeseries-dbs-except #{:snowflake :bigquery :oracle} 4 (count-of-grouping (checkins:4-per-minute) :minute  1 "minute"))

(expect-with-non-timeseries-dbs-except #{:snowflake :bigquery} 4 (count-of-grouping (checkins:4-per-hour) :hour "current"))
(expect-with-non-timeseries-dbs-except #{:snowflake :bigquery} 4 (count-of-grouping (checkins:4-per-hour) :hour -1 "hour"))
(expect-with-non-timeseries-dbs-except #{:snowflake :bigquery} 4 (count-of-grouping (checkins:4-per-hour) :hour  1 "hour"))

(expect-with-non-timeseries-dbs-except #{:snowflake :bigquery} 1 (count-of-grouping (checkins:1-per-day) :day "current"))
(expect-with-non-timeseries-dbs-except #{:snowflake :bigquery} 1 (count-of-grouping (checkins:1-per-day) :day -1 "day"))
(expect-with-non-timeseries-dbs-except #{:snowflake :bigquery} 1 (count-of-grouping (checkins:1-per-day) :day  1 "day"))

(expect-with-non-timeseries-dbs-except #{:snowflake :bigquery} 7 (count-of-grouping (checkins:1-per-day) :week "current"))

;; SYNTACTIC SUGAR
(expect-with-non-timeseries-dbs-except #{:snowflake :bigquery}
  1
  (-> (data/with-temp-db [_ (checkins:1-per-day)]
        (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :filter      [:time-interval $timestamp :current :day]}))
      first-row first int))

(expect-with-non-timeseries-dbs-except #{:snowflake :bigquery}
  7
  (-> (data/with-temp-db [_ (checkins:1-per-day)]
        (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :filter      [:time-interval $timestamp :last :week]}))
      first-row first int))

;; Make sure that when referencing the same field multiple times with different units we return the one that actually
;; reflects the units the results are in. eg when we breakout by one unit and filter by another, make sure the results
;; and the col info use the unit used by breakout
(defn- date-bucketing-unit-when-you [& {:keys [breakout-by filter-by with-interval]
                                        :or   {with-interval :current}}]
  (let [results (data/with-temp-db [_ (checkins:1-per-day)]
                  (data/run-mbql-query checkins
                    {:aggregation [[:count]]
                     :breakout    [[:datetime-field $timestamp breakout-by]]
                     :filter      [:time-interval $timestamp with-interval filter-by]}))]
    {:rows (or (-> results :row_count)
               (throw (ex-info "Query failed!" results)))
     :unit (-> results :data :cols first :unit)}))

(expect-with-non-timeseries-dbs-except #{:snowflake :bigquery}
  {:rows 1, :unit :day}
  (date-bucketing-unit-when-you :breakout-by "day", :filter-by "day"))

(expect-with-non-timeseries-dbs-except #{:snowflake :bigquery}
  {:rows 7, :unit :day}
  (date-bucketing-unit-when-you :breakout-by "day", :filter-by "week"))

(expect-with-non-timeseries-dbs-except #{:snowflake :bigquery}
  {:rows 1, :unit :week}
  (date-bucketing-unit-when-you :breakout-by "week", :filter-by "day"))

(expect-with-non-timeseries-dbs-except #{:snowflake :bigquery}
  {:rows 1, :unit :quarter}
  (date-bucketing-unit-when-you :breakout-by "quarter", :filter-by "day"))

(expect-with-non-timeseries-dbs-except #{:snowflake :bigquery}
  {:rows 1, :unit :hour}
  (date-bucketing-unit-when-you :breakout-by "hour", :filter-by "day"))

;; make sure if you use a relative date bucket in the past (e.g. "past 2 months") you get the correct amount of rows
;; (#3910)
(expect-with-non-timeseries-dbs-except #{:snowflake :bigquery}
  {:rows 2, :unit :day}
  (date-bucketing-unit-when-you :breakout-by "day", :filter-by "day", :with-interval -2))

(expect-with-non-timeseries-dbs-except #{:snowflake :bigquery}
  {:rows 2, :unit :day}
  (date-bucketing-unit-when-you :breakout-by "day", :filter-by "day", :with-interval 2))


;; Filtering by a unbucketed datetime Field should automatically bucket that Field by day if not already done (#8927)
;;
;; This should only apply when comparing Fields to `yyyy-MM-dd` date strings.
;;
;; e.g. `[:= <field> "2018-11-19"] should get rewritten as `[:= [:datetime-field <field> :day] "2018-11-19"]` if
;; `<field>` is a `:type/DateTime` Field
;;
;; We should get count = 1 for the current day, as opposed to count = 0 if we weren't auto-bucketing
;; (e.g. 2018-11-19T00:00 != 2018-11-19T12:37 or whatever time the checkin is at)
(expect-with-non-timeseries-dbs-except #{:snowflake :bigquery}
  [[1]]
  (format-rows-by [int]
    (rows
      (data/with-temp-db [_ (checkins:1-per-day)]
        (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :filter      [:= [:field-id $timestamp] (du/format-date "yyyy-MM-dd" (du/date-trunc :day))]})))))

;; if datetime string is not yyyy-MM-dd no date bucketing should take place, and thus we should get no (exact) matches
(expect-with-non-timeseries-dbs-except #{:snowflake :bigquery}
  ;; Mongo returns empty row for count = 0. We should fix that
  (case *engine*
    :mongo []
    [[0]])
  (format-rows-by [int]
    (rows
      (data/with-temp-db [_ (checkins:1-per-day)]
        (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :filter      [:= [:field-id $timestamp] (str (du/format-date "yyyy-MM-dd" (du/date-trunc :day))
                                                        "T14:16:00.000Z")]})))))
