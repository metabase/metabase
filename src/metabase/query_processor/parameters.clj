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

(defn- start-of-quarter [quarter year]
  (t/first-day-of-the-month (.withMonthOfYear (t/date-time year) (case quarter
                                                                   "Q1" DateTimeConstants/JANUARY
                                                                   "Q2" DateTimeConstants/APRIL
                                                                   "Q3" DateTimeConstants/JULY
                                                                   "Q4" DateTimeConstants/OCTOBER))))

(defn- week-range
  ([^DateTime dt] (week-range dt dt))
  ([^DateTime end ^DateTime start]
    ;; weeks always start on SUNDAY and end on SATURDAY
    ;; NOTE: in Joda the week starts on Monday and ends on Sunday, so to get the right Sunday we rollback 1 week
   {:end   (.withDayOfWeek end DateTimeConstants/SATURDAY)
    :start (.withDayOfWeek ^DateTime (t/minus start (t/weeks 1)) DateTimeConstants/SUNDAY)}))

(defn- month-range
  ([^DateTime dt] (month-range dt dt))
  ([^DateTime end ^DateTime start]
  {:end   (t/last-day-of-the-month end)
   :start (t/first-day-of-the-month start)}))

;; NOTE: this is perhaps a little hacky, but we are assuming that `dt` will be in the first month of the quarter
(defn- quarter-range
  ([^DateTime dt] (quarter-range dt dt))
  ([^DateTime end ^DateTime start]
  {:end   (t/last-day-of-the-month (t/plus end (t/months 2)))
   :start (t/first-day-of-the-month start)}))

(defn- year-range
  ([^DateTime dt] (year-range dt dt))
  ([^DateTime end ^DateTime start]
  {:end   (t/last-day-of-the-month  (.withMonthOfYear end DateTimeConstants/DECEMBER))
   :start (t/first-day-of-the-month (.withMonthOfYear start DateTimeConstants/JANUARY))}))

;(defn- str->int [str] (if (number? (read-string str))))

(def ^:private operations-by-date-unit
  {"day"   {:range     (fn [dt]
                         {:end   dt,
                          :start dt})
            :to-period t/days}
   "week"  {:range     week-range
            :to-period t/weeks}
   "month" {:range     month-range
            :to-period t/months}
   "year"  {:range     year-range
            :to-period t/years}})

(defn ^:private parse-absolute-date
  [date]
  (tf/parse (tf/formatters :year-month-day) date))

(defn ^:private expand-parser-groups
  [group-label group-value]
  (case group-label
    :unit (conj (seq (get operations-by-date-unit group-value))
                [group-label group-value])
    :int-value [[group-label (Integer/parseInt group-value)]]
    (:date :date-1 :date-2) [[group-label (parse-absolute-date group-value)]]
    [[group-label group-value]]))

(defn ^:private regex->parser
  "Takes a regex and labels matching the regex capturing groups. Returns a parser which
  takes a parameter value, validates the value against regex and gives a map of labels
  and group values. Respects the following special label names:
      :unit – finds a matching date unit and merges date unit operations to the result
      :int-value – converts the group value to integer
      :date[-index] – converts the group value to absolute date"
  [regex, group-labels]
  (fn [param-value]
    (when-let [regex-result (re-matches regex param-value)]
      (into {}
             (mapcat expand-parser-groups group-labels (rest regex-result))))))

;; Functions that use `relative-date-param-values` should feed the `:parser` return
;; value as the first parameter to both `:range` and `:filter`

;; Note that the order of values in the arrays matter: methods that test parsers against a parameter value
;; traverse the array from up to bottom
(def ^:private relative-date-param-values
  [{:parser  #(= % "today")
    :range  (fn [_ dt]
              {:end   dt,
               :start dt})
    :filter (fn [_ field] ["=" field ["relative_datetime" "current"]])}

   {:parser  #(= % "yesterday")
    :range  (fn [_ dt]
              {:end   (t/minus dt (t/days 1))
               :start (t/minus dt (t/days 1))})
    :filter (fn [_ field] ["=" field ["relative_datetime" -1 "day"]])}

   {:parser (regex->parser #"past([0-9]+)(day|week|month|year)s", [:int-value :unit])
    :range  (fn [{:keys [unit int-value range to-period]} dt]
              (range (t/minus dt (to-period 1))
                     (t/minus dt (to-period int-value))))
    :filter (fn [{:keys [unit int-value]} field]
              ["TIME_INTERVAL" field (- int-value) unit])}

   {:parser (regex->parser #"next([0-9]+)(day|week|month|year)s" [:int-value :unit])
    :range  (fn [{:keys [unit int-value to-period]} dt]
              (range (t/plus dt (to-period int-value))
                     (t/plus dt (to-period 1))))
    :filter (fn [{:keys [unit int-value]} field]
              ["TIME_INTERVAL" field int-value unit])}

   {:parser (regex->parser #"this(day|week|month|year)" [:unit])
    :range  (fn [{:keys [range]} dt]
              (range dt))
    :filter (fn [{:keys [unit]} field]
              ["TIME_INTERVAL" field "current" unit])}])

(defn ^:private date->iso8601
  [date]
  (tf/unparse (tf/formatters :year-month-day) date))

(defn ^:private range->filter
  [[start end] field]
  ["BETWEEN" field (date->iso8601 start) (date->iso8601 end)])

(def ^:private absolute-date-param-values
  ;; year and month
  ;; TODO: Find out if the standard date formatter could be used instead
   [{:parser (regex->parser #"([0-9]{4}-[0-9]{2})" [:year-month])
    :range  (fn [{:keys [year-month]} _]
              (month-range (tf/parse (tf/formatters :year-month) year-month)))
    :filter (fn [{:keys [year-month]} field]
              (range->filter (month-range (tf/parse (tf/formatters :year-month) year-month))
                             field))}
  ;; quarter year
  ;; TODO: Find out if the standard date formatter could be used instead
   {:parser (regex->parser #"(Q[1-4]{1})-([0-9]{4})" [:quarter :year])
    :range (fn [{:keys [quarter year]} _]
               (quarter-range (start-of-quarter quarter (Integer/parseInt year))))
    :filter (fn [{:keys [quarter year]} field]
               (range->filter (quarter-range (start-of-quarter quarter (Integer/parseInt year)))
                              field))}
  ;; single day
  {:parser (regex->parser #"([0-9-T:]+)" [:date])
    :range  (fn [{:keys [date]} _]
              {:start date, :end date})
    :filter (fn [{:keys [date]} field]
              (let [iso8601date (date->iso8601 date)]
                ["BETWEEN" field iso8601date iso8601date]))}
   ;; day range
   {:parser (regex->parser #"([0-9-T:]+)~([0-9-T:]+)" [:date-1 :date-2])
    :range  (fn [{:keys [date-1 date-2]} _]
              {:start date-1, :end date-2})
    :filter (fn [{:keys [date-1 date-2]} field]
              ["BETWEEN" field (date->iso8601 date-1) (date->iso8601 date-2)])}
   ;; before day
   {:parser (regex->parser #"~([0-9-T:]+)" [:date])
    :range  (fn [{:keys [date]} _]
              {:end date})
    :filter (fn [{:keys [date]} field]
              ["<" field (date->iso8601 date)])}
   ;; after day
   {:parser (regex->parser #"([0-9-T:]+)~" [:date])
    :range  (fn [{:keys [date]} _]
              {:start date})
    :filter (fn [{:keys [date]} field]
              [">" field (date->iso8601 date)])}
])

;; Collects all parameter value parsers and range/filter creators together
(def ^:private date-param-values
  (concat relative-date-param-values absolute-date-param-values))

(defn- find-and-execute-date-param-method
  [date-param-value method-id method-param]
  (some (fn [{parser :parser method method-id}]
          (if-let [parser-result (parser date-param-value)]
            (method parser-result method-param)))
        date-param-values))

(defn date->range
  "Takes a string description of a date range such as 'lastmonth' or '2016-07-15~2016-08-6' and
   return a MAP with `:start` and `:end` as iso8601 string formatted dates, respecting the given timezone."
  [param-value report-timezone]
  (let [tz        (t/time-zone-for-id report-timezone)
        formatter (tf/formatter "yyyy-MM-dd" tz)
        today     (.withTimeAtStartOfDay (t/to-time-zone (t/now) tz))]
  (->> (find-and-execute-date-param-method param-value :range today)
       (m/map-vals (partial tf/unparse formatter)))))

;formatter (tf/formatter "yyyy-MM-dd" tz)
;(m/map-vals (partial tf/unparse formatter)))))

(defn- date->filter
  "Takes a string description of a date range such as 'lastmonth' or '2016-07-15~2016-08-6' and returns a
   corresponding MBQL filter clause."
  [param-value field]
  (find-and-execute-date-param-method param-value :filter field))

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
    (date->filter param-value field)))

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
