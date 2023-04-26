(ns metabase.lib.schema.temporal-bucketing
  "Malli schema for temporal bucketing units and expressions."
  (:require
   [clojure.set :as set]
   [metabase.util.malli.registry :as mr]))

(def date-extraction-units
  "Units that you can EXTRACT from a date or datetime. These return integers in temporal bucketing expressions."
  #{:day-of-week
    :day-of-month
    :day-of-year
    :week-of-year
    :month-of-year
    :quarter-of-year
    :year})

(mr/def ::unit.date.extract
  (into [:enum {:error/message "Valid date extraction unit"}] date-extraction-units))

(def date-truncation-units
  "Units that you can TRUNCATE a date or datetime to. In temporal bucketing expressions these return a `:type/Date`.

  Note: `:year` could work as either an extract or a truncation unit, but I think we're mostly using it as extract for
  the time being. So it is is not included here."
  #{:day :week :month :quarter})

(mr/def ::unit.date.truncate
  (into [:enum {:error/message "Valid date truncation unit"}] date-truncation-units))

(def date-bucketing-units
  "Valid date or datetime bucketing units for either truncation or extraction operations."
  (set/union date-extraction-units date-truncation-units))

(mr/def ::unit.date
  (into [:enum {:error/message "Valid date bucketing unit"}] date-bucketing-units))

(def time-extraction-units
  "Units that you can EXTRACT from a time or datetime. These return integers in temporal bucketing expressions."
  #{:minute-of-hour :hour-of-day})

(mr/def ::unit.time.extract
  (into [:enum {:error/message "Valid time extraction unit"}] time-extraction-units))

(def time-truncation-units
  "Units you can TRUNCATE a time or datetime to. These return the same type as the expression being bucketed in temporal
  bucketing expressions."
  #{:millisecond :second :minute :hour})

(mr/def ::unit.time.truncate
  (into [:enum {:error/message "Valid time truncation unit"}] time-truncation-units))

(def time-bucketing-units
  "Valid time bucketing units for either truncation or extraction operations."
  (set/union time-extraction-units time-truncation-units))

(mr/def ::unit.time
  (into [:enum {:error/message "Valid time bucketing unit"}] time-bucketing-units))

(def datetime-bucketing-units
  "Valid datetime bucketing units for either truncation or extraction operations."
  (set/union date-bucketing-units time-bucketing-units))

(mr/def ::unit.date-time
  (into [:enum {:error/message "Valid datetime bucketing unit"}] datetime-bucketing-units))

(def temporal-bucketing-units
  "This is the same as [[datetime-bucketing-units]], but also includes `:default`."
  (conj datetime-bucketing-units :default))

(mr/def ::unit
  (into [:enum {:error/message "Valid temporal bucketing unit"}] temporal-bucketing-units))

(def datetime-truncation-units
  "Valid TRUNCATION units for a datetime."
  (set/union date-truncation-units time-truncation-units))

(mr/def ::unit.date-time.truncate
  (into [:enum {:error/message "Valid datetime truncation unit"}] datetime-truncation-units))

(def datetime-extraction-units
  "Valid EXTRACTION units for a datetime. Extraction units return integers!"
  (set/union date-extraction-units time-extraction-units))

(mr/def ::unit.date-time.extract
  (into [:enum {:error/message "Valid datetime extraction unit"}] datetime-extraction-units))

(def date-interval-units
  "Date units that are valid in intervals or clauses like `:datetime-add`. This is a superset
  of [[date-truncation-units]]."
  ;; it's the same but also includes `:year`, not normally allowed as a date truncation unit; `:year` is interpreted
  ;; as extraction instead.
  (conj date-truncation-units :year))

(mr/def ::unit.date.interval
  (into [:enum {:error/message "Valid date interval unit"}] date-interval-units))

(def time-interval-units
  "Time units that are valid in intervals or clauses like `:datetime-add`. Currently the same
  as [[time-truncation-units]]."
  time-truncation-units)

(mr/def ::unit.time.interval
  (into [:enum {:error/message "Valid time interval unit"}] time-interval-units))

(def datetime-interval-units
  "Units valid in intervals or clauses like `:datetime-add` for datetimes."
  (set/union date-interval-units time-interval-units))

(mr/def ::unit.date-time.interval
  (into [:enum {:error/message "Valid datetime interval unit"}] datetime-interval-units))
