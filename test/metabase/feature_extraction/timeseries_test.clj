(ns metabase.feature-extraction.timeseries-test
  (:require [clj-time
             [core :as t]
             [coerce :as t.coerce]]
            [expectations :refer :all]
            [metabase.feature-extraction.timeseries :refer :all]))

(expect
  [1
   1
   2
   4]
  [(quarter (t/date-time 2017 1))
   (quarter (t/date-time 2017 3))
   (quarter (t/date-time 2017 5))
   (quarter (t/date-time 2017 12))])

(defn- make-timestamp
  [& args]
  (-> (apply t/date-time args)
      to-double))

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
  (fill-timeseries (t/months 1) [[(make-timestamp 2016 1) 12]
                                 [(make-timestamp 2016 3) 4]
                                 [(make-timestamp 2017 1) 25]]))

(def ^:private ts (mapv vector (range) (take 100 (cycle (range 10)))))

(expect
  true
  (every? (decompose 10 ts) [:trend :residual :seasonal]))

(expect
  IllegalArgumentException
  (decompose 100 ts))
