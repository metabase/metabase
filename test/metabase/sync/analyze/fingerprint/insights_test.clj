(ns metabase.sync.analyze.fingerprint.insights-test
  (:require [expectations :refer :all]
            [metabase.sync.analyze.fingerprint.insights :refer :all :as i]))

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

(expect
  true
  (#'i/about-equidistant? [1 2 3]))
(expect
  false
  (#'i/about-equidistant? [1 2 3 46 7 3]))
(expect
  false
  (#'i/about-equidistant? [1 2 nil 3]))
(expect
  false
  (#'i/about-equidistant? [1 2 2 3]))
(expect
  true
  (#'i/about-equidistant? [1 2]))
(expect
  true
  (#'i/about-equidistant? [1]))
(expect
  true
  (#'i/about-equidistant? []))
(expect
  true
  ;; We want enough leeway that things such as different number of days in a month do not register
  (#'i/about-equidistant? (for [dt [#inst "2015-01" #inst "2015-02" #inst "2015-03"]]
                            (#'i/ms->day (.getTime dt)))))
