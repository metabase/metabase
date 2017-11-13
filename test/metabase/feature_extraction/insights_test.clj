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
  (let [n 100]
    (map :variation-trend
         [(variation-trend {:series (map-indexed
                                     (fn [i x]
                                       [i (* x (+ 1 (* (/ i n)
                                                       (- (* 2 (rand)) 0.9))))])
                                     (repeat n 2))
                            :resolution :month})
          (variation-trend {:series (map-indexed
                                     (fn [i x]
                                       [i (* x (+ 1 (* (/ (- n i) n)
                                                       (- (* 2 (rand)) 0.9))))])
                                     (repeat n 2))
                            :resolution :month})
          (variation-trend {:series (m/indexed (repeat n 2))
                            :resolution :day})])))
