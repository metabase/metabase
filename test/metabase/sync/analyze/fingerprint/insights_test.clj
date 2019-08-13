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


;; Make sure we don't return nosense results like infinitiy coeficients
;; Fixes https://github.com/metabase/metabase/issues/9070
(def ^:private ts [["2018-11-01",2960,10875]
                   ["2018-11-02",2574,11762]
                   ["2018-11-03",2761,13101]
                   ["2018-11-04",2405,12931]
                   ["2018-11-05",1726,10890]
                   ["2018-11-06",1669,10829]
                   ["2018-11-07",3661,10098]
                   ["2018-11-08",5760,12935]
                   ["2018-11-09",5251,30183]
                   ["2018-11-10",5757,36148]
                   ["2018-11-11",5244,32264]
                   ["2018-11-12",4190,25583]
                   ["2018-11-13",2343,21411]
                   ["2018-11-14",2109,21848]
                   ["2018-11-15",1865,19892]
                   ["2018-11-16",2130,14942]
                   ["2018-11-17",5037,15690]
                   ["2018-11-18",5029,14506]
                   ["2018-11-19",2335,10714]
                   ["2018-11-20",1745,9545]
                   ["2018-11-21",1784,7516]
                   ["2018-11-22",1717,6460]
                   ["2018-11-23",1796,4901]
                   ["2018-11-24",2039,5217]
                   ["2018-11-25",1781,4477]
                   ["2018-11-26",1330,3263]
                   ["2018-11-27",1296,2994]
                   ["2018-11-28",1278,3238]
                   ["2018-11-29",1377,3120]
                   ["2018-11-30",1553,2984]
                   ["2018-12-01",1805,3732]
                   ["2018-12-02",1796,3311]
                   ["2018-12-03",1444,2525]])

(expect
  [{:last-value 1444,
    :previous-value 1796,
    :last-change -0.19599109131403117,
    :slope -73.10260695187168,
    :offset 1307680.6786987525,
    :best-fit
    [:* 2.3076724063296997E223 [:exp [:* -0.02837494263105348 :x]]],
    :col nil}
   {:last-value 2525,
    :previous-value 3311,
    :last-change -0.2373905164602839,
    :slope -551.1062834224598,
    :offset 9850467.098930478,
    :best-fit [:+ 9850467.098930478 [:* -551.1062834224598 :x]],
    :col nil}]
  (transduce identity
             (insights [{:base_type :type/DateTime} {:base_type :type/Number} {:base_type :type/Number}])
             ts))
