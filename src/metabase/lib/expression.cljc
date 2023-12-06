(ns metabase.lib.expression
  (:refer-clojure
   :exclude
   [+ - * / case coalesce abs time concat replace])
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.common :as lib.common]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.temporal-bucketing
    :as lib.schema.temporal-bucketing]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.types :as types]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(mu/defn column-metadata->expression-ref :- :mbql.clause/expression
  "Given `:metadata/column` column metadata for an expression, construct an `:expression` reference."
  [metadata :- lib.metadata/ColumnMetadata]
  (let [options {:lib/uuid       (str (random-uuid))
                 :base-type      (:base-type metadata)
                 :effective-type ((some-fn :effective-type :base-type) metadata)}]
    [:expression options ((some-fn :lib/expression-name :name) metadata)]))

(mu/defn resolve-expression :- ::lib.schema.expression/expression
  "Find the expression with `expression-name` in a given stage of a `query`, or throw an Exception if it doesn't
  exist."
  ([query expression-name]
   (resolve-expression query -1 expression-name))

  ([query           :- ::lib.schema/query
    stage-number    :- :int
    expression-name :- ::lib.schema.common/non-blank-string]
   (let [stage (lib.util/query-stage query stage-number)]
     (or (m/find-first (comp #{expression-name} lib.util/expression-name)
                       (:expressions stage))
         (throw (ex-info (i18n/tru "No expression named {0}" (pr-str expression-name))
                         {:expression-name expression-name
                          :query           query
                          :stage-number    stage-number}))))))

(defmethod lib.metadata.calculation/type-of-method :expression
  [query stage-number [_expression _opts expression-name, :as _expression-ref]]
  (let [expression (resolve-expression query stage-number expression-name)]
    (lib.metadata.calculation/type-of query stage-number expression)))

(defmethod lib.metadata.calculation/metadata-method :expression
  [query stage-number [_expression opts expression-name, :as expression-ref-clause]]
  {:lib/type            :metadata/column
   :lib/source-uuid     (:lib/uuid opts)
   :name                expression-name
   :lib/expression-name expression-name
   :display-name        (lib.metadata.calculation/display-name query stage-number expression-ref-clause)
   :base-type           (lib.metadata.calculation/type-of query stage-number expression-ref-clause)
   :lib/source          :source/expressions})

(defmethod lib.metadata.calculation/display-name-method :dispatch-type/integer
  [_query _stage-number n _style]
  (str n))

(defmethod lib.metadata.calculation/display-name-method :dispatch-type/number
  [_query _stage-number n _style]
  (str n))

(defmethod lib.metadata.calculation/display-name-method :dispatch-type/string
  [_query _stage-number s _style]
  (str \" s \"))

(defmethod lib.metadata.calculation/display-name-method :dispatch-type/boolean
  [_query _stage-number s _style]
  (str s))

(defmethod lib.metadata.calculation/display-name-method :expression
  [_query _stage-number [_expression _opts expression-name] _style]
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

(def ^:private infix-operator-display-name
  {:+ "+"
   :- "-"
   :* "×"
   :/ "÷"})

(doseq [tag [:+ :- :/ :*]]
  (lib.hierarchy/derive tag ::infix-operator))

(defmethod lib.metadata.calculation/display-name-method ::infix-operator
  [query stage-number [tag _opts & args] _style]
  (infix-display-name query stage-number (get infix-operator-display-name tag) args))

(defmethod lib.metadata.calculation/column-name-method ::infix-operator
  [_query _stage-number _expr]
  "expression")

;;; `:+`, `:-`, and `:*` all have the same logic; also used for [[metabase.lib.schema.expression/type-of]].
;;;
;;; `:lib.type-of/type-is-type-of-arithmetic-args` is defined in [[metabase.lib.schema.expression.arithmetic]]
(defmethod lib.metadata.calculation/type-of-method :lib.type-of/type-is-type-of-arithmetic-args
  [query stage-number [_tag _opts & args]]
  ;; Okay to use reduce without an init value here since we know we have >= 2 args
  #_{:clj-kondo/ignore [:reduce-without-init]}
  (reduce
   types/most-specific-common-ancestor
   (for [arg args]
     (lib.metadata.calculation/type-of query stage-number arg))))

;;; TODO -- this stuff should probably be moved into [[metabase.lib.temporal-bucket]]

(defn- interval-unit-str [amount unit]
  ;; this uses [[clojure.string/lower-case]] so its in the user's locale in the browser rather than always using
  ;; English lower-casing rules.
  #_{:clj-kondo/ignore [:discouraged-var]}
  (str/lower-case (lib.temporal-bucket/describe-temporal-unit amount unit)))

(mu/defn ^:private interval-display-name  :- ::lib.schema.common/non-blank-string
  "e.g. something like \"- 2 days\""
  [amount :- :int
   unit   :- ::lib.schema.temporal-bucketing/unit.date-time.interval]
  ;; TODO -- sorta duplicated with [[metabase.shared.parameters.parameters/translated-interval]], but not exactly
  (let [unit-str (interval-unit-str amount unit)]
    (wrap-str-in-parens-if-nested
     (if (pos? amount)
       (lib.util/format "+ %d %s" amount                    unit-str)
       (lib.util/format "- %d %s" (clojure.core/abs amount) unit-str)))))

(mu/defn ^:private interval-column-name  :- ::lib.schema.common/non-blank-string
  "e.g. something like `minus_2_days`"
  [amount :- :int
   unit   :- ::lib.schema.temporal-bucketing/unit.date-time.interval]
  ;; TODO -- sorta duplicated with [[metabase.shared.parameters.parameters/translated-interval]], but not exactly
  (let [unit-str (interval-unit-str amount unit)]
    (if (pos? amount)
      (lib.util/format "plus_%s_%s"  amount                    unit-str)
      (lib.util/format "minus_%d_%s" (clojure.core/abs amount) unit-str))))

(defmethod lib.metadata.calculation/display-name-method :datetime-add
  [query stage-number [_datetime-add _opts x amount unit] style]
  (str (lib.metadata.calculation/display-name query stage-number x style)
       \space
       (interval-display-name amount unit)))

(defmethod lib.metadata.calculation/column-name-method :datetime-add
  [query stage-number [_datetime-add _opts x amount unit]]
  (str (lib.metadata.calculation/column-name query stage-number x)
       \_
       (interval-column-name amount unit)))

;;; for now we'll just pretend `:coalesce` isn't a present and just use the display name for the expr it wraps.
(defmethod lib.metadata.calculation/display-name-method :coalesce
  [query stage-number [_coalesce _opts expr _null-expr] style]
  (lib.metadata.calculation/display-name query stage-number expr style))

(defmethod lib.metadata.calculation/column-name-method :coalesce
  [query stage-number [_coalesce _opts expr _null-expr]]
  (lib.metadata.calculation/column-name query stage-number expr))

(defn- conflicting-name? [query stage-number expression-name]
  (let [stage     (lib.util/query-stage query stage-number)
        cols      (lib.metadata.calculation/visible-columns query stage-number stage)
        expr-name (u/lower-case-en expression-name)]
    (some #(-> % :name u/lower-case-en (= expr-name)) cols)))

(defn- add-expression-to-stage
  [stage expression]
  (cond-> (update stage :expressions (fnil conj []) expression)
    ;; if there are explicit fields selected, add the expression to them
    (vector? (:fields stage))
    (update :fields conj (lib.options/ensure-uuid [:expression {} (lib.util/expression-name expression)]))))

(mu/defn expression :- ::lib.schema/query
  "Adds an expression to query."
  ([query expression-name expressionable]
   (expression query -1 expression-name expressionable))

  ([query                :- ::lib.schema/query
    stage-number         :- [:maybe :int]
    expression-name      :- ::lib.schema.common/non-blank-string
    expressionable]
   (let [stage-number (or stage-number -1)]
     (when (conflicting-name? query stage-number expression-name)
       (throw (ex-info "Expression name conflicts with a column in the same query stage"
                       {:expression-name expression-name})))
     (lib.util/update-query-stage
      query stage-number
      add-expression-to-stage
      (-> (lib.common/->op-arg expressionable)
          (lib.util/named-expression-clause expression-name))))))

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

(mu/defn ^:private expression-metadata :- lib.metadata/ColumnMetadata
  [query                 :- ::lib.schema/query
   stage-number          :- :int
   expression-definition :- ::lib.schema.expression/expression]
  (let [expression-name (lib.util/expression-name expression-definition)]
    (-> (lib.metadata.calculation/metadata query stage-number expression-definition)
        (assoc :lib/source   :source/expressions
               :name         expression-name
               :display-name expression-name))))

(mu/defn expressions-metadata :- [:maybe [:sequential lib.metadata/ColumnMetadata]]
  "Get metadata about the expressions in a given stage of a `query`."
  ([query]
   (expressions-metadata query -1))

  ([query        :- ::lib.schema/query
    stage-number :- :int]
   (some->> (not-empty (:expressions (lib.util/query-stage query stage-number)))
            (mapv (partial expression-metadata query stage-number)))))

(mu/defn expressions :- [:maybe ::lib.schema.expression/expressions]
  "Get the expressions map from a given stage of a `query`."
  ([query]
   (expressions query -1))

  ([query        :- ::lib.schema/query
    stage-number :- :int]
   (not-empty (:expressions (lib.util/query-stage query stage-number)))))

(defmethod lib.ref/ref-method :expression
  [expression-clause]
  expression-clause)

(mu/defn expressionable-columns :- [:sequential lib.metadata/ColumnMetadata]
  "Get column metadata for all the columns that can be used expressions in
  the stage number `stage-number` of the query `query` and in expression index `expression-position`
  If `stage-number` is omitted, the last stage is used.
  Pass nil to `expression-position` for new expressions.
  The rules for determining which columns can be broken out by are as follows:

  1. custom `:expressions` in this stage of the query, that come before the `expression-position`

  2. Fields 'exported' by the previous stage of the query, if there is one;
     otherwise Fields from the current `:source-table`

  3. Fields exported by explicit joins

  4. Fields in Tables that are implicitly joinable."

  ([query :- ::lib.schema/query
    expression-position :- [:maybe ::lib.schema.common/int-greater-than-or-equal-to-zero]]
   (expressionable-columns query -1 expression-position))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    expression-position :- [:maybe ::lib.schema.common/int-greater-than-or-equal-to-zero]]
   (let [indexed-expressions (into {} (map-indexed (fn [idx expr]
                                                     [(lib.util/expression-name expr) idx])
                                                   (expressions query stage-number)))
         unavailable-expressions (fn [column]
                                   (or (not expression-position)
                                       (not= (:lib/source column) :source/expressions)
                                       (< (get indexed-expressions (:name column)) expression-position)))
         stage (lib.util/query-stage query stage-number)
         columns (lib.metadata.calculation/visible-columns query stage-number stage)]
     (->> columns
          (filterv unavailable-expressions)
          not-empty))))

(mu/defn expression-ref :- :mbql.clause/expression
  "Find the expression with `expression-name` using [[resolve-expression]], then create a ref for it. Intended for use
  when creating queries using threading macros e.g.

    (-> (lib/query ...)
        (lib/expression \"My Expression\" ...)
        (as-> <> (lib/aggregate <> (lib/avg (lib/expression-ref <> \"My Expression\")))))"
  ([query expression-name]
   (expression-ref query -1 expression-name))

  ([query           :- ::lib.schema/query
    stage-number    :- :int
    expression-name :- ::lib.schema.common/non-blank-string]
   (->> expression-name
        (resolve-expression query stage-number)
        (expression-metadata query stage-number)
        lib.ref/ref)))

(mu/defn with-expression-name :- ::lib.schema.expression/expression
  "Return a new expression clause like `an-expression-clause` but with name `new-name`.
  For expressions from the :expressions clause of a pMBQL query this sets the :lib/expression-name option,
  for other expressions (for example named aggregation expressions) the :display-name option is set.

  Note that always setting :lib/expression-name would lead to confusion, because that option is used
  to decide what kind of reference is to be created. For example, expression are referenced by name,
  aggregations are referenced by position."
  [an-expression-clause :- ::lib.schema.expression/expression
   new-name :- :string]
  (lib.options/update-options
   an-expression-clause
   (fn [opts]
     (let [opts (assoc opts :lib/uuid (str (random-uuid)))]
       (if (:lib/expression-name opts)
         (assoc opts :lib/expression-name new-name)
         (assoc opts :display-name new-name))))))
