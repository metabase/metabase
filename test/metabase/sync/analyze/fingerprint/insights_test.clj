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
(def ^:private ts [["2018-11-01",296,10875]
                   ["2018-11-02",257,11762]
                   ["2018-11-03",276,13101]
                   ["2018-11-04",240,12931]
                   ["2018-11-05",172,10890]
                   ["2018-11-06",166,10829]
                   ["2018-11-07",366,10098]
                   ["2018-11-08",576,12935]
                   ["2018-11-09",525,30183]
                   ["2018-11-10",575,36148]
                   ["2018-11-11",524,32264]
                   ["2018-11-12",419,25583]
                   ["2018-11-13",234,21411]
                   ["2018-11-14",210,21848]
                   ["2018-11-15",186,19892]
                   ["2018-11-16",213,14942]
                   ["2018-11-17",503,15690]
                   ["2018-11-18",502,14506]
                   ["2018-11-19",233,10714]
                   ["2018-11-20",174,9545]
                   ["2018-11-21",178,7516]
                   ["2018-11-22",171,6460]
                   ["2018-11-23",179,4901]
                   ["2018-11-24",203,5217]
                   ["2018-11-25",178,4477]
                   ["2018-11-26",133,3263]
                   ["2018-11-27",129,2994]
                   ["2018-11-28",127,3238]
                   ["2018-11-29",137,3120]
                   ["2018-11-30",155,2984]
                   ["2018-12-01",180,3732]
                   ["2018-12-02",179,3311]
                   ["2018-12-03",144,2525]])

(expect
  [{:last-value     144,
    :previous-value 179,
    :last-change    -0.19553072625698323,
    :slope          -7.318181818181817,
    :offset         130909.03030303027,
    :best-fit       [:* 9.493470601414073E222 [:exp [:* -0.028454294260686058 :x]]],
    :col            nil}
   {:last-value     2525,
    :previous-value 3311,
    :last-change    -0.2373905164602839,
    :slope          -551.1062834224598,
    :offset         9850467.098930478,
    :best-fit       [:+ 9850467.098930478 [:* -551.1062834224598 :x]],
    :col            nil}]
  (transduce identity
             (insights [{:base_type :type/DateTime} {:base_type :type/Number} {:base_type :type/Number}])
             ts))
