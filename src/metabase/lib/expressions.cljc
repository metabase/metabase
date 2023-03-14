(ns metabase.lib.expressions
  (:require
   [clojure.string :as str]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.temporal-bucketing
    :as lib.schema.temporal-bucketing]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(mu/defn resolve-expression :- ::lib.schema.expression/expression
  "Find the expression with `expression-name` in a given stage of a `query`, or throw an Exception if it doesn't
  exist."
  [query           :- ::lib.schema/query
   stage-number    :- :int
   expression-name :- ::lib.schema.common/non-blank-string]
  (let [stage (lib.util/query-stage query stage-number)]
    (or (get-in stage [:expressions expression-name])
        (throw (ex-info (i18n/tru "No expression named {0}" (pr-str expression-name))
                        {:expression-name expression-name
                         :query           query
                         :stage-number    stage-number})))))

(defmethod lib.metadata.calculation/metadata :expression
  [query stage-number [_expression opts expression-name, :as expression-ref]]
  (let [expression (resolve-expression query stage-number expression-name)]
    {:lib/type     :metadata/field
     :field_ref    expression-ref
     :name         expression-name
     :display_name (lib.metadata.calculation/display-name query stage-number expression-ref)
     :base_type    (or (:base-type opts)
                       (lib.schema.expression/type-of expression))}))

(defmethod lib.metadata.calculation/display-name-method :dispatch-type/number
  [_query _stage-number n]
  (str n))

(defmethod lib.metadata.calculation/display-name-method :dispatch-type/string
  [_query _stage-number s]
  (str \" s \"))

(defmethod lib.metadata.calculation/display-name-method :expression
  [_query _stage-number [_expression _opts expression-name]]
  expression-name)

(defmethod lib.metadata.calculation/column-name-method :expression
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

(defn- infix-display-name
  "Generate a infix-style display name for an arithmetic expression like `:+`, e.g. `x + y`."
  [query stage-number operator args]
  (wrap-str-in-parens-if-nested
   (binding [*nested* true]
     (str/join (str \space (name operator) \space)
               (map (partial lib.metadata.calculation/display-name query stage-number)
                    args)))))

(defmethod lib.metadata.calculation/display-name-method :+
  [query stage-number [_plus _opts & args]]
  (infix-display-name query stage-number "+" args))

(defmethod lib.metadata.calculation/display-name-method :-
  [query stage-number [_minute _opts & args]]
  (infix-display-name query stage-number "-" args))

(defmethod lib.metadata.calculation/display-name-method :/
  [query stage-number [_divide _opts & args]]
  (infix-display-name query stage-number "÷" args))

(defmethod lib.metadata.calculation/display-name-method :*
  [query stage-number [_multiply _opts & args]]
  (infix-display-name query stage-number "×" args))

(defn- infix-column-name
  [query stage-number operator-str args]
  (str/join (str \_ operator-str \_)
            (map (partial lib.metadata.calculation/column-name query stage-number)
                 args)))

(defmethod lib.metadata.calculation/column-name-method :+
  [query stage-number [_plus _opts & args]]
  (infix-column-name query stage-number "plus" args))

(defmethod lib.metadata.calculation/column-name-method :-
  [query stage-number [_minute _opts & args]]
  (infix-column-name query stage-number "minus" args))

(defmethod lib.metadata.calculation/column-name-method :/
  [query stage-number [_divide _opts & args]]
  (infix-column-name query stage-number "divided_by" args))

(defmethod lib.metadata.calculation/column-name-method :*
  [query stage-number [_multiply _opts & args]]
  (infix-column-name query stage-number "times" args))

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
       (lib.util/format "+ %d %s" amount       unit-str)
       (lib.util/format "- %d %s" (abs amount) unit-str)))))

(defmethod lib.metadata.calculation/display-name-method :datetime-add
  [query stage-number [_datetime-add _opts x amount unit]]
  (str (lib.metadata.calculation/display-name query stage-number x)
       \space
       (interval-display-name amount unit)))

;;; for now we'll just pretend `:coalesce` isn't a present and just use the display name for the expr it wraps.
(defmethod lib.metadata.calculation/display-name-method :coalesce
  [query stage-number [_coalesce _opts expr _null-expr]]
  (lib.metadata.calculation/display-name query stage-number expr))

(defmethod lib.metadata.calculation/column-name-method :coalesce
  [query stage-number [_coalesce _opts expr _null-expr]]
  (lib.metadata.calculation/column-name query stage-number expr))
