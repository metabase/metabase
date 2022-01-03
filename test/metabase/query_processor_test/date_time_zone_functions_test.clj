(ns metabase.query-processor-test.date-time-zone-functions-test
  (:require [clojure.test :as t]
            [metabase.test :as mt]
            [metabase.test.data :as data]
            [metabase.test.data.dataset-definitions :as defs]
            [metabase.test.data.interface :as tx])
  (:import java.time.ZonedDateTime))

(defn- test-date-extract
  [expr & [{:keys [:fields :filter :breakout :aggregation :limit]
            :or   {fields      [[:expression "expr"]]
                   filter      nil
                   breakout    nil
                   aggregation nil
                   ;; for breakout/agg, don't limit by default
                   limit       (if breakout nil 1)}}]]
  (if breakout
    (->> {:expressions {"expr" expr}
          ;; filter clause is optional
          :filter      filter
          :breakout    breakout
          :aggregation aggregation
          :limit       limit}
         (mt/run-mbql-query users)
         mt/rows)
    (->> {:expressions {"expr" expr}
          :fields      fields
          ;; filter clause is optional
          :filter      filter
          ;; To ensure stable ordering
          :order-by    [[:asc [:field (data/id :users :id) nil]]]
          :limit       limit}
      (mt/run-mbql-query users)
      mt/rows
      first)))

(t/deftest extraction-function-tests
  (mt/test-drivers (mt/normal-drivers-with-feature :date-functions)
    (doseq [[expected expr more-clauses]
            ;; get-year
            [[[2016] [:get-year "2016-05-01 01:23:45Z"]]
             [[2021] [:get-year "2021-12-08"]]
             [[2014]
              [:get-year [:field (mt/id :users :last_login) nil]]
              {:filter [:= [:field (mt/id :users :id) nil] 10]}]
             [[[2014 15]]
              [:get-year [:field (mt/id :users :last_login) nil]]
              {:aggregation [[:count]]
               :breakout    [[:expression "expr"]]}]

             ;; get-quarter
             [[2] [:get-quarter "2016-05-01 01:23:45Z"]]
             [[4] [:get-quarter "2021-12-08"]]
             [[1]
              [:get-quarter [:field (mt/id :users :last_login) nil]]
              {:filter [:= [:field (mt/id :users :id) nil] 4]}]
             [[[1 2]
               [2 2]
               [3 6]
               [4 5]]
              [:get-quarter [:field (mt/id :users :last_login) nil]]
              {:aggregation [[:count]]
               :breakout    [[:expression "expr"]]}]

             ;; get-month
             [[5] [:get-month "2016-05-01 01:23:45Z"]]
             [[12] [:get-month "2021-12-08"]]
             [[1]
              [:get-month [:field (mt/id :users :last_login) nil]]
              {:filter [:= [:field (mt/id :users :id) nil] 4]}]
             [[[1 1]
               [2 1]
               [4 2]
               [7 2]
               [8 4]
               [10 2]
               [11 2]
               [12 1]]
              [:get-month [:field (mt/id :users :last_login) nil]]
              {:aggregation [[:count]]
               :breakout    [[:expression "expr"]]}]

             ;; get-day
             [[27] [:get-day "2016-05-27 01:23:45Z"]]
             [[8] [:get-day "2021-12-08"]]
             [[6]
              [:get-day [:field (mt/id :users :last_login) nil]]
              {:filter [:= [:field (mt/id :users :id) nil] 3]}]
             [[[1 6] ; our login days aren't very widely distributed
               [2 2]
               [3 5]
               [5 1]
               [6 1]]
              [:get-day [:field (mt/id :users :last_login) nil]]
              {:aggregation [[:count]]
               :breakout    [[:expression "expr"]]}]

             ;; get-day-of-week
             [[6] [:get-day-of-week "2016-05-27 01:23:45Z"]]
             [[4] [:get-day-of-week "2021-12-08"]]
             [[5]
              [:get-day-of-week [:field (mt/id :users :last_login) nil]]
              {:filter [:= [:field (mt/id :users :id) nil] 3]}]
             [[[3 1]
               [4 1]
               [5 4]
               [6 5]
               [7 4]]
              [:get-day-of-week [:field (mt/id :users :last_login) nil]]
              {:aggregation [[:count]]
               :breakout    [[:expression "expr"]]}]

             ;; get-hour
             [[19] [:get-hour "2016-05-27 19:23:45Z"]]
             [[9]
              [:get-hour [:field (mt/id :users :last_login) nil]]
              {:filter [:= [:field (mt/id :users :id) nil] 7]}]
             [[[1 1]
               [10 2]
               [12 2]
               [13 1]
               [15 1]
               [16 1]
               [17 1]
               [19 1]
               [7 1]
               [8 2]
               [9 2]]
              [:get-hour [:field (mt/id :users :last_login) nil]]
              {:aggregation [[:count]]
               :breakout    [[:expression "expr"]]}]

             ;; get-minute
             [[23] [:get-minute "2016-05-27 19:23:45Z"]]
             [[45]
              [:get-minute [:field (mt/id :users :last_login) nil]]
              {:filter [:= [:field (mt/id :users :id) nil] 14]}]
             [[[0 1]
               [15 3]
               [30 9]
               [45 2]]
              [:get-minute [:field (mt/id :users :last_login) nil]]
              {:aggregation [[:count]]
               :breakout    [[:expression "expr"]]}]

             ;; get-second
             [[13] [:get-second "2016-05-27 19:23:13Z"]]
             [[0]
              [:get-second [:field (mt/id :users :last_login) nil]]
              {:filter [:= [:field (mt/id :users :id) nil] 14]}]]]
      (t/testing (format "%s function works as expected on %s" (first expr) (second expr))
        ;; compare vectors of more than one item (i.e. aggregation results) on the basis of sets
        (let [compare-on-fn (if (< 1 (count expected)) set identity)]
          (t/is (= (compare-on-fn expected) (compare-on-fn (test-date-extract expr more-clauses)))))))
    (t/testing ":get-second works on fields"
      ;; need to test this on a separate dataset because test-data doesn't have any
      ;; timestamp data with second level precision
      (mt/dataset sample-dataset
        ;; use Clojure to group the sample timestamps by second to create the expectation
        ;; since this would be a giant literal map otherwise
        (let [timestamps       (group-by (fn [^ZonedDateTime review-ts]
                                           (.getSecond review-ts))
                                         (->> (tx/get-dataset-definition defs/sample-dataset)
                                              :table-definitions
                                              (filter #(= "reviews" (:table-name %)))
                                              first
                                              :rows
                                              (map last)))
              timestamp-counts (reduce-kv (fn [m k v]
                                            (assoc m k (count v)))
                                          {}
                                          timestamps)]
          (t/is (= timestamp-counts
                   (->> (mt/run-mbql-query reviews
                          {:expressions {"review-second" [:get-second $created_at]}
                           :aggregation [[:count]]
                           :breakout    [[:expression "review-second"]]})
                        mt/rows
                        (into {})))))))))
