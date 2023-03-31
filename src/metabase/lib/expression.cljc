(ns metabase.lib.expression
  (:refer-clojure
   :exclude
   [+ - * / case coalesce abs time concat replace])
  (:require
   [clojure.string :as str]
   [metabase.lib.common :as lib.common]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.temporal-bucketing
    :as lib.schema.temporal-bucketing]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(mu/defn column-metadata->expression-ref :- :mbql.clause/expression
  "Given `:metadata/field` column metadata for an expression, construct an `:expression` reference."
  [metadata :- lib.metadata/ColumnMetadata]
  (let [options {:lib/uuid       (str (random-uuid))
                 :base-type      (:base_type metadata)
                 :effective-type ((some-fn :effective_type :base_type) metadata)}]
    [:expression options (:name metadata)]))

(mu/defn resolve-expression :- ::lib.schema.expression/expression
  "Find the expression with `expression-name` in a given stage of a `query`, or throw an Exception if it doesn't
  exist."
  [query           :- ::lib.schema/query
   stage-number    :- :int
   expression-name :- ::lib.schema.common/non-blank-string]
  (let [stage (lib.util/query-stage query stage-number)]
    (or (some-> (get-in stage [:expressions expression-name])
                lib.common/external-op)
        (throw (ex-info (i18n/tru "No expression named {0}" (pr-str expression-name))
                        {:expression-name expression-name
                         :query           query
                         :stage-number    stage-number})))))

(defmethod lib.schema.expression/type-of* :lib/external-op
  [{:keys [operator options args] :or {options {}}}]
  (lib.schema.expression/type-of* (into [(keyword operator) options] args)))

(defmethod lib.metadata.calculation/metadata-method :expression
  [query stage-number [_expression opts expression-name, :as expression-ref]]
  (let [expression (resolve-expression query stage-number expression-name)]
    {:lib/type     :metadata/field
     :lib/source   :source/expressions
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
  (let [unit-str (clojure.core/case unit
                   :millisecond (i18n/trun "millisecond" "milliseconds" (clojure.core/abs amount))
                   :second      (i18n/trun "second"      "seconds"      (clojure.core/abs amount))
                   :minute      (i18n/trun "minute"      "minutes"      (clojure.core/abs amount))
                   :hour        (i18n/trun "hour"        "hours"        (clojure.core/abs amount))
                   :day         (i18n/trun "day"         "days"         (clojure.core/abs amount))
                   :week        (i18n/trun "week"        "weeks"        (clojure.core/abs amount))
                   :month       (i18n/trun "month"       "months"       (clojure.core/abs amount))
                   :quarter     (i18n/trun "quarter"     "quarters"     (clojure.core/abs amount))
                   :year        (i18n/trun "year"        "years"        (clojure.core/abs amount)))]
    (wrap-str-in-parens-if-nested
     (if (pos? amount)
       (lib.util/format "+ %d %s" amount       unit-str)
       (lib.util/format "- %d %s" (clojure.core/abs amount) unit-str)))))

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

(mu/defn expression :- ::lib.schema/query
  "Adds an expression to query."
  ([query expression-name an-expression-clause]
   (expression query -1 expression-name an-expression-clause))
  ([query stage-number expression-name an-expression-clause]
   (let [stage-number (or stage-number -1)]
     (lib.util/update-query-stage
       query stage-number
       update :expressions
       assoc expression-name (lib.common/->op-arg query stage-number an-expression-clause)))))

(lib.common/defop + [x y & more])
(lib.common/defop - [x y & more])
(lib.common/defop * [x y & more])
;; Kondo gets confused
#_{:clj-kondo/ignore [:unresolved-namespace]}
(lib.common/defop / [x y & more])
(lib.common/defop case [x y & more])
(lib.common/defop coalesce [x y & more])
(lib.common/defop abs [x])
(lib.common/defop log [x])
(lib.common/defop exp [x])
(lib.common/defop sqrt [x])
(lib.common/defop ceil [x])
(lib.common/defop floor [x])
(lib.common/defop round [x])
(lib.common/defop power [n expo])
(lib.common/defop interval [n unit])
(lib.common/defop relative-datetime [t unit])
(lib.common/defop time [t unit])
(lib.common/defop absolute-datetime [t unit])
(lib.common/defop now [])
(lib.common/defop convert-timezone [t source dest])
(lib.common/defop get-week [t mode])
(lib.common/defop get-year [t])
(lib.common/defop get-month [t])
(lib.common/defop get-day [t])
(lib.common/defop get-hour [t])
(lib.common/defop get-minute [t])
(lib.common/defop get-second [t])
(lib.common/defop get-quarter [t])
(lib.common/defop datetime-add [t i unit])
(lib.common/defop datetime-subtract [t i unit])
(lib.common/defop concat [s1 s2 & more])
(lib.common/defop substring [s start end])
(lib.common/defop replace [s search replacement])
(lib.common/defop regexextract [s regex])
(lib.common/defop length [s])
(lib.common/defop trim [s])
(lib.common/defop ltrim [s])
(lib.common/defop rtrim [s])
(lib.common/defop upper [s])
(lib.common/defop lower [s])

(mu/defn expressions :- [:sequential lib.metadata/ColumnMetadata]
  "Get metadata about the expressions in a given stage of a `query`."
  ([query]
   (expressions query -1))

  ([query        :- ::lib.schema/query
    stage-number :- :int]
   (for [[expression-name expression-definition] (:expressions (lib.util/query-stage query stage-number))]
     (let [metadata (lib.metadata.calculation/metadata query stage-number expression-definition)]
       (merge
        metadata
        {:lib/source   :source/expressions
         :name         expression-name
         :display_name expression-name})))))
