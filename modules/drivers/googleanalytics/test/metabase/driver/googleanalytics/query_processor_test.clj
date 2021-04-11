(ns metabase.driver.googleanalytics.query-processor-test
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase.driver.googleanalytics-test :as ga.test]
            [metabase.driver.googleanalytics.query-processor :as ga.qp]
            [metabase.test :as mt]
            [metabase.util :as u]))

(deftest built-in-segment-test
  (is (= "ga::WOW"
         (#'ga.qp/built-in-segment {:filter [:segment "ga::WOW"]})))
  (testing "should work recursively"
    (is (= "gaid::A"
           (#'ga.qp/built-in-segment {:filter [:and [:= [:field 1 nil] 2] [:segment "gaid::A"]]}))))
  (testing "should throw Exception if more than one segment is matched"
    (is (thrown? Exception
                 (#'ga.qp/built-in-segment {:filter [:and [:segment "gaid::A"] [:segment "ga::B"]]}))))
  (testing "should ignore Metabase segments"
    (is (= "ga::B"
           (#'ga.qp/built-in-segment {:filter [:and [:segment 100] [:segment "ga::B"]]})))))

(deftest filter-test
  (mt/with-report-timezone-id nil
    (testing "\nabsolute datetimes"
      (doseq [[filter-type expected] {:=  {:start-date "2019-11-18", :end-date "2019-11-18"}
                                      :<  {:end-date "2019-11-17"}
                                      :<= {:end-date "2019-11-18"}
                                      :>  {:start-date "2019-11-19"}
                                      :>= {:start-date "2019-11-18"}}]
        (let [filter-clause [filter-type [:field 'field {:temporal-unit :day}] [:absolute-datetime (t/local-date "2019-11-18") :day]]]
          (testing filter-clause
            (is (= expected
                   (#'ga.qp/parse-filter:interval filter-clause)))))))
    (testing "\nrelative datetimes"
      (mt/with-database-timezone-id "UTC"
        (mt/with-clock (t/mock-clock (t/instant "2019-11-18T22:31:00Z") (t/zone-id "UTC"))
          (doseq [[filter-type {:keys [expected message]}]
                  {:=  {:message  "`=` filter — Month is 4 months ago, i.e. July 2019"
                        :expected {:start-date "2019-07-01", :end-date "2019-07-31"}}
                   :<  {:message  "`<` filter — month is less than 4 months ago, i.e. before July 2019"
                        :expected {:end-date "2019-06-30"}}
                   :<= {:message  "`<=` filter — month is less than or equal to 4 months ago, i.e. before August 2019"
                        :expected {:end-date "2019-07-31"}}
                   :>  {:message  "`>` filter — month is greater than 4 months ago, i.e. after July 2019"
                        :expected {:start-date "2019-08-01"}}
                   :>= {:message  "`>=` filter — month is greater than or equal to 4 months ago, i.e. after June 2019"
                        :expected {:start-date "2019-07-01"}}}]
            (testing (str "\n" message)
              (let [filter-clause [filter-type [:field 'field {:temporal-unit :month}] [:relative-datetime -4 :month]]]
                (testing filter-clause
                  (is (= expected
                         (#'ga.qp/parse-filter:interval filter-clause)))))))
          (testing "\ntemporal field bucketing unit != relative-datetime bucketing unit"
            (testing "Day = 4 months ago => Date = July 2019 => Date = 2019-07-01"
              ;; this is another weird query that is unlikely to actually get generated in the wild -- FE client
              ;; currently only uses `:time-interval` which doesn't produce queries with mixed units. This matches the
              ;; behavior of the SQL QP however.
              (let [filter-clause [:= [:field 'field {:temporal-unit :day}] [:relative-datetime -4 :month]]]
                (testing filter-clause
                  (is (= {:start-date "2019-07-01", :end-date "2019-07-01"}
                         (#'ga.qp/parse-filter:interval filter-clause)))))))
          (testing "\n:between filter"
            (is (= {:start-date "2019-07-01", :end-date "2019-10-31"}
                   (#'ga.qp/parse-filter:interval [:between
                                                   [:field 'field {:temporal-unit :month}]
                                                   [:relative-datetime -4 :month]
                                                   [:relative-datetime -1 :month]]))
                ":between is inclusive!!!!")))
        (testing "\nthis week should be based on the report timezone — see #9467"
          (testing "\nSanity check - with UTC timezone, current week *should* be different when going from 11 PM Sat -> 1 AM Sun"
            (is (not= (mt/with-clock (t/mock-clock (t/instant "2019-11-30T23:00:00Z") (t/zone-id "UTC"))
                        (#'ga.qp/parse-filter:interval [:= [:field 'field {:temporal-unit :week}] [:relative-datetime 0 :week]]))
                      (mt/with-clock (t/mock-clock (t/instant "2019-12-01T01:00:00Z") (t/zone-id "UTC"))
                        (#'ga.qp/parse-filter:interval [:= [:field 'field {:temporal-unit :week}] [:relative-datetime 0 :week]])))))
          (testing (str "\nthis week at Saturday 6PM local time (Saturday 11PM UTC) should be the same as this week "
                        "Saturday 8PM local time (Sunday 1 AM UTC)")
            (mt/with-report-timezone-id "US/Eastern"
              (doseq [system-timezone ["US/Eastern" "UTC"]]
                (testing "\nGoogle Analytics should prefer report timezone (if set) to system timezone"
                  (testing (format "\nSystem timezone = %s" system-timezone)
                    (is (= {:start-date "2019-11-24", :end-date "2019-11-30"}
                           (mt/with-clock (t/mock-clock (t/instant "2019-11-30T23:00:00Z") (t/zone-id system-timezone))
                             (#'ga.qp/parse-filter:interval [:= [:field 'field {:temporal-unit :week}] [:relative-datetime 0 :week]]))
                           (mt/with-clock (t/mock-clock (t/instant "2019-12-01T01:00:00Z") (t/zone-id system-timezone))
                             (#'ga.qp/parse-filter:interval [:= [:field 'field {:temporal-unit :week}] [:relative-datetime 0 :week]]))))))))))))))

(deftest day-date-range-test
  (is (= {:start-date "29daysAgo"}
         (#'ga.qp/day-date-range :> -30)))
  (is (= {:end-date "yesterday"}
         (#'ga.qp/day-date-range :< 0)))
  (testing "future dates aren't handled by `day-date-range`"
    (is (= nil
           (#'ga.qp/day-date-range :> 0)))))

(deftest relative-datetime->date-range-test
  (testing "Make sure `->date-range` works correctly for `:relative-datetime` clauses"
    (mt/with-clock #t "2019-11-18T00:00Z[UTC]"
      (is (= {:start-date "2019-07-01"}
             (#'ga.qp/->date-range :day :>= [:relative-datetime -4 :month])))
      (is (= {:end-date "2019-10-31"}
             (#'ga.qp/->date-range :day :< [:relative-datetime 0 :month])))
      (is (= {:start-date "30daysAgo"}
             (#'ga.qp/->date-range :day :>= [:relative-datetime -30 :day])))
      (is (= {:end-date "yesterday"}
             (#'ga.qp/->date-range :day :< [:relative-datetime 0 :day])))
      ;; day > last year => day > 2018[-01-01] => date >= 2019-01-02
      ;; this behavior is a little weird, but it matches what happens for the SQL drivers.
      (is (= {:start-date "2018-01-02"}
             (#'ga.qp/->date-range :day :> [:relative-datetime -1 :year])))
      (is (= {:end-date "2018-12-31"}
             (#'ga.qp/->date-range :day :< [:relative-datetime 0 :year])))
      ;; year > last year => year > 2018 => date >= 2019-01-01
      (is (= {:start-date "2019-01-01"}
             (#'ga.qp/->date-range :year :> [:relative-datetime -1 :year])))
      (is (= {:end-date "2018-12-31"}
             (#'ga.qp/->date-range :year :< [:relative-datetime 0 :year]))))))

(deftest compile-filter-clause-no-extra-semicolons-test
  (testing "`compile-filter:filters` shouldn't return extra semicolons if it encounters empty `:and` clauses (#12791)"
    ;; whatever is in the `:and` clause might get removed by the other functions that handle filter compilation; if
    ;; `compile-filter:filters` encounters an empty `:and`, don't generate an extra semicolon
    (ga.test/with-some-fields [{:keys [event-action-field event-label-field]}]
      (let [query {:filter [:and
                            [:=
                             [:field (u/the-id event-label-field) nil]
                             [:value "A" {:base_type :type/Text, :semantic_type nil, :database_type "VARCHAR"}]]
                            [:and]
                            [:!=
                             [:field (u/the-id event-action-field) nil]
                             [:value "B" {:base_type :type/Text, :semantic_type nil, :database_type "VARCHAR"}]]]}]
        (mt/with-everything-store
          (is (= {:filters "ga:eventLabel==A;ga:eventAction!=B"}
                 (#'ga.qp/handle-filter:filters query))))))))

(deftest regex-escape-test
  (testing "Regex escaping shouldn't escape dashes (#8626)"
    (ga.test/with-some-fields [{:keys [table event-label-field]}]
      (mt/with-everything-store
        (is (= "ga:eventLabel=~(?i)acon/manager---community-partnerships-and-population-programs"
               (-> (ga.qp/mbql->native
                    {:query {:source-table (u/the-id table)
                             :filter       [:contains
                                            [:field (u/the-id event-label-field) nil]
                                            "acon/manager---community-partnerships-and-population-programs"
                                            {:case-sensitive false}]}})
                   :query
                   :filters)))))))
