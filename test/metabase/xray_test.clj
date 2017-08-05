(ns metabase.xray-test
  (:require [clj-time.core :as t]
            [expectations :refer :all]
            [metabase.xray
             [core :as x.core]
             [costs :refer :all]
             [histogram :as h :refer :all]
             [thumbprinters :as tp :refer :all]]
            [redux.core :as redux]))

(def ^:private numbers [0.1 0.4 0.2 nil 0.5 0.3 0.51 0.55 0.22])
(def ^:private datetimes ["2015-06-01" nil "2015-06-11" "2015-01-01"
                          "2016-06-31" "2017-09-01" "2016-04-15" "2017-11-02"])
(def ^:private categories [:foo :baz :bar :bar nil :foo])

(def ^:private hist (transduce identity histogram (take 100 (cycle numbers))))
(def ^:private hist-c (transduce identity histogram-categorical
                                 (take 100 (cycle categories))))

(expect
  [2
   (/ 4)
   nil
   nil]
  [(safe-divide 4 2)
   (safe-divide 4)
   (safe-divide 0)
   (safe-divide 4 0)])

(expect
  [(/ 23 100)
   0.5
   -1.0
   -5.0
   1.2]
  [(growth 123 100)
   (growth -0.1 -0.2)
   (growth -0.4 -0.2)
   (growth -0.4 0.1)
   (growth 0.1 -0.5)])

(expect
  [100.0
   11]
  [(total-count hist)
   (nil-count hist)])

(expect
  [-0.0
   true]
  (let [all-ones (entropy (transduce identity histogram (repeat 10 1)))]
    [all-ones
     (> (entropy hist) (entropy hist-c) all-ones)]))

(expect
  [{:foo 2
    :bar 10}
   {}]
  [(transduce identity (rollup (redux/pre-step + :y) :x)
              [{:x :foo :y 1}
               {:x :foo :y 1}
               {:x :bar :y 5}
               {:x :bar :y 3}
               {:x :bar :y 2}])
   (transduce identity (rollup (redux/pre-step + :y) :x) [])])

(expect
  [1
   1
   2
   4]
  [(#'tp/quarter (t/date-time 2017 1))
   (#'tp/quarter (t/date-time 2017 3))
   (#'tp/quarter (t/date-time 2017 5))
   (#'tp/quarter (t/date-time 2017 12))])

(expect
  {:limit (var-get #'x.core/max-sample-size)}
  (#'x.core/extract-query-opts {:max-cost {:query :sample}}))

(defn- make-timestamp
  [y m]
  (-> (t/date-time y m)
      ((var tp/to-double))))

(expect
  [[(make-timestamp 2016 1) 12]
   [(make-timestamp 2016 2) 0]
   [(make-timestamp 2016 3) 4]
   [(make-timestamp 2016 4) 0]
   [(make-timestamp 2016 5) 0]
   [(make-timestamp 2016 6) 0]
   [(make-timestamp 2016 7) 0]
   [(make-timestamp 2016 8) 0]
   [(make-timestamp 2016 9) 0]
   [(make-timestamp 2016 10) 0]
   [(make-timestamp 2016 11) 0]
   [(make-timestamp 2016 12) 0]
   [(make-timestamp 2017 1) 25]]
  (#'tp/fill-timeseries (t/months 1) [[(make-timestamp 2016 1) 12]
                                      [(make-timestamp 2016 3) 4]
                                      [(make-timestamp 2017 1) 25]]))

;; Also low-key tests if thumbprinters can survive nils.
(expect
  [(var-get #'tp/Num)
   (var-get #'tp/DateTime)
   (var-get #'tp/Category)
   (var-get #'tp/Text)
   [nil [:type/NeverBeforeSeen :type/*]]]
  [(-> (#'x.core/thumbprint-field {} {:base_type :type/Number} numbers) :type)
   (-> (#'x.core/thumbprint-field {} {:base_type :type/DateTime} datetimes)
       :type)
   (-> (#'x.core/thumbprint-field {} {:base_type :type/Text
                                  :special_type :type/Category}
                              categories)
       :type)
   (->> categories
        (map str)
        (#'x.core/thumbprint-field {} {:base_type :type/Text})
        :type)
   (-> (#'x.core/thumbprint-field {} {:base_type :type/NeverBeforeSeen} numbers)
       :type)])

(expect
  [true
   true
   true
   true
   false
   false
   true
   true
   true
   true
   true
   true
   false
   false]
  [(-> {:computation :linear} linear-computation? boolean)
   (-> {:computation :unbounded} unbounded-computation? boolean)
   (-> {:computation :yolo} unbounded-computation? boolean)
   (-> {:computation :yolo} yolo-computation? boolean)
   (-> {:computation :unbounded} linear-computation? boolean)
   (-> {:computation :unbounded} yolo-computation? boolean)
   (-> {:query :cache} cache-only? boolean)
   (-> {:query :sample} sample-only? boolean)
   (-> {:query :full-scan} full-scan? boolean)
   (-> {:query :joins} full-scan? boolean)
   (-> {:query :joins} alow-joins? boolean)
   (-> nil full-scan? boolean)
   (-> nil alow-joins? boolean)
   (-> {:query :sample} full-scan? boolean)])
