(ns metabase.query-processor.middleware.cumulative-aggregations-test
  (:require [expectations :refer [expect]]
            [metabase.query-processor.middleware.cumulative-aggregations :as cumulative-aggregations]))

(expect
  [1 2 3]
  (#'cumulative-aggregations/add-rows #{} [1 2 3] [1 2 3]))

(expect
  [2 2 3]
  (#'cumulative-aggregations/add-rows #{0} [1 2 3] [1 2 3]))

(expect
  [2 4 3]
  (#'cumulative-aggregations/add-rows #{0 1} [1 2 3] [1 2 3]))

(expect
  [1 4 6]
  (#'cumulative-aggregations/add-rows #{1 2} [1 2 3] [1 2 3]))

(expect
  [1 2 3]
  (#'cumulative-aggregations/add-rows #{4} [1 2 3] [1 2 3]))

(expect
  #{1}
  (#'cumulative-aggregations/diff-indecies 0 [:a :b :c] [:a 100 :c]))

(expect
  #{5}
  (#'cumulative-aggregations/diff-indecies 4 [:a :b :c] [:a 100 :c]))

(expect
  #{}
  (#'cumulative-aggregations/diff-indecies 0 [:a :b :c] [:a :b :c]))

(expect
  [[0] [1] [2] [3] [4] [5] [6] [7] [8] [9]]
  (#'cumulative-aggregations/sum-rows #{} [[0] [1] [2] [3] [4] [5] [6] [7] [8] [9]]))

(expect
  [[0] [1] [3] [6] [10] [15] [21] [28] [36] [45]]
  (#'cumulative-aggregations/sum-rows #{0} [[0] [1] [2] [3] [4] [5] [6] [7] [8] [9]]))

(expect
  [[0 0] [1 1] [3 2] [6 3] [10 4] [15 5] [21 6] [28 7] [36 8] [45 9]]
  (#'cumulative-aggregations/sum-rows
   #{0}
   [[0 0] [1 1] [2 2] [3 3] [4 4] [5 5] [6 6] [7 7] [8 8] [9 9]]))

(expect
  [[0 0] [1 1] [3 3] [6 6] [10 10] [15 15] [21 21] [28 28] [36 36] [45 45]]
  (#'cumulative-aggregations/sum-rows
   #{0 1}
   [[0 0] [1 1] [2 2] [3 3] [4 4] [5 5] [6 6] [7 7] [8 8] [9 9]]))

;; can it go forever without a stack overflow?
(expect
  [[4999850001] [4999950000]]
  (drop 99998 (#'cumulative-aggregations/sum-rows
               #{0}
               (for [n (range 100000)]
                 [n]))))


;; make sure we take breakout fields into account
(expect
  {:rows [[1 1] [2 3] [3 6] [4 10] [5 15]]}
  ((cumulative-aggregations/handle-cumulative-aggregations (constantly {:rows [[1 1]
                                                                               [2 2]
                                                                               [3 3]
                                                                               [4 4]
                                                                               [5 5]]}))
   {:database 1
    :type     :query
    :query    {:source-table 1
               :breakout     [[:field-id 1]]
               :aggregation  [[:cum-sum [:field-id 1]]]}}))
