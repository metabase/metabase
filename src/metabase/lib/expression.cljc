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
  "Given `:metadata/field` column metadata for an expression, construct an `:expression` reference."
  [metadata :- lib.metadata/ColumnMetadata]
  (let [options {:lib/uuid       (str (random-uuid))
                 :base-type      (:base-type metadata)
                 :effective-type ((some-fn :effective-type :base-type) metadata)}]
    [:expression options (:name metadata)]))

(mu/defn resolve-expression :- ::lib.schema.expression/expression
  "Find the expression with `expression-name` in a given stage of a `query`, or throw an Exception if it doesn't
  exist."
  [query           :- ::lib.schema/query
   stage-number    :- :int
   expression-name :- ::lib.schema.common/non-blank-string]
  (let [stage (lib.util/query-stage query stage-number)]
    (or (m/find-first (comp #{expression-name} lib.util/expression-name)
                      (:expressions stage))
        (throw (ex-info (i18n/tru "No expression named {0}" (pr-str expression-name))
                        {:expression-name expression-name
                         :query           query
                         :stage-number    stage-number})))))

(defmethod lib.metadata.calculation/type-of-method :expression
  [query stage-number [_expression _opts expression-name, :as _expression-ref]]
  (let [expression (resolve-expression query stage-number expression-name)]
    (lib.metadata.calculation/type-of query stage-number expression)))

(defmethod lib.metadata.calculation/metadata-method :expression
  [query stage-number [_expression opts expression-name, :as expression-ref]]
  {:lib/type        :metadata/field
   :lib/source-uuid (:lib/uuid opts)
   :name            expression-name
   :display-name    (lib.metadata.calculation/display-name query stage-number expression-ref)
   :base-type       (lib.metadata.calculation/type-of query stage-number expression-ref)
   :lib/source      :source/expressions})

(defmethod lib.metadata.calculation/display-name-method :dispatch-type/integer
  [_query _stage-number n _style]
  (str n))

(defmethod lib.metadata.calculation/display-name-method :dispatch-type/number
  [_query _stage-number n _style]
  (str n))

(defmethod lib.metadata.calculation/display-name-method :dispatch-type/string
  [_query _stage-number s _style]
  (str \" s \"))

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

(defn- infix-column-name
  [query stage-number operator-str args]
  (str/join (str \_ operator-str \_)
            (map (partial lib.metadata.calculation/column-name query stage-number)
                 args)))

(def ^:private infix-operator-column-name
  {:+ "plus"
   :- "minus"
   :/ "divided_by"
   :* "times"})

(defmethod lib.metadata.calculation/column-name-method ::infix-operator
  [query stage-number [tag _opts & args]]
  (infix-column-name query stage-number (get infix-operator-column-name tag) args))

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

(mu/defn expression :- ::lib.schema/query
  "Adds an expression to query."
  ([query expression-name an-expression-clause]
   (expression query -1 expression-name an-expression-clause))
  ([query stage-number expression-name an-expression-clause]
   (let [stage-number (or stage-number -1)]
     (when (conflicting-name? query stage-number expression-name)
       (throw (ex-info "Expression name conflicts with a column in the same query stage"
                       {:expression-name expression-name})))
     (lib.util/update-query-stage
       query stage-number
       update :expressions
       (fnil conj [])
       (-> (lib.common/->op-arg query stage-number an-expression-clause)
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

(mu/defn expressions-metadata :- [:maybe [:sequential lib.metadata/ColumnMetadata]]
  "Get metadata about the expressions in a given stage of a `query`."
  ([query]
   (expressions-metadata query -1))

  ([query        :- ::lib.schema/query
    stage-number :- :int]
   (some->> (not-empty (:expressions (lib.util/query-stage query stage-number)))
            (mapv (fn [expression-definition]
                    (let [expression-name (lib.util/expression-name expression-definition)]
                      (-> (lib.metadata.calculation/metadata query stage-number expression-definition)
                          (assoc :lib/source   :source/expressions
                                 :name         expression-name
                                 :display-name expression-name))))))))

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
