(ns metabase.lib.schema.temporal-bucketing
  "Malli schema for temporal bucketing units and expressions."
  (:require
   [metabase.util.malli.registry :as mr]))

;;; units that you can EXTRACT from a date or datetime. These return integers in temporal bucketing expressions.
(mr/def ::unit.date.extract
  [:enum
   :day-of-week
   :day-of-month
   :day-of-year
   :week-of-year
   :month-of-year
   :quarter-of-year
   :year])

;;; units that you can TRUNCATE a date or datetime to. In temporal bucketing expressions these return a `:type/Date`.
(mr/def ::unit.date.truncate
  ;; `:year` could work as either an extract or a truncation unit, but I think we're mostly using it as extract for
  ;; the time being.
  [:enum :day :week :month :quarter #_:year])

(mr/def ::unit.date
  [:or
   ::unit.date.extract
   ::unit.date.truncate])

;;; units that you can EXTRACT from a time or datetime. These return integers in temporal bucketing expressions.
(mr/def ::unit.time.extract
  [:enum :minute-of-hour :hour-of-day])

;;; units you can TRUNCATE a time or datetime to. These return the same type as the expression being bucketed in
;;; temporal bucketing expressions.
(mr/def ::unit.time.truncate
  [:enum :millisecond :second :minute :hour])

(mr/def ::unit.time
  [:or
   ::unit.time.extract
   ::unit.time.truncate])

(mr/def ::unit
  [:or
   [:= :default]
   ::unit.date
   ::unit.time])

;;; valid TRUNCATION units for a DATE TIME.
(mr/def ::unit.date-time.truncate
  [:or
   ::unit.date.truncate
   ::unit.time.truncate])

;;; valid EXTRACTION units for a DATE TIME.
(mr/def ::unit.date-time.extract
  [:or
   ::unit.date.extract
   ::unit.time.extract])

;;; date units that are valid in intervals or clauses like `:datetime-add`. This is a superset of `::unit.date.truncate`
(mr/def ::unit.date.interval
  [:enum :day :week :month :quarter :year])

;;; time units that are valid in intervals or clauses like `:datetime-add`. Currently the same as `::unit.time.extract`.
(mr/def ::unit.time.interval
  [:enum :millisecond :second :minute :hour])

;;; units valid in intervals or clauses like `:datetime-add` for DATE TIMES.
(mr/def ::unit.date-time.interval
  [:or
   ::unit.date.interval
   ::unit.time.interval])
