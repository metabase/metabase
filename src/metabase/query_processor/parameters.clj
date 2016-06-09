(ns metabase.query-processor.parameters
  (:require [clojure.core.match :refer [match]]
            [clojure.string :as s]
            [clj-time.core :as t]
            [clj-time.format :as tf]
            [medley.core :as m]
            [metabase.driver :as driver])
  (:import (org.joda.time DateTimeConstants)))


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
  (condp = quarter
    "Q1" (t/first-day-of-the-month (.withMonthOfYear (t/date-time year) DateTimeConstants/JANUARY))
    "Q2" (t/first-day-of-the-month (.withMonthOfYear (t/date-time year) DateTimeConstants/APRIL))
    "Q3" (t/first-day-of-the-month (.withMonthOfYear (t/date-time year) DateTimeConstants/JULY))
    "Q4" (t/first-day-of-the-month (.withMonthOfYear (t/date-time year) DateTimeConstants/OCTOBER))))

(defn- week-range [dt]
  ;; weeks always start on SUNDAY and end on SATURDAY
  ;; NOTE: in Joda the week starts on Monday and ends on Sunday, so to get the right Sunday we rollback 1 week
  {:end   (.withDayOfWeek dt DateTimeConstants/SATURDAY)
   :start (.withDayOfWeek (t/minus dt (t/weeks 1)) DateTimeConstants/SUNDAY)})

(defn- month-range [dt]
  {:end   (t/last-day-of-the-month dt)
   :start (t/first-day-of-the-month dt)})

;; NOTE: this is perhaps a little hacky, but we are assuming that `dt` will be in the first month of the quarter
(defn- quarter-range [dt]
  {:end   (t/last-day-of-the-month (t/plus dt (t/months 2)))
   :start (t/first-day-of-the-month dt)})

(defn- year-range [dt]
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
        formatter (tf/formatter "YYYY-MM-dd" tz)
        today     (.withTimeAtStartOfDay (t/to-time-zone (t/now) tz))]
    (->> (condp = value
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


;;; +-------------------------------------------------------------------------------------------------------+
;;; |                                           MBQL QUERIES                                             |
;;; +-------------------------------------------------------------------------------------------------------+


(defn- build-filter-clause [{param-type :type, param-value :value, [_ field] :target}]
  (if-not (s/starts-with? param-type "date")
    ;; default behavior is to use a simple equals filter
    ["=" field param-value]
    ;; otherwise we need to handle date filtering
    (if-not (contains? relative-dates param-value)
      ;; absolute date range
      (let [{:keys [start end]} (absolute-date->range param-value)]
        ["BETWEEN" field start end])
      ;; relative date range
      (condp = param-value
        "past7days"  ["TIME_INTERVAL" field -7 "day"]
        "past30days" ["TIME_INTERVAL" field -30 "day"]
        "thisweek"   ["TIME_INTERVAL" field "current" "week"]
        "thismonth"  ["TIME_INTERVAL" field "current" "month"]
        "thisyear"   ["TIME_INTERVAL" field "current" "year"]
        "lastweek"   ["TIME_INTERVAL" field "last" "week"]
        "lastmonth"  ["TIME_INTERVAL" field "last" "month"]
        "lastyear"   ["TIME_INTERVAL" field "last" "year"]
        "yesterday"  ["=" field ["relative_datetime" -1 "day"]]
        "today"      ["=" field ["relative_datetime" "current"]]))))

(defn- merge-filter-clauses [base addtl]
  (cond
    (and (seq base)
         (seq addtl)) ["AND" base addtl]
    (seq base)        base
    (seq addtl)       addtl
    :else             []))

(defn- expand-params-mbql [query-dict [{:keys [target value], :as param} & rest]]
  (if param
    (if (and param target value)
      (let [filter-subclause (build-filter-clause param)
            query            (assoc-in query-dict [:query :filter] (merge-filter-clauses (get-in query-dict [:query :filter]) filter-subclause))]
        (expand-params-mbql query rest))
      (expand-params-mbql query-dict rest))
    query-dict))


;;; +-------------------------------------------------------------------------------------------------------+
;;; |                                           SQL QUERIES                                             |
;;; +-------------------------------------------------------------------------------------------------------+


(defn- extract-dates [value report-timezone]
  (if-not (contains? relative-dates value)
    ;; absolute date range
    (absolute-date->range value)
    ;; relative date range
    (relative-date->range value report-timezone)))

(defn- expand-date-range-param [report-timezone {[target param-name] :target, param-type :type, param-value :value, :as param}]
  (if-not (= param-type "date")
    param
    (let [{:keys [start end]} (extract-dates param-value report-timezone)]
      [(assoc param :target [target (str param-name ":start")], :value start)
       (assoc param :target [target (str param-name ":end")],   :value end)])))

(defn- substitute-param [param-name value query]
  ;; TODO: escaping and protection against SQL injection!
  (s/replace query (re-pattern (str "\\{\\{" param-name "\\}\\}")) value))

(defn- substitute-all-params [query-dict [{:keys [value], [_ param-name] :target, :as param} & rest]]
  (if param
    (if-not (and param param-name value (string? param-name))
      (substitute-all-params query-dict rest)
      (let [query (update-in query-dict [:native :query] (partial substitute-param param-name value))]
        (substitute-all-params query rest)))
    query-dict))

(def ^:private ^:const outer-clause-pattern #"\[\[.*?\]\]")
(def ^:private ^:const outer-clause-prefix-pattern #"^\[\[(.*?)\s.*\]\]$")
(def ^:private ^:const incomplete-outer-clause-pattern #"\[\[.*?\{\{.*?\}\}.*?\]\]")
(def ^:private ^:const inner-clause-pattern #"<(.*?)>")
(def ^:private ^:const incomplete-inner-clause-pattern #"<.*?\{\{.*?\}\}.*?>")

(defn- remove-incomplete-clauses
  "Scans the native query body and removes any custom clauses which were not substituted with a parameter."
  [query-dict]
  (let [find-and-replace (fn [sql]
                           (-> sql
                               (s/replace incomplete-outer-clause-pattern "")
                               (s/replace incomplete-inner-clause-pattern "")))]
    (update-in query-dict [:native :query] find-and-replace)))

(defn- format-outer-clause
  "Formats an outer clause, finding all inner clauses and joining them via `AND` and then concatenating that onto the clause prefix.
   e.g. \"[[WHERE <foo='bar'> <tou='can'>]]\" -> \"WHERE foo='bar' AND tou='can'\""
  [clause]
  (let [prefix (second (re-find outer-clause-prefix-pattern clause))]
    ;; re-seq produces a vector for each match like [matched-form grouping1] and we only want grouping1.
    (str prefix " " (s/join " AND " (map second (re-seq inner-clause-pattern clause))))))

(defn- process-outer-clauses
  "Takes a native query body and completely processes all included outer clauses present."
  [query-dict]
  (if-let [outer-clauses (re-seq outer-clause-pattern (get-in query-dict [:native :query]))]
    (update-in query-dict [:native :query] (fn [q]
                                             (loop [sql                   q
                                                    [outer-clause & rest] outer-clauses]
                                               (if outer-clause
                                                 (recur (s/replace-first sql outer-clause (format-outer-clause outer-clause)) rest)
                                                 sql))))
    query-dict))

(defn- process-inner-clauses
  "Takes a native query body and completely processes all included inner clauses present.
   e.g. \"<foo='bar'>\" -> \"foo='bar'\""
  [query-dict]
  (if-let [inner-clauses (re-seq inner-clause-pattern (get-in query-dict [:native :query]))]
    (update-in query-dict [:native :query] (fn [q]
                                             (loop [sql                      q
                                                    [[orig stripped] & rest] inner-clauses]
                                               (if orig
                                                 (recur (s/replace-first sql orig stripped) rest)
                                                 sql))))
    query-dict))

(defn- expand-params-native [{:keys [driver], :as query-dict} params]
  (if-not (driver/driver-supports? driver :native-parameters)
    query-dict
    (let [report-timezone (get-in query-dict [:settings :report-timezone])
          params          (flatten (map (partial expand-date-range-param report-timezone) params))]
      (-> (substitute-all-params query-dict params)
          remove-incomplete-clauses
          process-outer-clauses
          process-inner-clauses))))


;;; +-------------------------------------------------------------------------------------------------------+
;;; |                                           PUBLIC API                                             |
;;; +-------------------------------------------------------------------------------------------------------+


(defn expand-parameters
  "Expand any :parameters set on the QUERY-DICT and apply them to the query definition.
   This function removes the :parameters attribute from the QUERY-DICT as part of its execution."
  [{:keys [parameters], :as query-dict}]
  (let [query (dissoc query-dict :parameters)]
    (if (= :query (keyword (:type query)))
      (expand-params-mbql query parameters)
      (expand-params-native query parameters))))
