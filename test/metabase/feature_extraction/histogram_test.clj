(ns metabase.feature-extraction.histogram-test
  (:require [bigml.histogram.core :as impl]
            [expectations :refer :all]
            [metabase.feature-extraction.histogram :as h]))

(def ^:private hist-numbers (transduce identity h/histogram (concat (range 1000)
                                                                    [nil nil])))
(def ^:private hist-categories (transduce identity h/histogram-categorical
                                          [:foo :baz :baz :foo nil nil]))
(def ^:private hist-empty (transduce identity h/histogram []))

(expect
  [false true true]
  [(h/empty? hist-numbers)
   (h/empty? hist-empty)
   (h/empty? (transduce identity h/histogram nil))])

(expect
  [4.0 2 6.0 true false false false]
  [(impl/total-count hist-categories)
   (h/nil-count hist-categories)
   (h/total-count hist-categories)
   (h/categorical? hist-categories)
   (h/categorical? hist-numbers)
   (h/categorical? hist-empty)
   (h/categorical? (transduce identity h/histogram-categorical []))])

(expect
  [true
   (var-get #'h/pdf-sample-points)]
  (let [pdf (h/pdf hist-numbers)]
    [(every? (fn [[x p]]
               (< 0.008 p 0.012))
             pdf)
     (count pdf)]))

(expect
  (approximately 4.6 0.1)
  (h/entropy hist-numbers))
(expect
  [-0.0
   -0.0]
  [(h/entropy hist-empty)
   (h/entropy (transduce identity h/histogram [1 1 1]))])

(expect
  (approximately 100 1)
  (h/optimal-bin-width hist-numbers))
(expect
  nil
  (h/optimal-bin-width hist-empty))
(expect
  AssertionError
  (h/optimal-bin-width hist-categories))
