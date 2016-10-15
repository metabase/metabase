(ns metabase.query-processor.parameters
  "Code for handling parameter substitution in MBQL queries."
  (:require [clojure.core.match :refer [match]]
            [clojure.string :as s]
            (clj-time [core :as t]
                      [format :as tf])
            [medley.core :as m]
            [metabase.driver :as driver]
            [metabase.query-processor.sql-parameters :as native-params]
            [metabase.util :as u])
  (:import (org.joda.time DateTimeConstants DateTime)))


(def ^:private ^:const relative-dates
  #{"today"
    "yesterday"
    "past7days"
    "past30days"
    "thisweek"
    "thismonth"
    "thisyear"
    "lastweek"
    "lastmonth"
    "lastyear"})

(defn- start-of-quarter [quarter year]
  (t/first-day-of-the-month (.withMonthOfYear (t/date-time year) (case quarter
                                                                   "Q1" DateTimeConstants/JANUARY
                                                                   "Q2" DateTimeConstants/APRIL
                                                                   "Q3" DateTimeConstants/JULY
                                                                   "Q4" DateTimeConstants/OCTOBER))))

(defn- week-range [^DateTime dt]
  ;; weeks always start on SUNDAY and end on SATURDAY
  ;; NOTE: in Joda the week starts on Monday and ends on Sunday, so to get the right Sunday we rollback 1 week
  {:end   (.withDayOfWeek dt DateTimeConstants/SATURDAY)
   :start (.withDayOfWeek ^DateTime (t/minus dt (t/weeks 1)) DateTimeConstants/SUNDAY)})

(defn- month-range [^DateTime dt]
  {:end   (t/last-day-of-the-month dt)
   :start (t/first-day-of-the-month dt)})

;; NOTE: this is perhaps a little hacky, but we are assuming that `dt` will be in the first month of the quarter
(defn- quarter-range [^DateTime dt]
  {:end   (t/last-day-of-the-month (t/plus dt (t/months 2)))
   :start (t/first-day-of-the-month dt)})

(defn- year-range [^DateTime dt]
  {:end   (t/last-day-of-the-month (.withMonthOfYear dt DateTimeConstants/DECEMBER))
   :start (t/first-day-of-the-month (.withMonthOfYear dt DateTimeConstants/JANUARY))})

(defn- absolute-date->range
  "Take a given string description of an absolute date range and return a MAP with a given `:start` and `:end`.

   Supported formats:

      \"2014-05-10~2014-05-16\"
      \"Q1-2016\"
      \"2016-04\"
      \"2016-04-12\""
  [value]
  (if (s/includes? value "~")
    ;; these values are already expected to be iso8601 strings, so we are done
    (zipmap [:start :end] (s/split value #"~" 2))
    ;; these cases represent fixed date ranges, but we need to calculate start/end still
    (->> (cond
           ;; quarter-year (Q1-2016)
           (s/starts-with? value "Q") (let [[quarter year] (s/split value #"-" 2)]
                                        (quarter-range (start-of-quarter quarter (Integer/parseInt year))))
           ;; year-month (2016-04)
           (= (count value) 7)        (month-range (tf/parse (tf/formatters :year-month) value))
           ;; default is to assume a single day (2016-04-18).  we still parse just to validate.
           :else                      (let [dt (tf/parse (tf/formatters :year-month-day) value)]
                                        {:start dt, :end dt}))
         (m/map-vals (partial tf/unparse (tf/formatters :year-month-day))))))


(defn- relative-date->range
  "Take a given string description of a relative date range such as 'lastmonth' and return a MAP with a given
   `:start` and `:end` as iso8601 string formatted dates.  Values should be appropriate for the given REPORT-TIMEZONE."
  [value report-timezone]
  (let [tz        (t/time-zone-for-id report-timezone)
        formatter (tf/formatter "yyyy-MM-dd" tz)
        today     (.withTimeAtStartOfDay (t/to-time-zone (t/now) tz))]
    (->> (case value
           "past7days"  {:end   (t/minus today (t/days 1))
                         :start (t/minus today (t/days 7))}
           "past30days" {:end   (t/minus today (t/days 1))
                         :start (t/minus today (t/days 30))}
           "thisweek"   (week-range today)
           "thismonth"  (month-range today)
           "thisyear"   (year-range today)
           "lastweek"   (week-range (t/minus today (t/weeks 1)))
           "lastmonth"  (month-range (t/minus today (t/months 1)))
           "lastyear"   (year-range (t/minus today (t/years 1)))
           "yesterday"  {:end   (t/minus today (t/days 1))
                         :start (t/minus today (t/days 1))}
           "today"      {:end   today
                         :start today})
         ;; the above values are JodaTime objects, so unparse them to iso8601 strings
         (m/map-vals (partial tf/unparse formatter)))))

(defn date->range
  "Convert a relative or absolute date range VALUE to a map with `:start` and `:end` keys."
  [value report-timezone]
  (if (contains? relative-dates value)
    (relative-date->range value report-timezone)
    (absolute-date->range value)))


;;; +-------------------------------------------------------------------------------------------------------+
;;; |                                             MBQL QUERIES                                              |
;;; +-------------------------------------------------------------------------------------------------------+

(defn- parse-param-value-for-type
  "Convert PARAM-VALUE to a type appropriate for PARAM-TYPE.
   The frontend always passes parameters in as strings, which is what we want in most cases; for numbers, instead convert the parameters to integers or floating-point numbers."
  [param-type param-value]
  (cond
    ;; no conversion needed if PARAM-TYPE isn't :number or PARAM-VALUE isn't a string
    (or (not= (keyword param-type) :number)
        (not (string? param-value)))        param-value
    ;; if PARAM-VALUE contains a period then convert to a Double
    (re-find #"\." param-value)             (Double/parseDouble param-value)
    ;; otherwise convert to a Long
    :else                                   (Long/parseLong param-value)))


(defn- build-filter-clause [{param-type :type, param-value :value, [_ field] :target}]
  (let [param-value (parse-param-value-for-type param-type param-value)]
    (cond
      ;; default behavior (non-date filtering) is to use a simple equals filter
      (not (s/starts-with? param-type "date")) ["=" field param-value]
      ;; relative date range
      (contains? relative-dates param-value)   (case param-value
                                                 "past7days"  ["TIME_INTERVAL" field -7 "day"]
                                                 "past30days" ["TIME_INTERVAL" field -30 "day"]
                                                 "thisweek"   ["TIME_INTERVAL" field "current" "week"]
                                                 "thismonth"  ["TIME_INTERVAL" field "current" "month"]
                                                 "thisyear"   ["TIME_INTERVAL" field "current" "year"]
                                                 "lastweek"   ["TIME_INTERVAL" field "last" "week"]
                                                 "lastmonth"  ["TIME_INTERVAL" field "last" "month"]
                                                 "lastyear"   ["TIME_INTERVAL" field "last" "year"]
                                                 "yesterday"  ["=" field ["relative_datetime" -1 "day"]]
                                                 "today"      ["=" field ["relative_datetime" "current"]])
      ;; absolute date range
      :else                                    (let [{:keys [start end]} (absolute-date->range param-value)]
                                                 ["BETWEEN" field start end]))))

(defn- merge-filter-clauses [base addtl]
  (cond
    (and (seq base)
         (seq addtl)) ["AND" base addtl]
    (seq base)        base
    (seq addtl)       addtl
    :else             []))

(defn- expand-params:mbql [query-dict [{:keys [target value], :as param} & rest]]
  (cond
    (not param)      query-dict
    (or (not target)
        (not value)) (recur query-dict rest)
    :else            (let [filter-subclause (build-filter-clause param)
                           query            (assoc-in query-dict [:query :filter] (merge-filter-clauses (get-in query-dict [:query :filter]) filter-subclause))]
                       (recur query rest))))


;;; +-------------------------------------------------------------------------------------------------------+
;;; |                                             SQL QUERIES                                               |
;;; +-------------------------------------------------------------------------------------------------------+

(defn- expand-params:native [{:keys [driver] :as query}]
  (if-not (driver/driver-supports? driver :native-parameters)
    query
    (native-params/expand-params query)))


;;; +-------------------------------------------------------------------------------------------------------+
;;; |                                              PUBLIC API                                               |
;;; +-------------------------------------------------------------------------------------------------------+


(defn expand-parameters
  "Expand any :parameters set on the QUERY-DICT and apply them to the query definition.
   This function removes the :parameters attribute from the QUERY-DICT as part of its execution."
  [{:keys [parameters], :as query-dict}]
  (if (= :query (keyword (:type query-dict)))
    (expand-params:mbql (dissoc query-dict :parameters) parameters)
    (expand-params:native query-dict)))
