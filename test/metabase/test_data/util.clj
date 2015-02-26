(ns metabase.test-data.util
  "Utility functions for generating test data (on the off chance we want to generate more)."
  (:require [clojure.math.numeric-tower :as math]))

(defn rand-in-range [min max]
  (+ min (math/round (rand (- max min)))))

(defn rando-date []
  (let [year (rand-in-range 2013 2015)
        month (rand-in-range 1 12)
        day (rand-in-range 1 31)]
    `(~'sql-date ~year ~month ~day)))

(defn rando-checkin []
  (let [user-id (rand-in-range 1 (count users))
        venue-id (rand-in-range 1 (count venues))
        date (rando-date)]
    [user-id venue-id date]))
