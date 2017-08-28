(ns metabase.feature-extraction.feature-extractors-test
  (:require [clj-time.core :as t]
            [expectations :refer :all]
            [metabase.feature-extraction.feature-extractors :refer :all :as fe]
            [metabase.feature-extraction.histogram :as h]
            [redux.core :as redux]))

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
  [(#'fe/quarter (t/date-time 2017 1))
   (#'fe/quarter (t/date-time 2017 3))
   (#'fe/quarter (t/date-time 2017 5))
   (#'fe/quarter (t/date-time 2017 12))])

(defn- make-timestamp
  [y m]
  (-> (t/date-time y m)
      ((var fe/to-double))))

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
  (#'fe/fill-timeseries (t/months 1) [[(make-timestamp 2016 1) 12]
                                     [(make-timestamp 2016 3) 4]
                                      [(make-timestamp 2017 1) 25]]))

(expect
  [2
   0]
  [(transduce identity cardinality [:foo :bar :foo])
   (transduce identity cardinality [])])

(expect
  {:foo 4 :bar 0 :baz 1}
  ((#'fe/merge-juxt (fn [_] {:foo 4})
                    (fn [m] {:bar (count m)})
                    (fn [_] {:baz 1})) {}))

(def ^:private hist (transduce identity h/histogram (concat (range 50)
                                                            (range 200 250))))

(expect
  [["TEST" "SHARE"]
   3
   true
   [[17.0 1.0]]]
  (let [dataset (#'fe/histogram->dataset {:name "TEST"} hist)]
    [(:columns dataset)
     (count (:rows dataset))
     (->> (transduce identity h/histogram [])
          (#'fe/histogram->dataset {:name "TEST"})
          :rows
          empty?)
     (->> (transduce identity h/histogram [17])
          (#'fe/histogram->dataset {:name "TEST"})
          :rows
          vec)]))

(expect
  [(t/date-time 2017 8)
   (t/date-time 2017 12)
   (t/date-time 2017 8)]
  [(#'fe/round-to-month (t/date-time 2017 8 15))
   (#'fe/round-to-month (t/date-time 2017 12 20))
   (#'fe/round-to-month (t/date-time 2017 8 16))])

(expect
  {1 3 2 3 3 3 4 2}
  (#'fe/quarter-frequencies (t/date-time 2015) (t/date-time 2017 9 12)))

(expect
  {1 3 2 3 3 3 4 3 5 3 6 3 7 3 8 3 9 2 10 2 11 2 12 2}
  (#'fe/month-frequencies (t/date-time 2015) (t/date-time 2017 8 12)))

(def ^:private numbers [0.1 0.4 0.2 nil 0.5 0.3 0.51 0.55 0.22])
(def ^:private datetimes ["2015-06-01" nil "2015-06-11" "2015-01-01"
                          "2016-06-31" "2017-09-01" "2016-04-15" "2017-11-02"])
(def ^:private categories [:foo :baz :bar :bar nil :foo])

(defn- ->features
  [field data]
  (transduce identity (feature-extractor {} field) data))

(expect
  [(var-get #'fe/Num)
   (var-get #'fe/DateTime)
   [:type/Text :type/Category]
   (var-get #'fe/Text)
   [nil [:type/NeverBeforeSeen :type/*]]]
  [(-> (->features {:base_type :type/Number} numbers) :type)
   (-> (->features {:base_type :type/DateTime} datetimes) :type)
   (-> (->features {:base_type :type/Text
                    :special_type :type/Category}
                   categories)
       :type)
   (->> categories
        (map str)
        (->features {:base_type :type/Text})
        :type)
   (-> (->features {:base_type :type/NeverBeforeSeen} numbers)
       :type)])
