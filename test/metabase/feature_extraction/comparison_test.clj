(ns metabase.feature-extraction.comparison-test
  (:require [expectations :refer :all]
            [metabase.feature-extraction
             [comparison :refer :all :as c]
             [histogram :as h]]))

(expect
  [0.25
   0
   nil
   nil
   0
   1
   1
   0
   0.5
   nil]
  (mapv :difference [(difference 1 2.0)
                     (difference 2.0 2.0)
                     (difference 2.0 nil)
                     (difference nil 2.0)
                     (difference true true)
                     (difference true false)
                     (difference false true)
                     (difference false false)
                     (difference [[1 1] [2 0] [3 1]] [[1 0] [2 1] [3 1]])
                     (difference nil nil)]))

(expect
  true
  (every? true? (apply map (fn [[ka _] [kb _]]
                             (= ka kb))
                       (#'c/unify-categories {:a 0.5 :b 0.3 :c 0.2}
                                             {:x 0.9 :y 0.1}))))

(expect
  [{:foo 4 :bar 5}
   {:foo 4 :bar_a 4 :bar_b_x 4 :bar_b_y 7}]
  [(#'c/flatten-map {:foo 4 :bar 5})
   (#'c/flatten-map {:foo 4 :bar {:a 4 :b {:x 4 :y 7}}})])

(expect
  [true
   false
   nil]
  (let [h1      (transduce identity h/histogram (range 10))
        h2      (transduce identity h/histogram (repeat 10 10))
        h-empty (transduce identity h/histogram nil)]
    (map :significant? [(difference h1 h2)
                        (difference h1 h1)
                        (difference h1 h-empty)])))

(expect
  (approximately 0.3 0.1)
  (:distance (features-distance {:foo 2.0 :bar [[1 2] [2 3] [3 4]] :baz false}
                                {:foo 12 :bar [[1 10.7] [2 0.2] [3 5]] :baz false})))

(expect
  [nil
   nil
   nil
   [[1] [10] [12]]
   [[1 2] [10 11] [12 15]]
   nil
   [[1 2] [10 11] [12 15]]]
  [(#'c/comparable-segment [[1 1]] [])
   (#'c/comparable-segment [] [[1 1]])
   (#'c/comparable-segment nil nil)
   (#'c/comparable-segment [[1 10]] [[1 12]])
   (#'c/comparable-segment [[1 10] [2 11]] [[1 12] [2 15]])
   (#'c/comparable-segment [[1 10] [2 11]] [[1 12] [3 15]])
   (#'c/comparable-segment [[1 10] [2 11] [3 14]] [[1 12] [2 15]])])
