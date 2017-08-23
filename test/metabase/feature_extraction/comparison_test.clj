(ns metabase.feature-extraction.comparison-test
  (:require [expectations :refer :all]
            [metabase.feature-extraction.comparison :refer :all :as c]))

(expect
  (approximately 5.5 0.1)
  (transduce identity magnitude [1 2 3 4]))
(expect
  0.0
  (transduce identity magnitude []))

(expect
  [1.0
   0.5
   nil
   nil]
  [(cosine-distance [1 0 1] [0 1 0])
   (cosine-distance [1 0 1] [0 1 1])
   (cosine-distance [1 0 1] [0 0 0])
   (cosine-distance [] [])])

(expect
  [0.5
   0.0
   1
   1
   0
   1
   1
   0
   0.25]
  [(difference 1 2.0)
   (difference 2.0 2.0)
   (difference 2.0 nil)
   (difference nil 2.0)
   (difference true true)
   (difference true false)
   (difference false true)
   (difference false false)
   (difference [1 0 1] [0 1 1])])

(expect
  true
  (every? true? (apply map (fn [[ka _] [kb _]]
                             (= ka kb))
                       (#'c/unify-categories {:a 0.5 :b 0.3 :c 0.2}
                                             {:x 0.9 :y 0.1}))))

(expect
  (approximately 0.39 0.1)
  (chi-squared-distance [0.1 0.2 0.7] [0.5 0.4 0.1]))
(expect
  0
  (chi-squared-distance [] []))

(expect
  [{:foo 4 :bar 5}
   {:foo 4 :bar_a 4 :bar_b_x 4 :bar_b_y 7}]
  [(#'c/flatten-map {:foo 4 :bar 5})
   (#'c/flatten-map {:foo 4 :bar {:a 4 :b {:x 4 :y 7}}})])

(expect
  (approximately 0.5 0.1)
  (:distance (features-distance {:foo 2.0 :bar [1 2 3] :baz false}
                                {:foo 12 :bar [10.7 0.2 3] :baz false})))
