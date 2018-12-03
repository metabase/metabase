(ns metabase.driver.googleanalytics.query-processor
  "The Query Processor is responsible for translating the Metabase Query Language into Google Analytics request format.
  See https://developers.google.com/analytics/devguides/reporting/core/v3"
  (:require [clojure.string :as str]
            [clojure.tools.reader.edn :as edn]
            [metabase.mbql.util :as mbql.u]
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


;;; -------------------------------------------------- aggregation ---------------------------------------------------

(defn- handle-aggregation
  [{ags :aggregation}]
  (when (seq ags)
    {:metrics (str/join "," (mbql.u/match ags [:metric (metric-name :guard string?)] metric-name))}))


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
    ;; remove all clauses that operate on datetime fields or built-in segments because we don't want to handle them
    ;; here, we'll do that seperately with the filter:interval and handle-filter:built-in-segment stuff below
    ;;
    ;; (Recall that `auto-bucket-datetimes` guarantees all datetime Fields will be wrapped by `:datetime-field`
    ;; clauses in a fully-preprocessed query.)
    (let [filter (parse-filter (mbql.u/replace filter-clause
                                 [:segment (_ :guard mbql.u/ga-id?)] nil
                                 [_ [:datetime-field & _] & _] nil))]

      (when-not (str/blank? filter)
        {:filters filter}))))

;;; ----------------------------------------------- filter (intervals) -----------------------------------------------

(defmulti ^:private parse-filter:interval mbql.u/dispatch-by-clause-name-or-class)

(defmethod parse-filter:interval :default [_] nil)

(defmethod parse-filter:interval :between [[_ field min-val max-val]]
  {:start-date (->rvalue min-val), :end-date (->rvalue max-val)})

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

(defn- remove-non-datetime-filter-clauses
  "Replace any filter clauses that operate on a non-datetime Field with `nil`."
  [filter-clause]
  (mbql.u/replace filter-clause
    ;; we don't support any of the following as datetime filters
    #{:!= :<= :>= :starts-with :ends-with :contains}
    nil

    [(_ :guard #{:< :> :between :=}) [(_ :guard (partial not= :datetime-field)) & _] & _]
    nil))

(defn- handle-filter:interval
  "Handle datetime filter clauses. (Anything that *isn't* a datetime filter will be removed by the
  `handle-builtin-segment` logic)."
  [{filter-clause :filter}]
  (or (when filter-clause
        (parse-filter:interval (remove-non-datetime-filter-clauses filter-clause)))
      {:start-date earliest-date, :end-date latest-date}))


;;; ------------------------------------------- filter (built-in segments) -------------------------------------------

(s/defn ^:private built-in-segment :- (s/maybe su/NonBlankString)
  [{filter-clause :filter}]
  (let [segments (mbql.u/match filter-clause [:segment (segment-name :guard mbql.u/ga-id?)] segment-name)]
    (when (> (count segments) 1)
      (throw (Exception. (str (tru "Only one Google Analytics segment allowed at a time.")))))
    (first segments)))

(defn- handle-filter:built-in-segment
  "Handle a built-in GA segment (a `[:segment <ga id>]` filter clause), if present. This is added to the native query
  under a separate `:segment` key."
  [inner-query]
  (when-let [built-in-segment (built-in-segment inner-query)]
    {:segment built-in-segment}))


;;; ---------------------------------------------------- order-by ----------------------------------------------------

(defn- handle-order-by [{:keys [order-by], :as query}]
  (when order-by
    {:sort (str/join
            ","
            (for [[direction field] order-by]
              (str (case direction
                     :asc  ""
                     :desc "-")
                   (mbql.u/match-one field
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
  [{inner-query :query, :as raw}]
  {:query (into
           ;; set to false to match behavior of other drivers
           {:include-empty-rows false}
           (for [f [handle-source-table
                    handle-aggregation
                    handle-breakout
                    handle-filter:interval
                    handle-filter:filters
                    handle-filter:built-in-segment
                    handle-order-by
                    handle-limit]]
             (f inner-query)))
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
      {:name      "ga:date"
       :base_type :type/DateTime}
      {:name      (.getName header)
       :base_type (ga-type->base-type (.getDataType header))})))

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
  (let [^GaData response (do-query query)
        columns          (map header->column (.getColumnHeaders response))
        getters          (map header->getter-fn (.getColumnHeaders response))]
    {:cols     columns
     :columns  (map :name columns)
     :rows     (for [row (.getRows response)]
                 (for [[data getter] (map vector row getters)]
                   (getter data)))}))
