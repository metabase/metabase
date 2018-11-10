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

;; should throw an Exception if index is out of bounds
(expect
  IndexOutOfBoundsException
  (#'cumulative-aggregations/add-rows #{4} [1 2 3] [1 2 3]))

(expect
  #{1}
  (#'cumulative-aggregations/diff-indecies [:a :b :c] [:a 100 :c]))

(expect
  #{}
  (#'cumulative-aggregations/diff-indecies [:a :b :c] [:a :b :c]))

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

;; make sure cumulative aggregations still work correctly with lists...
(expect
  [[1 1 1] [2 3 2] [3 6 3]]
  (#'cumulative-aggregations/sum-rows #{1} '((1 1 1) (2 2 2) (3 3 3))))

;; ...and lazy sequences
(expect
  [[1 1 1] [2 3 2] [3 6 3]]
  (#'cumulative-aggregations/sum-rows #{1} (lazy-cat '((1 1 1)) '((2 2 2)) '((3 3 3)))))

;; the results should be L A Z Y
(expect
  {:fully-realized-after-taking-2? false
   :fully-realized-after-taking-3? true}
  (with-local-vars [fully-realized? false]
    (let [a-lazy-seq (lazy-cat
                      '((1 1 1))
                      '((2 2 2))
                      (do
                        (var-set fully-realized? true)
                        '((3 3 3))))
          realize-n  (fn [n]
                       (dorun (take n (#'cumulative-aggregations/sum-rows #{1} a-lazy-seq)))
                       @fully-realized?)]
      {:fully-realized-after-taking-2? (realize-n 2)
       :fully-realized-after-taking-3? (realize-n 3)})))


;; can it go forever without a stack overflow?
(expect
  [[4999850001] [4999950000]]
  (drop 99998 (#'cumulative-aggregations/sum-rows
               #{0}
               (for [n (range 100000)]
                 [n]))))

;; does replacing cumaulate ags work correctly?
(expect
  {:database 1
   :type     :query
   :query    {:source-table 1
              :breakout     [[:field-id 1]]
              :aggregation  [[:sum [:field-id 1]]]}}
  (#'cumulative-aggregations/replace-cumulative-ags
   {:database 1
    :type     :query
    :query    {:source-table 1
               :breakout     [[:field-id 1]]
               :aggregation  [[:cum-sum [:field-id 1]]]}}))

;; ...even inside expression aggregations?
(expect
  {:database 1
   :type     :query
   :query    {:source-table 1, :aggregation [[:* [:count] 1]]}}
  (#'cumulative-aggregations/replace-cumulative-ags
   {:database 1
    :type     :query
    :query    {:source-table 1, :aggregation [[:* [:cum-count] 1]]}}))


(def ^:private ^{:arglists '([])} return-some-rows
  (constantly
   {:rows [[1 1]
           [2 2]
           [3 3]
           [4 4]
           [5 5]]}))

;; make sure we take breakout fields into account
(expect
  {:rows [[1 1] [2 3] [3 6] [4 10] [5 15]]}
  ((cumulative-aggregations/handle-cumulative-aggregations return-some-rows)
   {:database 1
    :type     :query
    :query    {:source-table 1
               :breakout     [[:field-id 1]]
               :aggregation  [[:cum-sum [:field-id 1]]]}}))

;; make sure we sum up cumulative aggregations inside expressions correctly
(expect
  ;; we shouldn't be doing anything special with the expressions, let the database figure that out. We will just SUM
  {:rows [[1 1] [2 3] [3 6] [4 10] [5 15]]}
  ((cumulative-aggregations/handle-cumulative-aggregations return-some-rows)
   {:database 1
    :type     :query
    :query    {:source-table 1
               :breakout     [[:field-id 1]]
               :aggregation  [[:+ [:cum-count] 1]]}}))
