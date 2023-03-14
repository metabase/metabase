(ns metabase.lib.metadata.calculate.names
  "Logic for calculating human-friendly display names for things."
  (:require
   [clojure.string :as str]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculate.resolve :as calculate.resolve]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   #?@(:cljs ([goog.string :refer [format]]
              [goog.string.format :as gstring.format]))))

;; The formatting functionality is only loaded if you depend on goog.string.format.
#?(:cljs (comment gstring.format/keep-me))

;;; TODO -- probably not the best way to be handling i18n here, but this was ported from the FE code and
(defn join-strings-with-conjunction
  "This is basically [[clojure.string/join]] but uses commas to join everything but the last two args, which are joined
  by a string `conjunction`. Uses Oxford commas for > 2 args.

  (join-strings-with-conjunction \"and\" [\"X\" \"Y\" \"Z\"])
  ;; => \"X, Y, and Z\""
  [conjunction coll]
  (when (seq coll)
    (if (= (count coll) 1)
      (first coll)
      (let [conjunction (str \space (str/trim conjunction) \space)]
        (if (= (count coll) 2)
          ;; exactly 2 args: X and Y
          (str (first coll) conjunction (second coll))
          ;; > 2 args: X, Y, and Z
          (str
           (str/join ", " (butlast coll))
           ","
           conjunction
           (last coll)))))))

(defmulti display-name*
  "Impl for [[display-name]]."
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x)))

(defmethod display-name* :default
  [_query _stage-number x]
  ;; hopefully this is dev-facing only, so not i18n'ed.
  (log/warnf "Don't know how to calculate display name for %s. Add an impl for %s for %s"
             (pr-str x)
             `display-name*
             (lib.dispatch/dispatch-value x))
  (if (and (vector? x)
           (keyword? (first x)))
    ;; MBQL clause: just use the name of the clause.
    (name (first x))
    ;; anything else: use `pr-str` representation.
    (pr-str x)))

(defmethod display-name* :metadata/table
  [_query _stage-number table-metadata]
  ;; TODO -- pluralize
  (or (:display_name table-metadata)
      (u.humanization/name->human-readable-name :simple (:name table-metadata))))

(defn- options-when-mbql-clause
  "If this is an MBQL clause, return its options map, if it has one."
  [x]
  (when (and (vector? x)
             (keyword? (first x))
             (map? (second x)))
    (second x)))

(mu/defn display-name :- ::lib.schema.common/non-blank-string
  "Calculate a nice human-friendly display name for something."
  [query                                    :- ::lib.schema/query
   stage-number                             :- :int
   x]
  (or
   ;; if this is an MBQL clause with `:display-name` in the options map, then use that rather than calculating a name.
   (:display-name (options-when-mbql-clause x))
   (try
     (display-name* query stage-number x)
     (catch #?(:clj Throwable :cljs js/Error) e
       (throw (ex-info (i18n/tru "Error calculating display name for {0}: {1}" (pr-str x) (ex-message e))
                       {:x            x
                        :query        query
                        :stage-number stage-number}
                       e))))))

(defmulti column-name*
  "Impl for [[column-name]]. Prefer using [[column-name]] over using this directly; you should really only use this when
  adding  multimethod implementations."
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x)))

(mu/defn column-name :- ::lib.schema.common/non-blank-string
  "Calculate a database-friendly name to use for an expression."
  [query        :- ::lib.schema/query
   stage-number :- :int
   x]
  (or
   ;; if this is an MBQL clause with `:name` in the options map, then use that rather than calculating a name.
   (:name (options-when-mbql-clause x))
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
    (i18n/tru "Native Query")))

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



(defmethod display-name* :case
  [_query _stage-number _case]
  (i18n/tru "Case"))

(defmethod column-name* :case
  [_query _stage-number _case]
  "case")



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

;;;; misc literal types

(defmethod display-name* :dispatch-type/number
  [_query _stage-number n]
  (str n))

(defmethod display-name* :dispatch-type/string
  [_query _stage-number s]
  (str \" s \"))

(defmethod display-name* :dispatch-type/boolean
  [_query _stage-number bool]
  (if bool
    (i18n/tru "true")
    (i18n/tru "false")))

;;; TODO -- instead of putting more stuff in here, put it in the appropriate `metabase.lib` namespace
;;; e.g. [[metabase.lib.filter]]. See https://metaboat.slack.com/archives/C04DN5VRQM6/p1678742327970719
