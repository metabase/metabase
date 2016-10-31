(ns metabase.driver.googleanalytics.query-processor
  "The Query Processor is responsible for translating the Metabase Query Language into Google Analytics request format."
  (:require (clojure [string :as s])
            [clojure.tools.logging :as log]
            [clojure.tools.reader.edn :as edn]
            [medley.core :as m]
            (metabase.query-processor [expand :as expand])
            [metabase.util :as u])
  (:import java.sql.Timestamp
           java.util.Date
           clojure.lang.PersistentArrayMap
           (com.google.api.services.analytics.model GaData GaData$ColumnHeaders)
           (metabase.query_processor.interface AgFieldRef
                                               DateTimeField
                                               DateTimeValue
                                               Field
                                               RelativeDateTimeValue
                                               Value)))

(set! *warn-on-reflection* true) ; NOCOMMIT

(def ^:private ^:const earliest-date "2005-01-01")
(def ^:private ^:const latest-date "today")
(def ^:private ^:const max-rows-maximum 10000)

(def ^:const ga-type->base-type
  {"STRING"      :type/Text
   "FLOAT"       :type/Float
   "INTEGER"     :type/Integer
   "PERCENT"     :type/Float
   "TIME"        :type/Float
   "CURRENCY"    :type/Float
   "US_CURRENCY" :type/Float})


;; TODO: what should this actually be?
;; https://developers.google.com/analytics/devguides/reporting/core/v3/reference#startDate
;; says: Relative dates are always relative to the current date at the time of the query and are based on the timezone of the view (profile) specified in the query.
(defn- get-timezone-id [] "UTC")

(defn- date->ga-date
  [date]
  (u/format-date "yyyy-MM-dd" date))

(defprotocol ^:private IRValue
  (^:private ->rvalue [this]))

(extend-protocol IRValue
  nil                   (->rvalue [_] nil)
  Object                (->rvalue [this] this)
  Field                 (->rvalue [this] (:field-name this))
  DateTimeField         (->rvalue [this] (->rvalue (:field this)))
  Value                 (->rvalue [this] (:value this))
  DateTimeValue         (->rvalue [{{unit :unit} :field, value :value}] (date->ga-date (u/date-trunc-or-extract unit value (get-timezone-id))))
  RelativeDateTimeValue (->rvalue [{:keys [unit amount]}]
                          (cond
                            (and (= unit :day) (= amount 0))  "today"
                            (and (= unit :day) (= amount -1)) "yesterday"
                            (and (= unit :day) (< amount -1)) (str (- amount) "daysAgo")
                            :else                             (date->ga-date (u/date-trunc-or-extract unit (u/relative-date unit amount) (get-timezone-id))))))

(defn- escape-map
  [chars escape-char]
  (into {} (zipmap chars (map (partial str escape-char) chars))))

(defn- escape-for-regex
  [str]
  (s/escape str (escape-map ".\\+*?[^]$(){}=!<>|:-" "\\")))

(defn- escape-for-filter-clause
  [str]
  (s/escape str (escape-map ",;\\" "\\")))

(defn- ga-filter
  [& parts]
  (escape-for-filter-clause (apply str parts)))

;;; ### source-table

(defn- handle-source-table [{{source-table-name :name} :source-table}]
  {:pre [(or (string? source-table-name)
             (keyword? source-table-name))]}
  {:ids (str "ga:" source-table-name)})

;;; ### breakout

(defn- unit->ga-dimension
  [unit]
  (case unit
    :minute-of-hour "ga:minute"
    :hour           "ga:dateHour"
    :hour-of-day    "ga:hour"
    :day            "ga:date"
    :day-of-week    "ga:dayOfWeek"
    :day-of-month   "ga:day"
    :week           "ga:yearWeek"
    :week-of-year   "ga:week"
    :month          "ga:yearMonth"
    :month-of-year  "ga:month"
    :year           "ga:year"))

(defn- handle-breakout [{breakout-clause :breakout}]
  {:dimensions (if breakout-clause
                 (s/join "," (for [breakout-field breakout-clause]
                               (if (instance? DateTimeField breakout-field)
                                 (unit->ga-dimension (:unit breakout-field))
                                 (->rvalue breakout-field))))
                 "")})

;;; ### filter

;; TODO: implement negate?
(defn- parse-filter-subclause:filters [{:keys [filter-type field value] :as filter} & [negate?]]
  (if negate? (throw (Exception. ":not is :not yet implemented")))
  (when-not (instance? DateTimeField field)
    (let [field (when field (->rvalue field))
          value (when value (->rvalue value))]
      (case filter-type
        :contains    (ga-filter field "=@" value)
        :starts-with (ga-filter field "=~^" (escape-for-regex value))
        :ends-with   (ga-filter field "=~"  (escape-for-regex value) "$")
        :=           (ga-filter field "==" value)
        :!=          (ga-filter field "!=" value)
        :>           (ga-filter field ">" value)
        :<           (ga-filter field "<" value)
        :>=          (ga-filter field ">=" value)
        :<=          (ga-filter field "<=" value)
        :between     (str (ga-filter field ">=" (->rvalue (:min-val filter)))
                          ";"
                          (ga-filter field "<=" (->rvalue (:max-val filter))))))))

(defn- parse-filter-clause:filters [{:keys [compound-type subclause subclauses], :as clause}]
  (case compound-type
    :and (s/join ";" (remove nil? (mapv parse-filter-clause:filters subclauses)))
    :or  (s/join "," (remove nil? (mapv parse-filter-clause:filters subclauses)))
    :not (parse-filter-subclause:filters subclause :negate)
    nil  (parse-filter-subclause:filters clause)))

(defn- handle-filter:filters [{filter-clause :filter}]
  (when filter-clause
    (let [filter (parse-filter-clause:filters filter-clause)]
      (when-not (s/blank? filter)
        {:filters filter}))))

(defn- parse-filter-subclause:interval [{:keys [filter-type field value] :as filter} & [negate?]]
  (if negate? (throw (Exception. ":not is :not yet implemented")))
  (when (instance? DateTimeField field)
    (case filter-type
      :between {:start-date (->rvalue (:min-val filter))
                :end-date   (->rvalue (:max-val filter))}
      :>       {:start-date (->rvalue (:value filter))
                :end-date   latest-date}
      :<       {:start-date earliest-date
                :end-date   (->rvalue (:value filter))}
      :=       {:start-date (->rvalue (:value filter))
                :end-date   (->rvalue (:value filter))})))

(defn- parse-filter-clause:interval [{:keys [compound-type subclause subclauses], :as clause}]
  (case compound-type
    :and (apply concat (remove nil? (mapv parse-filter-clause:interval subclauses)))
    :or  (apply concat (remove nil? (mapv parse-filter-clause:interval subclauses)))
    :not (remove nil? [(parse-filter-subclause:interval subclause :negate)])
    nil  (remove nil? [(parse-filter-subclause:interval clause)])))

(defn- handle-filter:interval [{filter-clause :filter}]
  (let [date-filters (if filter-clause (parse-filter-clause:interval filter-clause) [])]
    (case (count date-filters)
      0 {:start-date earliest-date :end-date latest-date}
      1 (first date-filters)
      (throw (Exception. "Multiple date filters are not supported")))))

;;; ### order-by

(defn- handle-order-by [{:keys [order-by] :as query}]
  (when order-by
    {:sort (s/join "," (for [{:keys [field direction]} order-by]
                         (str (case direction
                                :ascending  ""
                                :descending "-")
                              (cond
                                (instance? DateTimeField field) (unit->ga-dimension (:unit field))
                                (instance? AgFieldRef field)    (get-in query [:aggregation :metric-name])
                                :else                           (->rvalue field)))))}))

;;; ### limit

(defn- handle-limit [{limit-clause :limit}]
  {:max-results (int (if (nil? limit-clause)
                       10000
                       limit-clause))})

(defn mbql->native
  "Transpile MBQL query into parameters required for a Google Analytics request."
  [{:keys [query], :as raw}]
  {:query (merge (handle-source-table    query)
                 (handle-breakout        query)
                 (handle-filter:interval query)
                 (handle-filter:filters  query)
                 (handle-order-by        query)
                 (handle-limit           query)
                 ;; segments and metrics are pulled out in transform-query
                 (get raw :ga)
                 ;; set to false to match behavior of other drivers
                 {:include-empty-rows false})
   :mbql? true})

(defn- parse-date
  [format str]
  (.parse (java.text.SimpleDateFormat. format) str))

(defn- parse-number
  [s]
  (edn/read-string (s/replace s #"^0+(.+)$" "$1")))


(def ^:private ga-dimension->date-format-fn
  {"ga:minute"    parse-number
   "ga:dateHour"  (partial parse-date "yyyyMMddHH")
   "ga:hour"      parse-number
   "ga:date"      (partial parse-date "yyyyMMdd")
   "ga:dayOfWeek" (comp inc parse-number)
   "ga:day"       parse-number
   "ga:yearWeek"  (partial parse-date "YYYYww")
   "ga:week"      parse-number
   "ga:yearMonth" (partial parse-date "yyyyMM")
   "ga:month"     parse-number
   "ga:year"      parse-number})

(defn- header->column
  [^GaData$ColumnHeaders header]
  (let [date-parser (ga-dimension->date-format-fn (.getName header))]
    (if date-parser
      {:name      (keyword "ga:date")
       :base-type :type/DateTime}
      {:name               (keyword (.getName header))
       :base-type          (ga-type->base-type (.getDataType header))
       :field-display-name "COOL"})))

(defn- header->getter-fn
  [^GaData$ColumnHeaders header]
  (let [date-parser (ga-dimension->date-format-fn (.getName header))
        base-type   (ga-type->base-type (.getDataType header))]
    (cond
      date-parser                   date-parser
      (isa? base-type :type/Number) edn/read-string
      :else                         identity)))

(defn execute-query
  [do-query query]
  (let [mbql?            (:mbql? (:native query))
        ^GaData response (do-query query)
        columns          (map header->column (.getColumnHeaders response))
        getters          (map header->getter-fn (.getColumnHeaders response))]
    {:columns  (map :name columns)
     :cols     columns
     :rows     (for [row (.getRows response)]
                 (for [[data getter] (map vector row getters)]
                   (getter data)))
     :annotate mbql?}))


;;; ------------------------------------------------------------ "transform-query" ------------------------------------------------------------

;; metics

(defn- built-in-metrics
  [{{[aggregation-type metric-name] :aggregation} :query}]
  (when (and (= :metric (expand/normalize-token aggregation-type))
             (string? metric-name))
        metric-name))

(defn- handle-built-in-metrics [query]
  (-> query
      (assoc-in [:ga :metrics] (built-in-metrics query))
      (m/dissoc-in [:query :aggregation])))


;; segments

(defn- built-in-segment?
  [[filter-type segment-name]]
  (and (= :segment (expand/normalize-token filter-type))
       (string? segment-name)))

(defn- built-in-segments
  [{{filter-clause :filter} :query}]
  (when-let [[built-in-segment-name & more] (seq (for [subclause filter-clause
                                                       :when     (built-in-segment? subclause)]
                                                   (second subclause)))]
    (when (seq more)
      (throw (Exception. "Only one Google Analytics segment allowed at a time.")))
    built-in-segment-name))

(defn- remove-built-in-segments
  [filter-clause]
  (when-let [filter-clause (seq (filter (complement built-in-segment?) filter-clause))]
    ;; filter out things like empty `:and` clauses
    (when (> (count filter-clause) 1)
      (vec filter-clause))))

(defn- handle-built-in-segments [query]
  (-> query
      (assoc-in [:ga :segment] (built-in-segments query))
      (update-in [:query :filter] remove-built-in-segments)))


;; public

(def ^{:arglists '([query])} transform-query
  "Preprocess the incoming query to pull out built-in segments and metrics.
   This removes customizations to the query dict and makes it compatible with MBQL."
  (comp handle-built-in-metrics handle-built-in-segments))
