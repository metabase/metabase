(ns metabase.shared.formatting.date-test
  (:require
   #?@(:cljs
       [[metabase.test-runner.assert-exprs.approximately-equal]])
   [clojure.test :refer [are deftest is testing]]
   [metabase.shared.formatting.date :as date]
   [metabase.shared.formatting.internal.date-formatters :as formatters]
   [metabase.shared.util.time :as shared.ut]
   [metabase.util.log.capture :as log.capture])
  #?(:clj (:import
           java.util.Locale)))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(def ^:private locale
  #?(:cljs nil :clj (Locale. "en")))

(deftest ^:parallel format-for-parameter-test
  (testing "some units have custom formatting"
    (are [exp date unit] (= exp (date/format-for-parameter (shared.ut/coerce-to-timestamp date) {:unit unit}))
      ;; Years
      "2022-01-01~2022-12-31" "2022-12-19T12:03:19" "year"
      ;; Months
      "2022-12"               "2022-12-19T12:03:19" "month"
      "2022-01"               "2022-01-19T12:03:19" "month"
      ;; Quarters
      "Q4-2022"               "2022-12-19T12:03:19" "quarter"
      "Q1-2022"               "2022-01-19T12:03:19" "quarter"
      ;; Quarter-of-year formats as the same day. This is an odd case, but it's in the original unit tests.
      ;; It actually isn't recognized as a ".startOf" by Moment, so it doesn't change the input. That means the
      ;; "range" is the input time, so it renders as a single day reference.
      "2022-01-19"            "2022-01-19T12:03:19" "quarter-of-year"
      ;; Days
      "2022-01-19"            "2022-01-19T12:03:19" "day"
      "2022-12-19"            "2022-12-19T12:03:19" "day")))

(deftest ^:parallel format-for-parameter-test-2
  (testing "other units are treated as days or day ranges"
    (are [exp date unit] (= exp (date/format-for-parameter (shared.ut/coerce-to-timestamp date)
                                                           {:unit   unit
                                                            :locale locale}))
      ;; Hour and minute are treated as days.
      "2022-12-19" "2022-12-19T12:03:19" "hour"
      "2022-12-19" "2022-12-19T00:03:19" "hour"
      "2022-12-19" "2022-12-19T12:03:19" "minute"
      "2022-12-19" "2022-12-19T00:03:19" "minute"

      ;; Weeks are (previous/this) start of Sunday to end of Saturday
      "2022-12-18~2022-12-24" "2022-12-18T00:03:19" "week"    ; Sunday
      "2022-12-18~2022-12-24" "2022-12-19T00:03:19" "week"    ; Monday
      "2022-12-18~2022-12-24" "2022-12-24T23:03:19" "week"))) ; Saturday

(deftest ^:parallel format-range-with-unit-test
  (letfn [(week-of [d]
            (date/format-range-with-unit d {:unit    "week"
                                            :compact true
                                            :locale  locale}))]
    (testing "full form (M d, Y - M d Y)"
      (testing "when not abbreviated"
        (is (= (str "November 1, 2022" date/range-separator "November 30, 2022")
               (date/format-range-with-unit "2022-11-16T11:19:04" {:unit "month"}))))
      (testing "in different years, even with :compact true"
        (is (= (str "Dec 29, 2019" date/range-separator "Jan 4, 2020")
               (week-of "2019-12-31T11:19:04")))))

    (testing "split months, shared year (M d - M d, Y"
      (is (= (str "Aug 28" date/range-separator "Sep 3, 2022")
             (week-of "2022-08-31T11:19:04"))))

    (testing "shared month and year (M d - d, Y)"
      (is (= (str "Dec 11" date/range-separator "17, 2022")
             (week-of "2022-12-14T11:19:04"))))))

(deftest ^:parallel format-datetime-with-unit-test-1a1
  (testing "special cases"
    (testing "is-exclude"
      (testing "for hour-of-day renders only the hour"
        (are [exp date] (= exp (date/format-datetime-with-unit date {:unit "hour-of-day" :is-exclude true}))
          "11 AM" "2022-11-20T11:19:04"
          "3 PM"  "2022-11-20T15:19:04"
          "12 AM" "2022-11-20T00:19:04"
          "12 PM" "2022-11-20T12:19:04")))))

(deftest ^:parallel format-datetime-with-unit-test-1a2
  (testing "special cases"
    (testing "is-exclude"
      (testing "for day-of-week renders eg. Monday"
        (testing "from ISO date strings"
          (are [exp date] (= exp (date/format-datetime-with-unit date {:unit "day-of-week" :is-exclude true}))
            "Sunday"    "2022-12-18T11:19:04"
            "Monday"    "2022-12-19T11:19:04"
            "Tuesday"   "2022-12-20T11:19:04"
            "Wednesday" "2022-12-21T11:19:04"
            "Thursday"  "2022-12-22T11:19:04"
            "Friday"    "2022-12-23T11:19:04"
            "Saturday"  "2022-12-24T11:19:04"))))))

(deftest ^:parallel format-datetime-with-unit-test-1a3
  (testing "special cases"
    (testing "is-exclude"
      (testing "for day-of-week renders eg. Monday"
        (testing "from weekday numbers"
          (are [exp date] (= exp (date/format-datetime-with-unit date {:unit "day-of-week" :is-exclude true}))
            "Saturday"  0
            "Sunday"    1
            "Monday"    2
            "Tuesday"   3
            "Wednesday" 4
            "Thursday"  5
            "Friday"    6
            "Saturday"  7
            "Sunday"    8))))))

(deftest ^:parallel format-datetime-with-unit-test-1a4
  (testing "special cases"
    (testing "is-exclude"
      (testing "for day-of-week renders eg. Monday"
        (testing "from short weekday names"
          (are [exp date] (= exp (date/format-datetime-with-unit date {:unit "day-of-week" :is-exclude true}))
            "Sunday"    "Sun"
            "Monday"    "Mon"
            "Tuesday"   "Tue"
            "Wednesday" "Wed"
            "Thursday"  "Thu"
            "Friday"    "Fri"
            "Saturday"  "Sat"
            "Sunday"    "Sun"))))))

(deftest ^:parallel format-datetime-with-unit-test-1a5
  (testing "special cases"
    (testing "is-exclude"
      (testing "for day-of-week renders eg. Monday"
        (testing "from full weekday names"
          (are [exp date] (= exp (date/format-datetime-with-unit date {:unit "day-of-week" :is-exclude true}))
            "Sunday"    "Sunday"
            "Monday"    "Monday"
            "Tuesday"   "Tuesday"
            "Wednesday" "Wednesday"
            "Thursday"  "Thursday"
            "Friday"    "Friday"
            "Saturday"  "Saturday"
            "Sunday"    "Sunday"))))))

(deftest ^:parallel format-datetime-with-unit-test-1b1
  (testing "special cases"
    (testing "weeks in tooltips (condensed ranges, not abbreviated)"
      (testing "that fit in one month are formatted December 18 - 24, 2022"
        (is (= (str "December 18" date/range-separator "24, 2022")
               (date/format-datetime-with-unit "2022-12-20T11:19:04" {:unit   "week"
                                                                      :type   "tooltip"
                                                                      :locale locale})))))))

(deftest ^:parallel format-datetime-with-unit-test-1b2
  (testing "special cases"
    (testing "weeks in tooltips (condensed ranges, not abbreviated)"
      (testing "that span months are formatted November 27 - December 3, 2022"
        (is (= (str "November 27" date/range-separator "December 3, 2022")
               (date/format-datetime-with-unit "2022-11-30T11:19:04" {:unit   "week"
                                                                      :type   "tooltip"
                                                                      :locale locale})))))))

(deftest ^:parallel format-datetime-with-unit-test-1b3
  (testing "special cases"
    (testing "weeks in tooltips (condensed ranges, not abbreviated)"
      (testing "that span years are formatted December 29, 2019 - January 4, 2020"
        (is (= (str "December 29, 2019" date/range-separator "January 4, 2020")
               (date/format-datetime-with-unit "2019-12-30T11:19:04" {:unit   "week"
                                                                      :type   "tooltip"
                                                                      :locale locale})))))))

(deftest ^:parallel format-datetime-with-unit-test-2a
  (testing "general dates"
    (testing "with default style, unit-based"
      (are [exp unit] (= exp (date/format-datetime-with-unit "2022-12-07" {:unit unit}))
        "2022"                     "year"
        "Q4 - 2022"                "quarter"
        "Q4"                       "quarter-of-year"
        ;; Not just "month" because that's got overrides, tested below.
        "December"                 "month-of-year"
        "December 7, 2022"         "day"
        "7"                        "day-of-month"
        "Wednesday"                "day-of-week"
        "341"                      "day-of-year"
        #?(:clj "50" :cljs "50th") "week-of-year"))))

(deftest ^:parallel format-datetime-with-unit-test-2b
  (testing "general dates"
    (testing "default formats for each date style"
      (are [exp style unit] (= exp (date/format-datetime-with-unit "2022-04-07T19:08:45.123" {:unit         unit
                                                                                              :date-style   style
                                                                                              :time-enabled false}))
        "4/7/2022"                "M/D/YYYY"           "day"
        "7/4/2022"                "D/M/YYYY"           "hour"
        "2022/4/7"                "YYYY/M/D"           "day"
        "April 7, 2022"           "MMMM D, YYYY"       "day"
        "7 April, 2022"           "D MMMM, YYYY"       "day"
        "Thursday, April 7, 2022" "dddd, MMMM D, YYYY" "day"))))

(deftest ^:parallel format-datetime-with-unit-test-2c1
  (testing "general dates"
    (testing "unit overrides for various styles"
      (are [exp style unit] (= exp (date/format-datetime-with-unit "2022-04-07T19:08:45.123" {:unit         unit
                                                                                              :date-style   style
                                                                                              :time-enabled false}))
        "4/2022"        "M/D/YYYY"           "month"
        "4/2022"        "D/M/YYYY"           "month"
        "2022/4"        "YYYY/M/D"           "month"
        "2022 - Q2"     "YYYY/M/D"           "quarter"
        "April, 2022"   "MMMM D, YYYY"       "month"
        "April, 2022"   "D MMMM, YYYY"       "month"
        "April 7, 2022" "dddd, MMMM D, YYYY" "week"  ;; TODO is this actually right? check with existing code
        "April, 2022"   "dddd, MMMM D, YYYY" "month"))))

(deftest ^:parallel format-datetime-with-unit-test-2c2
  (testing "general dates"
    (testing "unit overrides for various styles"
      (testing "use short forms in compact mode"
        (are [exp style unit] (= exp (date/format-datetime-with-unit "2022-04-07T19:08:45.123" {:unit         unit
                                                                                                :time-enabled false
                                                                                                :compact      true}))
          "Apr, 2022"   "MMMM D, YYYY"       "month"
          "Apr, 2022"   "D MMMM, YYYY"       "month"
          "Apr 7, 2022" "dddd, MMMM D, YYYY" "week"  ;; TODO is this actually right? check with existing code
          "Apr, 2022"   "dddd, MMMM D, YYYY" "month")))))

(deftest ^:parallel format-datetime-with-unit-test-2d
  (testing "general dates"
    (testing "custom date separators"
      (are [exp style separator unit]
           (= exp (date/format-datetime-with-unit "2022-04-07T19:08:45.123" {:unit           unit
                                                                             :time-enabled   false
                                                                             :date-style     style
                                                                             :date-separator separator
                                                                             :compact        true}))
        "Apr, 2022"    "MMMM D, YYYY" "/" "month"
        "Apr 7, 2022"  "MMMM D, YYYY" "/" "day"
        "Apr, 2022"    "MMMM D, YYYY" "-" "month"
        "Apr 7, 2022"  "MMMM D, YYYY" "-" "day"
        "4/2022"       "M/D/YYYY"     "/" "month"
        "4/7/2022"     "M/D/YYYY"     "/" "day"
        "4-2022"       "M/D/YYYY"     "-" "month"
        "4-7-2022"     "M/D/YYYY"     "-" "day"
        "4/2022"       "D/M/YYYY"     "/" "month"
        "7/4/2022"     "D/M/YYYY"     "/" "day"
        "4-2022"       "D/M/YYYY"     "-" "month"
        "7-4-2022"     "D/M/YYYY"     "-" "day"))))

(deftest ^:parallel format-datetime-with-unit-test-3a
  (testing "general dates and times"
    (testing "with both styles left as defaults and a sub-day :unit"
      (is (= "April 7, 2022, 7:08 PM"
             (date/format-datetime-with-unit "2022-04-07T19:08:45.123" {:unit "minute"}))))))

(deftest ^:parallel format-datetime-with-unit-test-3b
  (testing "general dates and times"
    (testing "setting the time style"
      (are [exp style enabled]
           (= exp (date/format-datetime-with-unit "2022-04-07T19:08:45.123" {:time-enabled enabled
                                                                             :time-style   style}))
        "April 7, 2022, 7:08 PM"        "h:mm A" "minutes"
        "April 7, 2022, 19:08"          "HH:mm"  "minutes"
        "April 7, 2022, 7:08:45 PM"     "h:mm A" "seconds"
        "April 7, 2022, 19:08:45"       "HH:mm"  "seconds"
        "April 7, 2022, 7:08:45.123 PM" "h:mm A" "milliseconds"
        "April 7, 2022, 19:08:45.123"   "HH:mm"  "milliseconds"))))

(deftest ^:parallel format-datetime-with-unit-test-3c
  (testing "general dates and times"
    (testing "setting both styles"
      (are [exp date-style time-style enabled]
           (= exp (date/format-datetime-with-unit "2022-04-07T19:08:45.123" {:date-style   date-style
                                                                             :time-style   time-style
                                                                             :time-enabled enabled}))
        "April 7, 2022, 7:08 PM" "MMMM D, YYYY" "h:mm A" "minutes"
        "April 7, 2022, 19:08"   "MMMM D, YYYY" "HH:mm"  "minutes"
        "4/7/2022, 7:08 PM"      "M/D/YYYY"     "h:mm A" "minutes"
        "4/7/2022, 19:08"        "M/D/YYYY"     "HH:mm"  "minutes"
        "4/7/2022, 19:08:45"     "M/D/YYYY"     "HH:mm"  "seconds"
        "4/7/2022, 19:08:45.123" "M/D/YYYY"     "HH:mm"  "milliseconds"))))

(deftest ^:parallel format-datetime-with-unit-test-3d
  (testing "general dates and times"
    (testing "setting a date style and unit that overrides, plus a time"
      ;; This is a weird thing to do, but it should work correctly.
      (is (= "4/2022, 19:08:45.123"
             (date/format-datetime-with-unit "2022-04-07T19:08:45.123" {:date-style   "M/D/YYYY"
                                                                        :time-style   "HH:mm"
                                                                        :time-enabled "milliseconds"
                                                                        :unit         "month"}))))))

(deftest ^:parallel format-datetime-with-unit-test-4
  (testing "bare times"
    (are [exp arg unit time-style] (= exp (date/format-datetime-with-unit arg {:unit       unit
                                                                               :time-style time-style}))
      "7:00 AM"   7 "hour-of-day" "h:mm A"
      "12:00 PM" 12 "hour-of-day" "h:mm A"
      "7:00 PM"  19 "hour-of-day" "h:mm A"
      "12:00 AM" 24 "hour-of-day" "h:mm A"
      "07:00"     7 "hour-of-day" "HH:mm"
      "12:00"    12 "hour-of-day" "HH:mm"
      "19:00"    19 "hour-of-day" "HH:mm"
      "00:00"    24 "hour-of-day" "HH:mm")))

(deftest ^:parallel format-datetime-with-unit-test-5
  (testing "prepending weekdays"
    (testing "works on any date format with days"
      (are [exp date-style time-style unit]
           (= exp (date/format-datetime-with-unit "2022-04-07T19:08:45.123" {:date-style      date-style
                                                                             :time-style      time-style
                                                                             :time-enabled    (when time-style "minutes")
                                                                             :unit            unit
                                                                             :weekday-enabled true}))
        "Thu, April 7, 2022, 7:08 PM" "MMMM D, YYYY" "h:mm A" "minute"
        "Thu, April 7, 2022, 19:08"   "MMMM D, YYYY" "HH:mm"  "minute"
        "Thu, 4/7/2022, 7:08 PM"      "M/D/YYYY"     "h:mm A" "minute"
        "Thu, 4/7/2022, 19:08"        "M/D/YYYY"     "HH:mm"  "minute"
        "Thu, 4/7/2022, 19:08"        "M/D/YYYY"     "HH:mm"  "hour"
        "Thu, April 7, 2022"          "MMMM D, YYYY" nil      "day"
        "Thu, April 7, 2022"          "MMMM D, YYYY" nil      "week"))))

(deftest ^:parallel format-datetime-with-unit-test-5b
  (testing "prepending weekdays"
    (testing "is skipped if the unit does not have day resolution"
      (are [exp date-style unit]
           (= exp (date/format-datetime-with-unit "2022-04-07T19:08:45.123" {:date-style      date-style
                                                                             :unit            unit
                                                                             :weekday-enabled true}))
        "April, 2022" "MMMM D, YYYY" "month"
        "Q2 - 2022"   "MMMM D, YYYY" "quarter"
        "2022"        "MMMM D, YYYY" "year"))))

(deftest fallback-test
  (testing "fallback to ISO date string if neither the unit nor style map to a format"
    (let [result (atom nil)]
      ;; Clear the cache, because it only generates the warning the first time this gets constructured.
      (reset! @#'formatters/options->formatter-cache {})
      (log.capture/with-log-messages-for-level [messages :warn]
        (reset! result
                (date/format-datetime-with-unit "2022-04-07T19:08:45.123" {:unit         :asdf
                                                                           :date-style   "asdf"
                                                                           :time-enabled false}))
        (is (=? [{:level :warn, :message "Unrecognized date style {:date-style asdf, :unit :asdf}"}]
                (messages))))
      (is (= "2022-04-07T19:08:45" @result)))))

;; TODO The originals theoretically support custom "date-format" and "time-format" options; are they ever
;; actually used? What about non-standard styles?
