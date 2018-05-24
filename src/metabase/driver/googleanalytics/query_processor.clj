(ns metabase.driver.googleanalytics.query-processor
  "The Query Processor is responsible for translating the Metabase Query Language into Google Analytics request format.
  See https://developers.google.com/analytics/devguides/reporting/core/v3"
  (:require [clojure.string :as s]
            [clojure.tools.reader.edn :as edn]
            [medley.core :as m]
            [metabase.query-processor.util :as qputil]
            [metabase.util :as u]
            [metabase.util.date :as du])
  (:import [com.google.api.services.analytics.model GaData GaData$ColumnHeaders]
           [metabase.query_processor.interface AgFieldRef DateTimeField DateTimeValue Field RelativeDateTimeValue Value]))

(def ^:private ^:const earliest-date "2005-01-01")
(def ^:private ^:const latest-date "today")
(def ^:private ^:const max-rows-maximum 10000)

(def ^:const ga-type->base-type
  "Map of Google Analytics field types to Metabase types."
  {"STRING"      :type/Text
   "FLOAT"       :type/Float
   "INTEGER"     :type/Integer
   "PERCENT"     :type/Float
   "TIME"        :type/Float
   "CURRENCY"    :type/Float
   "US_CURRENCY" :type/Float})


(defprotocol ^:private IRValue
  (^:private ->rvalue [this]))

(extend-protocol IRValue
  nil                   (->rvalue [_] nil)
  Object                (->rvalue [this] this)
  Field                 (->rvalue [this] (:field-name this))
  DateTimeField         (->rvalue [this] (->rvalue (:field this)))
  Value                 (->rvalue [this] (:value this))
  DateTimeValue         (->rvalue [{{unit :unit} :field, value :value}] (du/format-date "yyyy-MM-dd" (du/date-trunc unit value)))
  RelativeDateTimeValue (->rvalue [{:keys [unit amount]}]
                          (cond
                            (and (= unit :day) (= amount 0))  "today"
                            (and (= unit :day) (= amount -1)) "yesterday"
                            (and (= unit :day) (< amount -1)) (str (- amount) "daysAgo")
                            :else                             (du/format-date "yyyy-MM-dd" (du/date-trunc unit (du/relative-date unit amount))))))


(defn- char-escape-map
  "Generate a map of characters to escape to their escaped versions."
  [chars-to-escape]
  (into {} (for [c chars-to-escape]
             {c (str "\\" c)})))

(def ^:private ^{:arglists '([s])} escape-for-regex         (u/rpartial s/escape (char-escape-map ".\\+*?[^]$(){}=!<>|:-")))
(def ^:private ^{:arglists '([s])} escape-for-filter-clause (u/rpartial s/escape (char-escape-map ",;\\")))

(defn- ga-filter ^String [& parts]
  (escape-for-filter-clause (apply str parts)))


;;; ### source-table

(defn- handle-source-table [{{source-table-name :name} :source-table}]
  {:pre [((some-fn keyword? string?) source-table-name)]}
  {:ids (str "ga:" source-table-name)})


;;; ### breakout

(defn- aggregations [{aggregations :aggregation}]
  (if (every? sequential? aggregations)
    aggregations
    [aggregations]))

(defn- unit->ga-dimension
  [unit]
  (case unit
    :minute-of-hour "ga:minute"
    :hour           "ga:dateHour"
    :hour-of-day    "ga:hour"
    :day            "ga:date"
    :day-of-week    "ga:dayOfWeek"
    :day-of-month   "ga:day"
    :week           "ga:isoYearIsoWeek"
    :week-of-year   "ga:week"
    :month          "ga:yearMonth"
    :month-of-year  "ga:month"
    :year           "ga:year"))

(defn- handle-breakout [{breakout-clause :breakout}]
  {:dimensions (if-not breakout-clause
                 ""
                 (s/join "," (for [breakout-field breakout-clause]
                               (if (instance? DateTimeField breakout-field)
                                 (unit->ga-dimension (:unit breakout-field))
                                 (->rvalue breakout-field)))))})


;;; ### filter

;; TODO: implement negate?
(defn- parse-filter-subclause:filters
  (^String [filter-clause negate?]
   ;; if optional arg `negate?` is truthy then prepend a `!` to negate the filter.
   ;; See https://developers.google.com/analytics/devguides/reporting/core/v3/segments-feature-reference#not-operator
   (str (when negate? "!") (parse-filter-subclause:filters filter-clause)))

  (^String [{:keys [filter-type field value case-sensitive?], :as filter-clause}]
   (when-not (instance? DateTimeField field)
     (let [field (when field (->rvalue field))
           value (when value (->rvalue value))]
       (case filter-type
         :contains    (ga-filter field "=~" (if case-sensitive? "(?-i)" "(?i)")    (escape-for-regex value))
         :starts-with (ga-filter field "=~" (if case-sensitive? "(?-i)" "(?i)") \^ (escape-for-regex value))
         :ends-with   (ga-filter field "=~" (if case-sensitive? "(?-i)" "(?i)")    (escape-for-regex value) \$)
         :=           (ga-filter field "==" value)
         :!=          (ga-filter field "!=" value)
         :>           (ga-filter field ">" value)
         :<           (ga-filter field "<" value)
         :>=          (ga-filter field ">=" value)
         :<=          (ga-filter field "<=" value)
         :between     (str (ga-filter field ">=" (->rvalue (:min-val filter-clause)))
                           ";"
                           (ga-filter field "<=" (->rvalue (:max-val filter-clause)))))))))

(defn- parse-filter-clause:filters ^String [{:keys [compound-type subclause subclauses], :as clause}]
  (case compound-type
    :and (s/join ";" (remove nil? (map parse-filter-clause:filters subclauses)))
    :or  (s/join "," (remove nil? (map parse-filter-clause:filters subclauses)))
    :not (parse-filter-subclause:filters subclause :negate)
    nil  (parse-filter-subclause:filters clause)))

(defn- handle-filter:filters [{filter-clause :filter}]
  (when filter-clause
    (let [filter (parse-filter-clause:filters filter-clause)]
      (when-not (s/blank? filter)
        {:filters filter}))))

(defn- parse-filter-subclause:interval [{:keys [filter-type field value], :as filter} & [negate?]]
  (when negate?
    (throw (Exception. ":not is :not yet implemented")))
  (when (instance? DateTimeField field)
    (case filter-type
      :between {:start-date (->rvalue (:min-val filter))
                :end-date   (->rvalue (:max-val filter))}
      :>       {:start-date (->rvalue (:value filter))
                :end-date   latest-date}
      :<       {:start-date earliest-date
                :end-date   (->rvalue (:value filter))}
      :=       {:start-date (->rvalue (:value filter))
                :end-date   (condp instance? (:value filter)
                              DateTimeValue         (->rvalue (:value filter))
                              RelativeDateTimeValue (->rvalue (update (:value filter) :amount inc)))}))) ;; inc the end date so we'll get a proper date range once everything is bucketed

(defn- parse-filter-clause:interval [{:keys [compound-type subclause subclauses], :as clause}]
  (case compound-type
    :and (apply concat (remove nil? (map parse-filter-clause:interval subclauses)))
    :or  (apply concat (remove nil? (map parse-filter-clause:interval subclauses)))
    :not (remove nil? [(parse-filter-subclause:interval subclause :negate)])
    nil  (remove nil? [(parse-filter-subclause:interval clause)])))

(defn- handle-filter:interval
  "Handle datetime filter clauses. (Anything that *isn't* a datetime filter will be removed by the `handle-builtin-segment` logic)."
  [{filter-clause :filter}]
  (let [date-filters (when filter-clause
                       (parse-filter-clause:interval filter-clause))]
    (case (count date-filters)
      0 {:start-date earliest-date, :end-date latest-date}
      1 (first date-filters)
      (throw (Exception. "Multiple date filters are not supported")))))

;;; ### order-by

(defn- handle-order-by [{:keys [order-by], :as query}]
  (when order-by
    {:sort (s/join "," (for [{:keys [field direction]} order-by]
                         (str (case direction
                                :ascending  ""
                                :descending "-")
                              (cond
                                (instance? DateTimeField field) (unit->ga-dimension (:unit field))
                                (instance? AgFieldRef field)    (second (nth (aggregations query) (:index field))) ; aggregation is of format [ag-type metric-name]; get the metric-name
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

(defn- parse-number [s]
  (edn/read-string (s/replace s #"^0+(.+)$" "$1")))

(def ^:private ga-dimension->date-format-fn
  {"ga:minute"         parse-number
   "ga:dateHour"       (partial du/parse-date "yyyyMMddHH")
   "ga:hour"           parse-number
   "ga:date"           (partial du/parse-date "yyyyMMdd")
   "ga:dayOfWeek"      (comp inc parse-number)
   "ga:day"            parse-number
   "ga:isoYearIsoWeek" (partial du/parse-date "YYYYww")
   "ga:week"           parse-number
   "ga:yearMonth"      (partial du/parse-date "yyyyMM")
   "ga:month"          parse-number
   "ga:year"           parse-number})

(defn- header->column [^GaData$ColumnHeaders header]
  (let [date-parser (ga-dimension->date-format-fn (.getName header))]
    (if date-parser
      {:name      (keyword "ga:date")
       :base-type :type/DateTime}
      {:name               (keyword (.getName header))
       :base-type          (ga-type->base-type (.getDataType header))
       :field-display-name "COOL"})))

(defn- header->getter-fn [^GaData$ColumnHeaders header]
  (let [date-parser (ga-dimension->date-format-fn (.getName header))
        base-type   (ga-type->base-type (.getDataType header))]
    (cond
      date-parser                   date-parser
      (isa? base-type :type/Number) edn/read-string
      :else                         identity)))

(defn execute-query
  "Execute a QUERY using the provided DO-QUERY function, and return the results in the usual format."
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


;;; ----------------------------------------------- "transform-query" ------------------------------------------------

;;; metrics

(defn- built-in-metrics
  [{query :query}]
  (when-let [ags (seq (aggregations query))]
    (s/join "," (for [[aggregation-type metric-name] ags
                      :when (and aggregation-type
                                 (= :metric (qputil/normalize-token aggregation-type))
                                 (string? metric-name))]
                  metric-name))))

(defn- handle-built-in-metrics [query]
  (-> query
      (assoc-in [:ga :metrics] (built-in-metrics query))
      (m/dissoc-in [:query :aggregation])))


;;; segments

(defn- filter-type ^clojure.lang.Keyword [filter-clause]
  (when (and (sequential? filter-clause)
             ((some-fn keyword? string?) (first filter-clause)))
    (qputil/normalize-token (first filter-clause))))

(defn- compound-filter? [filter-clause]
  (contains? #{:and :or :not} (filter-type filter-clause)))

(defn- built-in-segment? [filter-clause]
  (and (= :segment (filter-type filter-clause))
       (string? (second filter-clause))))

(defn- built-in-segments [{{filter-clause :filter} :query}]
  (if-not (compound-filter? filter-clause)
    ;; if the top-level filter isn't compound check if it's built-in and return it if it is
    (when (built-in-segment? filter-clause)
      (second filter-clause))
    ;; otherwise if it *is* compound return the first subclause that is built-in; if more than one is built-in throw
    ;; exception
    (when-let [[built-in-segment-name & more] (seq (for [subclause filter-clause
                                                         :when     (built-in-segment? subclause)]
                                                     (second subclause)))]
      (when (seq more)
        (throw (Exception. "Only one Google Analytics segment allowed at a time.")))
      built-in-segment-name)))

(defn- remove-built-in-segments [filter-clause]
  (if-not (compound-filter? filter-clause)
    ;; if top-level filter isn't compound just return it as long as it's not built-in
    (when-not (built-in-segment? filter-clause)
      filter-clause)
    ;; otherwise for compound filters filter out the built-in filters
    (when-let [filter-clause (seq (for [subclause filter-clause
                                        :when     (not (built-in-segment? subclause))]
                                    subclause))]
      ;; don't keep the filter clause if it's something like an empty compound filter like [:and]
      (when (> (count filter-clause) 1)
        (vec filter-clause)))))

(defn- handle-built-in-segments [query]
  (-> query
      (assoc-in [:ga :segment] (built-in-segments query))
      (update-in [:query :filter] remove-built-in-segments)))


;;; public

(def ^{:arglists '([query])} transform-query
  "Preprocess the incoming query to pull out built-in segments and metrics.
   This removes customizations to the query dict and makes it compatible with MBQL."
  (comp handle-built-in-metrics handle-built-in-segments))
