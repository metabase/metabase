(ns metabase.lib.schema.temporal-bucketing
  "Malli schema for temporal bucketing units and expressions."
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def ::unit.date
  [:enum :default :day :day-of-week :day-of-month :day-of-year :week :week-of-year
   :month :month-of-year :quarter :quarter-of-year :year])

(mr/def ::unit.time
  [:enum :default :millisecond :second :minute :minute-of-hour :hour :hour-of-day])

(mr/def ::unit
  [:or
   ::unit.date
   ::unit.time])
