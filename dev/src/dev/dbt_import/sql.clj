(ns dev.dbt-import.sql
  "Warehouse SQL snippets → Lib expressions and filter clauses: the `expr` of a measure or dimension, and the SQL
  around the references in a filter template.

  dbt leaves both as the warehouse's own SQL. [[metabase.sql-parsing.core/parse-expression]] (sqlglot) parses an
  expression on its own, without a surrounding SELECT, in the warehouse's dialect, and a subset of its tree is built
  with Lib's clause constructors: column references, literals, arithmetic, comparisons, AND/OR/NOT, IN, BETWEEN,
  IS [NOT] NULL/TRUE/FALSE, LIKE patterns that Lib's string filters can express (see [[like]]), both forms of CASE,
  casts to the types Lib has a conversion for (see [[cast-targets]]) and the functions that have a Lib expression
  function with the same meaning (see [[->value]]). `NULLIF(x, 0)` as a divisor is plain division in Metabase (see
  [[safe-divisor]]). Anything else is reported as unsupported, naming the construct.

  Column references are resolved through a callback, so this namespace knows nothing about semantic models or
  Metabase metadata. Unsupported constructs are signalled with [[unsupported]], an exception the resolve stage turns
  into a report entry; see [[unsupported?]]."
  (:require
   [better-cond.core :as b]
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
(defn- safe-divisor
  "The divisor of `x / NULLIF(y, 0)` is just `y`: Metabase's `/` already turns a zero divisor into NULL (see
  `safe-denominator` in [[metabase.driver.sql.query-processor]]), so the idiom adds nothing. Any other divisor is
  returned as it is."
  [divisor]
  (let [compared-to (arg divisor :expression)]
    (if (and (= "Nullif" (:class divisor))
             (= "Literal" (:class compared-to))
             (not (arg compared-to :is_string))
             (zero? (parse-number (arg compared-to :this))))
      (arg divisor :this)
      divisor)))

(defmethod ->value "Div"
  [node resolve-column]
  (lib// (->value (arg node :this) resolve-column)
         (->value (safe-divisor (arg node :expression)) resolve-column)))

(def ^:private cast-targets
  "sqlglot's name for a SQL type (`cast(x as numeric(10, 2))` and `x::numeric` both arrive as `DECIMAL`) → the Lib
  conversion function that casts to it. Lib's `integer`, `float` and `text` take any expression; `date` takes a string
  to parse or a datetime to truncate; `datetime` takes a string, which is how SQL casts a text column to a timestamp.
  There is no cast to boolean or to an interval."
  {"TINYINT"      lib/integer
   "SMALLINT"     lib/integer
   "INT"          lib/integer
   "BIGINT"       lib/integer
   "DECIMAL"      lib/float
   "FLOAT"        lib/float
   "DOUBLE"       lib/float
   "CHAR"         lib/text
   "NCHAR"        lib/text
   "VARCHAR"      lib/text
   "NVARCHAR"     lib/text
   "TEXT"         lib/text
   "DATE"         lib/date
   "DATETIME"     lib/datetime
   "TIMESTAMP"    lib/datetime
   "TIMESTAMPTZ"  lib/datetime
   "TIMESTAMPLTZ" lib/datetime
   "TIMESTAMPNTZ" lib/datetime})

(defmethod ->value "Cast"
  [node resolve-column]
  (let [target (arg (arg node :to) :this)]
    (if-let [cast (get cast-targets target)]
      (cast (->value (arg node :this) resolve-column))
      (unsupported "a cast to %s, %s, is not supported" target (:sql node)))))

(defmethod ->value "Case"
  [node resolve-column]
  ;; the simple form, `CASE x WHEN v THEN ...`, is the searched form with `x = v` as each condition; `x` is converted
  ;; once per branch so that each branch gets a column ref of its own
  (let [operand   (arg node :this)
        condition (fn [when-node]
                    (if operand
                      (lib/= (->value operand resolve-column) (->value when-node resolve-column))
                      (->predicate when-node resolve-column)))
        branches  (mapv (fn [if-node]
                          [(condition (arg if-node :this))
                           (->value (arg if-node :true) resolve-column)])
                        (arg node :ifs))]
    (if (contains? (:args node) :default)
      (lib/case branches (->value (arg node :default) resolve-column))
      (lib/case branches))))

;;; functions

(defn- unary
  "`(lib-fn x)` over the one operand of `node`."
  [lib-fn node resolve-column]
  (lib-fn (->value (arg node :this) resolve-column)))

(defmethod ->value "Abs" [node resolve-column] (unary lib/abs node resolve-column))
(defmethod ->value "Floor" [node resolve-column] (unary lib/floor node resolve-column))
(defmethod ->value "Ceil" [node resolve-column] (unary lib/ceil node resolve-column))
(defmethod ->value "Sqrt" [node resolve-column] (unary lib/sqrt node resolve-column))
(defmethod ->value "Exp" [node resolve-column] (unary lib/exp node resolve-column))
(defmethod ->value "Pow" [node resolve-column] (binary lib/power node resolve-column ->value))
(defmethod ->value "Lower" [node resolve-column] (unary lib/lower node resolve-column))
(defmethod ->value "Upper" [node resolve-column] (unary lib/upper node resolve-column))
(defmethod ->value "Length" [node resolve-column] (unary lib/length node resolve-column))
(defmethod ->value "CurrentTimestamp" [_ _] (lib/now))
(defmethod ->value "CurrentDate" [_ _] (lib/today))

(defn- literal-number
  "The number `node` is, when it is a numeric literal; nil otherwise."
  [node]
  (when (and (= "Literal" (:class node)) (not (arg node :is_string)))
    (parse-number (arg node :this))))

(defmethod ->value "Log"
  [node resolve-column]
  ;; Metabase's `log` is base 10, as a one-argument SQL `log` is (`ln` is the natural log and does not map)
  (let [base-node (when (arg node :expression) (arg node :this))
        x-node    (or (arg node :expression) (arg node :this))]
    (when (and base-node (not= 10 (literal-number base-node)))
      (unsupported "log to a base other than 10 is not supported: %s" (:sql node)))
    (lib/log (->value x-node resolve-column))))

(defmethod ->value "Round"
  [node resolve-column]
  ;; Metabase rounds to a whole number only, so `round(x, n)` is `round(x * 10^n) / 10^n`
  (let [x        (->value (arg node :this) resolve-column)
        decimals (when-let [decimals-node (arg node :decimals)]
                   (let [n (literal-number decimals-node)]
                     (when-not (and (integer? n) (not (neg? n)))
                       (unsupported "round to %s decimals is not supported; only a literal number of decimals is"
                                    (:sql decimals-node)))
                     n))]
    (if (or (nil? decimals) (zero? decimals))
      (lib/round x)
      (let [scale (long (Math/pow 10.0 (double decimals)))]
        (lib// (lib/round (lib/* x scale)) scale)))))

(defmethod ->value "Coalesce"
  [node resolve-column]
  (let [values (map #(->value % resolve-column) (cons (arg node :this) (arg node :expressions)))]
    (if (next values)
      (apply lib/coalesce values)
      (first values))))

(defmethod ->value "Nullif"
  [node resolve-column]
  ;; `NULLIF(x, y)` is `CASE WHEN x = y THEN NULL ELSE x END`; `x` is converted twice so that each use has its own ref
  (lib/case [[(binary lib/= node resolve-column ->value) nil]]
            (->value (arg node :this) resolve-column)))

(defmethod ->value "Trim"
  [node resolve-column]
  (let [characters (arg node :expression)]
    (when (and characters (not= " " (->value characters resolve-column)))
      (unsupported "TRIM of characters other than spaces is not supported: %s" (:sql node)))
    (unary (case (arg node :position)
             "LEADING"  lib/ltrim
             "TRAILING" lib/rtrim
             lib/trim)
           node resolve-column)))

(defmethod ->value "Replace"
  [node resolve-column]
  (when-not (arg node :replacement)
    (unsupported "REPLACE without a replacement is not supported: %s" (:sql node)))
  (lib/replace (->value (arg node :this) resolve-column)
               (->value (arg node :expression) resolve-column)
               (->value (arg node :replacement) resolve-column)))

(defmethod ->value "Substring"
  [node resolve-column]
  ;; the same 1-based start and optional length as SQL
  (lib/expression-clause :substring
                         (into [(->value (arg node :this) resolve-column)
                                (->value (arg node :start) resolve-column)]
                               (when-let [length (arg node :length)]
                                 [(->value length resolve-column)]))
                         nil))

(defn- operands
  "The operands of a chain of `node-class` operators, `a AND b AND c`, flattened."
  [node node-class]
  (if (= node-class (:class node))
    (mapcat #(operands % node-class) [(arg node :this) (arg node :expression)])
    [node]))

(defn- concatenate
  "`concat` over the converted `nodes`."
  [nodes resolve-column]
  (let [values (map #(->value % resolve-column) nodes)]
    (if (next values)
      (apply lib/concat values)
      (first values))))

(defmethod ->value "Concat" [node resolve-column] (concatenate (arg node :expressions) resolve-column))
;; `a || b || c`
(defmethod ->value "DPipe" [node resolve-column] (concatenate (operands node "DPipe") resolve-column))

(def ^:private extract-parts
  "The date parts `EXTRACT(part FROM x)` and `date_part('part', x)` take, as sqlglot spells them, that Lib has a
  function for. The week and day-of-week parts depend on the warehouse's and the instance's first day of the week and
  are left out."
  {"YEAR"    lib/get-year
   "QUARTER" lib/get-quarter
   "MONTH"   lib/get-month
   "DAY"     lib/get-day
   "HOUR"    lib/get-hour
   "MINUTE"  lib/get-minute
   "SECOND"  lib/get-second})

(defmethod ->value "Extract"
  [node resolve-column]
  (let [part (arg (arg node :this) :this)]
    (if-let [get-part (get extract-parts part)]
      (get-part (->value (arg node :expression) resolve-column))
      (unsupported "extracting %s from a date is not supported" part))))

(def ^:private truncation-units
  "The units `date_trunc('unit', x)` takes, as sqlglot spells them, that are Metabase temporal units."
  {"MINUTE"  :minute
   "HOUR"    :hour
   "DAY"     :day
   "WEEK"    :week
   "MONTH"   :month
   "QUARTER" :quarter
   "YEAR"    :year})

(defn- date-trunc
  "`date_trunc('unit', column)` as the column bucketed by that temporal unit. Metabase truncates a column by bucketing
  its ref, so there is nothing to bucket when the argument is an expression rather than a column."
  [node resolve-column]
  (let [unit-name (arg (arg node :unit) :this)
        unit      (get truncation-units unit-name)
        value     (->value (arg node :this) resolve-column)]
    (when-not unit
      (unsupported "truncating a date to %s is not supported" unit-name))
    (when-not (lib/clause-of-type? value :field)
      (unsupported "date_trunc over an expression is not supported, only over a column: %s" (:sql node)))
    (lib/with-temporal-bucket value unit)))

;; sqlglot parses `date_trunc` as one or the other depending on the dialect; both have the same children
(defmethod ->value "TimestampTrunc" [node resolve-column] (date-trunc node resolve-column))
(defmethod ->value "DateTrunc" [node resolve-column] (date-trunc node resolve-column))

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

(defn- logical
  "`(lib-fn & operands)` over the flattened operands of `node`, so `a AND b AND c` is one `:and`."
  [lib-fn node node-class resolve-column]
  (apply lib-fn (map #(->predicate % resolve-column) (operands node node-class))))

(defmethod ->predicate "And" [node resolve-column] (logical lib/and node "And" resolve-column))
(defmethod ->predicate "Or" [node resolve-column] (logical lib/or node "Or" resolve-column))

(defn- is
  "`x IS NULL`, `x IS TRUE` or `x IS FALSE`, negated when `negate?`. `IS TRUE` is `x = true`, but `IS NOT TRUE` holds
  for a null `x` too where `x != true` is null, so the negated form is `x != b OR x IS NULL`."
  [node resolve-column negate?]
  (let [compared-to (arg node :expression)
        x           (fn [] (->value (arg node :this) resolve-column))]
    (case (:class compared-to)
      "Null"    (if negate? (lib/not-null (x)) (lib/is-null (x)))
      "Boolean" (let [b (boolean (arg compared-to :this))]
                  (if negate?
                    (lib/or (lib/!= (x) b) (lib/is-null (x)))
                    (lib/= (x) b)))
      (unsupported "%s is not supported, only IS [NOT] NULL, TRUE or FALSE" (describe node)))))

(defn- in
  "`x IN (...)`, or with `lib/not-in` as `lib-fn`, `x NOT IN (...)`."
  [node resolve-column lib-fn]
  (when (arg node :query)
    (unsupported "IN over a subquery is not supported, only over a list of values"))
  (apply lib-fn
         (->value (arg node :this) resolve-column)
         (map #(->value % resolve-column) (arg node :expressions))))

(defmethod ->predicate "Is" [node resolve-column] (is node resolve-column (boolean (arg node :negate))))
(defmethod ->predicate "In" [node resolve-column] (in node resolve-column lib/in))

(defn- unparenthesized
  "`node` with any parentheses around it removed."
  [node]
  (if (= "Paren" (:class node))
    (recur (arg node :this))
    node))

(defmethod ->predicate "Not"
  [node resolve-column]
  ;; sqlglot wraps NOT IN and NOT (x IS NULL) in a Not; Lib has clauses for both, and `NOT (x IS TRUE)` has to keep
  ;; the null semantics of IS rather than become `NOT (x = true)`
  (let [inner (unparenthesized (arg node :this))]
    (case (:class inner)
      "In" (in inner resolve-column lib/not-in)
      "Is" (is inner resolve-column (not (arg inner :negate)))
      (lib/not (->predicate inner resolve-column)))))

(defmethod ->predicate "Between"
  [node resolve-column]
  (lib/between (->value (arg node :this) resolve-column)
               (->value (arg node :low) resolve-column)
               (->value (arg node :high) resolve-column)))

(def ^:private like-simple-re
  "`%x%`, `x%`, `%x` or `x`, where `x` has no wildcards of its own; a run of `%` is one `%`."
  #"(%*)([^%_]*)(%*)")

(def ^:private like-infix-re
  "`x%y`, where neither `x` nor `y` has wildcards of its own."
  #"([^%_]+)%+([^%_]+)")

(def ^:private like-underscores-re
  "`x__`, `__x` or `__`: one literal with a run of `_` before or after it, and no `%`."
  #"([^%_]*)(_+)([^%_]*)")

(defn- like
  "`LIKE` or, `case-insensitive?`, `ILIKE` with a pattern Lib's string filters can express exactly. `%x%`, `x%` and
  `%x` are `:contains`, `:starts-with` and `:ends-with`, and a pattern with no wildcard is `:=`. `x%y` is
  `:starts-with` and `:ends-with` plus a minimum length, so that the two ends cannot overlap. A pattern of one literal
  and a run of `_` is `:starts-with` or `:ends-with` plus the exact length. Anything else, `_` in the middle of a
  literal or more than two literals, is reported."
  [node resolve-column case-insensitive?]
  (let [keyword-name (if case-insensitive? "ILIKE" "LIKE")
        pattern      (->value (arg node :expression) resolve-column)
        options      (when case-insensitive? {:case-sensitive false})
        column       #(->value (arg node :this) resolve-column)
        string-match (fn [operator body] (lib/expression-clause operator [(column) body] options))]
    (when-not (string? pattern)
      (unsupported "%s with a pattern that is not a string literal is not supported" keyword-name))
    (let [clause (b/cond
                   :let [[_ leading body trailing] (re-matches like-simple-re pattern)]
                   body
                   (cond
                     (and (seq leading) (seq trailing)) (string-match :contains body)
                     (seq leading)                      (string-match :ends-with body)
                     (seq trailing)                     (string-match :starts-with body)
                     case-insensitive?                  (unsupported "ILIKE without a wildcard is not supported")
                     :else                              (lib/= (column) body))

                   :let [[_ prefix suffix] (re-matches like-infix-re pattern)]
                   prefix
                   (lib/and (string-match :starts-with prefix)
                            (string-match :ends-with suffix)
                            (lib/>= (lib/length (column)) (+ (count prefix) (count suffix))))

                   :let [[_ prefix _ suffix] (re-matches like-underscores-re pattern)]
                   (and prefix (or (empty? prefix) (empty? suffix)))
                   (let [exact-length (lib/= (lib/length (column)) (count pattern))]
                     (cond
                       (seq prefix) (lib/and (string-match :starts-with prefix) exact-length)
                       (seq suffix) (lib/and (string-match :ends-with suffix) exact-length)
                       :else        exact-length))

                   :else
                   (unsupported "the %s pattern %s is not supported; only %%x%%, x%%, %%x, x%%y and x__ / __x are"
                                keyword-name (pr-str pattern)))]
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
