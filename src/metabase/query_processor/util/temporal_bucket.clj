(ns metabase.query-processor.util.temporal-bucket
  (:require
   [clojure.set :as set]))

(def valid-date-units
  "Valid temporal units for date."
  #{:default :day :day-of-week :day-of-month :day-of-year
    :week :week-of-year :month :month-of-year :quarter :quarter-of-year :year})

(def valid-time-units
  "Valid temporal units for time."
  #{:default :millisecond :second :minute :minute-of-hour :hour :hour-of-day})

(def valid-datetime-units
  "Valid temporal units for date time."
  (set/union valid-date-units valid-time-units))

;; TODO -- this should be changed to `:effective-type` once we finish the metadata changes.
(defmulti valid-units-for-base-type
  "Returns valid temrpoal units for the `base-type`."
  {:arglists '([base-type])}
  keyword)

;; for stuff like UNIX timestamps -- skip validation for now. (UNIX timestamp should be bucketable with any unit
;; anyway). Once `:effective-type` is in place, we can actually check those Fields here.
(defmethod valid-units-for-base-type :type/*        [_] valid-datetime-units)
(defmethod valid-units-for-base-type :type/Date     [_] valid-date-units)
(defmethod valid-units-for-base-type :type/Time     [_] valid-time-units)
(defmethod valid-units-for-base-type :type/DateTime [_] valid-datetime-units)

(defn compatible-temporal-unit?
  "Check whether some column of `a-type` can be bucketted by the`temporal-unit`. Any column can be bucketed by `nil`
  temporal unit. "
  [a-type temporal-unit]
  (or (nil? temporal-unit)
      (contains? (valid-units-for-base-type a-type) temporal-unit)))
