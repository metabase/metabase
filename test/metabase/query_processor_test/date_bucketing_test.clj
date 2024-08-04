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
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor-test-util :as sql.qp-test-util]
   [metabase.driver.util :as driver.u]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.models.database :refer [Database]]
   [metabase.models.table :refer [Table]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.middleware.format-rows :as format-rows]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [metabase.util.regex :as u.regex]
   [potemkin.types :as p.types]
   [pretty.core :as pretty]
   [toucan2.core :as t2])
  (:import
   (java.time LocalDate LocalDateTime)))

(set! *warn-on-reflection* true)

(defn- ->long-if-number [x]
  (if (number? x)
    (long x)
    x))

(def ^:private timezone
  {:utc     "UTC"
   :pacific "America/Los_Angeles"
   :eastern "America/New_York"})

(defn- ->timezone-id ^String [x]
  (if (keyword? x)
    (get timezone x)
    x))

(deftest sanity-check-test
  ;; TIMEZONE FIXME — currently broken for Snowflake. UNIX timestamps are interpreted as being in the report timezone
  ;; rather than UTC.
  (mt/test-drivers (disj (mt/normal-drivers) :redshift)
    (testing "\nRegardless of report timezone, UNIX timestamps should always be interpreted a being in UTC."
      (let [utc-results [[1 "2015-06-06T10:40:00Z" 4]
                         [2 "2015-06-10T19:51:00Z" 0]
                         [3 "2015-06-09T15:42:00Z" 5]
                         [4 "2015-06-22T23:49:00Z" 3]
                         [5 "2015-06-20T01:45:00Z" 3]]]
        (doseq [timezone [:pacific :utc :eastern]]
          (testing "\nResults should be returned in report timezone, if supported by driver."
            (testing (format "\ntimezone = %s" timezone)
              (let [local-results (cond
                                    (= driver/*driver* :sqlite)
                                    (for [[id s cnt] utc-results]
                                      [id (u.date/format-sql (t/local-date-time (u.date/parse s))) cnt])

                                    (or (= timezone :utc)
                                        (not (driver.u/supports? driver/*driver* :set-timezone (mt/db))))
                                    utc-results

                                    :else
                                    (for [[id s cnt] utc-results]
                                      (let [zone-id (t/zone-id (->timezone-id timezone))
                                            t       (t/offset-date-time (t/with-zone-same-instant (u.date/parse s) zone-id))
                                            s       (t/format :iso-offset-date-time t)]
                                        [id s cnt])))]
                (mt/with-report-timezone-id! (->timezone-id timezone)
                  (mt/dataset sad-toucan-incidents
                    (is (= local-results
                           (mt/formatted-rows [int identity int]
                             (mt/run-mbql-query incidents
                               {:fields   [$id $timestamp $severity]
                                :order-by [[:asc $id]]
                                :limit    5}))))))))))))))

(defn- sad-toucan-incidents-with-bucketing!
  "Returns 10 sad toucan incidents grouped by `unit`"
  ([unit]
   (->> (mt/dataset sad-toucan-incidents
          (mt/run-mbql-query incidents
            {:aggregation [[:count]]
             :breakout    [[:field %timestamp {:temporal-unit unit}]]
             :limit       10}))
        mt/rows
        (mt/format-rows-by [->long-if-number int])))

  ([unit timezone-id]
   (mt/initialize-if-needed! :db)
   (mt/with-report-timezone-id! (->timezone-id timezone-id)
     (sad-toucan-incidents-with-bucketing! unit))))

(defn- default-timezone-parse-fn
  "Create a date formatter, interpretting the datestring as being in `tz`"
  [default-timezone-id]
  (let [timezone-id (->timezone-id default-timezone-id)]
    (fn [s]
      (u.date/parse s timezone-id))))

(defn- format-in-timezone-fn
  "Create a formatter for converting a date to `tz` and in the format that the query processor would return"
  [results-timezone-id]
  (let [zone-id (-> results-timezone-id ->timezone-id t/zone-id)]
    (fn [t]
      (format-rows/format-value t zone-id))))

(defn- date-without-time-format-fn
  "sqlite returns dates that do not include their time, this formatter is useful for those DBs"
  [t]
  (condp instance? t
    LocalDate     (t/format :iso-local-date t)
    LocalDateTime (t/format :iso-local-date t)
    (t/format :iso-offset-date t)))

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
  "Creates a sad toucan result set by parsing literal strings with `parse-fn` and formatting then in results with
  `format-result-fn`."
  ([parse-fn format-result-fn]
   (sad-toucan-result parse-fn format-result-fn sad-toucan-dates))

  ([parse-fn format-result-fn temporal-literal-strs]
   (for [s temporal-literal-strs]
     [(-> s parse-fn format-result-fn) 1])))

(deftest group-by-default-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "\nPacific timezone"
      (is (= (cond
               ;; Timezone is omitted by these databases HACK - SQLite returns datetimes as strings, and we don't
               ;; re-parse them or do anything smart with them; we just return them directly. This is less than ideal.
               ;; TIMEZONE FIXME
               (= :sqlite driver/*driver*)
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

               ;; There's a bug here where we are reading in the UTC time as pacific, so we're 7 hours off
               ;; (This is fixed for Oracle now)
               (and (qp.test-util/tz-shifted-driver-bug? driver/*driver*) (not= driver/*driver* :oracle))
               [["2015-06-01T10:31:00-07:00" 1]
                ["2015-06-01T16:06:00-07:00" 1]
                ["2015-06-01T17:23:00-07:00" 1]
                ["2015-06-01T18:55:00-07:00" 1]
                ["2015-06-01T21:04:00-07:00" 1]
                ["2015-06-01T21:19:00-07:00" 1]
                ["2015-06-02T02:13:00-07:00" 1]
                ["2015-06-02T05:37:00-07:00" 1]
                ["2015-06-02T08:20:00-07:00" 1]
                ["2015-06-02T11:11:00-07:00" 1]]

               ;; When the reporting timezone is applied, the same datetime value is returned, but set in the pacific
               ;; timezone
               (qp.test-util/supports-report-timezone? driver/*driver*)
               [["2015-06-01T03:31:00-07:00" 1]
                ["2015-06-01T09:06:00-07:00" 1]
                ["2015-06-01T10:23:00-07:00" 1]
                ["2015-06-01T11:55:00-07:00" 1]
                ["2015-06-01T14:04:00-07:00" 1]
                ["2015-06-01T14:19:00-07:00" 1]
                ["2015-06-01T19:13:00-07:00" 1]
                ["2015-06-01T22:37:00-07:00" 1]
                ["2015-06-02T01:20:00-07:00" 1]
                ["2015-06-02T04:11:00-07:00" 1]]

               ;; Databases that don't support report timezone will always return the time using the JVM's timezone
               ;; setting Our tests force UTC time, so this should always be UTC
               :else
               [["2015-06-01T10:31:00Z" 1]
                ["2015-06-01T16:06:00Z" 1]
                ["2015-06-01T17:23:00Z" 1]
                ["2015-06-01T18:55:00Z" 1]
                ["2015-06-01T21:04:00Z" 1]
                ["2015-06-01T21:19:00Z" 1]
                ["2015-06-02T02:13:00Z" 1]
                ["2015-06-02T05:37:00Z" 1]
                ["2015-06-02T08:20:00Z" 1]
                ["2015-06-02T11:11:00Z" 1]])
             (sad-toucan-incidents-with-bucketing! :default :pacific))))))

(deftest group-by-default-test-2
  (mt/test-drivers (mt/normal-drivers)
    (testing "\nEastern timezone"
      (is (= (cond
               ;; These databases are always in UTC so aren't impacted by changes in report-timezone
               (= :sqlite driver/*driver*)
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

               (and (qp.test-util/tz-shifted-driver-bug? driver/*driver*) (not= driver/*driver* :oracle))
               [["2015-06-01T10:31:00-04:00" 1]
                ["2015-06-01T16:06:00-04:00" 1]
                ["2015-06-01T17:23:00-04:00" 1]
                ["2015-06-01T18:55:00-04:00" 1]
                ["2015-06-01T21:04:00-04:00" 1]
                ["2015-06-01T21:19:00-04:00" 1]
                ["2015-06-02T02:13:00-04:00" 1]
                ["2015-06-02T05:37:00-04:00" 1]
                ["2015-06-02T08:20:00-04:00" 1]
                ["2015-06-02T11:11:00-04:00" 1]]

               ;; The time instant is the same as UTC (or pacific) but should be offset by the eastern timezone
               (qp.test-util/supports-report-timezone? driver/*driver*)
               [["2015-06-01T06:31:00-04:00" 1]
                ["2015-06-01T12:06:00-04:00" 1]
                ["2015-06-01T13:23:00-04:00" 1]
                ["2015-06-01T14:55:00-04:00" 1]
                ["2015-06-01T17:04:00-04:00" 1]
                ["2015-06-01T17:19:00-04:00" 1]
                ["2015-06-01T22:13:00-04:00" 1]
                ["2015-06-02T01:37:00-04:00" 1]
                ["2015-06-02T04:20:00-04:00" 1]
                ["2015-06-02T07:11:00-04:00" 1]]

               ;; The change in report timezone has no affect on this group
               :else
               [["2015-06-01T10:31:00Z" 1]
                ["2015-06-01T16:06:00Z" 1]
                ["2015-06-01T17:23:00Z" 1]
                ["2015-06-01T18:55:00Z" 1]
                ["2015-06-01T21:04:00Z" 1]
                ["2015-06-01T21:19:00Z" 1]
                ["2015-06-02T02:13:00Z" 1]
                ["2015-06-02T05:37:00Z" 1]
                ["2015-06-02T08:20:00Z" 1]
                ["2015-06-02T11:11:00Z" 1]])
             (sad-toucan-incidents-with-bucketing! :default :eastern))))))

(deftest group-by-default-test-3
  ;; Changes the JVM timezone from UTC to Pacific, this test isn't run on H2 as the database stores it's timezones in
  ;; the JVM timezone (UTC on startup). When we change that timezone, it then assumes the data was also stored in that
  ;; timezone. This leads to incorrect results. In this example it applies the pacific offset twice
  ;;
  ;; The exclusions here are databases that give incorrect answers when the JVM timezone doesn't match the databases
  ;; timezone
  ;;
  ;; TIMEZONE FIXME
  (mt/test-drivers (mt/normal-drivers-with-feature :test/jvm-timezone-setting)
    (testing "Change JVM timezone from UTC to Pacific"
      (is (= (cond
               (= :sqlite driver/*driver*)
               (sad-toucan-result (default-timezone-parse-fn :utc) (comp u.date/format-sql t/local-date-time))

               (and (qp.test-util/tz-shifted-driver-bug? driver/*driver*) (not= driver/*driver* :oracle))
               (sad-toucan-result (default-timezone-parse-fn :eastern) (format-in-timezone-fn :eastern))

               ;; The JVM timezone should have no impact on results from a database that uses a report timezone
               (qp.test-util/supports-report-timezone? driver/*driver*)
               (sad-toucan-result (default-timezone-parse-fn :utc) (format-in-timezone-fn :eastern))

               :else
               (sad-toucan-result (default-timezone-parse-fn :utc) (format-in-timezone-fn :pacific)))
             (mt/with-system-timezone-id! (timezone :pacific)
               (sad-toucan-incidents-with-bucketing! :default :eastern)))))))

(deftest group-by-minute-test
  (testing "This dataset doesn't have multiple events in a minute, the results are the same as the default grouping"
    (mt/test-drivers (mt/normal-drivers)
      (is (= (cond
               (= :sqlite driver/*driver*)
               (sad-toucan-result (default-timezone-parse-fn :utc) (comp u.date/format-sql t/local-date-time))

               (qp.test-util/tz-shifted-driver-bug? driver/*driver*)
               (sad-toucan-result (default-timezone-parse-fn :pacific) (format-in-timezone-fn :pacific))

               (qp.test-util/supports-report-timezone? driver/*driver*)
               (sad-toucan-result (default-timezone-parse-fn :utc) (format-in-timezone-fn :pacific))

               :else
               (sad-toucan-result (default-timezone-parse-fn :utc) (format-in-timezone-fn :utc)))
             (sad-toucan-incidents-with-bucketing! :minute :pacific))))))

(deftest group-by-minute-of-hour-test
  (testing "Grouping by minute of hour is not affected by timezones"
    (mt/test-drivers (mt/normal-drivers)
      (is (= [[0 5]
              [1 4]
              [2 2]
              [3 4]
              [4 4]
              [5 3]
              [6 5]
              [7 1]
              [8 1]
              [9 1]]
             (sad-toucan-incidents-with-bucketing! :minute-of-hour :pacific))))))

(def ^:private sad-toucan-dates-grouped-by-hour
  "This is the first 10 groupings of sad toucan dates at the same hour when converted from millis since epoch in the UTC
  timezone. The timezone is left off of the timezone string so that we can emulate how certain conversions are broken
  in the code today. As an example, the UTC dates in Oracle are interpreted as the reporting timezone when they're
  UTC"
  ["2015-06-01T10:00:00"
   "2015-06-01T16:00:00"
   "2015-06-01T17:00:00"
   "2015-06-01T18:00:00"
   "2015-06-01T21:00:00"
   "2015-06-02T02:00:00"
   "2015-06-02T05:00:00"
   "2015-06-02T08:00:00"
   "2015-06-02T11:00:00"
   "2015-06-02T13:00:00"])

(defn- results-by-hour [parse-fn format-result-fn]
  (map
   (fn [s cnt]
     [(-> s parse-fn format-result-fn) cnt])
   sad-toucan-dates-grouped-by-hour
   [1 1 1 1 2 1 1 1 1 1]))

;; For this test, the results are the same for each database, but the formatting of the time for that given count is
;; different depending on whether the database supports a report timezone and what timezone that database is in
(deftest group-by-hour-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= (cond
             (= :sqlite driver/*driver*)
             (results-by-hour (default-timezone-parse-fn :utc) (comp u.date/format-sql t/local-date-time))

             (qp.test-util/tz-shifted-driver-bug? driver/*driver*)
             (results-by-hour (default-timezone-parse-fn :pacific) (format-in-timezone-fn :pacific))

             (qp.test-util/supports-report-timezone? driver/*driver*)
             (results-by-hour (default-timezone-parse-fn :utc) (format-in-timezone-fn :pacific))

             :else
             (results-by-hour (default-timezone-parse-fn :utc) (format-in-timezone-fn :utc)))
           (sad-toucan-incidents-with-bucketing! :hour :pacific)))))

;; The counts are affected by timezone as the times are shifted back by 7 hours. These count changes can be validated
;; by matching the first three results of the pacific results to the last three of the UTC results (i.e. pacific is 7
;; hours back of UTC at that time)
(deftest group-by-hour-of-day-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "results in pacific timezone"
      (is (= (if (and (not (qp.test-util/tz-shifted-driver-bug? driver/*driver*))
                      (qp.test-util/supports-report-timezone? driver/*driver*))
               [[0 8]  [1 9] [2 7] [3 10] [4 10] [5 9]  [6 6]  [7 5] [8 7] [9 7]]
               [[0 13] [1 8] [2 4] [3 7]  [4 5]  [5 13] [6 10] [7 8] [8 9] [9 7]])
             (sad-toucan-incidents-with-bucketing! :hour-of-day :pacific))))
    (testing "results in UTC"
      (is (= [[0 13] [1 8] [2 4] [3 7] [4 5] [5 13] [6 10] [7 8] [8 9] [9 7]]
             (sad-toucan-incidents-with-bucketing! :hour-of-day :utc))
          "With all databases in UTC, the results should be the same for all DBs"))))

(defn- find-events-in-range
  "Find the number of sad toucan events between `start-date-str` and `end-date-str`"
  [start-date-str end-date-str]
  (-> (mt/dataset sad-toucan-incidents
        (mt/run-mbql-query incidents
          {:aggregation [[:count]]
           :breakout    [!day.timestamp]
           :filter      [:between !default.timestamp start-date-str end-date-str]}))
      mt/rows
      first
      second
      (or 0)))

;; This test uses H2 (in UTC) to determine the difference in number of events in UTC time vs pacific time. It does
;; this using a the UTC dataset and some math to figure out if our 24 hour window is shifted 7 hours back, how many
;; events to we gain and lose. Although this test is technically covered by the other grouping by day tests, it's
;; useful for debugging to answer why row counts change when the timezone shifts by removing timezones and the related
;; database settings
(deftest new-events-after-timezone-shift-test
  (driver/with-driver :h2
    (doseq [[timezone-id expected-net-gains] {:pacific [2 -1 5 -5 2 0 -2 1 -1 1]
                                              :eastern [1 -1 3 -3 3 -2 -1 0 1 1]}]
      (testing (format "Timezone = %s" timezone-id)
        (doseq [[i expected-net-gain] (map-indexed vector expected-net-gains)
                :let                  [start                (t/local-date 2015 6 (inc i))
                                       end                  (t/plus start (t/days 1))
                                       ->tz                 #(t/zoned-date-time % (t/local-time 0) (t/zone-id (->timezone-id timezone-id)))
                                       find-events-in-range (fn [x y]
                                                              (find-events-in-range (u.date/format x) (u.date/format y)))
                                       num-events-gained    (find-events-in-range end (->tz end))
                                       num-events-lost      (find-events-in-range start (->tz start))]]
          (testing (format "events between %s and %s" start end)
            (is (= expected-net-gain
                   (- num-events-gained num-events-lost))
                (format "When shifting to %s timezone we should lose %d events and gain %d, for a net gain of %d"
                        timezone-id num-events-gained num-events-lost expected-net-gain))))))))

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

(defn- results-by-day [parse-fn format-result-fn counts]
  (map
   (fn [s cnt]
     [(-> s parse-fn format-result-fn) cnt])
   sad-toucan-events-grouped-by-day
   counts))

(deftest group-by-day-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "\nUTC timezone"
      (is (= (if (= :sqlite driver/*driver*)
               (results-by-day u.date/parse date-without-time-format-fn  [6 10 4 9 9 8 8 9 7 9])
               (results-by-day u.date/parse (format-in-timezone-fn :utc) [6 10 4 9 9 8 8 9 7 9]))
             (sad-toucan-incidents-with-bucketing! :day :utc))))
    (testing "\nPacific timezone"
      (is (= (cond
               (= :sqlite driver/*driver*)
               [["2015-06-01" 6]
                ["2015-06-02" 10]
                ["2015-06-03" 4]
                ["2015-06-04" 9]
                ["2015-06-05" 9]
                ["2015-06-06" 8]
                ["2015-06-07" 8]
                ["2015-06-08" 9]
                ["2015-06-09" 7]
                ["2015-06-10" 9]]

               (qp.test-util/tz-shifted-driver-bug? driver/*driver*)
               [["2015-06-01T00:00:00-07:00" 6]
                ["2015-06-02T00:00:00-07:00" 10]
                ["2015-06-03T00:00:00-07:00" 4]
                ["2015-06-04T00:00:00-07:00" 9]
                ["2015-06-05T00:00:00-07:00" 9]
                ["2015-06-06T00:00:00-07:00" 8]
                ["2015-06-07T00:00:00-07:00" 8]
                ["2015-06-08T00:00:00-07:00" 9]
                ["2015-06-09T00:00:00-07:00" 7]
                ["2015-06-10T00:00:00-07:00" 9]]

               (qp.test-util/supports-report-timezone? driver/*driver*)
               [["2015-06-01T00:00:00-07:00" 8]
                ["2015-06-02T00:00:00-07:00" 9]
                ["2015-06-03T00:00:00-07:00" 9]
                ["2015-06-04T00:00:00-07:00" 4]
                ["2015-06-05T00:00:00-07:00" 11]
                ["2015-06-06T00:00:00-07:00" 8]
                ["2015-06-07T00:00:00-07:00" 6]
                ["2015-06-08T00:00:00-07:00" 10]
                ["2015-06-09T00:00:00-07:00" 6]
                ["2015-06-10T00:00:00-07:00" 10]]

               :else
               [["2015-06-01T00:00:00Z" 6]
                ["2015-06-02T00:00:00Z" 10]
                ["2015-06-03T00:00:00Z" 4]
                ["2015-06-04T00:00:00Z" 9]
                ["2015-06-05T00:00:00Z" 9]
                ["2015-06-06T00:00:00Z" 8]
                ["2015-06-07T00:00:00Z" 8]
                ["2015-06-08T00:00:00Z" 9]
                ["2015-06-09T00:00:00Z" 7]
                ["2015-06-10T00:00:00Z" 9]])
             (sad-toucan-incidents-with-bucketing! :day :pacific))))
    (testing "\nEastern timezone"
      (is (= (cond
               (= :sqlite driver/*driver*)
               (results-by-day u.date/parse date-without-time-format-fn [6 10 4 9 9 8 8 9 7 9])

               (qp.test-util/tz-shifted-driver-bug? driver/*driver*)
               (results-by-day (default-timezone-parse-fn :eastern)
                               (format-in-timezone-fn :eastern)
                               [6 10 4 9 9 8 8 9 7 9])

               (qp.test-util/supports-report-timezone? driver/*driver*)
               (results-by-day (default-timezone-parse-fn :eastern)
                               (format-in-timezone-fn :eastern)
                               [7 9 7 6 12 6 7 9 8 10])

               :else
               (results-by-day u.date/parse
                               (format-in-timezone-fn :utc)
                               [6 10 4 9 9 8 8 9 7 9]))
             (sad-toucan-incidents-with-bucketing! :day :eastern)))))
  (testing "\nWith JVM timezone set to Pacific time"
    ;; This tests out the JVM timezone's impact on the results. For databases supporting a report timezone, this should
    ;; have no affect on the results. When no report timezone is used it should convert dates to the JVM's timezone
    ;;
    ;; H2 doesn't support us switching timezones after the dates have been stored. This causes H2 to (incorrectly) apply
    ;; the timezone shift twice, so instead of -07:00 it will become -14:00. Leaving out the test rather than validate
    ;; wrong results.
    ;;
    ;; The exclusions here are databases that give incorrect answers when the JVM timezone doesn't match the databases
    ;; timezone
    ;;
    ;; TIMEZONE FIXME
    (mt/test-drivers (mt/normal-drivers-with-feature :test/jvm-timezone-setting)
      (is (= (cond
               (= :sqlite driver/*driver*)
               (results-by-day u.date/parse date-without-time-format-fn [6 10 4 9 9 8 8 9 7 9])

               (qp.test-util/tz-shifted-driver-bug? driver/*driver*)
               (results-by-day (default-timezone-parse-fn :pacific)
                               (format-in-timezone-fn :pacific)
                               [6 10 4 9 9 8 8 9 7 9])

               (qp.test-util/supports-report-timezone? driver/*driver*)
               (results-by-day (default-timezone-parse-fn :pacific)
                               (format-in-timezone-fn :pacific)
                               [8 9 9 4 11 8 6 10 6 10])

               :else
               (results-by-day (default-timezone-parse-fn :utc)
                               (format-in-timezone-fn :pacific)
                               [6 10 4 9 9 8 8 9 7 9]))
             (mt/with-system-timezone-id! (timezone :pacific)
               (sad-toucan-incidents-with-bucketing! :day :pacific)))))))

(deftest group-by-day-of-week-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "\nPacific timezone"
      (is (= (if (and (not (qp.test-util/tz-shifted-driver-bug? driver/*driver*))
                      (qp.test-util/supports-report-timezone? driver/*driver*))
               [[1 29] [2 36] [3 33] [4 29] [5 13] [6 38] [7 22]]
               [[1 28] [2 38] [3 29] [4 27] [5 24] [6 30] [7 24]])
             (sad-toucan-incidents-with-bucketing! :day-of-week :pacific))))
    (testing "\nUTC timezone"
      (is (= [[1 28] [2 38] [3 29] [4 27] [5 24] [6 30] [7 24]]
             (sad-toucan-incidents-with-bucketing! :day-of-week :utc))))))

(deftest group-by-day-of-month-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "\nPacific timezone"
      (is (= (if (and (not (qp.test-util/tz-shifted-driver-bug? driver/*driver*))
                      (qp.test-util/supports-report-timezone? driver/*driver*))
               [[1 8] [2 9] [3 9] [4 4] [5 11] [6 8] [7 6] [8 10] [9 6] [10 10]]
               [[1 6] [2 10] [3 4] [4 9] [5  9] [6 8] [7 8] [8  9] [9 7] [10  9]])
             (sad-toucan-incidents-with-bucketing! :day-of-month :pacific))))
    (testing "\nUTC timezone"
      (is (= [[1 6] [2 10] [3 4] [4 9] [5  9] [6 8] [7 8] [8  9] [9 7] [10  9]]
             (sad-toucan-incidents-with-bucketing! :day-of-month :utc))))))

(deftest group-by-day-of-year-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "\nPacific timezone"
      (is (= (if (and (not (qp.test-util/tz-shifted-driver-bug? driver/*driver*))
                      (qp.test-util/supports-report-timezone? driver/*driver*))
               [[152 8] [153 9]  [154 9] [155 4] [156 11] [157 8]  [158 6] [159 10] [160 6] [161 10]]
               [[152 6] [153 10] [154 4] [155 9] [156  9] [157  8] [158 8] [159  9] [160 7] [161  9]])
             (sad-toucan-incidents-with-bucketing! :day-of-year :pacific))))
    (testing "\nUTC timezone"
      (is (= [[152 6] [153 10] [154 4] [155 9] [156  9] [157  8] [158 8] [159  9] [160 7] [161  9]]
             (sad-toucan-incidents-with-bucketing! :day-of-year :utc))))))

;; This test helps in debugging why event counts change with a given timezone. It queries only a UTC H2 datatabase to
;; find how those counts would change if time was in pacific time. The results of this test are also in the UTC test
;; above and pacific test below, but this is still useful for debugging as it doesn't involve changing timezones or
;; database settings
(deftest new-weekly-events-after-tz-shift-test
  (driver/with-driver :h2
    (doseq [[timezone-id start-date->expected-net-gain] {:pacific {"2015-05-31" 3
                                                                   "2015-06-07" 0
                                                                   "2015-06-14" -1
                                                                   "2015-06-21" -2
                                                                   "2015-06-28" 0}
                                                         :eastern {"2015-05-31" 1
                                                                   "2015-06-07" 1
                                                                   "2015-06-14" -1
                                                                   "2015-06-21" -1
                                                                   "2015-06-28" 0}}]
      (testing (format "Timezone = %s" timezone-id)
        (doseq [[start-str expected-net-gain] start-date->expected-net-gain
                :let                          [start                (u.date/parse start-str)
                                               end                  (t/plus start (t/days 7))
                                               ->tz                 #(t/zoned-date-time % (t/local-time 0) (t/zone-id (->timezone-id timezone-id)))
                                               find-events-in-range (fn [x y]
                                                                      (find-events-in-range (u.date/format x) (u.date/format y)))
                                               num-events-gained    (find-events-in-range end (->tz end))
                                               num-events-lost      (find-events-in-range start (->tz start))]]
          (testing (format "events between %s and %s" start end)
            (is (= expected-net-gain
                   (- num-events-gained num-events-lost))
                (format "When shifting to %s timezone we should lose %d events and gain %d, for a net gain of %d"
                        timezone-id num-events-gained num-events-lost expected-net-gain))))))))

(defn- results-by-week [parse-fn format-result-fn counts]
  (map
   (fn [s cnt]
     [(-> s parse-fn format-result-fn) cnt])
   ["2015-05-31"
    "2015-06-07"
    "2015-06-14"
    "2015-06-21"
    "2015-06-28"]
   counts))

;; Sad toucan incidents by week. Databases in UTC that don't support report timezones will be the same as the UTC test
;; above. Databases that support report timezone will have different counts as the week starts and ends 7 hours
;; earlier
(deftest group-by-week-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "\nUTC timezone"
      (is (= (if (= :sqlite driver/*driver*)
               (results-by-week u.date/parse
                                date-without-time-format-fn
                                [46 47 40 60 7])
               (results-by-week u.date/parse
                                (format-in-timezone-fn :utc)
                                [46 47 40 60 7]))
             (sad-toucan-incidents-with-bucketing! :week :utc))))
    (testing "\nPacific timezone"
      (is (= (cond
               (= :sqlite driver/*driver*)
               (results-by-week u.date/parse
                                date-without-time-format-fn
                                [46 47 40 60 7])

               (qp.test-util/tz-shifted-driver-bug? driver/*driver*)
               (results-by-week (default-timezone-parse-fn :pacific)
                                (format-in-timezone-fn :pacific)
                                [46 47 40 60 7])

               (qp.test-util/supports-report-timezone? driver/*driver*)
               (results-by-week (default-timezone-parse-fn :pacific)
                                (format-in-timezone-fn :pacific)
                                [49 47 39 58 7])

               :else
               (results-by-week u.date/parse
                                (format-in-timezone-fn :utc)
                                [46 47 40 60 7]))

             (sad-toucan-incidents-with-bucketing! :week :pacific))))
    ;; Tests eastern timezone grouping by week, UTC databases don't change, databases with reporting timezones need to
    ;; account for the 4-5 hour difference
    (testing "\nEastern timezone"
      (mt/test-drivers (mt/normal-drivers)
        (is (= (cond
                 (= :sqlite driver/*driver*)
                 (results-by-week u.date/parse
                                  date-without-time-format-fn
                                  [46 47 40 60 7])

                 (qp.test-util/tz-shifted-driver-bug? driver/*driver*)
                 (results-by-week (default-timezone-parse-fn :eastern)
                                  (format-in-timezone-fn :eastern)
                                  [46 47 40 60 7])

                 (qp.test-util/supports-report-timezone? driver/*driver*)
                 (results-by-week (default-timezone-parse-fn :eastern)
                                  (format-in-timezone-fn :eastern)
                                  [47 48 39 59 7])

                 :else
                 (results-by-week u.date/parse
                                  (format-in-timezone-fn :utc)
                                  [46 47 40 60 7]))

               (sad-toucan-incidents-with-bucketing! :week :eastern))))))
  ;; Setting database timezone id will change how the datetime results are displayed, unless report timezone is set.
  ;; If so, the report timezone takes precedence and result values are formatted according to that. Overriding
  ;; database timezone id has no impact on beginning/end of week during calculation.
  ;;
  ;; The exclusions here are databases that give incorrect answers when the JVM timezone doesn't match the databases
  ;; timezone (TIMEZONE FIXME)
  (testing "Database timezone override set to Pacific"
    (mt/test-drivers (mt/normal-drivers-except #{:sparksql})
      (is (= (cond
               (= :sqlite driver/*driver*)
               (results-by-week u.date/parse
                                date-without-time-format-fn
                                [46 47 40 60 7])

               ;; TODO - these results are the same as the `:else` results
               (qp.test-util/tz-shifted-driver-bug? driver/*driver*)
               (results-by-week (default-timezone-parse-fn :pacific)
                                (format-in-timezone-fn :pacific)
                                [46 47 40 60 7])

               (qp.test-util/supports-report-timezone? driver/*driver*)
               (results-by-week (default-timezone-parse-fn :pacific)
                                (format-in-timezone-fn :pacific)
                                [49 47 39 58 7])

               :else
               (results-by-week u.date/parse
                                (format-in-timezone-fn :pacific)
                                [46 47 40 60 7]))
             (mt/with-database-timezone-id (timezone :pacific)
               (sad-toucan-incidents-with-bucketing! :week :pacific)))))))

(deftest group-by-week-of-year-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= [[22 46] [23 47] [24 40] [25 60] [26 7]]
           (sad-toucan-incidents-with-bucketing! :week-of-year :utc)))))


(defn- fmt-str-or-int
  [x]
  (if (string? x)
    (str x)
    (int x)))

(deftest week-of-year-and-week-count-should-be-consistent-test
  (testing "consistent break out between weeks and week-of-year #4910"
    (mt/test-drivers (mt/normal-drivers)
      ;; 2019-01-01 is Tuesday, so set start-of-week to tuesday so
      ;; breakout by week-of-year will have first row is the 1st week of year
      (mt/with-temporary-setting-values [start-of-week :tuesday]
        (mt/dataset test-data
          (letfn [(test-break-out [unit]
                    (->> (mt/mbql-query orders
                           {:filter      [:between $created_at "2019-01-01" "2019-12-31"]
                            :breakout    [:field $created_at {:temporal-unit unit}]
                            :aggregation [[:count]]})
                         mt/process-query
                         (mt/formatted-rows [fmt-str-or-int int])))]
            (testing "count result should be the same between week and week-of-year"
              (is (= (map second (test-break-out :week))
                     (map second (test-break-out :week-of-year))))
              (is (= [127 124 136]
                     (->> (test-break-out :week)
                          (map second)
                          (take 3)))))
            (testing "make sure all drivers returns the same week column"
              (is (= (case driver/*driver*
                       :sqlite ["2019-01-01 00:00:00" "2019-01-08 00:00:00" "2019-01-15 00:00:00"]
                       ["2019-01-01T00:00:00Z" "2019-01-08T00:00:00Z" "2019-01-15T00:00:00Z"])
                     (->> (test-break-out :week)
                          (map first)
                          (take 3)))))
            (testing "make sure all drivers returns the same week-of-year column"
              (is (= [1 2 3]
                     (->> (test-break-out :week-of-year)
                          (map first)
                          (take 3)))))))))))

;; All of the sad toucan events in the test data fit in June. The results are the same on all databases and the only
;; difference is how the beginning of hte month is represented, since we always return times with our dates
(deftest group-by-month-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "\nPacific timezone"
      (is (= [[(cond
                 (= :sqlite driver/*driver*)
                 "2015-06-01"

                 (qp.test-util/supports-report-timezone? driver/*driver*)
                 "2015-06-01T00:00:00-07:00"

                 :else
                 "2015-06-01T00:00:00Z")
               200]]
             (sad-toucan-incidents-with-bucketing! :month :pacific))))
    (testing "\nEastern timezone"
      (mt/test-drivers (mt/normal-drivers)
        (is (= [[(cond
                   (= :sqlite driver/*driver*)
                   "2015-06-01"

                   (qp.test-util/supports-report-timezone? driver/*driver*)
                   "2015-06-01T00:00:00-04:00"

                   :else
                   "2015-06-01T00:00:00Z")
                 200]]
               (sad-toucan-incidents-with-bucketing! :month :eastern)))))))

(deftest group-by-month-of-year-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= [[6 200]]
           (sad-toucan-incidents-with-bucketing! :month-of-year :pacific)))))

(deftest group-by-quarter-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "\nPacific timezone"
      (is (= [[(cond (= :sqlite driver/*driver*)
                     "2015-04-01"

                     (qp.test-util/supports-report-timezone? driver/*driver*)
                     "2015-04-01T00:00:00-07:00"

                     :else
                     "2015-04-01T00:00:00Z")
               200]]
             (sad-toucan-incidents-with-bucketing! :quarter :pacific))))
    (testing "\nEastern timezone"
      (is (= [[(cond (= :sqlite driver/*driver*)
                     "2015-04-01"

                     (qp.test-util/supports-report-timezone? driver/*driver*)
                     "2015-04-01T00:00:00-04:00"

                     :else
                     "2015-04-01T00:00:00Z")
               200]]
             (sad-toucan-incidents-with-bucketing! :quarter :eastern))))))

(deftest group-by-quarter-of-year-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= [[2 200]]
           (sad-toucan-incidents-with-bucketing! :quarter-of-year :pacific)))

    (is (= [[1 200]
            [2 284]
            [3 278]
            [4 238]]
           (mt/formatted-rows [int int]
             (mt/run-mbql-query checkins
               {:aggregation [[:count]]
                :breakout    [!quarter-of-year.date]}))))))

(deftest group-by-year-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= [[(cond
               (= :sqlite driver/*driver*)
               "2015-01-01"

               (qp.test-util/supports-report-timezone? driver/*driver*)
               "2015-01-01T00:00:00-08:00"
               :else
               "2015-01-01T00:00:00Z")
             200]]
           (sad-toucan-incidents-with-bucketing! :year :pacific)))

    (is (= (if (= :sqlite driver/*driver*)
             [["2013-01-01" 235]
              ["2014-01-01" 498]
              ["2015-01-01" 267]]
             [["2013-01-01T00:00:00Z" 235]
              ["2014-01-01T00:00:00Z" 498]
              ["2015-01-01T00:00:00Z" 267]])
           (mt/formatted-rows [str int]
             (mt/run-mbql-query checkins
               {:aggregation [[:count]]
                :breakout    [!year.date]}))))))

;; RELATIVE DATES
(p.types/deftype+ ^:private TimestampDatasetDef [intervalSeconds intervalCount]
  pretty/PrettyPrintable
  (pretty [_]
    (list 'TimestampDatasetDef. intervalSeconds intervalCount)))

(defn- driver->current-datetime-base-type
  "Returns the :base-type of the \"current timestamp\" HoneySQL form defined by the driver `d`. Relies upon the driver
  implementation having set that explicitly via `hx/with-type-info`. Returns `nil` if it can't be determined."
  [d]
  (when (isa? driver/hierarchy driver/*driver* :sql)
    (let [db-type (h2x/database-type (sql.qp/current-datetime-honeysql-form d))]
      (when-not (str/blank? db-type)
        (sql-jdbc.sync/database-type->base-type d db-type)))))

(defmethod mt/get-dataset-definition TimestampDatasetDef
  [^TimestampDatasetDef this]
  (let [interval-seconds (.intervalSeconds this)
        intervalCount    (.intervalCount this)]
    (mt/dataset-definition
     (str "interval_" interval-seconds (when-not (= 30 intervalCount) (str "_" intervalCount)))
     ["checkins"
      [{:field-name "timestamp"
        :base-type  (or (driver->current-datetime-base-type driver/*driver*) :type/DateTime)}]
      (mapv (fn [i]
              ;; TIMESTAMP FIXME — not sure if still needed
              ;;
              ;; Create timestamps using relative dates (e.g. `DATEADD(second, -195, GETUTCDATE())` instead of
              ;; generating Java classes here so they'll be in the DB's native timezone. Some DBs refuse to use
              ;; the same timezone we're running the tests from *cough* SQL Server *cough*
              [(u/prog1 (if (and (isa? driver/hierarchy driver/*driver* :sql)
                                 ;; BigQuery/Vertica don't insert rows using SQL statements
                                 ;;
                                 ;; TODO -- make 'insert-rows-using-statements?` a multimethod so we don't need to
                                 ;; hardcode the whitelist here.
                                 (not (#{:vertica :bigquery-cloud-sdk} driver/*driver*)))
                          (sql.qp/compiled
                           (sql.qp/add-interval-honeysql-form driver/*driver*
                                                              (sql.qp/current-datetime-honeysql-form driver/*driver*)
                                                              (* i interval-seconds)
                                                              :second))
                          (u.date/add :second (* i interval-seconds)))
                        (assert <>))])
            (let [shift (quot intervalCount 2)
                  lower-bound (- shift)
                  upper-bound (- intervalCount shift)]
              (range lower-bound upper-bound)))])))

(defn- dataset-def-with-timestamps
  ([interval-seconds]
   (dataset-def-with-timestamps interval-seconds 30))
  ([interval-seconds interval-count]
   (TimestampDatasetDef. interval-seconds interval-count)))

(def ^:private checkins:4-per-minute
  "Dynamically generated dataset with 30 checkins spaced 15 seconds apart, from 3 mins 45 seconds ago to 3 minutes 30
  seconds in the future."
  (dataset-def-with-timestamps 15))

(def ^:private checkins:4-per-hour
  "Dynamically generated dataset with 30 checkins spaced 15 minutes apart, from 3 hours 45 minutes ago to 3 hours 30
  minutes in the future."
  (dataset-def-with-timestamps (u/minutes->seconds 15)))

(def ^:private checkins:1-per-day
  "Dynamically generated dataset with 30 checkins spaced 24 hours apart, from 15 days ago to 14 days in the future."
  (dataset-def-with-timestamps (* 24 (u/minutes->seconds 60))))

(def ^:private checkins:1-per-day:60
  "Dynamically generated dataset with 60 checkins spaced 24 hours apart, from 30 days ago to 29 days in the future."
  (dataset-def-with-timestamps (* 24 (u/minutes->seconds 60)) 60))

(defn- checkins-db-is-old?
  "Determine whether we need to recreate one of the dynamically-generated datasets above, if the data has grown a little
  stale."
  [max-age-seconds]
  (u.date/greater-than-period-duration? (u.date/period-duration (:created_at (mt/db)) (t/zoned-date-time))
                                        (t/seconds max-age-seconds)))

(def ^:private ^:dynamic *recreate-db-if-stale?* true)

(defn- count-of-grouping [^TimestampDatasetDef dataset field-grouping & relative-datetime-args]
  (mt/dataset dataset
    ;; DB has values in the range of now() - (interval-seconds * 15) and now() + (interval-seconds * 15). So if it
    ;; was created more than (interval-seconds * 5) seconds ago, delete the Database and recreate it to make sure
    ;; the tests pass.
    ;;
    ;; TODO - perhaps this should be rolled into `mt/dataset` itself -- it seems like a useful feature?
    (if (and (checkins-db-is-old? (* (.intervalSeconds dataset) 5)) *recreate-db-if-stale?*)
      (binding [*recreate-db-if-stale?* false]
        (log/infof "DB for %s is stale! Deleteing and running test again\n" dataset)
        (t2/delete! Database :id (mt/id))
        (apply count-of-grouping dataset field-grouping relative-datetime-args))
      (let [results (mt/run-mbql-query checkins
                      {:aggregation [[:count]]
                       :filter      [:=
                                     [:field %timestamp {:temporal-unit field-grouping}]
                                     (cons :relative-datetime relative-datetime-args)]})]
        (or (some-> results mt/first-row first int)
            results)))))

;; HACK - Don't run these tests against Snowflake/etc. because the databases need to be loaded every time the tests are
;;        ran and loading data into these DBs is mind-bogglingly slow. This also applies to Athena for now, because
;;        deleting data is not easy.
;;
;; Don't run the minute tests against Oracle because the Oracle tests are kind of slow and case CI to fail randomly
;; when it takes so long to load the data that the times are no longer current (these tests pass locally if your
;; machine isn't as slow as the CircleCI ones)
(deftest ^:parallel count-of-grouping-test
  (mt/test-drivers (mt/normal-drivers-except #{:athena})
    (testing "4 checkins per minute dataset"
      (testing "group by minute"
        (doseq [args [[:current] [-1 :minute] [1 :minute]]]
          (is (= 4
                 (apply count-of-grouping checkins:4-per-minute :minute args))
              (format "filter by minute = %s" (into [:relative-datetime] args))))))))

(deftest ^:parallel count-of-grouping-test-2
  (mt/test-drivers (mt/normal-drivers-except #{:athena})
    (testing "4 checkins per hour dataset"
      (testing "group by hour"
        (doseq [args [[:current] [-1 :hour] [1 :hour]]]
          (is (= 4
                 (apply count-of-grouping checkins:4-per-hour :hour args))
              (format "filter by hour = %s" (into [:relative-datetime] args))))))))

(deftest ^:parallel count-of-grouping-test-3
  (mt/test-drivers (mt/normal-drivers-except #{:athena})
    (testing "1 checkin per day dataset"
      (testing "group by day"
        (doseq [args [[:current] [-1 :day] [1 :day]]]
          (is (= 1
                 (apply count-of-grouping checkins:1-per-day :day args))
              (format "filter by day = %s" (into [:relative-datetime] args))))))))

(deftest ^:parallel count-of-grouping-test-4
  (mt/test-drivers (mt/normal-drivers-except #{:athena})
    (testing "1 checkin per day dataset"
      (testing "group by week"
        (is (= 7
               (count-of-grouping checkins:1-per-day :week :current))
            "filter by week = [:relative-datetime :current]")))))

(deftest ^:parallel time-interval-test
  (mt/test-drivers (mt/normal-drivers-except #{:athena})
    (testing "Syntactic sugar (`:time-interval` clause)"
      (mt/dataset checkins:1-per-day
        (is (= 1
               (ffirst
                (mt/formatted-rows [int]
                  (mt/run-mbql-query checkins
                    {:aggregation [[:count]]
                     :filter      [:time-interval $timestamp :current :day]})))))))))

(deftest ^:parallel time-interval-test-2
  (mt/test-drivers (mt/normal-drivers-except #{:athena})
    (testing "Syntactic sugar (`:time-interval` clause)"
      (mt/dataset checkins:1-per-day
        (is (= 7
               (ffirst
                (mt/formatted-rows [int]
                  (mt/run-mbql-query checkins
                    {:aggregation [[:count]]
                     :filter      [:time-interval $timestamp :last :week]})))))))))

(deftest ^:parallel time-interval-expression-test
  (mt/test-drivers (mt/normal-drivers-except #{:athena})
    (mt/dataset checkins:1-per-day
      (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
            orders (lib.metadata/table metadata-provider (mt/id :checkins))
            query (lib/query metadata-provider orders)
            timestamp-col (m/find-first (comp #{(mt/id :checkins :timestamp)} :id) (lib/visible-columns query))
            query (-> query
                      (lib/expression "Date" timestamp-col)
                      (lib/filter (lib/time-interval timestamp-col :current :week))
                      (as-> $q (lib/filter $q (lib/time-interval
                                                (m/find-first (comp #{"Date"} :name) (lib/visible-columns $q))
                                                :current :week))))]
        (is (= 7
               (count (mt/rows (qp/process-query query)))))))))

(deftest ^:parallel relative-time-interval-test
  (mt/test-drivers
   (disj (mt/normal-drivers-with-feature :date-arithmetics) :athena)
   ;; Following verifies #45942 is solved. Changing the offset ensures that intervals do not overlap.
   (testing "Syntactic sugar (`:relative-time-interval` clause) (#45942)"
     (mt/dataset checkins:1-per-day:60
      (is (= 7
             (ffirst
              (mt/formatted-rows
               [int]
               (mt/run-mbql-query
                checkins
                {:aggregation [[:count]]
                 :filter      [:relative-time-interval $timestamp -1 :week -1 :week]})))
             (ffirst
              (mt/formatted-rows
               [int]
               (mt/run-mbql-query
                checkins
                {:aggregation [[:count]]
                 :filter      [:relative-time-interval $timestamp -1 :week 0 :week]})))))))))

;; Make sure that when referencing the same field multiple times with different units we return the one that actually
;; reflects the units the results are in. eg when we breakout by one unit and filter by another, make sure the results
;; and the col info use the unit used by breakout
(defn- date-bucketing-unit-when-you [& {:keys [breakout-by filter-by with-interval]
                                        :or   {with-interval :current}}]
  (let [results (mt/dataset checkins:1-per-day
                  (mt/run-mbql-query checkins
                    {:aggregation [[:count]]
                     :breakout    [[:field %timestamp {:temporal-unit breakout-by}]]
                     :filter      [:time-interval $timestamp with-interval filter-by]}))]
    {:rows (or (-> results :row_count)
               (throw (ex-info "Query failed!" results)))
     :unit (-> results :data :cols first :unit)}))

(deftest ^:parallel date-bucketing-when-you-test
  (mt/test-drivers (mt/normal-drivers-except #{:athena})
    (is (= {:rows 1, :unit :day}
           (date-bucketing-unit-when-you :breakout-by "day", :filter-by "day")))
    (is (= {:rows 7, :unit :day}
           (date-bucketing-unit-when-you :breakout-by "day", :filter-by "week")))
    (is (= {:rows 1, :unit :week}
           (date-bucketing-unit-when-you :breakout-by "week", :filter-by "day")))
    (is (= {:rows 1, :unit :quarter}
           (date-bucketing-unit-when-you :breakout-by "quarter", :filter-by "day")))
    (is (= {:rows 1, :unit :hour}
           (date-bucketing-unit-when-you :breakout-by "hour", :filter-by "day")))
    ;; make sure if you use a relative date bucket in the past (e.g. "past 2 months") you get the correct amount of rows
    ;; (#3910)
    (is (= {:rows 2, :unit :day}
           (date-bucketing-unit-when-you :breakout-by "day", :filter-by "day", :with-interval -2)))
    (is (= {:rows 2, :unit :day}
           (date-bucketing-unit-when-you :breakout-by "day", :filter-by "day", :with-interval 2)))))

;; Filtering by a unbucketed datetime Field should automatically bucket that Field by day if not already done (#8927)
;;
;; This should only apply when comparing Fields to `yyyy-MM-dd` date strings.
;;
;; e.g. `[:= <field> "2018-11-19"] should get rewritten as `[:= [:field <field> {:temporal-unit :day}] "2018-11-19"]` if
;; `<field>` is a `:type/DateTime` Field
;;
;; We should get count = 1 for the current day, as opposed to count = 0 if we weren't auto-bucketing
;; (e.g. 2018-11-19T00:00 != 2018-11-19T12:37 or whatever time the checkin is at)
(deftest ^:parallel default-bucketing-test
  (mt/test-drivers (mt/normal-drivers-except #{:athena})
    (mt/dataset checkins:1-per-day
      (is (= [[1]]
             (mt/formatted-rows [int]
               (mt/run-mbql-query checkins
                 {:aggregation [[:count]]
                  :filter      [:= [:field $timestamp nil] (t/format "yyyy-MM-dd" (u.date/truncate :day))]})))))))

(deftest ^:parallel default-bucketing-test-2
  ;; this is basically the same test as above, but using the office-checkins dataset instead of the dynamically
  ;; created checkins DBs so we can run it against Snowflake as well.
  (mt/test-drivers (mt/normal-drivers)
    (mt/dataset office-checkins
      (is (= [[1]]
             (mt/formatted-rows [int]
               (mt/run-mbql-query checkins
                 {:aggregation [[:count]]
                  :filter      [:= [:field $timestamp nil] "2019-01-16"]})))))))

(deftest ^:parallel default-bucketing-test-3
  (mt/test-drivers (mt/normal-drivers)
    (mt/dataset office-checkins
      (testing "Check that automatic bucketing still happens when using compound filter clauses (#9127)"
        (is (= [[1]]
               (mt/formatted-rows [int]
                 (mt/run-mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:and
                                  [:= [:field $timestamp nil] "2019-01-16"]
                                  [:= [:field $id nil] 6]]}))))))))

(deftest ^:parallel default-bucketing-test-4
  (mt/test-drivers (mt/normal-drivers-except #{:athena})
    (testing "if datetime string is not yyyy-MM-dd no date bucketing should take place, and thus we should get no (exact) matches"
      (mt/dataset checkins:1-per-day
        (is (=
             ;; Mongo returns empty row for count = 0. We should fix that (#5419)
             (case driver/*driver*
               :mongo []
               [[0]])
             (mt/formatted-rows [int]
               (mt/run-mbql-query checkins
                 {:aggregation [[:count]]
                  :filter      [:= [:field $timestamp nil] (str (t/format "yyyy-MM-dd" (u.date/truncate :day))
                                                                "T14:16:00Z")]}))))))))

(def ^:private addition-unit-filtering-vals
  [[3   :day             "2014-03-03"]
   [135 :day-of-week     1]
   [36  :day-of-month    1]
   [9   :day-of-year     214]
   [11  :week            "2014-03-03"]
   [7   :week-of-year    2]
   [48  :month           "2014-03"]
   [38  :month-of-year   1]
   [107 :quarter         "2014-01"]
   [200 :quarter-of-year 1]
   [498 :year            "2014"]])

(defn- count-of-checkins [unit filter-value]
  (ffirst
   (mt/formatted-rows [int]
     (mt/run-mbql-query checkins
       {:aggregation [[:count]]
        :filter      [:= [:field %date {:temporal-unit unit}] filter-value]}))))

(deftest additional-unit-filtering-tests
  (testing "Additional tests for filtering against various datetime bucketing units that aren't tested above"
    (mt/with-temporary-setting-values [start-of-week :sunday]
      (mt/test-drivers (mt/normal-drivers)
        (doseq [[expected-count unit filter-value] addition-unit-filtering-vals]
          (doseq [tz [nil "UTC"]]         ;iterate on at least two report time zones to suss out bugs related to that
            (mt/with-temporary-setting-values [report-timezone tz]
              (testing (format "\nunit = %s" unit)
                (is (= expected-count (count-of-checkins unit filter-value))
                    (format
                     "count of rows where (= (%s date) %s) should be %d"
                     (name unit)
                     filter-value
                     expected-count))))))))))

(deftest ^:parallel legacy-default-datetime-bucketing-test
  (testing (str ":type/Date or :type/DateTime fields that don't have `:temporal-unit` clauses should get default `:day` "
                "bucketing for legacy reasons. See #9014")
    (is (=? {:query ["SELECT"
                     "  COUNT(*) AS \"count\""
                     "FROM"
                     "  \"PUBLIC\".\"CHECKINS\""
                     "WHERE"
                     "  \"PUBLIC\".\"CHECKINS\".\"DATE\" = CAST(NOW() AS date)"]}
            (-> (qp.compile/compile
                 (mt/mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:= $date [:relative-datetime :current]]}))
                (update :query #(str/split-lines (driver/prettify-native-form :h2 %))))))))

(deftest ^:parallel compile-time-interval-test
  (testing "Make sure time-intervals work the way they're supposed to."
    (testing "[:time-interval $date -4 :month] should give us something like Oct 01 2020 - Feb 01 2021 if today is Feb 17 2021"
      (is (= ["SELECT"
              "  CHECKINS.DATE AS DATE"
              "FROM"
              "  CHECKINS"
              "WHERE"
              "  ("
              "    CHECKINS.DATE >= DATE_TRUNC('month', DATEADD('month', -4, NOW()))"
              "  )"
              "  AND (CHECKINS.DATE < DATE_TRUNC('month', NOW()))"
              "GROUP BY"
              "  CHECKINS.DATE"
              "ORDER BY"
              "  CHECKINS.DATE ASC"
              "LIMIT"
              "  1048575"]
             (->> (qp.compile/compile
                   (mt/mbql-query checkins
                     {:filter   [:time-interval $date -4 :month]
                      :breakout [!day.date]}))
                  :query
                  sql.qp-test-util/pretty-sql
                  (driver/prettify-native-form :h2)
                  str/split-lines))))))

(deftest ^:parallel native-query-datetime-filter-test
  (testing "Field Filters with datetime values should behave like gui questions (#33492)"
    (are [native-type native-value mbql-filter expected-row-count]
        (let [mbql-rows (-> (mt/mbql-query orders {:fields [$created_at]
                                                   :filter mbql-filter
                                                   :order-by [[:asc $created_at]]})
                            qp/process-query
                            mt/rows)
              native-rows (-> (mt/native-query {:query (str "SELECT created_at "
                                                            "FROM orders "
                                                            "WHERE {{date}} "
                                                            "ORDER BY created_at")
                                                :template-tags {"date"
                                                                {:name "date"
                                                                 :display-name "Date"
                                                                 :type :dimension
                                                                 :widget-type native-type
                                                                 :dimension (mt/$ids !minute.orders.created_at)}}
                                                :parameters [{:type native-type
                                                              :name "date"
                                                              :target [:dimension [:template-tag "date"]]
                                                              :value native-value}]})
                              qp/process-query
                              mt/rows)]
          (is (= expected-row-count (count native-rows)))
          (is (= mbql-rows native-rows)))

        :date/range
        "2020-03-04~2020-03-04"
        [:between !day.created_at "2020-03-04" "2020-03-04"]
        13

        :date/range
        "2020-03-04T07:19:00~2020-03-04T07:20:00"
        [:between !minute.created_at "2020-03-04T07:19:00" "2020-03-04T07:20:00"]
        2

        :date/all-options
        "2020-03-04~2020-03-04"
        [:between !day.created_at "2020-03-04" "2020-03-04"]
        13

        :date/all-options
        "2020-03-04T07:19:00~2020-03-04T07:20:00"
        [:between !minute.created_at "2020-03-04T07:19:00" "2020-03-04T07:20:00"]
        2

        :date/single
        "2020-03-04"
        [:= !day.created_at "2020-03-04"]
        13

        :date/single
        "2020-03-04T07:20:00"
        [:= !minute.created_at "2020-03-04T07:20"]
        2)))

(deftest field-filter-start-of-week-test
  (testing "Field Filters with relative date ranges should respect the custom start of week setting (#14294)"
    (mt/dataset checkins:1-per-day
      (let [query (mt/native-query {:query         (str "SELECT dayname(\"TIMESTAMP\") as \"day\" "
                                                        "FROM checkins "
                                                        "[[WHERE {{date_range}}]] "
                                                        "ORDER BY \"TIMESTAMP\" ASC "
                                                        "LIMIT 1")
                                    :template-tags {"date_range"
                                                    {:name         "date_range"
                                                     :display-name "Date Range"
                                                     :type         :dimension
                                                     :widget-type  :date/all-options
                                                     :dimension    (mt/$ids $checkins.timestamp)}}
                                    :parameters    [{:type   :date/range
                                                     :name   "created_at"
                                                     :target [:dimension [:template-tag "date_range"]]
                                                     :value  "past1weeks"}]})]
        (doseq [[first-day-of-week expected] {"sunday"    ["Sunday"]
                                              "monday"    ["Monday"]
                                              "tuesday"   ["Tuesday"]
                                              "wednesday" ["Wednesday"]
                                              "thursday"  ["Thursday"]
                                              "friday"    ["Friday"]
                                              "saturday"  ["Saturday"]}]
          (mt/with-temporary-setting-values [start-of-week first-day-of-week]
            (is (= expected
                   (mt/first-row
                     (qp/process-query query))))))))))

(deftest temporal-unit-parameters-test
  (mt/dataset test-data
    (let [query-months (mt/query orders
                         {:type       :query
                          :query      {:source-table $$orders
                                       :aggregation  [[:sum $subtotal]]
                                       :breakout     [!month.created_at]
                                       :filter       [:between $created_at "2018-01-01T00:00:00Z" "2018-12-31T23:59:59Z"]}
                          ;; The value for this parameter gets overridden below.
                          :parameters [{:type   :temporal-unit
                                        :target [:dimension !month.created_at]
                                        :value  "month"}]})
          unit-totals (fn [unit]
                        (->> (qp/process-query (assoc-in query-months [:parameters 0 :value] unit))
                             (mt/formatted-rows [identity 2.0])
                             (map second)))]
      (testing "monthly"
        (is (= [37019.52 32923.82 36592.60 35548.11 43556.61 39537.82
                42292.10 42443.71 42077.35 45708.74 44498.55 46245.48]
               (unit-totals "month"))))

      (testing "quarterly"
        (is (= [106535.94 118642.54 126813.16 136452.77]
               (unit-totals "quarter"))))

      (testing "annual"
        (is (= [488444.41] (unit-totals "year")))))))

(deftest day-of-week-custom-start-of-week-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "`:day-of-week` bucketing should respect the `start-of-week` Setting (#13604)"
      (testing "filter by `:day-of-week` should work correctly (#15044)"
        (doseq [[day [thursday-day-of-week saturday-day-of-week]] {:sunday  [5 7]
                                                                   :monday  [4 6]
                                                                   :tuesday [3 5]}]
          (mt/with-temporary-setting-values [start-of-week day]
            (is (= (sort-by
                    first
                    [[thursday-day-of-week 2]
                     [saturday-day-of-week 1]])
                   (mt/formatted-rows [int int]
                     (mt/run-mbql-query checkins
                       {:aggregation [[:count]]
                        :breakout    [!day-of-week.date]
                        :filter      [:between $date "2013-01-03" "2013-01-20"]}))))))))))

(deftest first-day-of-week-for-day-of-week-bucketing-test
  (testing "First day of week for `:day-of-week` bucketing should be the consistent (#17801)"
    (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
      (let [query (mt/mbql-query checkins
                    {:aggregation [[:count]]
                     :breakout    [!day-of-week.date]})]
        (doseq [[first-day-of-week expected-rows] {:sunday    [[1 135] [2 143] [3 153] [4 136] [5 139] [6 160] [7 134]]
                                                   :monday    [[1 143] [2 153] [3 136] [4 139] [5 160] [6 134] [7 135]]
                                                   :tuesday   [[1 153] [2 136] [3 139] [4 160] [5 134] [6 135] [7 143]]
                                                   :wednesday [[1 136] [2 139] [3 160] [4 134] [5 135] [6 143] [7 153]]
                                                   :thursday  [[1 139] [2 160] [3 134] [4 135] [5 143] [6 153] [7 136]]
                                                   :friday    [[1 160] [2 134] [3 135] [4 143] [5 153] [6 136] [7 139]]
                                                   :saturday  [[1 134] [2 135] [3 143] [4 153] [5 136] [6 139] [7 160]]}]
          (mt/with-temporary-setting-values [start-of-week first-day-of-week]
            (mt/with-native-query-testing-context query
              (is (= expected-rows
                     (mt/formatted-rows [int int] (qp/process-query query)))))))))))

(deftest filter-by-current-quarter-test
  ;; Oracle doesn't work on March 31st because March 31st + 3 months = June 31st, which doesn't exist. See #10072
  (mt/test-drivers (disj (mt/normal-drivers) :oracle)
    (testing "Should be able to filter by current quarter (#20683)"
      (let [query (mt/mbql-query checkins
                    {:aggregation [[:count]]
                     :filter [:= !quarter.date [:relative-datetime :now]]})]
        (mt/with-native-query-testing-context query
          ;; this isn't expected to return anything; for now it's enough just to make sure that the query doesn't fail.
          (is (=
               ;; Mongo returns empty row for count = 0. We should fix that (#5419)
               (case driver/*driver*
                 :mongo []
                 [[0]])
               (mt/formatted-rows [int] (qp/process-query query)))))))))

(deftest filter-by-expression-time-interval-test
  (testing "Datetime expressions can filter to a date range (#33528)"
    (mt/test-drivers (mt/normal-drivers-except #{:athena})
      (mt/dataset
        checkins:1-per-day
        (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
              query (as-> (lib/query mp (lib.metadata/table mp (mt/id :checkins))) $q
                      (lib/expression $q "customdate" (m/find-first (comp #{(mt/id :checkins :timestamp)} :id) (lib/visible-columns $q)))
                      (lib/filter $q (lib/time-interval (lib/expression-ref $q "customdate") :current :week)))
              mbql-query (mt/mbql-query
                           checkins
                           {:expressions {"customdate" $timestamp}
                            :filter [:time-interval [:expression "customdate" {:base-type :type/DateTime}] :current :week]})
              processed  (qp/process-query query)
              mbql-processed (qp/process-query mbql-query)]
          ;; Test both path ways since only mbql-queries were affected.
          (is (= 7 (count (mt/rows processed))))
          (is (= 7 (count (mt/rows mbql-processed))))
          (is (= (get-in (qp/process-query mbql-query) [:data :native_form])
                 (get-in (qp/process-query (lib.convert/->pMBQL mbql-query)) [:data :native_form])
                 (get-in (qp/process-query query) [:data :native_form]))))))))

(deftest filter-by-expression-relative-time-interval-test
  (testing "Datetime expressions can filter to a date range"
    (mt/test-drivers
     (disj (mt/normal-drivers-with-feature :date-arithmetics) :athena)
     (mt/dataset checkins:1-per-day:60
      (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
            query (as-> (lib/query mp (lib.metadata/table mp (mt/id :checkins))) $q
                    (lib/expression $q "customdate" (m/find-first (comp #{(mt/id :checkins :timestamp)} :id)
                                                                  (lib/visible-columns $q)))
                    (lib/filter $q (lib/relative-time-interval
                                    (lib/expression-ref $q "customdate") -1 :week -1 :week)))
            mbql-query (mt/mbql-query
                        checkins
                        {:expressions {"customdate" $timestamp}
                         :filter [:relative-time-interval
                                  [:expression "customdate" {:base-type :type/DateTime}] -1 :week -1 :week]})
            processed  (qp/process-query query)
            mbql-processed (qp/process-query mbql-query)]
        (is (= 7 (count (mt/rows processed))))
        (is (= 7 (count (mt/rows mbql-processed))))
        (is (= (get-in (qp/process-query mbql-query) [:data :native_form])
               (get-in (qp/process-query (lib.convert/->pMBQL mbql-query)) [:data :native_form])
               (get-in (qp/process-query query) [:data :native_form]))))))))

;; TODO -- is this really date BUCKETING? Does this BELONG HERE?!
(deftest june-31st-test
  (testing "What happens when you try to add 3 months to March 31st? It should still work (#10072, #21968, #21969)"
    (mt/with-temporary-setting-values [report-timezone "UTC"]
      ;; only testing the SQL drivers for now since I'm not 100% sure how to mock this for everyone else. Maybe one day
      ;; when we support expressions like `+` for temporal types we can do an `:absolute-datetime` plus
      ;; `:relative-datetime` expression and do this directly in MBQL.
      (mt/test-drivers (filter #(isa? driver/hierarchy (driver/the-initialized-driver %) :sql)
                               (mt/normal-drivers))
        (mt/with-metadata-provider (mt/id)
          (doseq [[n unit] [[3 :month]
                            [1 :quarter]]
                  t        [#t "2022-03-31"
                            #t "2022-03-31T00:00:00"
                            #t "2022-03-31T00:00:00-00:00"]]
            (testing (format "%d %s ^%s %s" n unit (.getCanonicalName (class t)) (pr-str t))
              (let [march-31     (sql.qp/->honeysql driver/*driver* [:absolute-datetime t :day])
                    june-31      (sql.qp/add-interval-honeysql-form driver/*driver* march-31 n unit)
                    checkins     (mt/with-metadata-provider (mt/id)
                                   (sql.qp/->honeysql driver/*driver* (t2/select-one Table :id (mt/id :checkins))))
                    honeysql     {:select [[june-31 :june_31]]
                                  :from   [[checkins]]}
                    honeysql     (sql.qp/apply-top-level-clause driver/*driver* :limit honeysql {:limit 1})
                    [sql & args] (sql.qp/format-honeysql driver/*driver* honeysql)
                    query        (mt/native-query {:query sql, :params args})]
                (mt/with-native-query-testing-context query
                  (is (re= (u.regex/rx #"^2022-"
                                       ;; We don't really care if someone returns June 29th or 30th or July 1st here. I
                                       ;; guess you could make a case for either June 30th or July 1st. I don't really know
                                       ;; how you can get June 29th from this, but that's what Vertica returns. :shrug: The
                                       ;; main thing here is that it's not barfing.
                                       [:or [:and "06-" [:or "29" "30"]] "07-01"]
                                       ;; We also don't really care if this is returned as a date or a timestamp with or
                                       ;; without time zone.
                                       [:? [:or "T" #"\s"] "00:00:00" [:? "Z"]])
                           (first (mt/first-row (qp/process-query query))))))))))))))
