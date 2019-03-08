(ns metabase.sync.analyze.fingerprint.insights-test
  (:require [expectations :refer :all]
            [metabase.sync.analyze.fingerprint.insights :as i :refer :all]))

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


(defn- inst->day
  [inst]
  (some-> inst (.getTime) (#'i/ms->day)))

(defn- valid-period?
  ([from to] (valid-period? from to (#'i/infer-unit (inst->day from) (inst->day to))))
  ([from to period]
   (boolean (#'i/valid-period? (inst->day from) (inst->day to) period))))

(expect
  true
  (valid-period? #inst "2015-01" #inst "2015-02"))
(expect
  true
  (valid-period? #inst "2015-02" #inst "2015-03"))
(expect
  false
  (valid-period? #inst "2015-01" #inst "2015-03"))
(expect
  false
  (valid-period? #inst "2015-01" nil))
(expect
  true
  (valid-period? #inst "2015-01-01" #inst "2015-01-02"))
(expect
  true
  (valid-period? #inst "2015-01-01" #inst "2015-01-08"))
(expect
  true
  (valid-period? #inst "2015-01-01" #inst "2015-04-03"))
(expect
  true
  (valid-period? #inst "2015" #inst "2016"))
(expect
  false
  (valid-period? #inst "2015-01-01" #inst "2015-01-09"))
(expect
  true
  (valid-period? #inst "2015-01-01" #inst "2015-04-03" :quarter))
(expect
  false
  (valid-period? #inst "2015-01-01" #inst "2015-04-03" :month))
(expect
  false
  (valid-period? #inst "2015-01" #inst "2015-02" nil))
