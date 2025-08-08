(ns metabase.lib.schema.temporal-bucketing
  "Malli schema for temporal bucketing units and expressions."
  (:require
   #?(:clj [flatland.ordered.set :as ordered-set])
   [clojure.set :as set]
   [metabase.lib.schema.common :as common]
   [metabase.util.malli.registry :as mr]))

(def ordered-date-extraction-units
  "Units that you can EXTRACT from a date or datetime. These return integers in temporal bucketing expressions.
  The front end shows the options in this order."
  [:day-of-week
   :day-of-month
   :day-of-year
   :week-of-year
   :month-of-year
   :quarter-of-year
   :year
   :year-of-era])

(defn- ordered-set [xs]
  (into #?(:clj (ordered-set/ordered-set) :cljs #{}) xs))

(def date-extraction-units
  "Units that you can EXTRACT from a date or datetime. These return integers in temporal bucketing expressions."
  (ordered-set ordered-date-extraction-units))

(mr/def ::unit.date.extract
  (into [:enum {:error/message    "Valid date extraction unit"
                :decode/normalize common/normalize-keyword}]
        date-extraction-units))

(def ordered-date-truncation-units
  "Units that you can TRUNCATE a date or datetime to. In temporal bucketing expressions these return a `:type/Date`.
  The front end shows the options in this order."
  [:day :week :month :quarter :year])

(def date-truncation-units
  "Units that you can TRUNCATE a date or datetime to. In temporal bucketing expressions these return a `:type/Date`."
  (ordered-set ordered-date-truncation-units))

(mr/def ::unit.date.truncate
  (into [:enum {:error/message    "Valid date truncation unit"
                :decode/normalize common/normalize-keyword}]
        (conj date-truncation-units :default)))

(def ordered-date-bucketing-units
  "Valid date or datetime bucketing units for either truncation or extraction operations.
  The front end shows the options in this order."
  (into [] (distinct) (concat ordered-date-truncation-units ordered-date-extraction-units)))

(def date-bucketing-units
  "Valid date or datetime bucketing units for either truncation or extraction operations."
  (ordered-set ordered-date-bucketing-units))

(mr/def ::unit.date
  (into [:enum {:error/message    "Valid date bucketing unit"
                :decode/normalize common/normalize-keyword}]
        (conj date-bucketing-units :default)))

(def ordered-time-extraction-units
  "Units that you can EXTRACT from a time or datetime. These return integers in temporal bucketing expressions.
  The front end shows the options in this order."
  [:second-of-minute
   :minute-of-hour
   :hour-of-day])

(def time-extraction-units
  "Units that you can EXTRACT from a time or datetime. These return integers in temporal bucketing expressions."
  (ordered-set ordered-time-extraction-units))

(mr/def ::unit.time.extract
  (into [:enum {:error/message "Valid time extraction unit"}]
        (conj time-extraction-units :default)))

(def ordered-time-truncation-units
  "Units you can TRUNCATE a time or datetime to. These return the same type as the expression being bucketed in temporal
  bucketing expressions. The front end shows the options in this order."
  [:millisecond :second :minute :hour])

(def time-truncation-units
  "Units you can TRUNCATE a time or datetime to. These return the same type as the expression being bucketed in temporal
  bucketing expressions."
  (ordered-set ordered-time-truncation-units))

(mr/def ::unit.time.truncate
  (into [:enum {:error/message    "Valid time truncation unit"
                :decode/normalize common/normalize-keyword}]
        (conj time-truncation-units :default)))

(def ordered-time-bucketing-units
  "Valid time bucketing units for either truncation or extraction operations.
  The front end shows the options in this order."
  (into []
        (distinct)
        (concat ordered-time-truncation-units ordered-time-extraction-units)))

(def time-bucketing-units
  "Valid time bucketing units for either truncation or extraction operations."
  (ordered-set ordered-time-bucketing-units))

(mr/def ::unit.time
  (into [:enum {:error/message    "Valid time bucketing unit"
                :decode/normalize common/normalize-keyword}]
        time-bucketing-units))

(def ordered-datetime-truncation-units
  "Valid datetime bucketing units for truncation operations.
  The front end shows the options in this order."
  (into []
        (distinct)
        (concat ordered-time-truncation-units ordered-date-truncation-units)))

(def ordered-datetime-bucketing-units
  "Valid datetime bucketing units for either truncation or extraction operations.
  The front end shows the options in this order."
  (into []
        (distinct)
        (concat ordered-time-truncation-units ordered-date-truncation-units
                ordered-time-extraction-units ordered-date-extraction-units)))

(def datetime-bucketing-units
  "Valid datetime bucketing units for either truncation or extraction operations."
  (ordered-set ordered-datetime-bucketing-units))

(mr/def ::unit.date-time
  (into [:enum {:error/message    "Valid datetime bucketing unit"
                :decode/normalize common/normalize-keyword}]
        (conj ordered-datetime-bucketing-units :default)))

(def temporal-bucketing-units
  "This is the same as [[datetime-bucketing-units]], but also includes `:default`."
  (conj datetime-bucketing-units :default))

(mr/def ::unit
  (into [:enum {:error/message    "Valid temporal bucketing unit"
                :decode/normalize common/normalize-keyword}]
        (conj temporal-bucketing-units :default)))

(def datetime-truncation-units
  "Valid TRUNCATION units for a datetime."
  (set/union date-truncation-units time-truncation-units))

(mr/def ::unit.date-time.truncate
  (into [:enum {:error/message    "Valid datetime truncation unit"
                :decode/normalize common/normalize-keyword}]
        (conj datetime-truncation-units :default)))

(def datetime-extraction-units
  "Valid EXTRACTION units for a datetime. Extraction units return integers!"
  (set/union date-extraction-units time-extraction-units))

(mr/def ::unit.date-time.extract
  (into [:enum {:error/message    "Valid datetime extraction unit"
                :decode/normalize common/normalize-keyword}]
        (conj datetime-extraction-units :default)))

(def date-interval-units
  "Date units that are valid in intervals or clauses like `:datetime-add`. This is a superset
  of [[date-truncation-units]]."
  ;; it's the same but also includes `:year`, not normally allowed as a date truncation unit; `:year` is interpreted
  ;; as extraction instead.
  (conj date-truncation-units :year))

(mr/def ::unit.date.interval
  (into [:enum {:error/message    "Valid date interval unit"
                :decode/normalize common/normalize-keyword}]
        date-interval-units))

(def time-interval-units
  "Time units that are valid in intervals or clauses like `:datetime-add`. Currently the same
  as [[time-truncation-units]]."
  time-truncation-units)

(mr/def ::unit.time.interval
  (into [:enum {:error/message    "Valid time interval unit"
                :decode/normalize common/normalize-keyword}]
        (conj time-interval-units :default)))

(def datetime-interval-units
  "Units valid in intervals or clauses like `:datetime-add` for datetimes."
  (set/union date-interval-units time-interval-units))

(mr/def ::unit.date-time.interval
  (into [:enum {:error/message    "Valid datetime interval unit"
                :decode/normalize common/normalize-keyword}]
        (conj datetime-interval-units :default)))

(mr/def ::option
  [:map
   [:lib/type [:= :option/temporal-bucketing]]
   [:unit ::unit]
   [:default {:optional true} :boolean]])
