(ns metabase.driver.common.parameters.dates-test
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase.driver.common.parameters.dates :as dates]
            [metabase.util.date-2 :as u.date]))

(deftest date-string->filter-test
  (testing "year and month"
    (is (= [:between
            [:datetime-field [:field-literal "field" :type/DateTime] :day]
            "2019-04-01"
            "2019-04-30"]
           (dates/date-string->filter "2019-04" [:field-literal "field" :type/DateTime])))
    (testing "quarter year"
      (is (= [:between
              [:datetime-field [:field-literal "field" :type/DateTime] :day]
              "2019-04-01"
              "2019-06-30"]
             (dates/date-string->filter "Q2-2019" [:field-literal "field" :type/DateTime]))))
    (testing "single day"
      (is (= [:=
              [:datetime-field [:field-literal "field" :type/DateTime] :day]
              "2019-04-01"]
             (dates/date-string->filter "2019-04-01" [:field-literal "field" :type/DateTime]))))
    (testing "day range"
      (is (= [:between
              [:datetime-field [:field-literal "field" :type/DateTime] :day]
              "2019-04-01"
              "2019-04-03"]
             (dates/date-string->filter "2019-04-01~2019-04-03" [:field-literal "field" :type/DateTime]))))
    (testing "after day"
      (is (= [:>
              [:datetime-field [:field-literal "field" :type/DateTime] :day]
              "2019-04-01"]
             (dates/date-string->filter "2019-04-01~" [:field-literal "field" :type/DateTime]))))))

(deftest date-string->range-test
  (t/with-clock (t/mock-clock #t "2016-06-07T12:00Z")
    (doseq [[group s->expected]
            {"absolute datetimes"         {"Q1-2016"               {:end "2016-03-31", :start "2016-01-01"}
                                           "2016-02"               {:end "2016-02-29", :start "2016-02-01"}
                                           "2016-04-18"            {:end "2016-04-18", :start "2016-04-18"}
                                           "2016-04-18~2016-04-23" {:end "2016-04-23", :start "2016-04-18"}
                                           "2016-04-18~"           {:start "2016-04-18"}
                                           "~2016-04-18"           {:end "2016-04-18"}}
             "relative (past)"            {"past3days"    {:end "2016-06-06", :start "2016-06-04"}
                                           "past3days~"   {:end "2016-06-07", :start "2016-06-04"}
                                           "past7days"    {:end "2016-06-06", :start "2016-05-31"}
                                           "past30days"   {:end "2016-06-06", :start "2016-05-08"}
                                           "past2months"  {:end "2016-05-31", :start "2016-04-01"}
                                           "past2months~" {:end "2016-06-30", :start "2016-04-01"}
                                           "past13months" {:end "2016-05-31", :start "2015-05-01"}
                                           "past1years"   {:end "2015-12-31", :start "2015-01-01"}
                                           "past1years~"  {:end "2016-12-31", :start "2015-01-01"}
                                           "past16years"  {:end "2015-12-31", :start "2000-01-01"}}
             "relative (next)"            {"next3days"    {:end "2016-06-10", :start "2016-06-08"}
                                           "next3days~"   {:end "2016-06-10", :start "2016-06-07"}
                                           "next7days"    {:end "2016-06-14", :start "2016-06-08"}
                                           "next30days"   {:end "2016-07-07", :start "2016-06-08"}
                                           "next2months"  {:end "2016-08-31", :start "2016-07-01"}
                                           "next2months~" {:end "2016-08-31", :start "2016-06-01"}
                                           "next13months" {:end "2017-07-31", :start "2016-07-01"}
                                           "next1years"   {:end "2017-12-31", :start "2017-01-01"}
                                           "next1years~"  {:end "2017-12-31", :start "2016-01-01"}
                                           "next16years"  {:end "2032-12-31", :start "2017-01-01"}}
             "relative (this)"            {"thisday"   {:end "2016-06-07", :start "2016-06-07"}
                                           "thisweek"  {:end "2016-06-11", :start "2016-06-05"}
                                           "thismonth" {:end "2016-06-30", :start "2016-06-01"}
                                           "thisyear"  {:end "2016-12-31", :start "2016-01-01"}}
             "relative (last)"            {"lastweek"  {:end "2016-06-04", :start "2016-05-29"}
                                           "lastmonth" {:end "2016-05-31", :start "2016-05-01"}
                                           "lastyear"  {:end "2015-12-31", :start "2015-01-01"}}
             "relative (today/yesterday)" {"yesterday" {:end "2016-06-06", :start "2016-06-06"}
                                           "today"     {:end "2016-06-07", :start "2016-06-07"}}}]
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
                 (dates/date-string->range s options))
              (format "%s with options %s should parse to %s" (pr-str s) (pr-str options) (pr-str expected))))))))
