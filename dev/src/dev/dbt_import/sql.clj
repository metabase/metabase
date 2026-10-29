(ns dev.dbt-import.sql
  "Warehouse SQL snippets → Lib expressions and filter clauses: the `expr` of a measure or dimension, and the SQL
  around the references in a filter template.

  dbt leaves both as the warehouse's own SQL. [[metabase.sql-parsing.core/parse-expression]] (sqlglot) parses an
  expression on its own, without a surrounding SELECT, in the warehouse's dialect, and a subset of its tree is built
  with Lib's clause constructors: column references, literals, arithmetic, comparisons, AND/OR/NOT, IN, BETWEEN,
  IS [NOT] NULL/TRUE/FALSE, LIKE, ILIKE and SIMILAR TO patterns and regex matches (see [[like-clause]] and
  [[regex-match]]), both forms of CASE, casts to the types Lib has a conversion for (see [[cast-targets]]) and the
  functions that have a Lib expression function with the same meaning (see [[->value]]). `NULLIF(x, 0)` as a divisor
  is plain division in Metabase (see [[safe-divisor]]). Anything else is reported as unsupported, naming the
  construct.

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

(mu/defn jinja? :- :boolean
  "Does `sql` still contain Jinja (`{{`) outside its string literals? Inside one it is just text."
  [sql :- :string]
  (str/includes? (str/replace sql string-literal-re "''") "{{"))

(mu/defn- parse :- ::node
  "Parse the SQL expression `sql` in `dialect`, or throw [[unsupported]] saying why it could not be parsed."
  [dialect :- ::dialect
   sql     :- :string]
  ;; sqlglot reads `{{ ... }}` as a struct literal, so catch Jinja the filter renderer did not recognise first
  (when (jinja? sql)
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

(defn- unparenthesized
  "`node` with any parentheses around it removed."
  [node]
  (if (= "Paren" (:class node))
    (recur (arg node :this))
    node))

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

(defn- types-of
  "The types `value`, a converted operand, may have: [[lib.schema.expression/type-of]] as a set, since it returns one
  when the type is ambiguous."
  [value]
  (let [t (lib.schema.expression/type-of value)]
    (if (set? t) t #{t})))

(defn- integer-typed?
  "Is `value` known to be an integer? A column the project does not type is `:type/*`, which is not known to be one."
  [value]
  (every? #(isa? % :type/Integer) (types-of value)))

(defmethod ->value "Div"
  [node resolve-column]
  (let [dividend (->value (arg node :this) resolve-column)
        divisor  (->value (safe-divisor (arg node :expression)) resolve-column)]
    ;; sqlglot marks a `/` whose meaning depends on its operands' types as `typed`: on Postgres, SQL Server, Redshift,
    ;; Presto and SQLite an integer divided by an integer is truncated to an integer, where Metabase's `/` divides as
    ;; floats, so the number would silently differ. MySQL, Snowflake, BigQuery and Oracle divide as decimals, as
    ;; Metabase does, and are not marked.
    (when (and (arg node :typed) (integer-typed? dividend) (integer-typed? divisor))
      (unsupported (str "%s divides an integer by an integer, which the warehouse truncates to a whole number and"
                        " Metabase does not; cast an operand to a decimal or float")
                   (:sql node)))
    (lib// dividend divisor)))

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

(defn- boolean-typed?
  "Can `value` be a boolean: is its type `:type/Boolean`, or unknown (`:type/*`, a column the project does not type),
  which is trusted?"
  [value]
  (boolean (some #(or (= % :type/*) (isa? % :type/Boolean)) (types-of value))))

(defmethod ->predicate "Column"
  [node resolve-column]
  ;; a bare column in a boolean position is a boolean column, `WHERE is_returned`; one the project types as anything
  ;; else cannot be, and the warehouse would reject it where Lib's `[:= x true]` would run
  (let [value (->value node resolve-column)]
    (when-not (boolean-typed? value)
      (unsupported "%s is not a boolean column, so it cannot stand alone as a condition" (:sql node)))
    (lib/= value true)))

(defn- without-null-operands
  "Report comparison `node` when any of its operand `nodes` is the literal `NULL`. In SQL a comparison against NULL
  is null, so never true; the Lib clause it would convert to treats a nil operand as a null check (`[:= x nil]` is
  `x IS NULL`) and matches the null rows instead."
  [node nodes]
  (when (some #(= "Null" (:class (unparenthesized %))) nodes)
    (unsupported "%s compares against NULL, which is never true in SQL; use IS [NOT] NULL" (describe node))))

(defn- comparison
  "`(lib-fn left right)` over the operands of comparison `node`, neither of which may be `NULL` (see
  [[without-null-operands]])."
  [lib-fn node resolve-column]
  (without-null-operands node [(arg node :this) (arg node :expression)])
  (binary lib-fn node resolve-column ->value))

(defmethod ->predicate "EQ" [node resolve-column] (comparison lib/= node resolve-column))
(defmethod ->predicate "NEQ" [node resolve-column] (comparison lib/!= node resolve-column))
(defmethod ->predicate "GT" [node resolve-column] (comparison lib/> node resolve-column))
(defmethod ->predicate "GTE" [node resolve-column] (comparison lib/>= node resolve-column))
(defmethod ->predicate "LT" [node resolve-column] (comparison lib/< node resolve-column))
(defmethod ->predicate "LTE" [node resolve-column] (comparison lib/<= node resolve-column))

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
  (without-null-operands node (cons (arg node :this) (arg node :expressions)))
  (apply lib-fn
         (->value (arg node :this) resolve-column)
         (map #(->value % resolve-column) (arg node :expressions))))

(defmethod ->predicate "Is" [node resolve-column] (is node resolve-column (boolean (arg node :negate))))
(defmethod ->predicate "In" [node resolve-column] (in node resolve-column lib/in))

(defn- null-safe-comparison
  "`a IS NOT DISTINCT FROM b`, or `a IS DISTINCT FROM b` when `distinct?`: equality that treats two nulls as the same
  and a null against a value as different, and is never null itself. Against a literal it is the `=` or `!=` Lib has:
  `=` is null, so false in a filter, for a null column, and Metabase compiles `!=` on a column to include the nulls.
  Between two columns (or expressions) it is spelled out over `IS NULL` checks with every branch two-valued, which
  runs on any warehouse where `IS DISTINCT FROM` or a boolean `COALESCE` would not."
  [node resolve-column distinct?]
  ;; a value is converted afresh each time it appears in the clause, so that no two refs share a uuid
  (let [a #(->value (arg node :this) resolve-column)
        b #(->value (arg node :expression) resolve-column)
        [column literal] (cond
                           (and (lib/clause? (a)) (lib/clause? (b))) nil
                           (lib/clause? (a))                          [a (b)]
                           (lib/clause? (b))                          [b (a)]
                           :else (unsupported "%s compares two literals" (describe node)))]
    (cond
      (and column (nil? literal))
      (if distinct? (lib/not-null (column)) (lib/is-null (column)))

      column
      (if distinct?
        ;; `!=` on a column already includes the nulls; on an expression it does not, so say so
        (if (lib/clause-of-type? (column) :field)
          (lib/!= (column) literal)
          (lib/or (lib/!= (column) literal) (lib/is-null (column))))
        (lib/= (column) literal))

      distinct?
      (lib/or (lib/and (lib/not-null (a)) (lib/not-null (b)) (lib/!= (a) (b)))
              (lib/and (lib/is-null (a)) (lib/not-null (b)))
              (lib/and (lib/not-null (a)) (lib/is-null (b))))

      :else
      (lib/or (lib/and (lib/not-null (a)) (lib/not-null (b)) (lib/= (a) (b)))
              (lib/and (lib/is-null (a)) (lib/is-null (b)))))))

(defmethod ->predicate "NullSafeEQ" [node resolve-column] (null-safe-comparison node resolve-column false))
(defmethod ->predicate "NullSafeNEQ" [node resolve-column] (null-safe-comparison node resolve-column true))

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
  (without-null-operands node [(arg node :this) (arg node :low) (arg node :high)])
  (lib/between (->value (arg node :this) resolve-column)
               (->value (arg node :low) resolve-column)
               (->value (arg node :high) resolve-column)))

;;; patterns and regular expressions

(def ^:private regex-metacharacters
  "The characters a backslash makes literal in a POSIX regular expression."
  (set "\\^$.|?*+()[]{}"))

(defn- regex-quote
  "`s` as a regular expression matching exactly `s`. Not `Pattern/quote`: its `\\Q...\\E` is Java's, not the
  warehouse's."
  [s]
  (str/join (map (fn [c] (if (regex-metacharacters c) (str "\\" c) c)) s)))

(defn- regex-match
  "`value` matches `regex`, as a filter clause. Lib has no regex filter, but the first match `regex-match-first`
  finds is null exactly when the regex does not match, so the filter is that match being not null. The regex is wrapped
  in a group of its own, because a group inside it would make the match that group's, which can be null even when the
  regex matches (`(a)|b` against `b`); `(?i)` makes it case-insensitive. Needs the warehouse driver to support
  regular expressions."
  [value regex case-insensitive?]
  (lib/not-null (lib/regex-match-first value (str (when case-insensitive? "(?i)") "(" regex ")"))))

(defn- like-tokens
  "The `LIKE` `pattern` as tokens: a literal string, `:any` for `%` (a run of `%` is one), `:one` for `_`. The
  character `escape` (nil for none) makes the character after it literal."
  [pattern escape]
  (loop [[c & more :as chars] (seq pattern)
         literal              (StringBuilder.)
         tokens               []]
    (let [flush-literal (fn [] (cond-> tokens (pos? (.length literal)) (conj (str literal))))]
      (cond
        (empty? chars)
        (flush-literal)

        (= c escape)
        (do (when (empty? more)
              (unsupported "the pattern %s ends with its escape character" (pr-str pattern)))
            (recur (rest more) (.append literal (char (first more))) tokens))

        (= c \%)
        (recur more (StringBuilder.) (let [tokens (flush-literal)]
                                       (cond-> tokens (not= :any (peek tokens)) (conj :any))))

        (= c \_)
        (recur more (StringBuilder.) (conj (flush-literal) :one))

        :else
        (recur more (.append literal (char c)) tokens)))))

(defn- like-regex
  "The regular expression equivalent to the `LIKE` pattern `tokens`, anchored at both ends; `transform-literal`
  (identity, or lower-case) is applied to each literal."
  [tokens transform-literal]
  (str "^"
       (str/join (map (fn [token]
                        (case token
                          :any ".*"
                          :one "."
                          (regex-quote (transform-literal token))))
                      tokens))
       "$"))

(defn- like-clause
  "The filter clause for `value` matching the `LIKE` pattern `tokens`, or `ILIKE` when `case-insensitive?`. Where
  Lib's string filters express the pattern exactly they are used, since they read as what was written and run on any
  warehouse: `%x%`, `x%` and `%x` are `:contains`, `:starts-with` and `:ends-with`, `x%y` adds a minimum `length` so
  that the two ends cannot overlap, and one literal with a run of `_` pins the exact `length`. A pattern with no
  wildcard is `=`, over `lower` for `ILIKE`. Anything else is the equivalent regular expression (see [[regex-match]]),
  over `lower` with lower-cased literals for `ILIKE`, so that it does not depend on the warehouse's regex flags."
  [value tokens case-insensitive?]
  (let [options      (when case-insensitive? {:case-sensitive false})
        string-match (fn [operator body] (lib/expression-clause operator [(value) body] options))
        length       (fn [] (lib/length (value)))
        literal?     string?
        ones         (fn [tokens] (when (and (seq tokens) (every? #{:one} tokens)) (count tokens)))
        lower-case   (if case-insensitive? u/lower-case-en identity)]
    (b/cond
      (empty? tokens)
      (lib/= (value) "")

      :let [[a b c] tokens]

      (and (= 1 (count tokens)) (literal? a))
      (if case-insensitive? (lib/= (lib/lower (value)) (lower-case a)) (lib/= (value) a))

      (= [:any] tokens)
      (lib/not-null (value))

      (and (= 3 (count tokens)) (= :any a) (literal? b) (= :any c))
      (string-match :contains b)

      (and (= 2 (count tokens)) (literal? a) (= :any b))
      (string-match :starts-with a)

      (and (= 2 (count tokens)) (= :any a) (literal? b))
      (string-match :ends-with b)

      (and (= 3 (count tokens)) (literal? a) (= :any b) (literal? c))
      (lib/and (string-match :starts-with a)
               (string-match :ends-with c)
               (lib/>= (length) (+ (count a) (count c))))

      :let [[first-token & more] tokens
            n-ones               (ones tokens)]

      n-ones
      (lib/= (length) n-ones)

      :let [n-ones (and (literal? first-token) (ones more))]

      n-ones
      (lib/and (string-match :starts-with first-token) (lib/= (length) (+ (count first-token) n-ones)))

      :let [n-ones (and (literal? (peek tokens)) (ones (pop tokens)))]

      n-ones
      (lib/and (string-match :ends-with (peek tokens)) (lib/= (length) (+ (count (peek tokens)) n-ones)))

      :else
      (regex-match (if case-insensitive? (lib/lower (value)) (value)) (like-regex tokens lower-case) false))))

(defn- pattern-literal
  "The string literal the pattern of `node` (a `LIKE`, `ILIKE` or `SIMILAR TO`) is, or [[unsupported]]: a pattern
  that is a column or an expression has no Lib equivalent."
  [node resolve-column keyword-name]
  (let [pattern (->value (arg node :expression) resolve-column)]
    (when-not (string? pattern)
      (unsupported "%s with a pattern that is not a string literal is not supported" keyword-name))
    pattern))

(defn- like
  "`LIKE` or, `case-insensitive?`, `ILIKE`, with `escape` as the pattern's escape character (nil for none); see
  [[like-clause]]."
  [node resolve-column case-insensitive? escape]
  (let [pattern (pattern-literal node resolve-column (if case-insensitive? "ILIKE" "LIKE"))
        clause  (like-clause #(->value (arg node :this) resolve-column) (like-tokens pattern escape) case-insensitive?)]
    (if (arg node :negate) (lib/not clause) clause)))

(defmethod ->predicate "Like" [node resolve-column] (like node resolve-column false nil))
(defmethod ->predicate "ILike" [node resolve-column] (like node resolve-column true nil))

(defn- similar-to-regex
  "The POSIX regular expression for the SQL-standard one of `SIMILAR TO`: `%` is `.*`, `_` is `.`, `.` is a literal
  (outside a bracket expression), `escape` makes the next character literal, and the rest (`|`, `*`, `+`, `?`, `{}`,
  `()`, `[]`) is the same in both. Anchored at both ends, as `SIMILAR TO` matches the whole string."
  [pattern escape]
  (loop [[c & more :as chars] (seq pattern)
         in-bracket?          false
         out                  (StringBuilder. "^")]
    (cond
      (empty? chars)
      (str (.append out "$"))

      (and (= c escape) (not in-bracket?))
      (do (when (empty? more)
            (unsupported "the pattern %s ends with its escape character" (pr-str pattern)))
          (recur (rest more) in-bracket? (.append out (regex-quote (str (first more))))))

      in-bracket?
      (recur more (not= c \]) (.append out (char c)))

      :else
      (recur more (= c \[) (.append out (case c
                                          \% ".*"
                                          \_ "."
                                          \. "\\."
                                          (str c)))))))

(defn- similar-to
  "`SIMILAR TO`, with `escape` as its escape character (SQL's default is a backslash), as a regex match."
  [node resolve-column escape]
  (regex-match (->value (arg node :this) resolve-column)
               (similar-to-regex (pattern-literal node resolve-column "SIMILAR TO") escape)
               false))

(defmethod ->predicate "SimilarTo" [node resolve-column] (similar-to node resolve-column \\))

(defmethod ->predicate "Escape"
  [node resolve-column]
  ;; `x LIKE 'a!%' ESCAPE '!'`: the escape character wraps the pattern operator
  (let [escape-string (->value (arg node :expression) resolve-column)
        inner         (arg node :this)]
    (when-not (and (string? escape-string) (= 1 (count escape-string)))
      (unsupported "ESCAPE %s is not supported, only a one-character string literal is" (:sql (arg node :expression))))
    (let [escape (first escape-string)]
      (case (:class inner)
        "Like"      (like inner resolve-column false escape)
        "ILike"     (like inner resolve-column true escape)
        "SimilarTo" (similar-to inner resolve-column escape)
        (unsupported "%s is not supported as a condition" (describe node))))))

(defn- regexp-like
  "`x ~ 'regex'` (`regexp_like(x, 'regex')`), or `x ~* 'regex'` when `case-insensitive?`, as a regex match."
  [node resolve-column case-insensitive?]
  (regex-match (->value (arg node :this) resolve-column)
               (pattern-literal node resolve-column (if case-insensitive? "~*" "~"))
               case-insensitive?))

(defmethod ->predicate "RegexpLike" [node resolve-column] (regexp-like node resolve-column false))
(defmethod ->predicate "RegexpILike" [node resolve-column] (regexp-like node resolve-column true))

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
  'grain')`, `Entity('name')` or `Metric('name', ...)`. `:grain` is the second argument of a `TimeDimension`, or the
  argument of a `.grain('month')` chained onto the reference, which means the same. `:arguments` is whatever followed
  the quoted arguments, `entity_path=['order']` or `group_by=['customer']`, as written; `:methods` is every other
  method call chained onto the reference, `.date_part('month')`, as written; both nil when there was none."
  [:map
   [:kind      [:enum :dimension :time-dimension :entity :metric]]
   [:name      :string]
   [:grain     [:maybe :string]]
   [:arguments [:maybe :string]]
   [:methods   [:maybe :string]]])

(mr/def ::rendered-filter
  "A filter template with its references replaced by placeholder identifiers, and what each placeholder stood for."
  [:map
   [:sql        :string]
   [:references [:map-of :string ::reference]]])

(def ^:private reference-re
  "`{{ Dimension('order__status') }}`, `{{ TimeDimension('metric_time', 'day') }}`, `{{ Entity('customer') }}`,
  `{{ Metric('revenue', group_by=['customer']) }}`, `{{ Dimension('order__ordered_at').grain('month') }}`: the
  object, its quoted first argument, an optional quoted second argument, whatever else precedes the closing
  parenthesis, and the method calls chained onto it."
  #"\{\{\s*(Dimension|TimeDimension|Entity|Metric)\(\s*(?:'([^']*)'|\"([^\"]*)\")\s*(?:,\s*(?:'([^']*)'|\"([^\"]*)\"))?([^)]*)\)((?:\s*\.\s*\w+\([^)]*\))*)\s*\}\}")

(def ^:private method-re
  "One `.name(arguments)` call chained onto a reference."
  #"\.\s*(\w+)\(([^)]*)\)")

(defn- extra-arguments
  "`remainder`, what a reference had after its quoted arguments, without the comma that separated it from them; nil
  when there was nothing but whitespace."
  [remainder]
  (not-empty (str/replace (str/trim remainder) #"^,\s*" "")))

(mu/defn- chained-methods :- [:map {:closed true}
                              [:grain   [:maybe :string]]
                              [:methods [:maybe :string]]]
  "What the method calls chained onto a reference, `chain`, say: `.grain('month')` names the grain (the last one wins),
  and anything else is `:methods`, as written, for the resolver to report."
  [chain :- :string]
  (reduce (fn [acc [call method-name arguments]]
            (if-let [grain (when (= method-name "grain")
                             (let [[_ single-quoted double-quoted] (re-matches #"\s*(?:'([^']*)'|\"([^\"]*)\")\s*" arguments)]
                               (or single-quoted double-quoted)))]
              (assoc acc :grain grain)
              (update acc :methods str (str/replace call #"\s+" ""))))
          {:grain nil, :methods nil}
          (re-seq method-re chain)))

(def ^:private reference-kinds
  {"Dimension"     :dimension
   "TimeDimension" :time-dimension
   "Entity"        :entity
   "Metric"        :metric})

(mu/defn render-filter :- ::rendered-filter
  "Replace each MetricFlow reference in the filter `template` with a placeholder identifier, so the rest parses as SQL
  with [[condition->mbql]], whose column callback then sees the placeholders as column names. `:references` says what
  each placeholder stood for, arguments the converter does not read included, for the resolver to report. Jinja the
  regex does not recognise is left alone and fails to parse."
  [template :- :string]
  (let [references (volatile! (transient {}))
        sql        (str/replace template reference-re
                                (fn [[_ object single-1 double-1 single-2 double-2 remainder chain]]
                                  (let [placeholder     (format "__dbt_ref_%d__" (count @references))
                                        {:keys [grain methods]} (chained-methods chain)]
                                    (vswap! references assoc! placeholder {:kind      (reference-kinds object)
                                                                           :name      (or single-1 double-1)
                                                                           :grain     (or grain single-2 double-2)
                                                                           :arguments (extra-arguments remainder)
                                                                           :methods   methods})
                                    placeholder)))]
    {:sql        sql
     :references (persistent! @references)}))
