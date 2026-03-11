(ns metabase.analyze.fingerprint.insights-test
  (:require
   [clojure.test :refer :all]
   [metabase.analyze.fingerprint.insights
    :as
    insights])
  (:import
   (java.math MathContext RoundingMode)))

(set! *warn-on-reflection* true)

(def ^:private cols [{:base_type :type/DateTime} {:base_type :type/Number}])

(deftest last-value-test
  (doseq [{:keys [rows expected]} [{:rows [["2014" 100]
                                           ["2015" 200]
                                           ["2016" nil]
                                           [nil 300]
                                           [nil nil]
                                           ["2017" 700]]
                                    :expected 700}
                                   {:rows [["2017" 700]]
                                    :expected 700}
                                   {:rows []
                                    :expected nil}
                                   {:rows [[nil nil]]
                                    :expected nil}]]
    (testing (format "rows = %s" rows)
      (is (= expected
             (-> (transduce identity (insights/insights cols) rows)
                 first
                 :last-value))))))

(defn- inst->day
  [t]
  (some-> t (#'insights/->millis-from-epoch) (#'insights/ms->day)))

(defn- valid-period?
  ([from to] (valid-period? from to (#'insights/infer-unit (inst->day from) (inst->day to))))
  ([from to period]
   (boolean (#'insights/valid-period? (inst->day from) (inst->day to) period))))

(deftest valid-period-test
  (is (true? (valid-period? #t "2015-01" #t "2015-02")))
  ; Do we correctly handle descending time series?
  (is (true? (valid-period? #t "2015-02" #t "2015-01")))
  (is (true? (valid-period? #t "2015-02" #t "2015-03")))
  (is (= false (valid-period? #t "2015-01" #t "2015-03")))
  (is (= false (valid-period? #t "2015-01" nil)))
  (is (true? (valid-period? #t "2015-01-01" #t "2015-01-02")))
  (is (true? (valid-period? #t "2015-01-01" #t "2015-01-08")))
  (is (true? (valid-period? #t "2015-01-01" #t "2015-04-03")))
  (is (true? (valid-period? #t "2015" #t "2016")))
  ;; Test leap year handling
  (is (true? (valid-period? #t "2016" #t "2017")))
  (is (true? (valid-period? #t "2017" #t "2018")))
  ;; Periods less than 365 days should NOT be inferred as :year
  (is (not= :year (#'insights/infer-unit (inst->day #t "2015-01-01") (inst->day #t "2015-12-01"))))
  (is (not= :year (#'insights/infer-unit (inst->day #t "2015-02-01") (inst->day #t "2016-01-01"))))
  ;; Both 365 and 366 day periods should be inferred as :year
  (is (= :year (#'insights/infer-unit (inst->day #t "2015-01-01") (inst->day #t "2016-01-01"))))
  (is (= :year (#'insights/infer-unit (inst->day #t "2016-01-01") (inst->day #t "2017-01-01"))))
  (is (= false (valid-period? #t "2015-01-01" #t "2015-01-09")))
  (is (true? (valid-period? #t "2015-01-01" #t "2015-04-03" :quarter)))
  (is (= false (valid-period? #t "2015-01-01" #t "2015-04-03" :month)))
  (is (= false (valid-period? #t "2015-01" #t "2015-02" nil))))

;; Make sure we don't return nosense results like infinitiy coeficients
;; Fixes https://github.com/metabase/metabase/issues/9070

;; Keep the size of this dataset below `insights/validation-set-size` else result might depend on which
;; data points are included in the sample, producing intermittent test failures
(def ^:private ts [["2018-11-01",296,10875]
                   ["2018-11-02",257,11762]
                   ["2018-11-03",276,13101]
                   ["2018-11-05",172,10890]
                   ["2018-11-08",576,12935]
                   ["2018-11-09",525,30183]
                   ["2018-11-10",575,36148]
                   ["2018-11-16",213,14942]
                   ["2018-11-17",503,15690]
                   ["2018-11-18",502,14506]
                   ["2018-11-19",233,10714]
                   ["2018-11-20",174,9545]
                   ["2018-11-22",171,6460]
                   ["2018-11-24",203,5217]
                   ["2018-11-26",133,3263]
                   ["2018-11-28",127,3238]
                   ["2018-11-29",137,3120]
                   ["2018-12-01",180,3732]
                   ["2018-12-02",179,3311]
                   ["2018-12-03",144,2525]])

(def ^:private larger-ts (concat ts ts ts ts))

(defn- round-to-precision
  "Round (presumably floating-point) `number` to a precision of `sig-figures`. Returns a `Double`.

  This rounds by significant figures, not decimal places. See [[round-to-decimals]] for that.

    (round-to-precision 4 1234567.89) -> 123500.0"
  ^Double [^Integer sig-figures ^Number number]
  {:pre [(integer? sig-figures) (number? number)]}
  (-> number
      bigdec
      (.round (MathContext. sig-figures RoundingMode/HALF_EVEN))
      double))

(deftest ^:parallel round-to-precision-test
  (are [exp figs n] (= exp
                       (round-to-precision figs n))
    1.0 1 1.234
    1.2 2 1.234
    1.3 2 1.278
    1.3 2 1.251
    12300.0 3 12345.67
    0.00321 3 0.003209817))

(deftest timeseries-insight-test
  (is (= [{:last-value 144,
           :previous-value 179,
           :last-change -0.19553072625698323,
           :slope -7.671473413418271,
           :offset 137234.92983406168,
           :best-fit [:* 1.56726E227 [:exp [:* -0.02899533549378612 :x]]],
           :unit :day,
           :col nil}
          {:last-value 2525,
           :previous-value 3311,
           :last-change -0.2373905164602839,
           :slope -498.764272733624,
           :offset 8915371.843617931,
           :best-fit [:+ 8915371.843617931 [:* -498.764272733624 :x]],
           :col nil,
           :unit :day}]
         (-> (transduce identity
                        (insights/insights [{:base_type :type/DateTime}
                                            {:base_type :type/Number}
                                            {:base_type :type/Number}])
                        ts)
                                        ; This value varies between machines (M1 Macs? JVMs?) so round it to avoid test failures.
             (update-in [0 :best-fit 1] #(round-to-precision 6 %)))))
  (testing "We should robustly survive weird values such as NaN, Infinity, and nil"
    (is (= [{:last-value 20.0
             :previous-value 10.0
             :last-change 1.0
             :slope 10.0
             :offset -178350.0
             :best-fit [:+ -178350.0 [:* 10.0 :x]]
             :unit :day
             :col nil}]
           (transduce identity
                      (insights/insights [{:base_type :type/DateTime} {:base_type :type/Number}])
                      [["2018-11-01" 10.0]
                       ["2018-11-02" 20.0]
                       ["2018-11-03" nil]
                       ["2018-11-05" Double/NaN]
                       ["2018-11-08" Double/POSITIVE_INFINITY]])))))

(defn- prepeatedly
  "basic parallel version of `repeatedly`."
  [n f]
  (let [futures (doall (repeatedly n #(future (f))))]
    (map deref futures)))

(deftest consistent-timeseries-insight-test
  (testing "Timeseries insights remain stable when sampling. (#44349)"
    (let [insights (fn []
                     (-> (transduce identity
                                    (insights/insights [{:base_type :type/DateTime}
                                                        {:base_type :type/Number}
                                                        {:base_type :type/Number}])
                                    ;; intentionally make a dataset larger than
                                    ;; `insights/validation-set-size` to induce the random sampling
                                    larger-ts)
                                        ; This value varies between machines (M1 Macs? JVMs?) so round it to avoid test failures.
                         (update-in [0 :best-fit 1] #(round-to-precision 6 %))))]
      (is (= 1
             (count (distinct (prepeatedly 100 insights))))))))

(deftest change-test
  (is (= 0.0 (insights/change 1 1)))
  (is (= -0.5 (insights/change 1 2)))
  (is (= 1.0 (insights/change 2 1)))
  (is (= nil (insights/change 1 0)))
  (is (= -1.0 (insights/change 0 1)))
  (is (= 2.0 (insights/change 1 -1)))
  (is (= -2.0 (insights/change -1 1)))
  (is (= 1.0 (insights/change -1 -2)))
  (is (= nil (insights/change -1 0)))
  (is (= 1.0 (insights/change 0 -1))))

(deftest insights-with-custom-epxression-columns-test
  (testing "If valid timeseries columns exist, insights should be computed even with custom expressions. (#46244)"
    (is (some?
         (transduce identity
                    (insights/insights [{:base_type :type/DateTime}
                                        {:base_type :type/Number}
                                        ;; Any column with a base type that is not number or temporal previously
                                        ;; prevented timeseries insights from being calculated
                                        {:base_type :type/Text}])
                    [["2024-08-09" 10.0 "weekday"]
                     ["2024-08-10" 20.0 "weekend"]])))))

(deftest datetime-unit-insights
  (testing "A timeseries column with a :type/Text base type can still produce insights if it has a valid :unit (#12388)"
    (are [assertion datetime-col] (assertion
                                   (transduce identity
                                              (insights/insights [datetime-col
                                                                  {:base_type :type/Number}])
                                              [["2024-08-09" 10.0]
                                               ["2024-08-10" 20.0]]))
      nil? {:base_type :type/Text}
      some? {:base_type :type/Text :effective_type :type/DateTime}
      ;; Extraction unit (day-of-week) is classified as a numeric column and doesn't produce insights here
      nil? {:base_type :type/Text :unit :day-of-week}
      ;; Spot check truncation units — should all generate insights
      some? {:base_type :type/Text :unit :day}
      some? {:base_type :type/Text :unit :month}
      some? {:base_type :type/Text :unit :year})))

(deftest ^:parallel timeseries-with-datetime-aggregation-test
  (testing "A timeseries should still be detected when datetime aggregations are present (#62069)"
    (testing "Should recognize timeseries with datetime breakout and datetime aggregation (legacy :source)"
      (is (some?
           (transduce identity
                      (insights/insights [{:base_type :type/DateTime
                                           :source :breakout}
                                          {:base_type :type/Number}
                                          {:base_type :type/DateTime
                                           :source :aggregation}])
                      [["2024-08-09" 10.0 "2024-08-01"]
                       ["2024-08-10" 20.0 "2024-08-02"]]))))
    (testing "Should recognize timeseries with lib/breakout? and lib/source metadata (modern)"
      (is (some?
           (transduce identity
                      (insights/insights [{:base_type :type/DateTime
                                           :lib/breakout? true}
                                          {:base_type :type/Number}
                                          {:base_type :type/DateTime
                                           :lib/source :source/aggregations}])
                      [["2024-08-09" 10.0 "2024-08-01"]
                       ["2024-08-10" 20.0 "2024-08-02"]]))))
    (testing "Should work with effective_type for datetime aggregations"
      (is (some?
           (transduce identity
                      (insights/insights [{:base_type :type/DateTime
                                           :source :breakout}
                                          {:base_type :type/Number}
                                          {:base_type :type/Text
                                           :effective_type :type/DateTime
                                           :source :aggregation}])
                      [["2024-08-09" 10.0 "2024-08-01"]
                       ["2024-08-10" 20.0 "2024-08-02"]]))))))

(deftest ^:parallel timeseries-with-relation-semantic-type-test
  (testing "A datetime column with Entity Key or Foreign Key semantic type should still work for timeseries (#35281)"
    (testing "Should recognize timeseries when datetime breakout has :type/FK semantic type"
      (is (some?
           (transduce identity
                      (insights/insights [{:base_type :type/DateTime
                                           :semantic_type :type/FK
                                           :source :breakout}
                                          {:base_type :type/Number}])
                      [["2024-08-09" 10.0]
                       ["2024-08-10" 20.0]]))))
    (testing "Should recognize timeseries when datetime breakout has :type/PK semantic type"
      (is (some?
           (transduce identity
                      (insights/insights [{:base_type :type/DateTime
                                           :semantic_type :type/PK
                                           :source :breakout}
                                          {:base_type :type/Number}])
                      [["2024-08-09" 10.0]
                       ["2024-08-10" 20.0]]))))
    (testing "Non-datetime FK/PK columns should not be treated as datetimes"
      (is (nil?
           (transduce identity
                      (insights/insights [{:base_type :type/Integer
                                           :semantic_type :type/FK
                                           :source :breakout}
                                          {:base_type :type/Number}])
                      [[1 10.0]
                       [2 20.0]]))))
    (testing "Integer FK/PK columns should not be treated as numbers (they are identifiers)"
      (is (nil?
           (transduce identity
                      (insights/insights [{:base_type :type/DateTime
                                           :source :breakout}
                                          {:base_type :type/Integer
                                           :semantic_type :type/FK}])
                      [["2024-08-09" 1]
                       ["2024-08-10" 2]]))))))
