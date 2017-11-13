(ns metabase.feature-extraction.insights-test
  (:require [expectations :refer :all]
            [medley.core :as m]
            [metabase.feature-extraction.insights :refer :all]))

(expect
  [true
   nil]
  (map :stationary [(stationary {:series     (m/indexed (repeat 100 1))
                                 :resolution :month})
                    (stationary {:series     (m/indexed (range 100))
                                 :resolution :month})]))

(expect
  [{:mode :increasing}
   {:mode :decreasing}
   nil]
  (map :variation-trend
       [(variation-trend {:series (map-indexed
                                   (fn [i x]
                                     [i (* x (+ 1 (* (/ i 1000)
                                                     (- (* 2 (rand)) 0.9))))])
                                   (repeatedly 1000 #(rand-int 10)))
                          :resolution :day})
        (variation-trend {:series (map-indexed
                                   (fn [i x]
                                     [i (* x (+ 1 (* (/ (- 1000 i) 1000)
                                                     (- (* 2 (rand)) 0.9))))])
                                   (repeatedly 1000 #(rand-int 10)))
                          :resolution :day})
        (variation-trend {:series (m/indexed (repeat 1000 1))
                          :resolution :day})]))
