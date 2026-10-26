(ns dev.dbt-import.sql
  "Warehouse SQL snippets → Lib expressions and filter clauses: the `expr` of a measure or dimension, and the SQL
  around the references in a filter template.

  dbt leaves both as the warehouse's own SQL. [[metabase.sql-parsing.core/parse-expression]] (sqlglot) parses an
  expression on its own, without a surrounding SELECT, in the warehouse's dialect, and a small subset of its tree is
  built with Lib's clause constructors: column references, literals, arithmetic, comparisons, AND/OR/NOT, IN, BETWEEN,
  IS NULL, simple LIKE patterns and searched CASE. Anything else is reported as unsupported, naming the construct.

  Column references are resolved through a callback, so this namespace knows nothing about semantic models or
  Metabase metadata. Unsupported constructs are signalled with [[unsupported]], an exception the resolve stage turns
  into a report entry; see [[unsupported?]]."
  (:require
   [clojure.string :as str]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(mr/def ::value
  "What a SQL value expression converts to: a Lib expression, or a literal."
  ::lib.schema.expression/expression)

(mr/def ::resolve-column
  "Callback turning a column name as written in the SQL (unquoted, unqualified) into the Lib ref that refers to it."
  ifn?)

(mr/def ::dialect
  "A sqlglot dialect name, or nil for sqlglot's default."
  [:maybe :string])

(mr/def ::node
  "A node of the tree [[metabase.sql-parsing.core/parse-expression]] returns."
  [:map
   [:class :string]
   [:sql   :string]
   [:args  :map]
   [:func  {:optional true} :string]])

(defn unsupported
  "Throw the exception that marks a SQL construct the converter cannot express; `fmt` and `args` are for `format`."
  [fmt & args]
  (throw (ex-info (apply format fmt args) {::unsupported true})))

(defn unsupported?
  "Was `e` thrown by [[unsupported]]?"
  [e]
  (boolean (and (instance? ExceptionInfo e) (::unsupported (ex-data e)))))

(def ^:private string-literal-re
  "A single-quoted SQL string, with doubled quotes inside it."
  #"'(?:[^']|'')*'")

(mu/defn- parse :- ::node
  "Parse the SQL expression `sql` in `dialect`, or throw [[unsupported]] saying why it could not be parsed."
  [dialect :- ::dialect
   sql     :- :string]
  ;; sqlglot reads `{{ ... }}` as a struct literal, so catch Jinja the filter renderer did not recognise first;
  ;; inside a string literal it is just text
  (when (str/includes? (str/replace sql string-literal-re "''") "{{")
    (unsupported "could not parse %s: it still contains Jinja" (pr-str sql)))
  (try
    (sql-parsing/parse-expression dialect sql)
    (catch Exception e
      (if (sql-parsing/parse-error? e)
        (unsupported "could not parse %s: %s" (pr-str sql) (first (str/split-lines (str (sql-parsing/parse-error-message e)))))
        (throw e)))))

(defn- arg
  "The child `k` of `node`."
  [node k]
  (get-in node [:args k]))

(defn- describe
  "`node` for an unsupported message: its SQL and the kind of node it is."
  [node]
  (format "%s (%s)" (:sql node) (:class node)))

(defmulti ^:private ->value
  "The Lib expression for a sqlglot node used as a value: a column, a literal, arithmetic, or CASE."
  {:arglists '([node resolve-column])}
  (fn [node _resolve-column] (:class node)))

(defmulti ^:private ->predicate
  "The Lib filter clause for a sqlglot node used where a boolean is expected: a whole filter, a WHEN, an operand of
  AND, OR or NOT."
  {:arglists '([node resolve-column])}
  (fn [node _resolve-column] (:class node)))

(defmethod ->value :default
  [node _]
  (if-let [function-name (:func node)]
    (unsupported "the function %s is not supported" (u/lower-case-en function-name))
    (unsupported "%s is not supported" (describe node))))

(defmethod ->predicate :default
  [node _]
  (unsupported "%s is not supported as a condition" (describe node)))

(defmethod ->value "Column"
  [node resolve-column]
  ;; the table qualifier, if any, is dropped: a metric has one table
  (resolve-column (arg (arg node :this) :this)))

(defn- parse-number [^String s]
  (if (re-matches #"-?\d+" s)
    (Long/parseLong s)
    (Double/parseDouble s)))

(defmethod ->value "Literal"
  [node _]
  (let [text (arg node :this)]
    (if (arg node :is_string)
      text
      (parse-number text))))

(defmethod ->value "Boolean" [node _] (boolean (arg node :this)))
(defmethod ->value "Null" [_ _] nil)

(defmethod ->value "Neg"
  [node resolve-column]
  (let [value (->value (arg node :this) resolve-column)]
    (if (number? value)
      (- value)
      (lib/- 0 value))))

(defmethod ->value "Paren" [node resolve-column] (->value (arg node :this) resolve-column))
(defmethod ->predicate "Paren" [node resolve-column] (->predicate (arg node :this) resolve-column))

(defn- binary
  "`(lib-fn left right)`, converting both operands with `f`."
  [lib-fn node resolve-column f]
  (lib-fn (f (arg node :this) resolve-column) (f (arg node :expression) resolve-column)))

(defmethod ->value "Add" [node resolve-column] (binary lib/+ node resolve-column ->value))
(defmethod ->value "Sub" [node resolve-column] (binary lib/- node resolve-column ->value))
(defmethod ->value "Mul" [node resolve-column] (binary lib/* node resolve-column ->value))
(defmethod ->value "Div" [node resolve-column] (binary lib// node resolve-column ->value))

(defmethod ->value "Cast"
  [node _]
  (unsupported "a cast to %s, %s, is not supported" (arg (arg node :to) :this) (:sql node)))

(defmethod ->value "Case"
  [node resolve-column]
  (when (arg node :this)
    (unsupported "a simple CASE (CASE x WHEN value ...) is not supported, only CASE WHEN condition ..."))
  (let [branches (mapv (fn [if-node]
                         [(->predicate (arg if-node :this) resolve-column)
                          (->value (arg if-node :true) resolve-column)])
                       (arg node :ifs))]
    (if (contains? (:args node) :default)
      (lib/case branches (->value (arg node :default) resolve-column))
      (lib/case branches))))

;;; conditions

(defmethod ->predicate "Column"
  [node resolve-column]
  ;; a bare column in a boolean position is a boolean column, `WHERE is_returned`
  (lib/= (->value node resolve-column) true))

(defmethod ->predicate "EQ" [node resolve-column] (binary lib/= node resolve-column ->value))
(defmethod ->predicate "NEQ" [node resolve-column] (binary lib/!= node resolve-column ->value))
(defmethod ->predicate "GT" [node resolve-column] (binary lib/> node resolve-column ->value))
(defmethod ->predicate "GTE" [node resolve-column] (binary lib/>= node resolve-column ->value))
(defmethod ->predicate "LT" [node resolve-column] (binary lib/< node resolve-column ->value))
(defmethod ->predicate "LTE" [node resolve-column] (binary lib/<= node resolve-column ->value))

(defn- operands
  "The operands of a chain of `node-class` operators, `a AND b AND c`, flattened."
  [node node-class]
  (if (= node-class (:class node))
    (mapcat #(operands % node-class) [(arg node :this) (arg node :expression)])
    [node]))

(defn- logical
  "`(lib-fn & operands)` over the flattened operands of `node`, so `a AND b AND c` is one `:and`."
  [lib-fn node node-class resolve-column]
  (apply lib-fn (map #(->predicate % resolve-column) (operands node node-class))))

(defmethod ->predicate "And" [node resolve-column] (logical lib/and node "And" resolve-column))
(defmethod ->predicate "Or" [node resolve-column] (logical lib/or node "Or" resolve-column))

(defn- is-null
  "`x IS NULL`, or `x IS NOT NULL` when `negate?`."
  [node resolve-column negate?]
  (when-not (= "Null" (:class (arg node :expression)))
    (unsupported "%s is not supported, only IS [NOT] NULL" (describe node)))
  ((if negate? lib/not-null lib/is-null) (->value (arg node :this) resolve-column)))

(defn- in
  "`x IN (...)`, or with `lib/not-in` as `lib-fn`, `x NOT IN (...)`."
  [node resolve-column lib-fn]
  (when (arg node :query)
    (unsupported "IN over a subquery is not supported, only over a list of values"))
  (apply lib-fn
         (->value (arg node :this) resolve-column)
         (map #(->value % resolve-column) (arg node :expressions))))

(defmethod ->predicate "Is" [node resolve-column] (is-null node resolve-column (boolean (arg node :negate))))
(defmethod ->predicate "In" [node resolve-column] (in node resolve-column lib/in))

(defmethod ->predicate "Not"
  [node resolve-column]
  ;; sqlglot wraps NOT IN and NOT (x IS NULL) in a Not; Lib has clauses for both
  (let [inner (arg node :this)]
    (case (:class inner)
      "In" (in inner resolve-column lib/not-in)
      "Is" (is-null inner resolve-column (not (arg inner :negate)))
      (lib/not (->predicate inner resolve-column)))))

(defmethod ->predicate "Between"
  [node resolve-column]
  (lib/between (->value (arg node :this) resolve-column)
               (->value (arg node :low) resolve-column)
               (->value (arg node :high) resolve-column)))

(def ^:private like-pattern-re
  "`%x%`, `x%`, `%x` or `x`, where `x` has no wildcards of its own."
  #"(%?)([^%_]*)(%?)")

(defn- like
  "`LIKE` or, `case-insensitive?`, `ILIKE` with a simple pattern as `:contains`, `:starts-with`, `:ends-with` or `:=`."
  [node resolve-column case-insensitive?]
  (let [keyword-name (if case-insensitive? "ILIKE" "LIKE")
        pattern      (->value (arg node :expression) resolve-column)
        [_ leading body trailing] (when (string? pattern) (re-matches like-pattern-re pattern))]
    (when-not (string? pattern)
      (unsupported "%s with a pattern that is not a string literal is not supported" keyword-name))
    (when-not body
      (unsupported "the %s pattern %s is not supported; only %%x%%, x%% and %%x are" keyword-name (pr-str pattern)))
    (let [operator (cond
                     (and (seq leading) (seq trailing)) :contains
                     (seq leading)                      :ends-with
                     (seq trailing)                     :starts-with
                     case-insensitive?                  (unsupported "ILIKE without a wildcard is not supported")
                     :else                              :=)
          clause   (lib/expression-clause operator
                                          [(->value (arg node :this) resolve-column) body]
                                          (when case-insensitive? {:case-sensitive false}))]
      (if (arg node :negate) (lib/not clause) clause))))

(defmethod ->predicate "Like" [node resolve-column] (like node resolve-column false))
(defmethod ->predicate "ILike" [node resolve-column] (like node resolve-column true))

(mu/defn expression->mbql :- ::value
  "The Lib expression for the SQL value expression `sql` in `dialect`, resolving column names with `resolve-column`. A
  literal comes back as itself. Throws [[unsupported]] for SQL the subset does not cover."
  [dialect        :- ::dialect
   sql            :- :string
   resolve-column :- ::resolve-column]
  (->value (parse dialect sql) resolve-column))

(mu/defn condition->mbql :- ::lib.schema.expression/boolean
  "The Lib filter clause for the SQL condition `sql` in `dialect`, resolving column names with `resolve-column`.
  Throws [[unsupported]] for SQL the subset does not cover."
  [dialect        :- ::dialect
   sql            :- :string
   resolve-column :- ::resolve-column]
  (->predicate (parse dialect sql) resolve-column))

;;; filter templates

(mr/def ::reference
  "A MetricFlow object reference from a filter template: `Dimension('entity__name')`, `TimeDimension('entity__name',
  'grain')`, `Entity('name')` or `Metric('name', ...)`."
  [:map
   [:kind  [:enum :dimension :time-dimension :entity :metric]]
   [:name  :string]
   [:grain [:maybe :string]]])

(mr/def ::rendered-filter
  "A filter template with its references replaced by placeholder identifiers, and what each placeholder stood for."
  [:map
   [:sql        :string]
   [:references [:map-of :string ::reference]]])

(def ^:private reference-re
  "`{{ Dimension('order__status') }}`, `{{ TimeDimension('metric_time', 'day') }}`, `{{ Entity('customer') }}`,
  `{{ Metric('revenue', group_by=['customer']) }}`: the object, its quoted first argument, an optional quoted second
  argument, and whatever else precedes the closing parenthesis."
  #"\{\{\s*(Dimension|TimeDimension|Entity|Metric)\(\s*(?:'([^']*)'|\"([^\"]*)\")\s*(?:,\s*(?:'([^']*)'|\"([^\"]*)\"))?[^)]*\)\s*\}\}")

(def ^:private reference-kinds
  {"Dimension"     :dimension
   "TimeDimension" :time-dimension
   "Entity"        :entity
   "Metric"        :metric})

(mu/defn render-filter :- ::rendered-filter
  "Replace each MetricFlow reference in the filter `template` with a placeholder identifier, so the rest parses as SQL
  with [[condition->mbql]], whose column callback then sees the placeholders as column names. `:references` says what
  each placeholder stood for. Jinja the regex does not recognise is left alone and fails to parse."
  [template :- :string]
  (let [references (volatile! (transient {}))
        sql        (str/replace template reference-re
                                (fn [[_ object single-1 double-1 single-2 double-2]]
                                  (let [placeholder (format "__dbt_ref_%d__" (count @references))]
                                    (vswap! references assoc! placeholder {:kind  (reference-kinds object)
                                                                           :name  (or single-1 double-1)
                                                                           :grain (or single-2 double-2)})
                                    placeholder)))]
    {:sql        sql
     :references (persistent! @references)}))
