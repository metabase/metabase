(ns metabase.driver.common-test
  (:require [expectations :refer [expect]]
            [metabase.driver.common :as driver.common]))

(expect
  :type/Text
  (driver.common/values->base-type ["A" "B" "C"]))

;; should ignore nils
(expect
  :type/Text
  (driver.common/values->base-type [nil nil "C"]))

;; should pick base-type of most common class
(expect
  :type/Text
  (driver.common/values->base-type ["A" 100 "C"]))

;; should fall back to :type/* if no better type is found
(expect
  :type/*
  (driver.common/values->base-type [(Object.)]))

;; Should work with initial nils even if sequence is lazy
(expect
  [:type/Integer true]
  (let [realized-lazy-seq? (atom false)]
    [(driver.common/values->base-type (lazy-cat [nil nil nil]
                                                (do (reset! realized-lazy-seq? true)
                                                    [4 5 6])))
     @realized-lazy-seq?]))

;; but it should respect laziness and not keep scanning after it finds 100 values
(expect
  [:type/Integer false]
  (let [realized-lazy-seq? (atom false)]
    [(driver.common/values->base-type (lazy-cat [1 2 3]
                                                (repeat 1000 nil)
                                                (do (reset! realized-lazy-seq? true)
                                                    [4 5 6])))
     @realized-lazy-seq?]))
