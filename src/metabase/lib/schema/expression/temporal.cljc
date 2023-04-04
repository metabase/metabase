(ns metabase.lib.schema.expression.temporal
  (:require
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.lib.schema.temporal-bucketing :as temporal-bucketing]
   [metabase.util.malli.registry :as mr]))

(mbql-clause/define-tuple-mbql-clause :interval
  :int
  ::temporal-bucketing/unit.date-time.interval)

;; FIXME Interval produces a fixed type but we have no :type/Interval
(defmethod expression/type-of* :interval
  [[_tag _opts n _unit]]
  (expression/type-of n))

;;; TODO -- we should constrain this so that you can only use a Date unit if expr is a date, etc.
(doseq [op [:datetime-add :datetime-subtract]]
  (mbql-clause/define-tuple-mbql-clause op
    #_expr   [:ref ::expression/temporal]
    #_amount :int
    #_unit   [:ref ::temporal-bucketing/unit.date-time.interval])

  (expression/register-type-of-first-arg op))

(doseq [op [:get-year :get-month :get-day :get-hour :get-minute :get-second :get-quarter]]
  (mbql-clause/define-tuple-mbql-clause op :- :type/Integer
    [:schema [:ref ::expression/temporal]]))

(mbql-clause/define-tuple-mbql-clause :datetime-diff :- :type/Integer
  #_:datetime1 [:schema [:ref ::expression/temporal]]
  #_:datetime2 [:schema [:ref ::expression/temporal]]
  #_:unit [:enum "year" "month" "day" "hour" "second" "millisecond" "quarter"])

(mbql-clause/define-tuple-mbql-clause :get-week :- :type/Integer
  #_:datetime [:schema [:ref ::expression/temporal]]
  ;; TODO should this be in the options map?
  #_:mode [:maybe [:enum :iso :us :instance]])

(mbql-clause/define-tuple-mbql-clause :convert-timezone
  #_:datetime [:schema [:ref ::expression/temporal]]
  ;; TODO could be better specified - perhaps with a build time macro to inline the timezones?
  ;; NOT expressions?
  #_:target [:string]
  #_:source [:maybe [:string]])

(expression/register-type-of-first-arg :convert-timezone)

(mbql-clause/define-tuple-mbql-clause :now :- :type/DateTimeWithTZ)

(mbql-clause/define-tuple-mbql-clause :absolute-datetime :- :type/DateTimeWithTZ
  #_:datetimestr [:schema [:ref ::expression/string]]
  #_:unit [:ref ::temporal-bucketing/unit.date-time.interval])

(mr/def ::relative-datetime.amount
  [:or
   [:= :current]
   :int])

(mbql-clause/define-tuple-mbql-clause :relative-datetime :- :type/DateTime
  #_n    [:ref ::relative-datetime.amount]
  #_unit [:ref ::temporal-bucketing/unit.date-time.interval])

(mbql-clause/define-tuple-mbql-clause :time :- :type/Time
  #_:timestr [:schema [:ref ::expression/string]]
  #_:unit [:ref ::temporal-bucketing/unit.time.interval])

(mr/def ::temporal-extract.unit
  [:enum
   :year-of-era
   :quarter-of-year
   :month-of-year
   :week-of-year-iso
   :week-of-year-us
   :week-of-year-instance
   :day-of-month
   :day-of-week
   :hour-of-day
   :minute-of-hour
   :second-of-minute])

(mr/def ::temporal-extract.week-mode
  [:enum :iso :us :instance])

;;; TODO -- this should make sure unit agrees with the type of expression we're extracting from.
(mbql-clause/define-catn-mbql-clause :temporal-extract :- :type/Integer
  [:datetime [:schema [:ref ::expression/temporal]]]
  [:unit     [:schema [:ref ::temporal-extract.unit]]]
  [:mode     [:? [:schema [:ref ::temporal-extract.week-mode]]]])
