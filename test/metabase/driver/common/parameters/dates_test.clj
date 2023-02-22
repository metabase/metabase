(ns metabase.driver.common.parameters.dates-test
  (:require
   [clojure.test :refer :all]
   [clojure.test.check :as tc]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase.driver.common.parameters.dates :as params.dates]
   [metabase.test :as mt]
   [metabase.util.date-2 :as u.date]))

(deftest date-string->filter-test
  (testing "year and month"
    (is (= [:between
            [:field "field" {:base-type :type/DateTime, :temporal-unit :day}]
            "2019-04-01"
            "2019-04-30"]
           (params.dates/date-string->filter "2019-04" [:field "field" {:base-type :type/DateTime}]))))
  (testing "quarter year"
    (is (= [:between
            [:field "field" {:base-type :type/DateTime, :temporal-unit :day}]
            "2019-04-01"
            "2019-06-30"]
           (params.dates/date-string->filter "Q2-2019" [:field "field" {:base-type :type/DateTime}]))))
  (testing "single day"
    (is (= [:=
            [:field "field" {:base-type :type/DateTime, :temporal-unit :day}]
            "2019-04-01"]
           (params.dates/date-string->filter "2019-04-01" [:field "field" {:base-type :type/DateTime}]))))
  (testing "day range"
    (is (= [:between
            [:field "field" {:base-type :type/DateTime, :temporal-unit :day}]
            "2019-04-01"
            "2019-04-03"]
           (params.dates/date-string->filter "2019-04-01~2019-04-03" [:field "field" {:base-type :type/DateTime}]))))
  (testing "after day"
    (is (= [:>
            [:field "field" {:base-type :type/DateTime, :temporal-unit :day}]
            "2019-04-01"]
           (params.dates/date-string->filter "2019-04-01~" [:field "field" {:base-type :type/DateTime}]))))
  (testing "relative (past) exclusive"
    (is (= [:time-interval
            [:field "field" {:base-type :type/DateTime}]
            -3
            :day
            {:include-current false}]
           (params.dates/date-string->filter "past3days" [:field "field" {:base-type :type/DateTime}]))))
  (testing "relative (past) inclusive"
    (is (= [:time-interval [:field "field" {:base-type :type/DateTime}]
            -3
            :day
            {:include-current true}]
           (params.dates/date-string->filter "past3days~" [:field "field" {:base-type :type/DateTime}]))))
  (testing "relative (next) exclusive"
    (is (= [:time-interval [:field "field" {:base-type :type/DateTime}]
            3
            :day
            {:include-current false}]
           (params.dates/date-string->filter "next3days" [:field "field" {:base-type :type/DateTime}]))))
  (testing "relative (next) inclusive"
    (is (= [:time-interval [:field "field" {:base-type :type/DateTime}]
            3
            :day
            {:include-current true}]
           (params.dates/date-string->filter "next3days~" [:field "field" {:base-type :type/DateTime}]))))
  (testing "quarters (#21083)"
    (is (= [:time-interval [:field "field" {:base-type :type/DateTime}] -30 :quarter {:include-current false}]
           (params.dates/date-string->filter "past30quarters" [:field "field" {:base-type :type/DateTime}]))))
  (testing "relative (past) with starting from "
    (is (= [:between
            [:+ [:field "field" {:base-type :type/DateTime}] [:interval 3 :year]]
            [:relative-datetime -3 :day]
            [:relative-datetime 0 :day]]
           (params.dates/date-string->filter "past3days-from-3years" [:field "field" {:base-type :type/DateTime}]))))
  (testing "relative (next) with starting from"
    (is (= [:between
            [:+ [:field "field" {:base-type :type/DateTime}] [:interval -13 :month]]
            [:relative-datetime 0 :hour]
            [:relative-datetime 7 :hour]]
           (params.dates/date-string->filter "next7hours-from-13months" [:field "field" {:base-type :type/DateTime}]))))
  (testing "exclusions"
    (mt/with-clock #t "2016-06-07T12:13:55Z"
      (testing "hours"
        (is (= [:!=
                [:field "field" {:base-type :type/DateTime, :temporal-unit :hour-of-day}]
                "2016-06-07T00:00:00Z"]
               (params.dates/date-string->filter "exclude-hours-0" [:field "field" {:base-type :type/DateTime}])))
        (is (= [:!=
                [:field "field" {:base-type :type/DateTime, :temporal-unit :hour-of-day}]
                "2016-06-07T00:00:00Z"
                "2016-06-07T23:00:00Z"]
               (params.dates/date-string->filter "exclude-hours-0-23" [:field "field" {:base-type :type/DateTime}])))
        (is (thrown? clojure.lang.ExceptionInfo #"Don't know how to parse date string \"exclude-hours-\""
               (params.dates/date-string->filter "exclude-hours-" [:field "field" {:base-type :type/DateTime}])))
        (is (thrown? clojure.lang.ExceptionInfo #"Don't know how to parse date string \"exclude-hours-24-3\""
               (params.dates/date-string->filter "exclude-hours-24-3" [:field "field" {:base-type :type/DateTime}]))))
      (testing "quarters"
        (is (= [:!=
                [:field "field" {:base-type :type/DateTime, :temporal-unit :quarter-of-year}]
                "2016-01-01"]
               (params.dates/date-string->filter "exclude-quarters-1" [:field "field" {:base-type :type/DateTime}])))
        (is (= [:!=
                [:field "field" {:base-type :type/DateTime, :temporal-unit :quarter-of-year}]
                "2016-04-01"
                "2016-07-01"
                "2016-10-01"]
               (params.dates/date-string->filter "exclude-quarters-2-3-4" [:field "field" {:base-type :type/DateTime}])))
        (is (thrown? clojure.lang.ExceptionInfo #"Don't know how to parse date string \"exclude-quarters-Q1\""
               (params.dates/date-string->filter "exclude-quarters-Q1" [:field "field" {:base-type :type/DateTime}]))))
      (testing "days"
        (is (= [:!=
                [:field "field" {:base-type :type/DateTime, :temporal-unit :day-of-week}]
                "2016-06-10"
                "2016-06-07"]
               (params.dates/date-string->filter "exclude-days-Fri-Tue" [:field "field" {:base-type :type/DateTime}])))
        (is (thrown? clojure.lang.ExceptionInfo #"Don't know how to parse date string \"exclude-days-Friday\""
               (params.dates/date-string->filter "exclude-days-Friday" [:field "field" {:base-type :type/DateTime}]))))
      (testing "months"
        (is (= [:!=
                [:field "field" {:base-type :type/DateTime, :temporal-unit :month-of-year}]
                "2016-12-01"
                "2016-04-01"
                "2016-09-01"]
               (params.dates/date-string->filter "exclude-months-Dec-Apr-Sep" [:field "field" {:base-type :type/DateTime}])))
        (is (thrown? clojure.lang.ExceptionInfo #"Don't know how to parse date string \"exclude-months-April\""
                     (params.dates/date-string->filter "exclude-months-April" [:field "field" {:base-type :type/DateTime}]))))
      (testing "minutes"
        (is (thrown? clojure.lang.ExceptionInfo #"Don't know how to parse date string \"exclude-minutes-15-30\""
               (params.dates/date-string->filter "exclude-minutes-15-30" [:field "field" {:base-type :type/DateTime}])))))))

(deftest date-string->range-test
  (mt/with-clock #t "2016-06-07T12:13:55Z"
    (doseq [[group s->expected]
            {"absolute datetimes"         {"Q1-2016"               {:start "2016-01-01", :end "2016-03-31"}
                                           "2016-02"               {:start "2016-02-01", :end "2016-02-29"}
                                           "2016-04-18"            {:start "2016-04-18", :end "2016-04-18"}
                                           "2016-04-18~2016-04-23" {:start "2016-04-18", :end "2016-04-23"}
                                           "2016-04-18~"           {:start "2016-04-18"}
                                           "~2016-04-18"           {:end "2016-04-18"}}
             "relative (past)"            {"past30seconds"  {:start "2016-06-07T12:13:25", :end "2016-06-07T12:13:54"}
                                           "past5minutes~"  {:start "2016-06-07T12:08:00", :end "2016-06-07T12:13:00"}
                                           "past3hours"     {:start "2016-06-07T09:00:00", :end "2016-06-07T11:00:00"}
                                           "past3days"      {:start "2016-06-04", :end "2016-06-06"}
                                           "past3days~"     {:start "2016-06-04", :end "2016-06-07"}
                                           "past7days"      {:start "2016-05-31", :end "2016-06-06"}
                                           "past30days"     {:start "2016-05-08", :end "2016-06-06"}
                                           "past2months"    {:start "2016-04-01", :end "2016-05-31"}
                                           "past2months~"   {:start "2016-04-01", :end "2016-06-30"}
                                           "past13months"   {:start "2015-05-01", :end "2016-05-31"}
                                           "past2quarters"  {:start "2015-10-01", :end "2016-03-31"}
                                           "past2quarters~" {:start "2015-10-01", :end "2016-06-30"}
                                           "past1years"     {:start "2015-01-01", :end "2015-12-31"}
                                           "past1years~"    {:start "2015-01-01", :end "2016-12-31"}
                                           "past16years"    {:start "2000-01-01", :end "2015-12-31"}}
             "relative (next)"            {"next45seconds"  {:start "2016-06-07T12:13:56", :end "2016-06-07T12:14:40"}
                                           "next20minutes"  {:start "2016-06-07T12:14:00", :end "2016-06-07T12:33:00"}
                                           "next6hours"     {:start "2016-06-07T13:00:00", :end "2016-06-07T18:00:00"}
                                           "next3days"      {:start "2016-06-08", :end "2016-06-10"}
                                           "next3days~"     {:start "2016-06-07", :end "2016-06-10"}
                                           "next7days"      {:start "2016-06-08", :end "2016-06-14"}
                                           "next30days"     {:start "2016-06-08", :end "2016-07-07"}
                                           "next2months"    {:start "2016-07-01", :end "2016-08-31"}
                                           "next2months~"   {:start "2016-06-01", :end "2016-08-31"}
                                           "next2quarters"  {:start "2016-07-01", :end "2016-12-31"}
                                           "next2quarters~" {:start "2016-04-01", :end "2016-12-31"}
                                           "next13months"   {:start "2016-07-01", :end "2017-07-31"}
                                           "next1years"     {:start "2017-01-01", :end "2017-12-31"}
                                           "next1years~"    {:start "2016-01-01", :end "2017-12-31"}
                                           "next16years"    {:start "2017-01-01", :end "2032-12-31"}}
             "relative (this)"            {"thissecond"  {:start "2016-06-07T12:13:55", :end "2016-06-07T12:13:55"}
                                           "thisminute"  {:start "2016-06-07T12:13:00", :end "2016-06-07T12:13:00"}
                                           "thishour"    {:start "2016-06-07T12:00:00", :end "2016-06-07T12:00:00"}
                                           "thisday"     {:start "2016-06-07", :end "2016-06-07"}
                                           "thisweek"    {:start "2016-06-05", :end "2016-06-11"}
                                           "thismonth"   {:start "2016-06-01", :end "2016-06-30"}
                                           "thisquarter" {:start "2016-04-01", :end "2016-06-30"}
                                           "thisyear"    {:start "2016-01-01", :end "2016-12-31"}}
             "relative (last)"            {"lastsecond"  {:start "2016-06-07T12:13:54", :end "2016-06-07T12:13:54"}
                                           "lastminute"  {:start "2016-06-07T12:12:00", :end "2016-06-07T12:12:00"}
                                           "lasthour"    {:start "2016-06-07T11:00:00", :end "2016-06-07T11:00:00"}
                                           "lastweek"    {:start "2016-05-29", :end "2016-06-04"}
                                           "lastmonth"   {:start "2016-05-01", :end "2016-05-31"}
                                           "lastquarter" {:start "2016-01-01", :end "2016-03-31"}
                                           "lastyear"    {:start "2015-01-01", :end "2015-12-31"}}
             "relative (today/yesterday)" {"yesterday" {:start "2016-06-06", :end "2016-06-06"}
                                           "today"     {:start "2016-06-07", :end "2016-06-07"}}
             "relative (past) with starting from" {"past1days-from-0days"      {:start "2016-06-06", :end "2016-06-06"}
                                                   "past1months-from-0months"  {:start "2016-05-01", :end "2016-05-31"}
                                                   "past1months-from-36months" {:start "2013-05-01", :end "2013-05-31"}
                                                   "past1years-from-36months"  {:start "2012-01-01", :end "2012-12-31"}
                                                   "past3days-from-3years"     {:start "2013-06-04", :end "2013-06-06"}}
             "relative (next) with starting from" {"next2days-from-1months"    {:start "2016-07-08", :end "2016-07-09"}
                                                   "next1months-from-0months"  {:start "2016-07-01", :end "2016-07-31"}
                                                   "next1months-from-36months" {:start "2019-07-01", :end "2019-07-31"}
                                                   "next1years-from-36months"  {:start "2020-01-01", :end "2020-12-31"}
                                                   "next3days-from-3years"     {:start "2019-06-08", :end "2019-06-10"}
                                                   "next7hours-from-13months"  {:start "2017-07-07T13:00:00", :end "2017-07-07T19:00:00"}}}]
      (testing group
        (doseq [[s inclusive-range]   s->expected
                [options range-xform] (letfn [(adjust [m k amount]
                                                (if-not (get m k)
                                                  m
                                                  (update m k #(u.date/format (u.date/add (u.date/parse %) :day amount)))))
                                              (adjust-start [m]
                                                (adjust m :start -1))
                                              (adjust-end [m]
                                                (adjust m :end 1))]
                                        {nil                                              identity
                                         {:inclusive-start? false}                        adjust-start
                                         {:inclusive-end? false}                          adjust-end
                                         {:inclusive-start? false, :inclusive-end? false} (comp adjust-start adjust-end)})
                :let                  [expected (range-xform inclusive-range)]]
          (is (= expected
                 (params.dates/date-string->range s options))
              (format "%s with options %s should parse to %s" (pr-str s) (pr-str options) (pr-str expected))))))))

(deftest relative-dates-with-starting-from-zero-must-match
  (testing "relative dates need to behave the same way, offset or not."
    (mt/with-clock #t "2016-06-07T12:13:55Z"
      (testing "'past1months-from-0months' should be the same as: 'past1months'"
        (is (= {:start "2016-05-01", :end "2016-05-31"}
               (params.dates/date-string->range "past1months")
               (params.dates/date-string->range "past1months-from-0months"))))
      (testing "'next1months-from-0months' should be the same as: 'next1months'"
        (is (= {:start "2016-07-01", :end "2016-07-31"}
               (params.dates/date-string->range "next1months")
               (params.dates/date-string->range "next1months-from-0months")))))))

(def time-range-generator
  (let [time-units (mapv #(str % "s") (keys @#'params.dates/operations-by-date-unit))]
    (gen/fmap
     (fn [[frame n unit unit2]]
       [(str frame n unit)
        (str frame n unit "-from-0" unit2)])
     (gen/tuple
      (gen/elements #{"next" "past"})
      (gen/such-that #(not= % 0) gen/nat)
      (gen/elements time-units)
      (gen/elements time-units)))))

(tc/quick-check 1000
  (prop/for-all [[tr tr+from-zero] time-range-generator]
    (= (params.dates/date-string->range tr)
       (params.dates/date-string->range tr+from-zero))))

(deftest custom-start-of-week-test
  (testing "Relative filters should respect the custom `start-of-week` Setting (#14294)"
    (mt/with-clock #t "2021-03-01T14:15:00-08:00[US/Pacific]"
      (doseq [[first-day-of-week expected] {"sunday"    {:start "2021-02-21", :end "2021-02-27"}
                                            "monday"    {:start "2021-02-22", :end "2021-02-28"}
                                            "tuesday"   {:start "2021-02-16", :end "2021-02-22"}
                                            "wednesday" {:start "2021-02-17", :end "2021-02-23"}
                                            "thursday"  {:start "2021-02-18", :end "2021-02-24"}
                                            "friday"    {:start "2021-02-19", :end "2021-02-25"}
                                            "saturday"  {:start "2021-02-20", :end "2021-02-26"}}]
        (mt/with-temporary-setting-values [start-of-week first-day-of-week]
          (is (= expected
                 (params.dates/date-string->range "past1weeks"))))))))
