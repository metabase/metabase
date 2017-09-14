(ns metabase.feature-extraction.feature-extractors-test
  (:require [clj-time
             [core :as t]
             [coerce :as t.coerce]]
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
  [0.23
   1.0
   -0.5
   -5.0
   5.0
   2.0
   nil
   nil
   nil]
  [(growth 123 100)
   (growth -0.1 -0.2)
   (growth -0.4 -0.2)
   (growth -0.4 0.1)
   (growth 0.1 -0.4)
   (growth Long/MAX_VALUE Long/MIN_VALUE)
   (growth 0.1 nil)
   (growth nil 0.5)
   (growth 0.5 0.0)])

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
  [& args]
  (-> (apply t/date-time args)
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
  [{1 3 2 3 3 3 4 2}
   {1 3 2 3 3 3 4 3}
   {1 1 2 1 3 1 4 1}]
  [(#'fe/quarter-frequencies (t/date-time 2015) (t/date-time 2017 9 12))
   (#'fe/quarter-frequencies (t/date-time 2015) (t/date-time 2017 10))
   (#'fe/quarter-frequencies (t/date-time 2015 5) (t/date-time 2016 2))])

(expect
  [true false]
  [(roughly= 30 30.5 0.05)
   (roughly= 130 30.5 0.05)])

(expect
  [:day
   :day
   :month
   nil]
  [(#'fe/infer-resolution {:breakout [["datetime-field" [:field-id 1] :as :day]]}
                          [[(make-timestamp 2015 1 1) 3]
                           [(make-timestamp 2015 2 24) 34]
                           [(make-timestamp 2015 3 3) 4]])
   (#'fe/infer-resolution nil [[(make-timestamp 2015 1 1) 3]
                               [(make-timestamp 2015 1 2) 34]
                               [(make-timestamp 2015 1 3) 4]])
   (#'fe/infer-resolution nil [[(make-timestamp 2015 1) 3]
                               [(make-timestamp 2015 2) 34]
                               [(make-timestamp 2015 3) 4]])
   (#'fe/infer-resolution nil [[(make-timestamp 2015 1) 1]
                               [(make-timestamp 2015 12) 2]
                               [(make-timestamp 2016 1) 0]])])

(expect
  [{1 3 2 3 3 3 4 3 5 3 6 3 7 3 8 3 9 2 10 2 11 2 12 2}
   {1 1 2 1 5 1 6 1 7 1 8 1 9 1 10 1 11 1 12 1}
   {5 1 6 1}]
  [(#'fe/month-frequencies (t/date-time 2015) (t/date-time 2017 8 12))
   (#'fe/month-frequencies (t/date-time 2015 5) (t/date-time 2016 2))
   (#'fe/month-frequencies (t/date-time 2015 5 31) (t/date-time 2015 6 28))])

(defn- make-sql-timestamp
  [& args]
  (-> (apply t/date-time args)
      t.coerce/to-sql-time))

(def ^:private numbers [0.1 0.4 0.2 nil 0.5 0.3 0.51 0.55 0.22])
(def ^:private ints [0 nil Long/MAX_VALUE Long/MIN_VALUE 5 -100])
(def ^:private datetimes [(make-sql-timestamp 2015 6 1)
                          nil
                          (make-sql-timestamp 2015 6 1)
                          (make-sql-timestamp 2015 6 11)
                          (make-sql-timestamp 2015 1 1)
                          (make-sql-timestamp 2016 6 30)
                          (make-sql-timestamp 2017 9 1)
                          (make-sql-timestamp 2016 4 15)
                          (make-sql-timestamp 2017 11 2)])
(def ^:private categories [:foo :baz :bar :bar nil :foo])

(defn- ->features
  [field data]
  (transduce identity (feature-extractor {} field) data))

(expect
  [(var-get #'fe/Num)
   (var-get #'fe/Num)
   (var-get #'fe/DateTime)
   [:type/Text :type/Category]
   (var-get #'fe/Text)
   [nil [:type/NeverBeforeSeen :type/*]]]
  [(-> (->features {:base_type :type/Number} numbers) :type)
   (-> (->features {:base_type :type/Number} ints) :type)
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
