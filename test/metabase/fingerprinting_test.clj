(ns metabase.fingerprinting-test
  (:require (clj-time [coerce :as t.coerce]
                      [core :as t])
            [expectations :refer :all]
            [metabase.fingerprinting :refer :all :as f]
            [redux.core :as redux]))

(def numbers [0.1 0.4 0.2 nil 0.5 0.3 0.51 0.55 0.22])
(def datetimes [(t/date-time 2016 1) (t/date-time 2016 2) nil (t/date-time 2016 5)
                (t/date-time 2016 7 23) (t/date-time 2016 10 2)])
(def categories [:foo :baz :bar :bar nil :foo])

(def hist (transduce identity histogram (take 100 (cycle numbers))))
(def hist-c (transduce identity histogram-categorical (take 100 (cycle categories))))

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
  [{0.1 12 0.2 11 0.22 11 0.3 11 0.4 11 0.5 11 0.51 11 0.55 11}]
  [(bins hist)])

(expect
b  [100.0
   11]
  [(total-count hist)
   (nil-count hist)])

(expect
  [-0.0
   true]
  (let [all-ones (binned-entropy (transduce identity histogram (repeat 10 1)))]
    [all-ones
     (> (binned-entropy hist) (binned-entropy hist-c) all-ones)]))

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
  [(#'f/quarter (t/date-time 2017 1))
   (#'f/quarter (t/date-time 2017 3))
   (#'f/quarter (t/date-time 2017 5))
   (#'f/quarter (t/date-time 2017 12))])

(expect
  {:limit (var-get #'f/max-sample-size)}
  (#'f/extract-query-opts {:max-cost {:query :sample}}))

(defn- make-timestamp
  [y m]
  (-> (t/date-time y m)
      t.coerce/to-long
      ((var f/truncate-timestamp))))

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
  (#'f/fill-timeseries (t/months 1) [[(make-timestamp 2016 1) 12]
                                     [(make-timestamp 2016 3) 4]
                                     [(make-timestamp 2017 1) 25]]))

;; Also low-key tests if fingerprinters can survive nils.
(expect
  [(var-get #'f/Num)
   (var-get #'f/DateTime)
   (var-get #'f/Category)
   (var-get #'f/Text)
   nil]
  [(-> (#'f/fingerprint-field {} {:base_type :type/Number} numbers) :type)
   (-> (#'f/fingerprint-field {} {:base_type :type/DateTime} datetimes) :type)
   (-> (#'f/fingerprint-field {} {:base_type :type/Text
                                  :special_type :type/Category}
                              categories)
       :type)
   (-> (#'f/fingerprint-field {} {:base_type :type/Text} (map str categories)) :type)
   (-> (#'f/fingerprint-field {} {:base_type :type/NeverBeforeSeen} numbers) :type)])

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
   false]
  [(-> {:computation :linear} (#'f/linear-computation?) some?)
   (-> {:computation :unbounded} (#'f/unbounded-computation?) some?)
   (-> {:computation :yolo} (#'f/unbounded-computation?) some?)
   (-> {:computation :yolo} (#'f/yolo-computation?) some?)
   (-> {:computation :unbounded} (#'f/linear-computation?) some?)
   (-> {:computation :unbounded} (#'f/yolo-computation?) some?)
   (-> {:query :cache} (#'f/cache-only?) some?)
   (-> {:query :sample} (#'f/sample-only?) some?)
   (-> {:query :full-scan} (#'f/full-scan?) some?)
   (-> {:query :joins} (#'f/full-scan?) some?)
   (-> {:query :joins} (#'f/alow-joins?) some?)
   (-> {:query :sample} (#'f/full-scan?) some?)])
