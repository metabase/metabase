(ns metabase.shared.util.time-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.shared.util.internal.time :as internal]
   [metabase.shared.util.time :as shared.ut]
   #?@(:cljs [["moment" :as moment]]
       :clj  [[java-time :as t]]))
  #?(:clj (:import java.util.Locale)))

(defn- from [time-str]
  #?(:cljs (moment time-str)
     :clj  (t/offset-date-time (t/local-date-time time-str) (t/zone-offset))))
(defn- from-zulu [time-str]
  #?(:cljs (moment/utc time-str)
     :clj  (t/offset-date-time time-str)))

(defn- same?
  "True if these two datetimes are equivalent.
  JVM objects are [[=]] but Moment.js values are not, so use the Moment.isSame method in CLJS."
  [t1 t2]
  #?(:cljs (.isSame ^moment/Moment t1 t2)
     :clj  (= t1 t2)))

(defn- same-instant?
  "The same point on the timeline of the universe, adjusting to the same time zone (UTC)."
  [t1 t2]
  #?(:cljs (.isSame ^moment/Moment t1 t2)
     :clj  (= (t/instant t1) (t/instant t2))))

(def test-epoch
  "For consistency of testing we use an arbitrary time as \"now\"."
  "2022-12-14T13:18:43")

(deftest string->timestamp-test
  (testing "numbers are parsed into datetimes based on the unit"
    (with-redefs [internal/now (fn [] (from test-epoch))]
      (are [exp-str input unit] (same? (from exp-str) (shared.ut/coerce-to-timestamp input {:unit unit}))
        "2022-12-14T13:00:00"  0 "minute-of-hour"
        "2022-12-14T13:12:00" 12 "minute-of-hour"
        "2022-12-14T13:59:00" 59 "minute-of-hour"

        "2022-12-14T00:00:00"  0 "hour-of-day"
        "2022-12-14T06:00:00"  6 "hour-of-day"
        "2022-12-14T12:00:00" 12 "hour-of-day"
        "2022-12-14T23:00:00" 23 "hour-of-day"

        ;; 2022-12-14 is a Wednesday (day 4, with a Sunday start)
        "2022-12-11T00:00:00" 1 "day-of-week"
        "2022-12-12T00:00:00" 2 "day-of-week"
        "2022-12-13T00:00:00" 3 "day-of-week"
        "2022-12-14T00:00:00" 4 "day-of-week"
        "2022-12-15T00:00:00" 5 "day-of-week"
        "2022-12-16T00:00:00" 6 "day-of-week"
        "2022-12-17T00:00:00" 7 "day-of-week"

        ;; day-of-year uses a specific (leap) year, 2016-01-01, for its reference.
        "2016-01-01T00:00:00"   1 "day-of-year"
        "2016-01-02T00:00:00"   2 "day-of-year"
        "2016-02-01T00:00:00"  32 "day-of-year"
        "2016-02-29T00:00:00"  60 "day-of-year"
        "2016-03-01T00:00:00"  61 "day-of-year"
        "2016-12-31T00:00:00" 366 "day-of-year"

        ;; day-of-month uses a specific 31-day month (2016-01), as its reference.
        "2016-01-01T00:00:00"   1 "day-of-month"
        "2016-01-02T00:00:00"   2 "day-of-month"
        "2016-01-31T00:00:00"  31 "day-of-month"

        ;; week-of-year 1 means the first week, which is the week that contains Jan 1, even if it's in December.
        ;; Note that the first day of the week differs by locale!
        ;; But since we force "en" locale in our dev environment, Sunday is the start of the week.
        ;; In 2022 the first week starts on Sunday, Dec. 26, 2021.
        "2021-12-26T00:00:00"  1 "week-of-year"
        "2022-01-02T00:00:00"  2 "week-of-year"
        "2022-12-18T00:00:00" 52 "week-of-year"
        "2022-12-25T00:00:00" 53 "week-of-year"

        "2022-01-01T00:00:00"  1 "month-of-year"
        "2022-02-01T00:00:00"  2 "month-of-year"
        "2022-06-01T00:00:00"  6 "month-of-year"
        "2022-12-01T00:00:00" 12 "month-of-year"

        "2022-01-01T00:00:00" 1 "quarter-of-year"
        "2022-04-01T00:00:00" 2 "quarter-of-year"
        "2022-07-01T00:00:00" 3 "quarter-of-year"
        "2022-10-01T00:00:00" 4 "quarter-of-year"

        "2022-01-01T00:00:00" 2022 "year"
        "1954-01-01T00:00:00" 1954 "year"
        "2044-01-01T00:00:00" 2044 "year")))

  (testing "numbers with no unit are parsed as year numbers"
    (are [exp-str input] (same? (from-zulu exp-str) (shared.ut/coerce-to-timestamp input {}))
      "1950-01-01T00:00:00Z" 1950
      "2015-01-01T00:00:00Z" 2015))

  (testing "strings"
    (testing "with unit=day-of-week get parsed as eg. Mon"
      (with-redefs [internal/now (fn [] (from test-epoch))]
        (are [exp-str input] (same? (from exp-str) (shared.ut/coerce-to-timestamp input {:unit "day-of-week"}))
          ;; 2022-12-14 (the test epoch) is a Wednesday.
          "2022-12-12T00:00:00" "Mon"
          "2022-12-13T00:00:00" "Tue"
          "2022-12-14T00:00:00" "Wed"
          "2022-12-15T00:00:00" "Thu"
          "2022-12-16T00:00:00" "Fri"
          "2022-12-17T00:00:00" "Sat"
          "2022-12-18T00:00:00" "Sun")))

    (testing "with unit != day-of-week"
      (testing "and a time offset are parsed in that offset"
        (are [exp-str input] (same-instant? (from-zulu exp-str) (shared.ut/coerce-to-timestamp input {}))
          "2022-12-14T13:37:00Z" "2022-12-14T13:37:00Z"
          "2022-12-14T09:37:00Z" "2022-12-14T13:37:00+04:00"
          "2022-12-14T17:07:00Z" "2022-12-14T13:37:00-03:30"))
      (testing "and no time offset are assumed to be UTC"
        (is (same? (from-zulu "2022-12-14T13:37:45Z")
                   (shared.ut/coerce-to-timestamp "2022-12-14T13:37:45" {}))))))

  (testing "existing date-time values are simply returned"
    (are [value] (let [t (shared.ut/coerce-to-timestamp value)] (same? t (shared.ut/coerce-to-timestamp t)))
      "2022-12-12T00:00:00"
      "2022-12-12T00:00:00Z"
      1000)))

(deftest same-day-month-year-test
  (let [ref-date      (from "2022-12-19T08:12:45")  ; Base
        same-day      (from "2022-12-19T14:06:00")  ; Later that day
        same-month    (from "2022-12-02T06:44:18")  ; Earlier the same month
        same-year     (from "2022-06-14T06:44:18")  ; Earlier the same year
        previous-year (from "2021-12-19T08:12:45")] ; Exactly the same date/time - the year before!
    (testing "same-day?"
      (is (shared.ut/same-day? ref-date ref-date))
      (is (shared.ut/same-day? ref-date same-day))
      (is (shared.ut/same-day? same-day ref-date))
      (is (not (shared.ut/same-day? ref-date same-month)))
      (is (not (shared.ut/same-day? ref-date same-year)))
      (is (not (shared.ut/same-day? ref-date previous-year))))
    (testing "same-month?"
      (is (shared.ut/same-month? ref-date ref-date))
      (is (shared.ut/same-month? ref-date same-day))
      (is (shared.ut/same-month? same-day ref-date))
      (is (shared.ut/same-month? same-day same-month))
      (is (not (shared.ut/same-month? same-day same-year)))
      (is (not (shared.ut/same-month? same-day previous-year))))
    (testing "same-year?"
      (is (shared.ut/same-year? ref-date ref-date))
      (is (shared.ut/same-year? ref-date same-day))
      (is (shared.ut/same-year? same-day ref-date))
      (is (shared.ut/same-year? same-day same-month))
      (is (shared.ut/same-year? same-day same-year))
      (is (not (shared.ut/same-year? same-day previous-year))))))

(deftest to-range-test
  (doseq [[exp-from exp-to date unit]
          [["2022-01-01T00:00:00Z" "2022-12-31T23:59:59.999Z" "2022-08-19T00:00:00" "year"]

           ["2022-08-01T00:00:00Z" "2022-08-31T23:59:59.999Z" "2022-08-19T00:00:00" "month"] ; 31 days in August
           ["2022-02-01T00:00:00Z" "2022-02-28T23:59:59.999Z" "2022-02-19T00:00:00" "month"] ; 28 days in regular February
           ["2020-02-01T00:00:00Z" "2020-02-29T23:59:59.999Z" "2020-02-19T00:00:00" "month"] ; 29 days in leap-year February

           ;; Weeks are Sunday-Saturday
           ["2022-08-21T00:00:00Z" "2022-08-27T23:59:59.999Z" "2022-08-21T00:00:00" "week"]  ; Input is Sunday
           ["2022-08-21T00:00:00Z" "2022-08-27T23:59:59.999Z" "2022-08-24T00:00:00" "week"]  ; Input is Wednesday
           ["2022-08-21T00:00:00Z" "2022-08-27T23:59:59.999Z" "2022-08-27T00:00:00" "week"]  ; Input is Saturday
           ;; Week that crosses a month boundary.
           ["2022-08-28T00:00:00Z" "2022-09-03T23:59:59.999Z" "2022-08-29T00:00:00" "week"]
           ["2022-08-28T00:00:00Z" "2022-09-03T23:59:59.999Z" "2022-09-01T00:00:00" "week"]
           ;; Week that crosses a year boundary.
           ["2019-12-29T00:00:00Z" "2020-01-04T23:59:59.999Z" "2019-12-30T00:00:00" "week"]
           ["2019-12-29T00:00:00Z" "2020-01-04T23:59:59.999Z" "2020-01-02T00:00:00" "week"]]
          :let [[from to] (shared.ut/to-range (shared.ut/coerce-to-timestamp date nil)
                                              {:unit   unit
                                               :locale #?(:cljs nil :clj (Locale/getDefault))})]]
    (is (same? (from-zulu exp-from) from) "start dates should be the same")
    (is (same? (from-zulu exp-to)   to)   "end dates should be the same")))

(defn- time-from [s]
  #?(:cljs (moment s moment/HTML5_FMT.TIME_MS)
     :clj  (t/local-time s)))

(deftest coerce-to-time-test
  (testing "parsing time strings"
    (are [exp input] (same? (time-from exp) (shared.ut/coerce-to-time input))
      "09:26:45.123" "09:26:45.123"
      "09:26:45.000" "09:26:45"
      "09:26:00.000" "09:26"
      "19:26:00.000" "19:26"

      "09:26:45.123" "09:26:45.123+08:00"
      "09:26:45.000" "09:26:45+08:00"
      "09:26:00.000" "09:26+08:00"
      "19:26:00.000" "19:26+08:00"

      "09:26:45.123" "09:26:45.123-08:00"
      "09:26:45.000" "09:26:45-08:00"
      "09:26:00.000" "09:26-08:00"
      "19:26:00.000" "19:26-08:00"))

  (testing "Moment and LocalTime values are simply returned"
    (let [t (time-from "09:29")]
      (is (= t (shared.ut/coerce-to-time t)))))

  (testing "numbers are treated as Unix timestamps"
    (is (thrown-with-msg? #?(:clj Exception :cljs js/Error)
                          #"Unknown input to coerce-to-time; expecting a string"
                          (shared.ut/coerce-to-time 12)))))
