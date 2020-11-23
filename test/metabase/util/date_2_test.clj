(ns metabase.util.date-2-test
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [java-time :as t]
            [metabase.test :as mt]
            [metabase.test.util.timezone :as tu.timezone]
            [metabase.util.date-2 :as u.date]
            [metabase.util.date-2.common :as u.date.common])
  (:import java.time.temporal.ChronoField))

(deftest parse-test
  ;; system timezone should not affect the way strings are parsed
  (doseq [system-timezone-id ["UTC" "US/Pacific"]]
    (tu.timezone/with-system-timezone-id system-timezone-id
      (letfn [(message [expected s default-timezone-id]
                (if default-timezone-id
                  (format "parsing '%s' with default timezone id '%s' should give you %s" s default-timezone-id (pr-str expected))
                  (format "parsing '%s' should give you %s" s (pr-str expected))))
              (is-parsed? [expected s default-timezone-id]
                {:pre [(string? s)]}
                (testing "ISO-8601-style literal"
                  (is (= expected
                         (u.date/parse s default-timezone-id))
                      (message expected s default-timezone-id)))
                (when (str/includes? s "T")
                  (testing "SQL-style literal"
                    (let [s (str/replace s #"T" " ")]
                      (is (= expected
                             (u.date/parse s default-timezone-id))
                          (message expected s default-timezone-id))
                      (when-let [[_ before-offset offset] (re-find #"(.*)((?:(?:[+-]\d{2}:\d{2})|Z).*$)" s)]
                        (let [s (format "%s %s" before-offset offset)]
                          (testing "w/ space before offset"
                            (is (= expected
                                   (u.date/parse s default-timezone-id))
                                (message expected s default-timezone-id)))))))))]
        (testing "literals without timezone"
          (doseq [[s expected]
                  {"2019"                    (t/local-date 2019 1 1)
                   "2019-10"                 (t/local-date 2019 10 1)
                   "2019-10-28"              (t/local-date 2019 10 28)
                   "2019-10-28T13"           (t/local-date-time 2019 10 28 13)
                   "2019-10-28T13:14"        (t/local-date-time 2019 10 28 13 14)
                   "2019-10-28T13:14:15"     (t/local-date-time 2019 10 28 13 14 15)
                   "2019-10-28T13:14:15.555" (t/local-date-time 2019 10 28 13 14 15 (* 555 1000 1000))
                   "13:30"                   (t/local-time 13 30)
                   "13:30:20"                (t/local-time 13 30 20)
                   "13:30:20.555"            (t/local-time 13 30 20 (* 555 1000 1000))}]
            (is-parsed? expected s nil)))
        (testing "literals without timezone, but default timezone provided"
          (doseq [[s expected]
                  {"2019"                    (t/zoned-date-time 2019  1  1  0  0  0               0 (t/zone-id "America/Los_Angeles"))
                   "2019-10"                 (t/zoned-date-time 2019 10  1  0  0  0               0 (t/zone-id "America/Los_Angeles"))
                   "2019-10-28"              (t/zoned-date-time 2019 10 28  0  0  0               0 (t/zone-id "America/Los_Angeles"))
                   "2019-10-28T13"           (t/zoned-date-time 2019 10 28 13  0  0               0 (t/zone-id "America/Los_Angeles"))
                   "2019-10-28T13:14"        (t/zoned-date-time 2019 10 28 13 14  0               0 (t/zone-id "America/Los_Angeles"))
                   "2019-10-28T13:14:15"     (t/zoned-date-time 2019 10 28 13 14 15               0 (t/zone-id "America/Los_Angeles"))
                   "2019-10-28T13:14:15.555" (t/zoned-date-time 2019 10 28 13 14 15 (* 555 1000000) (t/zone-id "America/Los_Angeles"))
                   ;; Times without timezone info should always be parsed as `LocalTime` regardless of whether a default
                   ;; timezone if provided. That's because we can't convert the zone to an offset because the offset is up
                   ;; in the air because of daylight savings.
                   "13:30"                   (t/local-time 13 30  0               0)
                   "13:30:20"                (t/local-time 13 30 20               0)
                   "13:30:20.555"            (t/local-time 13 30 20 (* 555 1000000))}]
            (is-parsed? expected s "America/Los_Angeles")))
        (testing "literals with a timezone offset"
          (doseq [[s expected]
                  {"2019-10-28-07:00"              (t/offset-date-time 2019 10 28  0  0  0               0 (t/zone-offset -7))
                   "2019-10-28T13-07:00"           (t/offset-date-time 2019 10 28 13  0  0               0 (t/zone-offset -7))
                   "2019-10-28T13:14-07:00"        (t/offset-date-time 2019 10 28 13 14  0               0 (t/zone-offset -7))
                   "2019-10-28T13:14:15-07:00"     (t/offset-date-time 2019 10 28 13 14 15               0 (t/zone-offset -7))
                   "2019-10-28T13:14:15.555-07:00" (t/offset-date-time 2019 10 28 13 14 15 (* 555 1000000) (t/zone-offset -7))
                   "13:30-07:00"                   (t/offset-time 13 30  0               0 (t/zone-offset -7))
                   "13:30:20-07:00"                (t/offset-time 13 30 20               0 (t/zone-offset -7))
                   "13:30:20.555-07:00"            (t/offset-time 13 30 20 (* 555 1000000) (t/zone-offset -7))}]
            ;; The 'UTC' default timezone ID should be ignored entirely since all these literals specify their offset
            (is-parsed? expected s "UTC")))
        (testing "literals with a timezone id"
          (doseq [[s expected] {"2019-12-13T16:31:00-08:00[US/Pacific]"              (t/zoned-date-time 2019 12 13 16 31  0               0 (t/zone-id "US/Pacific"))
                                "2019-10-28-07:00[America/Los_Angeles]"              (t/zoned-date-time 2019 10 28  0  0  0               0 (t/zone-id "America/Los_Angeles"))
                                "2019-10-28T13-07:00[America/Los_Angeles]"           (t/zoned-date-time 2019 10 28 13  0  0               0 (t/zone-id "America/Los_Angeles"))
                                "2019-10-28T13:14-07:00[America/Los_Angeles]"        (t/zoned-date-time 2019 10 28 13 14  0               0 (t/zone-id "America/Los_Angeles"))
                                "2019-10-28T13:14:15-07:00[America/Los_Angeles]"     (t/zoned-date-time 2019 10 28 13 14 15               0 (t/zone-id "America/Los_Angeles"))
                                "2019-10-28T13:14:15.555-07:00[America/Los_Angeles]" (t/zoned-date-time 2019 10 28 13 14 15 (* 555 1000000) (t/zone-id "America/Los_Angeles"))
                                "13:30-07:00[America/Los_Angeles]"                   (t/offset-time 13 30  0               0 (t/zone-offset -7))
                                "13:30:20-07:00[America/Los_Angeles]"                (t/offset-time 13 30 20               0 (t/zone-offset -7))
                                "13:30:20.555-07:00[America/Los_Angeles]"            (t/offset-time 13 30 20 (* 555 1000000) (t/zone-offset -7))}]
            ;; The 'UTC' default timezone ID should be ignored entirely since all these literals specify their zone ID
            (is-parsed? expected s "UTC")))
        (testing "literals with UTC offset 'Z'"
          (doseq [[s expected] {"2019Z"                    (t/zoned-date-time 2019  1  1  0  0  0               0 (t/zone-id "UTC"))
                                "2019-10Z"                 (t/zoned-date-time 2019 10  1  0  0  0               0 (t/zone-id "UTC"))
                                "2019-10-28Z"              (t/zoned-date-time 2019 10 28  0  0  0               0 (t/zone-id "UTC"))
                                "2019-10-28T13Z"           (t/zoned-date-time 2019 10 28 13  0  0               0 (t/zone-id "UTC"))
                                "2019-10-28T13:14Z"        (t/zoned-date-time 2019 10 28 13 14  0               0 (t/zone-id "UTC"))
                                "2019-10-28T13:14:15Z"     (t/zoned-date-time 2019 10 28 13 14 15               0 (t/zone-id "UTC"))
                                "2019-10-28T13:14:15.555Z" (t/zoned-date-time 2019 10 28 13 14 15 (* 555 1000000) (t/zone-id "UTC"))
                                "13:30Z"                   (t/offset-time 13 30  0               0 (t/zone-offset 0))
                                "13:30:20Z"                (t/offset-time 13 30 20               0 (t/zone-offset 0))
                                "13:30:20.555Z"            (t/offset-time 13 30 20 (* 555 1000000) (t/zone-offset 0))}]
            ;; default timezone ID should be ignored; because `Z` means UTC we should return ZonedDateTimes instead of
            ;; OffsetDateTime
            (is-parsed? expected s "US/Pacific"))))
      (testing "Weird formats"
        (testing "Should be able to parse SQL-style literals where Zone offset is separated by a space, with no colons between hour and minute"
          (is (= (t/offset-date-time "2014-08-01T10:00-07:00")
                 (u.date/parse "2014-08-01 10:00:00.000 -0700")))
          (is (= (t/offset-date-time "2014-08-01T10:00-07:00")
                 (u.date/parse "2014-08-01 10:00:00 -0700")))
          (is (= (t/offset-date-time "2014-08-01T10:00-07:00")
                 (u.date/parse "2014-08-01 10:00 -0700"))))
        (testing "Should be able to parse SQL-style literals where Zone ID is separated by a space, without brackets"
          (is (= (t/zoned-date-time "2014-08-01T10:00Z[UTC]")
                 (u.date/parse "2014-08-01 10:00:00.000 UTC")))
          (is (= (t/zoned-date-time "2014-08-02T00:00+08:00[Asia/Hong_Kong]")
                 (u.date/parse "2014-08-02 00:00:00.000 Asia/Hong_Kong"))))
        (testing "Should be able to parse strings with hour-only offsets e.g. '+00'"
          (is (= (t/offset-time "07:23:18.331Z")
                 (u.date/parse "07:23:18.331-00")))
          (is (= (t/offset-time "07:23:18.000Z")
                 (u.date/parse "07:23:18-00")))
          (is (= (t/offset-time "07:23:00.000Z")
                 (u.date/parse "07:23-00")))
          (is (= (t/offset-time "07:23:18.331-08:00")
                 (u.date/parse "07:23:18.331-08")))
          (is (= (t/offset-time "07:23:18.000-08:00")
                 (u.date/parse "07:23:18-08")))
          (is (= (t/offset-time "07:23:00.000-08:00")
                 (u.date/parse "07:23-08")))))
      (testing "nil"
        (is (= nil
               (u.date/parse nil))
            "Passing `nil` should return `nil`"))
      (testing "blank strings"
        (is (= nil
               (u.date/parse ""))
            (= nil
               (u.date/parse "   ")))))))

;; TODO - more tests!
(deftest format-test
  (testing "ZonedDateTime"
    (testing "should get formatted as the same way as an OffsetDateTime"
      (is (= "2019-11-01T18:39:00-07:00"
             (u.date/format (t/zoned-date-time "2019-11-01T18:39:00-07:00[US/Pacific]")))))
    (testing "make sure it can handle different DST offsets correctly"
      (is (= "2020-02-13T16:31:00-08:00"
             (u.date/format (t/zoned-date-time "2020-02-13T16:31:00-08:00[US/Pacific]"))))))
  (testing "Instant"
    (is (= "1970-01-01T00:00:00Z"
           (u.date/format (t/instant "1970-01-01T00:00:00Z")))))
  (testing "nil"
    (is (= nil
           (u.date/format nil))
        "Passing `nil` should return `nil`")))

(deftest format-sql-test
  (testing "LocalDateTime"
    (is (= "2019-11-05 19:27:00"
           (u.date/format-sql (t/local-date-time "2019-11-05T19:27")))))
  (testing "ZonedDateTime"
    (is (= "2019-11-01 18:39:00-07:00"
           (u.date/format-sql (t/zoned-date-time "2019-11-01T18:39:00-07:00[US/Pacific]")))
        "should get formatted as the same way as an OffsetDateTime")))

(deftest adjuster-test
  (let [now (t/zoned-date-time "2019-12-10T17:17:00-08:00[US/Pacific]")]
    (testing "adjust temporal value to first day of week (Sunday)"
      (is (= (t/zoned-date-time "2019-12-08T17:17-08:00[US/Pacific]")
             (t/adjust now (u.date/adjuster :first-day-of-week)))))
    (testing "adjust temporal value to first day of ISO week (Monday)"
      (is (= (t/zoned-date-time "2019-12-09T17:17-08:00[US/Pacific]")
             (t/adjust now (u.date/adjuster :first-day-of-iso-week)))))
    (testing "adjust temporal value to first day of first week of year (previous or same Sunday as first day of year)"
      (is (= (t/zoned-date-time "2018-12-30T17:17-08:00[US/Pacific]")
             (t/adjust now (u.date/adjuster :first-week-of-year))
             (t/adjust now (u.date/adjuster :week-of-year 1)))))
    (testing "adjust temporal value to the 50th week of the year"
      (is (= (t/zoned-date-time "2019-12-08T17:17-08:00[US/Pacific]")
             (t/adjust now (u.date/adjuster :week-of-year 50)))))))

(deftest extract-test
  (testing "u.date/extract with 2 args"
    ;; everything is at `Sunday October 27th 2019 2:03:40.555 PM` or subset thereof
    (let [temporal-category->sample-values {:dates     [(t/local-date 2019 10 27)]
                                            :times     [(t/local-time  14 3 40 (* 555 1000000))
                                                        (t/offset-time 14 3 40 (* 555 1000000) (t/zone-offset -7))]
                                            :datetimes [(t/offset-date-time 2019 10 27 14 3 40 (* 555 1000000) (t/zone-offset -7))
                                                        (t/zoned-date-time  2019 10 27 14 3 40 (* 555 1000000) (t/zone-id "America/Los_Angeles"))]}]
      (doseq [[categories unit->expected] {#{:times :datetimes} {:minute-of-hour 3
                                                                 :hour-of-day    14}
                                           #{:dates :datetimes} {:day-of-week      1
                                                                 :iso-day-of-week  7
                                                                 :day-of-month     27
                                                                 :day-of-year      300
                                                                 :week-of-year     44
                                                                 :iso-week-of-year 43
                                                                 :month-of-year    10
                                                                 :quarter-of-year  4
                                                                 :year             2019}}
              category                    categories
              t                           (get temporal-category->sample-values category)
              [unit expected]             unit->expected]
        (is (= expected
               (u.date/extract t unit))
            (format "Extract %s from %s %s should be %s" unit (class t) t expected)))))
  (testing "u.date/extract with 1 arg (extract from now)"
    (is (= 2
           (t/with-clock (t/mock-clock (t/instant "2019-11-18T22:31:00Z"))
             (u.date/extract :day-of-week))))))

(deftest truncate-test
  (testing "u.date/truncate with 2 args"
    (let [t->unit->expected
          {(t/local-date 2019 10 27)
           {:second   (t/local-date 2019 10 27)
            :minute   (t/local-date 2019 10 27)
            :hour     (t/local-date 2019 10 27)
            :day      (t/local-date 2019 10 27)
            :week     (t/local-date 2019 10 27)
            :iso-week (t/local-date 2019 10 21)
            :month    (t/local-date 2019 10 1)
            :quarter  (t/local-date 2019 10 1)
            :year     (t/local-date 2019 1 1)}

           (t/local-time 14 3 40 (* 555 1000000))
           {:second (t/local-time 14 3 40)
            :minute (t/local-time 14 3)
            :hour   (t/local-time 14)}

           (t/offset-time 14 3 40 (* 555 1000000) (t/zone-offset -7))
           {:second (t/offset-time 14 3 40 0 (t/zone-offset -7))
            :minute (t/offset-time 14 3  0 0 (t/zone-offset -7))
            :hour   (t/offset-time 14 0  0 0 (t/zone-offset -7))}

           (t/offset-date-time 2019 10 27 14 3 40 (* 555 1000000) (t/zone-offset -7))
           {:second   (t/offset-date-time 2019 10 27 14 3 40 0 (t/zone-offset -7))
            :minute   (t/offset-date-time 2019 10 27 14 3  0 0 (t/zone-offset -7))
            :hour     (t/offset-date-time 2019 10 27 14 0  0 0 (t/zone-offset -7))
            :day      (t/offset-date-time 2019 10 27 0  0  0 0 (t/zone-offset -7))
            :week     (t/offset-date-time 2019 10 27 0  0  0 0 (t/zone-offset -7))
            :iso-week (t/offset-date-time 2019 10 21 0  0  0 0 (t/zone-offset -7))
            :month    (t/offset-date-time 2019 10  1 0  0  0 0 (t/zone-offset -7))
            :quarter  (t/offset-date-time 2019 10  1 0  0  0 0 (t/zone-offset -7))
            :year     (t/offset-date-time 2019  1  1 0  0  0 0 (t/zone-offset -7))}

           (t/zoned-date-time  2019 10 27 14 3 40 (* 555 1000000) (t/zone-id "America/Los_Angeles"))
           {:second   (t/zoned-date-time  2019 10 27 14 3 40 0 (t/zone-id "America/Los_Angeles"))
            :minute   (t/zoned-date-time  2019 10 27 14 3  0 0 (t/zone-id "America/Los_Angeles"))
            :hour     (t/zoned-date-time  2019 10 27 14 0  0 0 (t/zone-id "America/Los_Angeles"))
            :day      (t/zoned-date-time  2019 10 27  0 0  0 0 (t/zone-id "America/Los_Angeles"))
            :week     (t/zoned-date-time  2019 10 27  0 0  0 0 (t/zone-id "America/Los_Angeles"))
            :iso-week (t/zoned-date-time  2019 10 21  0 0  0 0 (t/zone-id "America/Los_Angeles"))
            :month    (t/zoned-date-time  2019 10  1  0 0  0 0 (t/zone-id "America/Los_Angeles"))
            :quarter  (t/zoned-date-time  2019 10  1  0 0  0 0 (t/zone-id "America/Los_Angeles"))
            :year     (t/zoned-date-time  2019  1  1  0 0  0 0 (t/zone-id "America/Los_Angeles"))}}]
      (doseq [[t unit->expected] t->unit->expected
              [unit expected]    unit->expected]
        (is (= expected
               (u.date/truncate t unit))
            (format "Truncate %s %s to %s should be %s" (class t) t unit expected)))))
  (testing "u.date/truncate with 1 arg (truncate now)"
    (is (= (t/zoned-date-time "2019-11-18T00:00Z[UTC]")
           (t/with-clock (t/mock-clock (t/instant "2019-11-18T22:31:00Z"))
             (u.date/truncate :day))))))

(deftest add-test
  (testing "with 2 args (datetime relative to now)"
    (is (= (t/zoned-date-time "2019-11-20T22:31Z[UTC]")
           (t/with-clock (t/mock-clock (t/instant "2019-11-18T22:31:00Z"))
             (u.date/add :day 2)))))
  (testing "with 3 args"
    (let [t (t/zoned-date-time "2019-06-14T00:00:00.000Z[UTC]")]
      (doseq [[unit n expected] [[:second  5 "2019-06-14T00:00:05Z[UTC]"]
                                 [:minute  5 "2019-06-14T00:05:00Z[UTC]"]
                                 [:hour    5 "2019-06-14T05:00:00Z[UTC]"]
                                 [:day     5 "2019-06-19T00:00:00Z[UTC]"]
                                 [:week    5 "2019-07-19T00:00:00Z[UTC]"]
                                 [:month   5 "2019-11-14T00:00:00Z[UTC]"]
                                 [:quarter 5 "2020-09-14T00:00:00Z[UTC]"]
                                 [:year    5 "2024-06-14T00:00:00Z[UTC]"]]]
        (is (= (t/zoned-date-time expected)
               (u.date/add t unit n))
            (format "%s plus %d %ss should be %s" t n unit expected))))))

(deftest range-test
  (testing "with 1 arg (range relative to now)"
    (is (= {:start (t/zoned-date-time "2019-11-17T00:00Z[UTC]")
            :end   (t/zoned-date-time "2019-11-24T00:00Z[UTC]")}
           (t/with-clock (t/mock-clock (t/instant "2019-11-18T22:31:00Z"))
             (u.date/range :week)))))
  (testing "with 2 args"
    (is (= {:start (t/zoned-date-time "2019-10-27T00:00Z[UTC]")
            :end   (t/zoned-date-time "2019-11-03T00:00Z[UTC]")}
           (u.date/range (t/zoned-date-time "2019-11-01T15:29:00Z[UTC]") :week))))
  (testing "with 3 args (start/end inclusitivity options)"
    (testing "exclusive start"
      (is (= {:start (t/local-date-time "2019-10-31T23:59:59.999"), :end (t/local-date-time "2019-12-01T00:00")}
             (u.date/range (t/local-date-time "2019-11-18T00:00") :month {:start :exclusive}))))
    (testing "inclusive end"
      (is (= {:start (t/local-date-time "2019-11-01T00:00"), :end (t/local-date-time "2019-11-30T23:59:59.999")}
             (u.date/range (t/local-date-time "2019-11-18T00:00") :month {:end :inclusive}))))
    (testing ":day resolution + inclusive end"
      (is (= {:start (t/local-date "2019-11-01"), :end (t/local-date "2019-11-30")}
             (u.date/range (t/local-date "2019-11-18") :month {:end :inclusive, :resolution :day}))))))

(deftest comparison-range-test
  (testing "Comparing MONTH"
    (letfn [(comparison-range [comparison-type options]
              (u.date/comparison-range (t/local-date "2019-11-18") :month comparison-type (merge {:resolution :day} options)))]
      (testing "Month = November"
        (is (= {:start (t/local-date "2019-11-01"), :end (t/local-date "2019-12-01")}
               (comparison-range := nil)))
        (testing "inclusive end"
          (is (= {:start (t/local-date "2019-11-01"), :end (t/local-date "2019-11-30")}
                 (comparison-range := {:end :inclusive}))))
        (testing "exclusive start"
          (is (= {:start (t/local-date "2019-10-31"), :end (t/local-date "2019-12-01")}
                 (comparison-range := {:start :exclusive})))))
      (testing "month < November"
        (is (= {:end (t/local-date "2019-11-01")}
               (comparison-range :< nil)))
        (testing "inclusive end"
          (is (= {:end (t/local-date "2019-10-31")}
                 (comparison-range :< {:end :inclusive})))))
      (testing "month <= November"
        (is (= {:end (t/local-date "2019-12-01")}
               (comparison-range :<= nil)))
        (testing "inclusive end"
          (is (= {:end (t/local-date "2019-11-30")}
                 (comparison-range :<= {:end :inclusive})))))
      (testing "month > November"
        (is (= {:start (t/local-date "2019-12-01")}
               (comparison-range :> nil)))
        (testing "exclusive start"
          (is (= {:start (t/local-date "2019-11-30")}
                 (comparison-range :> {:start :exclusive})))))
      (testing "month >= November"
        (is (= {:start (t/local-date "2019-11-01")}
               (comparison-range :>= nil)))
        (testing "exclusive start"
          (is (= {:start (t/local-date "2019-10-31")}
                 (comparison-range :>= {:start :exclusive})))))))
  (testing "Comparing DAY"
    (letfn [(comparison-range [comparison-type options]
              (u.date/comparison-range (t/local-date-time "2019-11-18T12:00") :day comparison-type (merge {:resolution :minute} options)))]
      (testing "Day = November 18th"
        (is (= {:start (t/local-date-time "2019-11-18T00:00"), :end (t/local-date-time "2019-11-19T00:00")}
               (comparison-range := nil)))
        (testing "inclusive end"
          (is (= {:start (t/local-date-time "2019-11-18T00:00"), :end (t/local-date-time "2019-11-18T23:59")}
                 (comparison-range := {:end :inclusive}))))
        (testing "exclusive start"
          (is (= {:start (t/local-date-time "2019-11-17T23:59"), :end (t/local-date-time "2019-11-19T00:00")}
                 (comparison-range := {:start :exclusive})))))
      (testing "Day < November 18th"
        (is (= {:end (t/local-date-time "2019-11-18T00:00")}
               (comparison-range :< nil)))
        (testing "inclusive end"
          (is (= {:end (t/local-date-time "2019-11-17T23:59")}
                 (comparison-range :< {:end :inclusive})))))
      (testing "Day <= November 18th"
        (is (= {:end (t/local-date-time "2019-11-19T00:00")}
               (comparison-range :<= nil)))
        (testing "inclusive end"
          (is (= {:end (t/local-date-time "2019-11-18T23:59")}
                 (comparison-range :<= {:end :inclusive})))))
      (testing "Day > November 18th"
        (is (= {:start (t/local-date-time "2019-11-19T00:00")}
               (comparison-range :> nil)))
        (testing "exclusive start"
          (is (= {:start (t/local-date-time "2019-11-18T23:59")}
                 (comparison-range :> {:start :exclusive})))))
      (testing "Day >= November 18th"
        (is (= {:start (t/local-date-time "2019-11-18T00:00")}
               (comparison-range :>= nil)))
        (testing "exclusive start"
          (is (= {:start (t/local-date-time "2019-11-17T23:59")}
                 (comparison-range :>= {:start :exclusive}))))))))

(deftest period-duration-test
  (testing "Creating a period duration from a string"
    (is (= (org.threeten.extra.PeriodDuration/of (t/duration "PT59S"))
           (u.date/period-duration "PT59S"))))
  (testing "Creating a period duration out of two temporal types of the same class"
    (is (= (u.date/period-duration "PT1S")
           (u.date/period-duration (t/offset-date-time "2019-12-03T02:30:05Z") (t/offset-date-time "2019-12-03T02:30:06Z")))))
  (testing "Creating a period duration out of two different temporal types"
    (is (= (u.date/period-duration "PT59S")
           (u.date/period-duration (t/instant "2019-12-03T02:30:27Z") (t/offset-date-time "2019-12-03T02:31:26Z"))))))

(deftest older-than-test
  (let [now (t/instant "2019-12-04T00:45:00Z")]
    (t/with-clock (t/mock-clock now (t/zone-id "America/Los_Angeles"))
      (testing (str "now = " now)
        (doseq [t ((juxt t/instant t/local-date t/local-date-time t/offset-date-time identity)
                   (t/zoned-date-time "2019-11-01T00:00-08:00[US/Pacific]"))]
          (testing (format "t = %s" (pr-str t))
            (is (= true
                   (u.date/older-than? t (t/weeks 2)))
                (format "%s happened before 2019-11-19" (pr-str t)))
            (is (= false
                   (u.date/older-than? t (t/months 2)))
                (format "%s did not happen before 2019-10-03" (pr-str t)))))))))

(deftest static-instances-locale-test
  (testing "in the Turkish locale, :minute-of-hour can be found"
    (mt/with-locale "tr"
      (is (some? (:minute-of-hour (u.date.common/static-instances ChronoField)))))))
