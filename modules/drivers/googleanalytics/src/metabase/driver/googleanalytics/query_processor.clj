(ns metabase.driver.googleanalytics.query-processor
  "The Query Processor is responsible for translating the Metabase Query Language into Google Analytics request format.
  See https://developers.google.com/analytics/devguides/reporting/core/v3"
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [clojure.tools.reader.edn :as edn]
            [java-time :as t]
            [metabase.mbql.util :as mbql.u]
            [metabase.query-processor
             [store :as qp.store]
             [timezone :as qp.timezone]]
            [metabase.util
             [date-2 :as u.date]
             [i18n :as ui18n :refer [deferred-tru tru]]
             [schema :as su]]
            [metabase.util.date-2
             [common :as u.date.common]
             [parse :as u.date.parse]]
            [metabase.util.date-2.parse.builder :as u.date.builder]
            [schema.core :as s])
  (:import [com.google.api.services.analytics.model GaData GaData$ColumnHeaders]
           java.time.DayOfWeek
           java.time.format.DateTimeFormatter
           org.threeten.extra.YearWeek))

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

(defmethod ->rvalue :field-id
  [[_ field-id]]
  (:name (qp.store/field field-id)))

(defmethod ->rvalue :field-literal
  [[_ field-name]]
  field-name)

(defmethod ->rvalue :datetime-field
  [[_ field]]
  (->rvalue field))

;; TODO - I think these next two methods are no longer used, since `->date-range` handles these clauses
(defmethod ->rvalue :absolute-datetime
  [[_ t unit]]
  (t/format "yyyy-MM-dd" (u.date/truncate t unit)))

(defmethod ->rvalue :relative-datetime
  [[_ amount unit]]
  (cond
    (and (= unit :day) (= amount 0))  "today"
    (and (= unit :day) (= amount -1)) "yesterday"
    (and (= unit :day) (< amount -1)) (str (- amount) "daysAgo")

    :else
    (t/format
     "yyyy-MM-dd"
     (u.date/truncate (u.date/add unit amount) unit))))

(defmethod ->rvalue :value
  [[_ value _]]
  value)

(defn- char-escape-map
  "Generate a map of characters to escape to their escaped versions."
  [chars-to-escape]
  (into {} (for [c chars-to-escape]
             {c (str "\\" c)})))

(defn- escape-for-regex [s]
  (str/escape s (char-escape-map ".\\+*?[^]$(){}=!<>|:-")))

(defn- escape-for-filter-clause [s]
  (str/escape s (char-escape-map ",;\\")))

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
    :week           "ga:yearWeek"
    :iso-week       "ga:isoYearIsoWeek"
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

(defmethod parse-filter :contains
  [[_ field value {:keys [case-sensitive], :or {case-sensitive true}}]]
  (ga-filter (->rvalue field) "=~" (if case-sensitive "(?-i)" "(?i)") (escape-for-regex (->rvalue value))))

(defmethod parse-filter :starts-with
  [[_ field value {:keys [case-sensitive], :or {case-sensitive true}}]]
  (ga-filter (->rvalue field) "=~" (if case-sensitive "(?-i)" "(?i)") \^ (escape-for-regex (->rvalue value))))

(defmethod parse-filter :ends-with
  [[_ field value {:keys [case-sensitive], :or {case-sensitive true}}]]
  (ga-filter (->rvalue field) "=~" (if case-sensitive "(?-i)" "(?i)") (escape-for-regex (->rvalue value)) \$))

(defmethod parse-filter :=
  [[_ field value]]
  (ga-filter (->rvalue field) "==" (->rvalue value)))

(defmethod parse-filter :!=
  [[_ field value]]
  (ga-filter (->rvalue field) "!=" (->rvalue value)))

(defmethod parse-filter :>
  [[_ field value]]
  (ga-filter (->rvalue field) ">" (->rvalue value)))

(defmethod parse-filter :<
  [[_ field value]]
  (ga-filter (->rvalue field) "<" (->rvalue value)))

(defmethod parse-filter :>=
  [[_ field value]]
  (ga-filter (->rvalue field) ">=" (->rvalue value)))

(defmethod parse-filter :<=
  [[_ field value]]
  (ga-filter (->rvalue field) "<=" (->rvalue value)))

(defmethod parse-filter :between
  [[_ field min-val max-val]]
  (str (ga-filter (->rvalue field) ">=" (->rvalue min-val))
       ";"
       (ga-filter (->rvalue field) "<=" (->rvalue max-val))))

(defmethod parse-filter :and
  [[_ & clauses]]
  (str/join ";" (filter some? (map parse-filter clauses))))

(defmethod parse-filter :or
  [[_ & clauses]]
  (str/join "," (filter some? (map parse-filter clauses))))

(defmethod parse-filter :not
  [[_ clause]]
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

(defn- format-range [{:keys [start end]}]
  (merge
   (when start
     {:start-date (t/format "yyyy-MM-dd" start)})
   (when end
     {:end-date (t/format "yyyy-MM-dd" end)})))

(defmulti ^:private ->date-range
  {:arglists '([unit comparison-type x])}
  (fn [_ _ x]
    (mbql.u/dispatch-by-clause-name-or-class x)))

(defmethod ->date-range :default
  [_ _ x]
  {:start-date (->rvalue x), :end-date (->rvalue x)})

(defmethod ->date-range :relative-datetime
  [unit comparison-type [_ n relative-datetime-unit]]
  (or (when (= relative-datetime-unit :day)
        ;; since GA is normally inclusive add 1 to `:<` or `:>` filters so it starts and ends on the correct date
        ;; e.g [:> ... [:relative-datetime -30 :day]] -> {:start-date "29daysago)}
        ;; (include events whose day is > 30 days ago, i.e., >= 29 days ago)
        (let [n (case comparison-type
                  (:< :>) (inc n)
                  n)]
          (when-not (pos? n)
            (let [special-amount (cond
                                   (zero? n) "today"
                                   (= n -1)  "yesterday"
                                   (neg? n)  (format "%ddaysAgo" (- n)))]
              (case comparison-type
                (:< :<=) {:end-date special-amount}
                (:> :>=) {:start-date special-amount}
                :=       {:start-date special-amount, :end-date special-amount}
                nil)))))
      (let [now (qp.timezone/now :googleanalytics nil :use-report-timezone-id-if-unsupported? true)
            t   (u.date/add now relative-datetime-unit n)]
        (format-range (u.date/comparison-range t unit comparison-type {:end :inclusive, :resolution :day})))))

(defmethod ->date-range :absolute-datetime
  [unit comparison-type [_ t]]
  (format-range (u.date/comparison-range t unit comparison-type {:end :inclusive, :resolution :day})))

(defn- field->unit [field]
  (or (mbql.u/match-one field
        [:datetime-field _ unit] unit)
      :day))

(defmulti ^:private parse-filter:interval
  {:arglists '([filter-clause])}
  mbql.u/dispatch-by-clause-name-or-class)

(defmethod parse-filter:interval :default [_] nil)

(defmethod parse-filter:interval :>
  [[_ field x]]
  (select-keys (->date-range (field->unit field) :> x) [:start-date]))

(defmethod parse-filter:interval :<
  [[_ field x]]
  (select-keys (->date-range (field->unit field) :< x) [:end-date]))

(defmethod parse-filter:interval :>=
  [[_ field x]]
  (select-keys (->date-range (field->unit field) :>= x) [:start-date]))

(defmethod parse-filter:interval :<=
  [[_ field x]]
  (select-keys (->date-range (field->unit field) :<= x) [:end-date]))

(defmethod parse-filter:interval :=
  [[_ field x]]
  (->date-range (field->unit field) := x))


;; MBQL :between is INCLUSIVE just like SQL !!!
(defmethod parse-filter:interval :between
  [[_ field min-val max-val]]
  (merge
   (parse-filter:interval [:>= field min-val])
   (parse-filter:interval [:<= field max-val])))


;;; Compound filters

(defn- maybe-get-only-filter-or-throw [filters]
  (when-let [filters (seq (filter some? filters))]
    (when (> (count filters) 1)
      (throw (Exception. (tru "Multiple date filters are not supported"))))
    (first filters)))

(defn- try-reduce-filters [[filter1 filter2]]
  (merge-with
    (fn [_ _] (throw (Exception. (str (deferred-tru "Multiple date filters are not supported in filters: ") filter1 filter2))))
    filter1 filter2))

(defmethod parse-filter:interval :and
  [[_ & subclauses]]
  (let [filters (map parse-filter:interval subclauses)]
    (if (= (count filters) 2)
      (try-reduce-filters filters)
      (maybe-get-only-filter-or-throw filters))))

(defmethod parse-filter:interval :or
  [[_ & subclauses]]
  (maybe-get-only-filter-or-throw (map parse-filter:interval subclauses)))

(defmethod parse-filter:interval :not
  [[& _]]
  (throw (Exception. (tru ":not is not yet implemented"))))

(defn- remove-non-datetime-filter-clauses
  "Replace any filter clauses that operate on a non-datetime Field with `nil`."
  [filter-clause]
  (mbql.u/replace filter-clause
    ;; we don't support any of the following as datetime filters
    #{:!= :starts-with :ends-with :contains}
    nil

    [(_ :guard #{:< :> :<= :>= :between :=}) [(_ :guard (partial not= :datetime-field)) & _] & _]
    nil))

(defn- normalize-unit [unit]
  (if (= unit :default) :day unit))

(defn- normalize-datetime-units
  "Replace all unsupported datetime units with the default"
  [filter-clause]
  (mbql.u/replace filter-clause
    [:datetime-field field unit]        [:datetime-field field (normalize-unit unit)]
    [:absolute-datetime timestamp unit] [:absolute-datetime timestamp (normalize-unit unit)]
    [:relative-datetime amount unit]    [:relative-datetime amount (normalize-unit unit)]))

(defn- add-start-end-dates [filter-clause]
  (merge {:start-date earliest-date, :end-date latest-date} filter-clause))

(defn- handle-filter:interval
  "Handle datetime filter clauses. (Anything that *isn't* a datetime filter will be removed by the
  `handle-builtin-segment` logic)."
  [{filter-clause :filter}]
  (or (when filter-clause
        (add-start-end-dates
          (parse-filter:interval
            (normalize-datetime-units
              (remove-non-datetime-filter-clauses filter-clause)))))
      {:start-date earliest-date, :end-date latest-date}))


;;; ------------------------------------------- filter (built-in segments) -------------------------------------------

(s/defn ^:private built-in-segment :- (s/maybe su/NonBlankString)
  [{filter-clause :filter}]
  (let [segments (mbql.u/match filter-clause [:segment (segment-name :guard mbql.u/ga-id?)] segment-name)]
    (when (> (count segments) 1)
      (throw (Exception. (tru "Only one Google Analytics segment allowed at a time."))))
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

(def ^:private ^DateTimeFormatter iso-year-week-formatter
  (u.date.builder/formatter
   (u.date.builder/value :iso/week-based-year 4)
   (u.date.builder/value :iso/week-of-week-based-year 2)))

(defn- parse-iso-year-week [^String s]
  (when s
    (-> (YearWeek/from (.parse iso-year-week-formatter s))
        (.atDay DayOfWeek/MONDAY))))

(def ^:private ^DateTimeFormatter year-week-formatter
  (u.date.builder/formatter
   (u.date.builder/value :week-fields/week-based-year 4)
   (u.date.builder/value :week-fields/week-of-week-based-year 2)))

(defn- parse-year-week [^String s]
  (when s
    (let [parsed (.parse year-week-formatter s)
          year   (.getLong parsed (u.date.common/temporal-field :week-fields/week-based-year))
          week   (.getLong parsed (u.date.common/temporal-field :week-fields/week-of-week-based-year))]
      (t/adjust (t/local-date year 1 1) (u.date/adjuster :week-of-year week)))))

(def ^:private ^DateTimeFormatter year-month-formatter
  (u.date.builder/formatter
   (u.date.builder/value :year 4)
   (u.date.builder/value :month-of-year 2)
   (u.date.builder/default-value :day-of-month 1)))

(def ^:private ga-dimension->formatter
  {"ga:date"           "yyyyMMdd"
   "ga:dateHour"       "yyyyMMddHH"
   "ga:dateHourMinute" "yyyyMMddHHmm"
   "ga:day"            parse-number
   "ga:dayOfWeek"      (comp inc parse-number)
   "ga:hour"           parse-number
   "ga:isoYearIsoWeek" parse-iso-year-week
   "ga:minute"         parse-number
   "ga:month"          parse-number
   "ga:week"           parse-number
   "ga:year"           parse-number
   "ga:yearMonth"      year-month-formatter
   "ga:yearWeek"       parse-year-week})

(defn- header->column [^GaData$ColumnHeaders header]
  (let [formatter (ga-dimension->formatter (.getName header))]
    (if formatter
      {:name      "ga:date"
       :base_type :type/DateTime}
      {:name      (.getName header)
       :base_type (ga-type->base-type (.getDataType header))})))

(defn- header->getter-fn [^GaData$ColumnHeaders header]
  (let [formatter (ga-dimension->formatter (.getName header))
        base-type (ga-type->base-type (.getDataType header))
        parser    (cond
                    formatter                     formatter
                    (isa? base-type :type/Number) edn/read-string
                    :else                         identity)]
    (log/tracef "Parsing result column %s with %s" (.getName header) (pr-str parser))
    (if (or (string? parser) (instance? DateTimeFormatter parser))
      (partial u.date.parse/parse-with-formatter parser)
      parser)))

(defn execute-query
  "Execute a `query` using the provided `do-query` function, and return the results in the usual format."
  [do-query query]
  (let [^GaData response (do-query query)
        columns          (map header->column (.getColumnHeaders response))
        getters          (map header->getter-fn (.getColumnHeaders response))]
    {:cols     columns
     :columns  (map :name columns)
     :rows     (for [row (.getRows response)]
                 (for [[data getter] (map vector row getters)]
                   (getter data)))}))
