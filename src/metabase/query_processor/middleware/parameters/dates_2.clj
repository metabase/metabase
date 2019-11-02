(ns metabase.query-processor.middleware.parameters.dates-2
  "New implementation of `metabase.query-processor.middleware.parameters.dates`. Work in progress."
  (:require [metabase.util.date-2 :as u.date]))

(defn- parse-group [s group]
  (if (sequential? group)
    (let [[group-name parser] group]
      [group-name (parser s)])
    [group s]))

(defn- parse-with-regex [re groups s]
  (when-let [results (re-matches re s)]
    (let [matches (rest results)]
      (into {} (map parse-group matches groups)))))

(defmulti ^:private parse
  "Attempt to parse a MBQL date parameter string `s`. If this method can parse `s`, it should return a truthy value; this
  value will be passed to `parsed->range` and `parsed->mbql`. If this method cannot parse `s`, it should return a
  falsy value, so that a different parser might be tried."
  {:arglists '([parser s])}
  (fn [parser _] (keyword parser)))

(defmulti ^:private parsed->range
  "Convert the results of parsing an MBQL date parameter string into a map describing a range (span?) of time with
  `:start` (inclusive) and `:end` (exclusive) instants, e.g.

    {:start \"2019-11-01T15:49:00-07:00[US/Pacific]\", :end \"2019-11-02T15:49:00-07:00[US/Pacific]\"}

  This is used for parameter substitution in SQL queries to generate SQL like `BETWEEN <start> AND <end>`. For
  relative datetimes, the value of `now` should be used when calculating the span."
  {:arglists '([parser parser-results now])}
  (fn [parser _ _] (keyword parser)))

(defmulti ^:private parsed->mbql
  "Convert the results of parsing an MBQL date parameter string into a filter clause, e.g.

    [:= [:datetime-field field :day] [:relative-datetime :current]]

  This is used in parameter substitution for MBQL queries."
  {:arglists '([parser parser-results field-clause])}
  (fn [parser _ _] (keyword parser)))

(defmethod parse :relative/today
  [_ s]
  (= s "today"))

(defmethod parsed->range :relative/today
  [_ _ now]
  (u.date/range now :day))

(defmethod parsed->mbql :relative/today
  [_ _ field]
  [:= [:datetime-field field :day] [:relative-datetime :current]])


(defmethod parse :relative/yesterday
  [_ s]
  (= s "yesterday"))

(defmethod parsed->range :relative/yesterday
  [_ _ now]
  (u.date/range (u.date/add now :day -1)))

(defmethod parsed->mbql :relative/yesterday
  [_ _ field]
  [:= [:datetime-field :field :day] [:relative-datetime -1 :day]])

(defmethod parse :relative/past-n
  [_ s]
  (parse-with-regex
   ;; adding a tilde (~) at the end of a past<n><unit> filter means we should include the current day/etc.
   ;; e.g. past30days  = past 30 days, not including partial data for today ({:include-current false})
   ;;      past30days~ = past 30 days, *including* partial data for today   ({:include-current true})
   #"^past([0-9]+)(day|week|month|year)s(~?)$"
   [[:n #(Integer/parseInt %)] [:unit keyword] [:include-current? seq]]
   s))

(defmethod parsed->range :relative/past-n
  [_ {:keys [n unit include-current?]} now]
  (println "include-current?:" include-current?) ; NOCOMMIT
  (u.date/date-range [(- n) unit] now (when include-current? [1 unit])))


(defn- parse->range [parser s now]
  (when-let [results (parse parser s)]
    (parsed->range parser results now)))

(defn- parse->mbql [parser s field]
  (when-let [results (parse parser s)]
    (parsed->mbql parser results field)))
