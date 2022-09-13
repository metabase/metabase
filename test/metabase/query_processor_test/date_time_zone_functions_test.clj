(ns metabase.query-processor-test.date-time-zone-functions-test
  (:require [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.test :as mt]
            [metabase.test.data :as data]
            [metabase.test.data.dataset-definitions :as defs]
            [metabase.test.data.interface :as tx])
  (:import java.time.ZonedDateTime))

(defn test-date-extract
  [expr {:keys [aggregation breakout limit fields]
         :or   {fields [[:expression "expr"]]}}]
  (if breakout
    (->> (mt/run-mbql-query times {:expressions {"expr" expr}
                                        :aggregation aggregation
                                        :limit       limit
                                        :breakout    breakout})
         (mt/formatted-rows [int int]))
    (->> (mt/run-mbql-query times {:expressions {"expr" expr}
                                        :aggregation aggregation
                                        :limit       limit
                                        :fields      fields})
         (mt/formatted-rows [int]))))

(mt/defdataset mixed-times
  [["times" [{:field-name "index"
              :base-type :type/Integer}
             {:field-name "dt"
              :base-type :type/DateTime}
             {:field-name "d"
              :base-type :type/Date}
             {:field-name "as_dt"
              :base-type :type/Text
              :effective-type :type/DateTime
              :coercion-strategy :Coercion/ISO8601->DateTime}
             {:field-name "as_d"
              :base-type :type/Text
              :effective-type :type/Date
              :coercion-strategy :Coercion/ISO8601->Date}]
    [[1 #t "2004-02-19 09:19:09" #t "2004-02-19" "2004-02-19 09:19:09" "2004-02-19"]
     [2 #t "2008-06-20 10:20:10" #t "2008-06-20" "2008-06-20 10:20:10" "2008-06-20"]
     [3 #t "2012-11-21 11:21:11" #t "2012-11-21" "2012-11-21 11:21:11" "2012-11-21"]
     [4 #t "2012-11-21 11:21:11" #t "2012-11-21" "2012-11-21 11:21:11" "2012-11-21"]]]])

(deftest extraction-function-tests
  (mt/test-drivers (mt/normal-drivers-with-feature :date-functions)
   (mt/dataset mixed-times
     (doseq [[operation col-type except-drivers & tests]
             ;; get-year
             [[:get-year
               :datetime
               #{}
               [[[2004] [2008] [2012] [2012]]
                [:get-year [:field (mt/id :times :dt) nil]]]
               [[[2004 1] [2008 1] [2012 2]]
                [:get-year [:field (mt/id :times :dt) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              [:get-year
               :date
               #{}
               [[[2004] [2008] [2012] [2012]]
                [:get-year [:field (mt/id :times :d) nil]]]
               [[[2004 1] [2008 1] [2012 2]]
                [:get-year [:field (mt/id :times :d) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              [:get-year
               :text-as-datetime
               #{:mongo}
               [[[2004] [2008] [2012] [2012]]
                [:get-year [:field (mt/id :times :as_dt) nil]]]
               [[[2004 1] [2008 1] [2012 2]]
                [:get-year [:field (mt/id :times :as_dt) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              [:get-year
               :text-as-date
               #{:mongo}
               [[[2004] [2008] [2012] [2012]]
                [:get-year [:field (mt/id :times :as_d) nil]]]
               [[[2004 1] [2008 1] [2012 2]]
                [:get-year [:field (mt/id :times :as_d) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              ;; get-quarter
              [:get-quarter
               :datetime
               #{}
               [[[1] [2] [4] [4]]
                [:get-quarter [:field (mt/id :times :dt) nil]]]
               [[[1 1] [2 1] [4 2]]
                [:get-quarter [:field (mt/id :times :dt) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              [:get-quarter
               :date
               #{}
               [[[1] [2] [4] [4]]
                [:get-quarter [:field (mt/id :times :d) nil]]]
               [[[1 1] [2 1] [4 2]]
                [:get-quarter [:field (mt/id :times :d) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              [:get-quarter
               :text-as-datetime
               #{:mongo}
               [[[1] [2] [4] [4]]
                [:get-quarter [:field (mt/id :times :as_dt) nil]]]
               [[[1 1] [2 1] [4 2]]
                [:get-quarter [:field (mt/id :times :as_dt) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              [:get-quarter
               :text-as-date
               #{:mongo}
               [[[1] [2] [4] [4]]
                [:get-quarter [:field (mt/id :times :as_d) nil]]]
               [[[1 1] [2 1] [4 2]]
                [:get-quarter [:field (mt/id :times :as_d) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              ;; get-month
              [:get-month
               :datetime
               #{}
               [[[2] [6] [11] [11]]
                [:get-month [:field (mt/id :times :dt) nil]]]
               [[[2 1] [6 1] [11 2]]
                [:get-month [:field (mt/id :times :dt) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              [:get-month
               :date
               #{}
               [[[2] [6] [11] [11]]
                [:get-month [:field (mt/id :times :d) nil]]]
               [[[2 1] [6 1] [11 2]]
                [:get-month [:field (mt/id :times :d) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              [:get-month
               :text-as-datetime
               #{:mongo}
               [[[2] [6] [11] [11]]
                [:get-month [:field (mt/id :times :as_dt) nil]]]
               [[[2 1] [6 1] [11 2]]
                [:get-month [:field (mt/id :times :as_dt) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              [:get-month
               :text-as-date
               #{:mongo}
               [[[2] [6] [11] [11]]
                [:get-month [:field (mt/id :times :as_d) nil]]]
               [[[2 1] [6 1] [11 2]]
                [:get-month [:field (mt/id :times :as_d) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              ;; get-day
              [:get-day
               :datetime
               #{}
               [[[19] [20] [21] [21]]
                [:get-day [:field (mt/id :times :dt) nil]]]
               [[[19 1] [20 1] [21 2]]
                [:get-day [:field (mt/id :times :dt) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              [:get-day
               :date
               #{}
               [[[19] [20] [21] [21]]
                [:get-day [:field (mt/id :times :d) nil]]]
               [[[19 1] [20 1] [21 2]]
                [:get-day [:field (mt/id :times :d) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              [:get-day
               :text-as-datetime
               #{:mongo}
               [[[19] [20] [21] [21]]
                [:get-day [:field (mt/id :times :as_dt) nil]]]
               [[[19 1] [20 1] [21 2]]
                [:get-day [:field (mt/id :times :as_dt) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              [:get-day
               :text-as-date
               #{:mongo}
               [[[19] [20] [21] [21]]
                [:get-day [:field (mt/id :times :d) nil]]]
               [[[19 1] [20 1] [21 2]]
                [:get-day [:field (mt/id :times :d) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              ;; get-day-of-week
              [:get-day-of-week
               :datetime
               #{}
               [[[5] [6] [4] [4]]
                [:get-day-of-week [:field (mt/id :times :dt) nil]]]
               [[[4 2] [5 1] [6 1]]
                [:get-day-of-week [:field (mt/id :times :dt) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              [:get-day-of-week
               :date
               #{}
               [[[5] [6] [4] [4]]
                [:get-day-of-week [:field (mt/id :times :d) nil]]]
               [[[4 2] [5 1] [6 1]]
                [:get-day-of-week [:field (mt/id :times :d) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              [:get-day-of-week
               :text-as-datetime
               #{:mongo}
               [[[5] [6] [4] [4]]
                [:get-day-of-week [:field (mt/id :times :as_dt) nil]]]
               [[[4 2] [5 1] [6 1]]
                [:get-day-of-week [:field (mt/id :times :as_dt) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              [:get-day-of-week
               :text-as-date
               #{:mongo}
               [[[5] [6] [4] [4]]
                [:get-day-of-week [:field (mt/id :times :as_d) nil]]]
               [[[4 2] [5 1] [6 1]]
                [:get-day-of-week [:field (mt/id :times :as_d) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              ;; get-hour
              [:get-hour
               :datetime
               #{}
               [[[9] [10] [11] [11]]
                [:get-hour [:field (mt/id :times :dt) nil]]]
               [[[9 1] [10 1] [11 2]]
                [:get-hour [:field (mt/id :times :dt) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              [:get-hour
               :text-as-datetime
               #{:mongo}
               [[[9] [10] [11] [11]]
                [:get-hour [:field (mt/id :times :as_dt) nil]]]
               [[[9 1] [10 1] [11 2]]
                [:get-hour [:field (mt/id :times :as_dt) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              ;; get-minute
              [:get-minute
               :datetime
               #{}
               [[[19] [20] [21] [21]]
                [:get-minute [:field (mt/id :times :dt) nil]]]
               [[[19 1] [20 1] [21 2]]
                [:get-minute [:field (mt/id :times :dt) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              [:get-minute
               :text-as-datetime
               #{:mongo}
               [[[19] [20] [21] [21]]
                [:get-minute [:field (mt/id :times :as_dt) nil]]]
               [[[19 1] [20 1] [21 2]]
                [:get-minute [:field (mt/id :times :as_dt) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              ;; get-second
              [:get-second
               :datetime
               #{}
               [[[9] [10] [11] [11]]
                [:get-second [:field (mt/id :times :dt) nil]]]
               [[[9 1] [10 1] [11 2]]
                [:get-second [:field (mt/id :times :dt) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]

              [:get-second
               :text-as-datetime
               #{:mongo}
               [[[9] [10] [11] [11]]
                [:get-second [:field (mt/id :times :as_dt) nil]]]
               [[[9 1] [10 1] [11 2]]
                [:get-second [:field (mt/id :times :as_dt) nil]]
                {:aggregation [[:count]]
                 :breakout    [[:expression "expr"]]}]]]]
      (when-not (except-drivers driver/*driver*)
        (testing (format "%s function works as expected on %s column for driver %s" operation col-type driver/*driver*)
          (doseq [[expected expr more-clauses] tests]
            (is (= (set expected) (set (test-date-extract expr more-clauses)))))))))))
