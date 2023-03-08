(ns metabase.lib.metadata.calculate.names
  "Logic for calculating human-friendly display names for things."
  (:require
   [clojure.string :as str]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculate.resolve :as calculate.resolve]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.malli :as mu]
   #?@(:cljs ([goog.string :refer [format]]
              [goog.string.format :as gstring.format]))))

;; The formatting functionality is only loaded if you depend on goog.string.format.
#?(:cljs (comment gstring.format/keep-me))

(defmulti ^:private display-name*
  "Impl for [[display-name]]."
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x)))

(mu/defn display-name :- ::lib.schema.common/non-blank-string
  "Calculate a nice human-friendly display name for something."
  [query        :- calculate.resolve/Query
   stage-number :- :int
   x]
  (or
   ;; if this is an MBQL clause with `:display-name` in the options map, then use that rather than calculating a name.
   (when (and (vector? x)
              (keyword? (first x))
              (map? (second x)))
     (let [opts (second x)]
       (:display-name opts)))
   (try
     (display-name* query stage-number x)
     (catch #?(:clj Throwable :cljs js/Error) e
       (throw (ex-info (i18n/tru "Error calculating display name for {0}: {1}" (pr-str x) (ex-message e))
                       {:x            x
                        :query        query
                        :stage-number stage-number}
                       e))))))

(defmulti ^:private column-name*
  "Impl for [[column-name]]."
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x)))

(mu/defn column-name :- ::lib.schema.common/non-blank-string
  "Calculate a database-friendly name to use for an expression."
  [query        :- calculate.resolve/Query
   stage-number :- :int
   x]
  (or
   ;; if this is an MBQL clause with `:name` in the options map, then use that rather than calculating a name.
   (when (and (vector? x)
              (keyword? (first x))
              (map? (second x)))
     (let [opts (second x)]
       (:name opts)))
   (try
     (column-name* query stage-number x)
     (catch #?(:clj Throwable :cljs js/Error) e
       (throw (ex-info (i18n/tru "Error calculating column name for {0}: {1}" (pr-str x) (ex-message e))
                       {:x            x
                        :query        query
                        :stage-number stage-number}
                       e))))))

(defn- slugify [s]
  (-> s
      (str/replace #"\+" (i18n/tru "plus"))
      (str/replace #"\-" (i18n/tru "minus"))
      (str/replace #"[\(\)]" "")
      u/slugify))

;;; default impl just takes the display name and slugifies it.
(defmethod column-name* :default
  [query stage-number x]
  (slugify (display-name query stage-number x)))

(defmethod display-name* :mbql/join
  [query _stage-number {[first-stage] :stages, :as _join}]
  (if-let [source-table (:source-table first-stage)]
    (if (integer? source-table)
      (:display_name (lib.metadata/table query source-table))
      ;; handle card__<id> source tables.
      (let [[_ card-id-str] (re-matches #"^card__(\d+)$" source-table)]
        (i18n/tru "Saved Question #{0}" card-id-str)))
    (i18n/tru "Native calculate.resolve/Query")))

(defmethod display-name* :metadata/field
  [query stage-number {field-display-name :display_name, field-name :name, join-alias :source_alias, :as _field-metadata}]
  (let [field-display-name (or field-display-name
                               (u.humanization/name->human-readable-name :simple field-name))
        join-display-name  (when join-alias
                             (let [join (calculate.resolve/join query stage-number join-alias)]
                              (display-name query stage-number join)))]
    (if join-display-name
      (str join-display-name " → " field-display-name)
      field-display-name)))

(defmethod display-name* :field
  [query stage-number [_field {:keys [join-alias], :as _opts} _id-or-name, :as field-clause]]
  (let [field-metadata (cond-> (calculate.resolve/field-metadata query stage-number field-clause)
                         join-alias (assoc :source_alias join-alias))]
    (display-name query stage-number field-metadata)))

(defmethod display-name* :expression
  [_query _stage-number [_expression _opts expression-name]]
  expression-name)

(defmethod column-name* :expression
  [_query _stage-number [_expression _opts expression-name]]
  expression-name)

(def ^:private ^:dynamic *nested*
  "Whether the display name we are generated is recursively nested inside another display name. For infix math operators
  we'll wrap the results in parentheses to make the display name more obvious."
  false)

(defn- wrap-str-in-parens-if-nested [s]
  (if *nested*
    (str \( s \))
    s))

(defn- infix-display-name*
  "Generate a infix-style display name for an arithmetic expression like `:+`, e.g. `x + y`."
  [query stage-number operator args]
  (wrap-str-in-parens-if-nested
   (binding [*nested* true]
     (str/join (str \space (name operator) \space)
               (map (partial display-name* query stage-number)
                    args)))))

(defmethod display-name* :+
  [query stage-number [_plus _opts & args]]
  (infix-display-name* query stage-number "+" args))

(defmethod display-name* :-
  [query stage-number [_minute _opts & args]]
  (infix-display-name* query stage-number "-" args))

(defmethod display-name* :/
  [query stage-number [_divide _opts & args]]
  (infix-display-name* query stage-number "÷" args))

(defmethod display-name* :*
  [query stage-number [_multiply _opts & args]]
  (infix-display-name* query stage-number "×" args))

(defn- infix-column-name*
  [query stage-number operator-str args]
  (str/join (str \_ operator-str \_)
            (map (partial column-name* query stage-number)
                 args)))

(defmethod column-name* :+
  [query stage-number [_plus _opts & args]]
  (infix-column-name* query stage-number "plus" args))

(defmethod column-name* :-
  [query stage-number [_minute _opts & args]]
  (infix-column-name* query stage-number "minus" args))

(defmethod column-name* :/
  [query stage-number [_divide _opts & args]]
  (infix-column-name* query stage-number "divided_by" args))

(defmethod column-name* :*
  [query stage-number [_multiply _opts & args]]
  (infix-column-name* query stage-number "times" args))

(defmethod display-name* :count
  [query stage-number [_count _opts x]]
  ;; x is optional.
  (if x
    (i18n/tru "Count of {0}" (display-name query stage-number x))
    (i18n/tru "Count")))

(defmethod column-name* :count
  [query stage-number [_count _opts x]]
  (if x
    (str "count_" (column-name query stage-number x))
    "count"))

(defmethod display-name* :case
  [_query _stage-number _case]
  (i18n/tru "Case"))

(defmethod column-name* :case
  [_query _stage-number _case]
  "case")

(defmethod display-name* :distinct
  [query stage-number [_distinct _opts x]]
  (i18n/tru "Distinct values of {0}"  (display-name query stage-number x)))

(defmethod column-name* :distinct
  [query stage-number [_distinct _opts x]]
  (str "distinct_" (column-name query stage-number x)))

(defmethod display-name* :avg
  [query stage-number [_avg _opts x]]
  (i18n/tru "Average of {0}" (display-name query stage-number x)))

(defmethod column-name* :avg
  [query stage-number [_avg _opts x]]
  (str "avg_" (column-name query stage-number x)))

(defmethod display-name* :cum-count
  [query stage-number [_cum-count _opts x]]
  (i18n/tru "Cumulative count of {0}" (display-name query stage-number x)))

(defmethod column-name* :cum-count
  [query stage-number [_avg _opts x]]
  (str "cum_count_" (column-name query stage-number x)))

(defmethod display-name* :sum
  [query stage-number [_sum _opts x]]
  (i18n/tru "Sum of {0}" (display-name query stage-number x)))

(defmethod column-name* :sum
  [query stage-number [_sum _opts x]]
  (str "sum_" (column-name query stage-number x)))

(defmethod display-name* :cum-sum
  [query stage-number [_cum-sum _opts x]]
  (i18n/tru "Cumulative sum of {0}" (display-name query stage-number x)))

(defmethod column-name* :cum-sum
  [query stage-number [_avg _opts x]]
  (str "cum_sum_" (column-name query stage-number x)))

(defmethod display-name* :stddev
  [query stage-number [_stddev _opts x]]
  (i18n/tru "Standard deviation of {0}" (display-name query stage-number x)))

(defmethod column-name* :stddev
  [query stage-number [_avg _opts x]]
  (str "std_dev_" (column-name query stage-number x)))

(defmethod display-name* :min
  [query stage-number [_min _opts x]]
  (i18n/tru "Min of {0}" (display-name query stage-number x)))

(defmethod column-name* :min
  [query stage-number [_min _opts x]]
  (str "min_" (column-name query stage-number x)))

(defmethod display-name* :max
  [query stage-number [_max _opts x]]
  (i18n/tru "Max of {0}" (display-name query stage-number x)))

(defmethod column-name* :max
  [query stage-number [_max _opts x]]
  (str "max_" (column-name query stage-number x)))

(defmethod display-name* :var
  [query stage-number [_var _opts x]]
  (i18n/tru "Variance of {0}" (display-name query stage-number x)))

(defmethod column-name* :var
  [query stage-number [_var _opts x]]
  (str "var_" (column-name query stage-number x)))

(defmethod display-name* :median
  [query stage-number [_median _opts x]]
  (i18n/tru "Median of {0}" (display-name query stage-number x)))

(defmethod column-name* :median
  [query stage-number [_median _opts x]]
  (str "median_" (column-name query stage-number x)))

(defmethod display-name* :percentile
  [query stage-number [_percentile _opts x p]]
  (i18n/tru "{0}th percentile of {1}" p (display-name query stage-number x)))

(defmethod column-name* :percentile
  [query stage-number [_percentile _opts x p]]
  (format "p%d_%s" p (column-name query stage-number x)))

;;; we don't currently have sophisticated logic for generating nice display names for filter clauses

(defmethod display-name* :sum-where
  [query stage-number [_sum-where _opts x _pred]]
  (i18n/tru "Sum of {0} matching condition" (display-name query stage-number x)))

(defmethod column-name* :sum-where
  [query stage-number [_sum-where _opts x]]
  (str "sum_where_" (column-name query stage-number x)))

(defmethod display-name* :share
  [_query _stage-number _share]
  (i18n/tru "Share of rows matching condition"))

(defmethod column-name* :share
  [_query _stage-number _share]
  "share")

(defmethod display-name* :count-where
  [_query _stage-number _count-where]
  (i18n/tru "Count of rows matching condition"))

(defmethod column-name* :count-where
  [_query _stage-number _count-where]
  "count-where")

(mu/defn ^:private interval-display-name  :- ::lib.schema.common/non-blank-string
  "e.g. something like \"- 2 days\""
  [amount :- :int
   unit   :- ::lib.schema.temporal-bucketing/unit.date-time.interval]
  ;; TODO -- sorta duplicated with [[metabase.shared.parameters.parameters/translated-interval]], but not exactly
  (let [unit-str (case unit
                   :millisecond (i18n/trun "millisecond" "milliseconds" (abs amount))
                   :second      (i18n/trun "second"      "seconds"      (abs amount))
                   :minute      (i18n/trun "minute"      "minutes"      (abs amount))
                   :hour        (i18n/trun "hour"        "hours"        (abs amount))
                   :day         (i18n/trun "day"         "days"         (abs amount))
                   :week        (i18n/trun "week"        "weeks"        (abs amount))
                   :month       (i18n/trun "month"       "months"       (abs amount))
                   :quarter     (i18n/trun "quarter"     "quarters"     (abs amount))
                   :year        (i18n/trun "year"        "years"        (abs amount)))]
    (wrap-str-in-parens-if-nested
     (if (pos? amount)
       (format "+ %d %s" amount       unit-str)
       (format "- %d %s" (abs amount) unit-str)))))

(defmethod display-name* :datetime-add
  [query stage-number [_datetime-add _opts x amount unit]]
  (str (display-name query stage-number x)
       \space
       (interval-display-name amount unit)))

;;; for now we'll just pretend `:coalesce` isn't a present and just use the display name for the expr it wraps.
(defmethod display-name* :coalesce
  [query stage-number [_coalesce _opts expr _null-expr]]
  (display-name query stage-number expr))

(defmethod column-name* :coalesce
  [query stage-number [_coalesce _opts expr _null-expr]]
  (column-name query stage-number expr))

(defmethod display-name* :dispatch-type/number
  [_query _stage-number n]
  (str n))

(defmethod display-name* :dispatch-type/string
  [_query _stage-number s]
  (str \" s \"))
