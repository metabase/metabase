(ns metabase.sync.analyze.fingerprint.insights-test
  (:require [expectations :refer :all]
            [metabase.sync.analyze.fingerprint.insights :refer :all]))

(def ^:private cols [{:base_type :type/DateTime} {:base_type :type/Number}])

(expect
  700
  (-> (transduce identity (insights cols) [["2014" 100]
                                           ["2015" 200]
                                           ["2016" nil]
                                           [nil 300]
                                           [nil nil]
                                           ["2017" 700]])
      first
      :last-value))

(expect
  700
  (-> (transduce identity (insights cols) [["2017" 700]])
      first
      :last-value))

;; Here we just make sure we don't blow up on empty input
(expect
  nil
  (-> (transduce identity (insights cols) [])
      first
      :last-value))

(expect
  nil
  (-> (transduce identity (insights cols) [[nil nil]])
      first
      :last-value))
