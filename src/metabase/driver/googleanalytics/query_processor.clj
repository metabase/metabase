(ns metabase.driver.googleanalytics.query-processor
  "The Query Processor is responsible for translating the Metabase Query Language into Google Analytics request format.
  See https://developers.google.com/analytics/devguides/reporting/core/v3"
  (:require [clojure.string :as str]
            [clojure.tools.reader.edn :as edn]
            [medley.core :as m]
            [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.query-processor.store :as qp.store]
            [metabase.util
             [date :as du]
             [i18n :as ui18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s])
  (:import [com.google.api.services.analytics.model GaData GaData$ColumnHeaders]))

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


(defmulti ^:private ->rvalue mbql.u/dispatch-by-clause-name-or-class)

(defmethod ->rvalue nil [_] nil)

(defmethod ->rvalue Object [this] this)

(defmethod ->rvalue :field-id [[_ field-id]]
  (:name (qp.store/field field-id)))

(defmethod ->rvalue :field-literal [[_ field-name]]
  field-name)

(defmethod ->rvalue :datetime-field [[_ field]]
  (->rvalue field))

(defmethod ->rvalue :absolute-datetime [[_ timestamp unit]]
  (du/format-date "yyyy-MM-dd" (du/date-trunc unit timestamp)))

(defmethod ->rvalue :relative-datetime [[_ amount unit]]
  (cond
    (and (= unit :day) (= amount 0))  "today"
    (and (= unit :day) (= amount -1)) "yesterday"
    (and (= unit :day) (< amount -1)) (str (- amount) "daysAgo")
    :else                             (du/format-date "yyyy-MM-dd" (du/date-trunc unit (du/relative-date unit amount)))))

(defmethod ->rvalue :value [[_ value _]]
  value)


(defn- char-escape-map
  "Generate a map of characters to escape to their escaped versions."
  [chars-to-escape]
  (into {} (for [c chars-to-escape]
             {c (str "\\" c)})))

(def ^:private ^{:arglists '([s])} escape-for-regex         #(str/escape % (char-escape-map ".\\+*?[^]$(){}=!<>|:-")))
(def ^:private ^{:arglists '([s])} escape-for-filter-clause #(str/escape % (char-escape-map ",;\\")))

(defn- ga-filter ^String [& parts]
  (escape-for-filter-clause (apply str parts)))


;;; -------------------------------------------------- source-table --------------------------------------------------

(defn- handle-source-table [{source-table-id :source-table}]
  (let [{source-table-name :name} (qp.store/table source-table-id)]
    {:ids (str "ga:" source-table-name)}))


;;; ---------------------------------------------------- breakout ----------------------------------------------------


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
                 (str/join "," (for [breakout-field breakout-clause]
                                 (mbql.u/match-one breakout-field
                                   [:datetime-field _ unit] (unit->ga-dimension unit)
                                   _                        (->rvalue &match)))))})



;;; ----------------------------------------------------- filter -----------------------------------------------------

(defmulti ^:private parse-filter mbql.u/dispatch-by-clause-name-or-class)

(defmethod parse-filter nil [& _]
  nil)

(defmethod parse-filter :contains [[_ field value {:keys [case-sensitive], :or {case-sensitive true}}]]
  (ga-filter (->rvalue field) "=~" (if case-sensitive "(?-i)" "(?i)") (escape-for-regex (->rvalue value))))

(defmethod parse-filter :starts-with [[_ field value {:keys [case-sensitive], :or {case-sensitive true}}]]
  (ga-filter (->rvalue field) "=~" (if case-sensitive "(?-i)" "(?i)") \^ (escape-for-regex (->rvalue value))))

(defmethod parse-filter :ends-with [[_ field value {:keys [case-sensitive], :or {case-sensitive true}}]]
  (ga-filter (->rvalue field) "=~" (if case-sensitive "(?-i)" "(?i)") (escape-for-regex (->rvalue value)) \$))

(defmethod parse-filter := [[_ field value]]
  (ga-filter (->rvalue field) "==" (->rvalue value)))

(defmethod parse-filter :!= [[_ field value]]
  (ga-filter (->rvalue field) "!=" (->rvalue value)))

(defmethod parse-filter :> [[_ field value]]
  (ga-filter (->rvalue field) ">" (->rvalue value)))

(defmethod parse-filter :< [[_ field value]]
  (ga-filter (->rvalue field) "<" (->rvalue value)))

(defmethod parse-filter :>= [[_ field value]]
  (ga-filter (->rvalue field) ">=" (->rvalue value)))

(defmethod parse-filter :<= [[_ field value]]
  (ga-filter (->rvalue field) "<=" (->rvalue value)))

(defmethod parse-filter :between [[_ field min-val max-val]]
  (str (ga-filter (->rvalue field) ">=" (->rvalue min-val))
       ";"
       (ga-filter (->rvalue field) "<=" (->rvalue max-val))))

(defmethod parse-filter :and [[_ & clauses]]
  (str/join ";" (filter some? (map parse-filter clauses))))

(defmethod parse-filter :or [[_ & clauses]]
  (str/join "," (filter some? (map parse-filter clauses))))

(defmethod parse-filter :not [[_ clause]]
  (str "!" (parse-filter clause)))

(defn- handle-filter:filters [{filter-clause :filter}]
  (when filter-clause
    ;; remove all clauses that operate on datetime fields because we don't want to handle them here, we'll do that
    ;; seperately with the filter:interval stuff below
    (let [filter (parse-filter (mbql.u/replace filter-clause
                                 [_ [:datetime-field & _] & _] nil))]

      (when-not (str/blank? filter)
        {:filters filter}))))

;;; ----------------------------------------------- filter (intervals) -----------------------------------------------

(defmulti ^:private parse-filter:interval mbql.u/dispatch-by-clause-name-or-class)

(defmethod parse-filter:interval :default [_] nil)

(defmethod parse-filter:interval :between [[_ field min-val max-val]]
  {:start-date min-val, :end-date max-val})

(defmethod parse-filter:interval :> [[_ field value]]
  {:start-date (->rvalue value), :end-date latest-date})

(defmethod parse-filter:interval :< [[_ field value]]
  {:start-date earliest-date, :end-date (->rvalue value)})

;; TODO - why we don't support `:>=` or `:<=` in GA?

(defmethod parse-filter:interval := [[_ field value]]
  {:start-date (->rvalue value)
   :end-date   (->rvalue
                (cond-> value
                  ;; for relative datetimes, inc the end date so we'll get a proper date range once everything is
                  ;; bucketed
                  (mbql.u/is-clause? :relative-datetime value)
                  (mbql.u/add-datetime-units 1)))})

(defn- maybe-get-only-filter-or-throw [filters]
  (when-let [filters (seq (filter some? filters))]
    (when (> (count filters) 1)
      (throw (Exception. (str (tru "Multiple date filters are not supported")))))
    (first filters)))

(defmethod parse-filter:interval :and [[_ & subclauses]]
  (maybe-get-only-filter-or-throw (map parse-filter:interval subclauses)))

(defmethod parse-filter:interval :or [[_ & subclauses]]
  (maybe-get-only-filter-or-throw (map parse-filter:interval subclauses)))

(defmethod parse-filter:interval :not [[& _]]
  (throw (Exception. (str (tru ":not is not yet implemented")))))

(defn- handle-filter:interval
  "Handle datetime filter clauses. (Anything that *isn't* a datetime filter will be removed by the
  `handle-builtin-segment` logic)."
  [{filter-clause :filter}]
  (or (when filter-clause
        ;; filter out any filter clauses that aren't operating on `[:datetime-field ...]` forms. All other clauses
        ;; will be using `:field-literal` since those are the only two options GA supports
        (parse-filter:interval (mbql.u/replace filter-clause
                                 [_ [:field-literal & _] & _] nil)))
      {:start-date earliest-date, :end-date latest-date}))


;;; ---------------------------------------------------- order-by ----------------------------------------------------

(defn- handle-order-by [{:keys [order-by], :as query}]
  (when order-by
    {:sort (str/join
            ","
            (for [[direction field] order-by]
              (str (case direction
                     :asc  ""
                     :desc "-")
                   (mbql.u/match field
                     [:datetime-field _ unit] (unit->ga-dimension unit)
                     [:aggregation index]     (mbql.u/aggregation-at-index query index)
                     [& _]                    (->rvalue &match)))))}))


;;; ----------------------------------------------------- limit ------------------------------------------------------

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
  (edn/read-string (str/replace s #"^0+(.+)$" "$1")))

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
  (when-let [ags (seq (:aggregation query))]
    (str/join "," (mbql.u/match ags [:metric (metric-name :guard string?)] metric-name))))

(defn- handle-built-in-metrics [query]
  (-> query
      (assoc-in [:ga :metrics] (built-in-metrics query))
      (m/dissoc-in [:query :aggregation])))


;;; segments

(s/defn ^:private built-in-segment :- (s/maybe su/NonBlankString)
  [{{filter-clause :filter} :query}]
  (let [segments (mbql.u/match filter-clause [:segment (segment-name :guard string?)] segment-name)]
    (when (> (count segments) 1)
      (throw (Exception. (str (tru "Only one Google Analytics segment allowed at a time.")))))
    (first segments)))

(s/defn ^:private remove-built-in-segments :- (s/maybe mbql.s/Filter)
  [filter-clause :- (s/maybe mbql.s/Filter)]
  (mbql.u/simplify-compound-filter
   (mbql.u/replace filter-clause
     [:segment (_ :guard string?)] nil)))

(defn- handle-built-in-segments [{{filters :filter} :query, :as query}]
  (let [query   (assoc-in query [:ga :segment] (built-in-segment query))
        filters (remove-built-in-segments filters)]
    (if (seq filters)
      (assoc-in    query [:query :filter] filters)
      (m/dissoc-in query [:query :filter]))))


;;; public

(def ^{:arglists '([query])} transform-query
  "Preprocess the incoming query to pull out built-in segments and metrics.
   This removes customizations to the query dict and makes it compatible with MBQL."
  (comp handle-built-in-metrics handle-built-in-segments))
