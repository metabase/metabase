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
                                     [i (* x (+ 1 (* (/ i 100)
                                                     (- (* 2 (rand)) 0.9))))])
                                   (repeatedly 100 #(rand-int 10)))
                          :resolution :month})
        (variation-trend {:series (map-indexed
                                   (fn [i x]
                                     [i (* x (+ 1 (* (/ (- 100 i) 100)
                                                     (- (* 2 (rand)) 0.9))))])
                                   (repeatedly 100 #(rand-int 10)))
                          :resolution :month})
        (variation-trend {:series (m/indexed (repeat 100 1))
                          :resolution :month})]))
