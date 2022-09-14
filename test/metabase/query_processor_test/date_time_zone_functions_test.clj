(ns metabase.query-processor-test.date-time-zone-functions-test
  (:require [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.test :as mt]))

(defn test-date-extract
  [{:keys [aggregation breakout expressions fields limit]}]
  (if breakout
    (->> (mt/run-mbql-query times {:expressions expressions
                                   :aggregation aggregation
                                   :limit       limit
                                   :breakout    breakout})
         (mt/formatted-rows [int int]))
    (->> (mt/run-mbql-query times {:expressions expressions
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
  (mt/test-drivers (disj (mt/normal-drivers-with-feature :date-functions) :mongo)
    (mt/dataset mixed-times
      (doseq [[col-type field-id]
              [[:datetime (mt/id :times :dt)]
               [:date (mt/id :times :d)]
               [:text-as-datetime (mt/id :times :as_dt)]
               [:text-as-date (mt/id :times :as_d)]]]
        (doseq [[operation should-skip-fn & tests]
                [[:get-year
                  (constantly false)
                  [[[2004] [2008] [2012] [2012]]
                   {:expressions {"expr" [:get-year [:field field-id nil]]}
                    :fields      [[:expression "expr"]]}]
                  [[[2004] [2008] [2012] [2012]]
                   {:aggregation [[:get-year [:field field-id nil]]]}]
                  [[[2004 1] [2008 1] [2012 2]]
                   {:expressions {"expr" [:get-year [:field field-id nil]]}
                    :aggregation [[:count]]
                    :breakout    [[:expression "expr"]]}]]

                 [:get-quarter
                  (constantly false)
                  [[[1] [2] [4] [4]]
                   {:expressions {"expr" [:get-quarter [:field field-id nil]]}
                    :fields      [[:expression "expr"]]}]
                  [[[1] [2] [4] [4]]
                   {:aggregation [[:get-quarter [:field field-id nil]]]}]
                  [[[1 1] [2 1] [4 2]]
                   {:expressions {"expr" [:get-quarter [:field field-id nil]]}
                    :aggregation [[:count]]
                    :breakout    [[:expression "expr"]]}]]

                 [:get-month
                  (constantly false)
                  [[[2] [6] [11] [11]]
                   {:expressions {"expr" [:get-month [:field field-id nil]]}
                    :fields      [[:expression "expr"]]}]
                  [[[2] [6] [11] [11]]
                   {:aggregation [[:get-month [:field field-id nil]]]}]
                  [[[2 1] [6 1] [11 2]]
                   {:expressions {"expr" [:get-month [:field field-id nil]]}
                    :aggregation [[:count]]
                    :breakout    [[:expression "expr"]]}]]

                 [:get-day
                  (constantly false)
                  [[[19] [20] [21] [21]]
                   {:expressions {"expr" [:get-day [:field field-id nil]]}
                    :fields      [[:expression "expr"]]}]
                  [[[19] [20] [21] [21]]
                   {:aggregation [[:get-day [:field field-id nil]]]}]
                  [[[19 1] [20 1] [21 2]]
                   {:expressions {"expr" [:get-day [:field field-id nil]]}
                    :aggregation [[:count]]
                    :breakout    [[:expression "expr"]]}]]

                 [:get-day-of-week
                  (constantly false)
                  [[[5] [6] [4] [4]]
                   {:expressions {"expr" [:get-day-of-week [:field field-id nil]]}
                    :fields      [[:expression "expr"]]}]
                  [[[5] [6] [4] [4]]
                   {:aggregation [[:get-day-of-week [:field field-id nil]]]}]
                  [[[4 2] [5 1] [6 1]]
                   {:expressions {"expr" [:get-day-of-week [:field field-id nil]]}
                    :aggregation [[:count]]
                    :breakout    [[:expression "expr"]]}]]

                 [:get-hour
                  (fn [_driver col-type]
                    (#{:date :text-as-date} col-type))
                  [[[9] [10] [11] [11]]
                   {:expressions {"expr" [:get-hour [:field field-id nil]]}
                    :fields      [[:expression "expr"]]}]
                  [[[9] [10] [11] [11]]
                   {:aggregation [[:get-hour [:field field-id nil]]]}]
                  [[[9 1] [10 1] [11 2]]
                   {:expressions {"expr" [:get-hour [:field field-id nil]]}
                    :aggregation [[:count]]
                    :breakout    [[:expression "expr"]]}]]

                 [:get-minute
                  (fn [_driver col-type]
                    (#{:date :text-as-date} col-type))
                  [[[19] [20] [21] [21]]
                   {:expressions {"expr" [:get-minute [:field field-id nil]]}
                    :fields      [[:expression "expr"]]}]
                  [[[19] [20] [21] [21]]
                   {:aggregation [[:get-minute [:field field-id nil]]]}]
                  [[[19 1] [20 1] [21 2]]
                   {:expressions {"expr" [:get-minute [:field field-id nil]]}
                    :aggregation [[:count]]
                    :breakout    [[:expression "expr"]]}]]

                 [:get-second
                  (fn [_driver col-type]
                    (#{:date :text-as-date} col-type))
                  [[[9] [10] [11] [11]]
                   {:expressions {"expr" [:get-second [:field field-id nil]]}
                    :fields      [[:expression "expr"]]}]
                  [[[9] [10] [11] [11]]
                   {:aggregation [[:get-second [:field field-id nil]]]}]
                  [[[9 1] [10 1] [11 2]]
                   {:expressions {"expr" [:get-second [:field field-id nil]]}
                    :aggregation [[:count]]
                    :breakout    [[:expression "expr"]]}]]]]
         (when-not (should-skip-fn driver/*driver* col-type)
           (testing (format "%s function works as expected on %s column for driver %s" operation col-type driver/*driver*)
             (doseq [[expected query] tests]
               (is (= (set expected) (set (test-date-extract query)))))))))))

  (mt/test-driver :mongo
    (mt/dataset mixed-times
      (doseq [[col-type field-id]
              [[:datetime (mt/id :times :dt)]
               [:date (mt/id :times :d)]]]
        (doseq [[operation should-skip-fn & tests]
                [[:get-year
                  (constantly false)
                  [[[2004] [2008] [2012] [2012]]
                   {:expressions {"expr" [:get-year [:field field-id nil]]}
                    :fields      [[:expression "expr"]]}]
                  [[[2004 1] [2008 1] [2012 2]]
                   {:expressions {"expr" [:get-year [:field field-id nil]]}
                    :aggregation [[:count]]
                    :breakout    [[:expression "expr"]]}]]

                 [:get-quarter
                  (constantly false)
                  [[[1] [2] [4] [4]]
                   {:expressions {"expr" [:get-quarter [:field field-id nil]]}
                    :fields      [[:expression "expr"]]}]
                  [[[1 1] [2 1] [4 2]]
                   {:expressions {"expr" [:get-quarter [:field field-id nil]]}
                    :aggregation [[:count]]
                    :breakout    [[:expression "expr"]]}]]

                 [:get-month
                  (constantly false)
                  [[[2] [6] [11] [11]]
                   {:expressions {"expr" [:get-month [:field field-id nil]]}
                    :fields      [[:expression "expr"]]}]
                  [[[2 1] [6 1] [11 2]]
                   {:expressions {"expr" [:get-month [:field field-id nil]]}
                    :aggregation [[:count]]
                    :breakout    [[:expression "expr"]]}]]

                 [:get-day
                  (constantly false)
                  [[[19] [20] [21] [21]]
                   {:expressions {"expr" [:get-day [:field field-id nil]]}
                    :fields      [[:expression "expr"]]}]
                  [[[19 1] [20 1] [21 2]]
                   {:expressions {"expr" [:get-day [:field field-id nil]]}
                    :aggregation [[:count]]
                    :breakout    [[:expression "expr"]]}]]

                 [:get-day-of-week
                  (constantly false)
                  [[[5] [6] [4] [4]]
                   {:expressions {"expr" [:get-day-of-week [:field field-id nil]]}
                    :fields      [[:expression "expr"]]}]
                  [[[4 2] [5 1] [6 1]]
                   {:expressions {"expr" [:get-day-of-week [:field field-id nil]]}
                    :aggregation [[:count]]
                    :breakout    [[:expression "expr"]]}]]

                 [:get-hour
                  (fn [_driver col-type]
                    (#{:date} col-type))
                  [[[9] [10] [11] [11]]
                   {:expressions {"expr" [:get-hour [:field field-id nil]]}
                    :fields      [[:expression "expr"]]}]
                  [[[9 1] [10 1] [11 2]]
                   {:expressions {"expr" [:get-hour [:field field-id nil]]}
                    :aggregation [[:count]]
                    :breakout    [[:expression "expr"]]}]]

                 [:get-minute
                  (fn [_driver col-type]
                    (#{:date} col-type))
                  [[[19] [20] [21] [21]]
                   {:expressions {"expr" [:get-minute [:field field-id nil]]}
                    :fields      [[:expression "expr"]]}]
                  [[[19 1] [20 1] [21 2]]
                   {:expressions {"expr" [:get-minute [:field field-id nil]]}
                    :aggregation [[:count]]
                    :breakout    [[:expression "expr"]]}]]

                 [:get-second
                  (fn [_driver col-type]
                    (#{:date} col-type))
                  [[[9] [10] [11] [11]]
                   {:expressions {"expr" [:get-second [:field field-id nil]]}
                    :fields      [[:expression "expr"]]}]
                  [[[9 1] [10 1] [11 2]]
                   {:expressions {"expr" [:get-second [:field field-id nil]]}
                    :aggregation [[:count]]
                    :breakout    [[:expression "expr"]]}]]]]
         (when-not (should-skip-fn driver/*driver* col-type)
           (testing (format "%s function works as expected on %s column for driver %s" operation col-type driver/*driver*)
             (doseq [[expected query] tests]
               (is (= (set expected) (set (test-date-extract query))))))))))))
