(ns dev.dbt-import.sql
  "Warehouse SQL snippets → Lib expressions and filter clauses: the `expr` of a measure or dimension, and the SQL
  around the references in a filter template.

  dbt leaves both as the warehouse's own SQL. [[metabase.sql-parsing.core/parse-expression]] (sqlglot) parses an
  expression on its own, without a surrounding SELECT, in the warehouse's dialect, and a subset of its tree is built
  with Lib's clause constructors: column references, literals, arithmetic, comparisons, AND/OR/NOT, IN, BETWEEN,
  IS [NOT] NULL/TRUE/FALSE, LIKE, ILIKE and SIMILAR TO patterns and regex matches (see [[like-clause]] and
  [[regex-match]]), both forms of CASE, casts to the types Lib has a conversion for (see [[cast-targets]]) and the
  functions that have a Lib expression function with the same meaning. Each sqlglot node class the subset covers has
  a converter in [[value-converters]], for a node used as a value, or [[predicate-converters]], for one used where a
  boolean is expected; [[->value]] and [[->predicate]] dispatch on the class. `NULLIF(x, 0)` as a divisor is plain
  division in Metabase (see [[safe-divisor]]). Anything else is reported as unsupported, naming the construct.

  Column references are resolved through a callback, so this namespace knows nothing about semantic models or
  Metabase metadata. Unsupported constructs are thrown with [[unsupported/throw!]], which the resolve stage turns
  into a report entry."
  (:require
   [better-cond.core :as b]
   [clojure.string :as str]
   [dev.dbt-import.unsupported :as unsupported]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::value
  "What a SQL value expression converts to: a Lib expression, or a literal, nil for `NULL`."
  ::lib.schema.expression/expression)

(mr/def ::condition
  "What a SQL condition converts to: a Lib filter clause."
  ::lib.schema.expression/boolean)

(mr/def ::resolve-column
  "Callback turning a column name as written in the SQL (unquoted, unqualified) into the Lib ref that refers to it."
  ifn?)

(mr/def ::dialect
  "A sqlglot dialect name, or nil for sqlglot's default."
  [:maybe :string])

(mr/def ::node
  "A node of the tree [[metabase.sql-parsing.core/parse-expression]] returns."
  [:map {:closed true}
   [:class :string]
   [:sql   :string]
   [:args  [:map-of {::mr/deliberately-open true, :description "sqlglot's named children, of any shape"}
            :keyword :any]]
   [:func  {:optional true} :string]])

(mr/def ::converter
  "A function of a node and the column callback that converts the node, see [[value-converters]] and
  [[predicate-converters]]."
  ifn?)

(def ^:private string-literal-re
  "A single-quoted SQL string, with doubled quotes inside it."
  #"'(?:[^']|'')*'")

(mu/defn jinja? :- :boolean
  "Does `sql` still contain Jinja (`{{`) outside its string literals? Inside one it is just text."
  [sql :- :string]
  (str/includes? (str/replace sql string-literal-re "''") "{{"))

(mu/defn- parse :- ::node
  "Parse the SQL expression `sql` in `dialect`, or throw [[unsupported/throw!]] saying why it could not be parsed."
  [dialect :- ::dialect
   sql     :- :string]
  ;; sqlglot reads `{{ ... }}` as a struct literal, so catch Jinja the filter renderer did not recognise first
  (when (jinja? sql)
    (unsupported/throw! "could not parse %s: it still contains Jinja" (pr-str sql)))
  (try
    (sql-parsing/parse-expression dialect sql)
    (catch Exception e
      (if (sql-parsing/parse-error? e)
        (unsupported/throw! "could not parse %s: %s"
                            (pr-str sql) (first (str/split-lines (str (sql-parsing/parse-error-message e)))))
        (throw e)))))

(mu/defn- arg :- :any
  "The child `k` of `node`: a node, a vector of nodes, a string, a boolean or a number; nil when there is none."
  [node :- ::node
   k    :- :keyword]
  (get-in node [:args k]))

(mu/defn- describe :- :string
  "`node` for an unsupported message: its SQL and the kind of node it is."
  [node :- ::node]
  (format "%s (%s)" (:sql node) (:class node)))

(mu/defn- unparenthesized :- ::node
  "`node` with any parentheses around it removed."
  [node :- ::node]
  (loop [node node]
    (if (= "Paren" (:class node))
      (recur (arg node :this))
      node)))

(declare ->value ->predicate)

(mu/defn- parse-number :- number?
  "The number a SQL numeric literal `s` is: a long when it fits one, otherwise a double."
  [s :- :string]
  (or (parse-long s) (parse-double s)))

(mu/defn- literal-number :- [:maybe number?]
  "The number `node` is, when it is a numeric literal; nil otherwise."
  [node :- ::node]
  (when (and (= "Literal" (:class node)) (not (arg node :is_string)))
    (parse-number (arg node :this))))

(mu/defn- column->value :- ::value
  "A column reference, as the callback resolves it. The table qualifier, if any, is dropped: a metric has one table."
  [node           :- ::node
   resolve-column :- ::resolve-column]
  (resolve-column (arg (arg node :this) :this)))

(mu/defn- literal->value :- [:or :string number?]
  "A string literal as the string, a numeric literal as the number."
  [node            :- ::node
   _resolve-column :- ::resolve-column]
  (let [text (arg node :this)]
    (if (arg node :is_string)
      text
      (parse-number text))))

(mu/defn- negation->value :- ::value
  "Unary minus: of a numeric literal, the negative number; of anything else, `0 - x`."
  [node           :- ::node
   resolve-column :- ::resolve-column]
  (let [value (->value (arg node :this) resolve-column)]
    (if (number? value)
      (- value)
      (lib/- 0 value))))

(mu/defn- binary-value :- ::value
  "`(lib-fn left right)` over the two operands of `node`, converted as values."
  [lib-fn         :- ifn?
   node           :- ::node
   resolve-column :- ::resolve-column]
  (lib-fn (->value (arg node :this) resolve-column) (->value (arg node :expression) resolve-column)))

(mu/defn- arithmetic :- ::converter
  "The converter for a binary operator node: `(lib-fn left right)`."
  [lib-fn :- ifn?]
  (fn [node resolve-column]
    (binary-value lib-fn node resolve-column)))

(mu/defn- unary :- ::converter
  "The converter for a one-argument function node: `(lib-fn x)`."
  [lib-fn :- ifn?]
  (fn [node resolve-column]
    (lib-fn (->value (arg node :this) resolve-column))))

(mu/defn- safe-divisor :- ::node
  "The divisor of `x / NULLIF(y, 0)` is just `y`: Metabase's `/` already turns a zero divisor into NULL (see
  [[metabase.driver.sql.query-processor/safe-denominator]]), so the idiom adds nothing. Any other divisor is
  returned as it is."
  [divisor :- ::node]
  (let [compared-to (arg divisor :expression)]
    (if (and (= "Nullif" (:class divisor))
             (= "Literal" (:class compared-to))
             (not (arg compared-to :is_string))
             (zero? (parse-number (arg compared-to :this))))
      (arg divisor :this)
      divisor)))

(mu/defn- types-of :- [:set :keyword]
  "The types `value`, a converted operand, may have: [[lib.schema.expression/type-of]] as a set, since it returns one
  when the type is ambiguous."
  [value :- ::value]
  (let [t (lib.schema.expression/type-of value)]
    (if (set? t) t #{t})))

(mu/defn- integer-typed? :- :boolean
  "Is `value` known to be an integer? A column the project does not type is `:type/*`, which is not known to be one."
  [value :- ::value]
  (every? #(isa? % :type/Integer) (types-of value)))

(mu/defn- division->value :- ::value
  "`x / y`. [[unsupported/throw!]] when sqlglot marks the division `typed` and both operands are known integers: on
  Postgres, SQL Server, Redshift, Presto and SQLite an integer divided by an integer is truncated to an integer, where
  Metabase's `/` divides as floats, so the number would silently differ. MySQL, Snowflake, BigQuery and Oracle divide
  as decimals, as Metabase does, and are not marked. A `NULLIF(y, 0)` divisor is `y` (see [[safe-divisor]])."
  [node           :- ::node
   resolve-column :- ::resolve-column]
  (let [dividend (->value (arg node :this) resolve-column)
        divisor  (->value (safe-divisor (arg node :expression)) resolve-column)]
    (when (and (arg node :typed) (integer-typed? dividend) (integer-typed? divisor))
      (unsupported/throw! (str "%s divides an integer by an integer, which the warehouse truncates to a whole number"
                               " and Metabase does not; cast an operand to a decimal or float")
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

(mu/defn- cast->value :- ::value
  "`CAST(x AS type)` or `x::type`, as the Lib conversion for the type (see [[cast-targets]])."
  [node           :- ::node
   resolve-column :- ::resolve-column]
  (let [target (arg (arg node :to) :this)]
    (if-let [cast-fn (get cast-targets target)]
      (cast-fn (->value (arg node :this) resolve-column))
      (unsupported/throw! "a cast to %s, %s, is not supported" target (:sql node)))))

(mu/defn- case->value :- ::value
  "Both forms of `CASE`. The simple form, `CASE x WHEN v THEN ...`, is the searched form with `x = v` as each
  condition; `x` is converted once per branch so that each branch gets a column ref of its own."
  [node           :- ::node
   resolve-column :- ::resolve-column]
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

(mu/defn- log->value :- ::value
  "`log(x)` or `log(10, x)`. Metabase's `log` is base 10, as a one-argument SQL `log` is (`ln` is the natural log and
  does not map); any other base is [[unsupported/throw!]]."
  [node           :- ::node
   resolve-column :- ::resolve-column]
  (let [base-node (when (arg node :expression) (arg node :this))
        x-node    (or (arg node :expression) (arg node :this))]
    (when (and base-node (not= 10 (literal-number base-node)))
      (unsupported/throw! "log to a base other than 10 is not supported: %s" (:sql node)))
    (lib/log (->value x-node resolve-column))))

(mu/defn- round->value :- ::value
  "`round(x)`, or `round(x, n)` as `round(x * 10^n) / 10^n`, since Metabase rounds to a whole number only; `n` has to
  be a literal."
  [node           :- ::node
   resolve-column :- ::resolve-column]
  (let [x        (->value (arg node :this) resolve-column)
        decimals (when-let [decimals-node (arg node :decimals)]
                   (let [n (literal-number decimals-node)]
                     (when-not (and (integer? n) (not (neg? n)))
                       (unsupported/throw! "round to %s decimals is not supported; only a literal number of decimals is"
                                           (:sql decimals-node)))
                     n))]
    (if (or (nil? decimals) (zero? decimals))
      (lib/round x)
      (let [scale (long (Math/pow 10.0 (double decimals)))]
        (lib// (lib/round (lib/* x scale)) scale)))))

(mu/defn- coalesce->value :- ::value
  "`coalesce(x, ...)`; of one argument, just that argument."
  [node           :- ::node
   resolve-column :- ::resolve-column]
  (let [values (map #(->value % resolve-column) (cons (arg node :this) (arg node :expressions)))]
    (if (next values)
      (apply lib/coalesce values)
      (first values))))

(mu/defn- nullif->value :- ::value
  "`NULLIF(x, y)` is `CASE WHEN x = y THEN NULL ELSE x END`; `x` is converted twice so that each use has its own ref."
  [node           :- ::node
   resolve-column :- ::resolve-column]
  (lib/case [[(binary-value lib/= node resolve-column) nil]]
            (->value (arg node :this) resolve-column)))

(mu/defn- trim->value :- ::value
  "`trim`, `ltrim` and `rtrim`, of spaces only."
  [node           :- ::node
   resolve-column :- ::resolve-column]
  (let [characters (arg node :expression)]
    (when (and characters (not= " " (->value characters resolve-column)))
      (unsupported/throw! "TRIM of characters other than spaces is not supported: %s" (:sql node)))
    ((unary (case (arg node :position)
              "LEADING"  lib/ltrim
              "TRAILING" lib/rtrim
              lib/trim))
     node resolve-column)))

(mu/defn- replace->value :- ::value
  "`replace(x, from, to)`."
  [node           :- ::node
   resolve-column :- ::resolve-column]
  (when-not (arg node :replacement)
    (unsupported/throw! "REPLACE without a replacement is not supported: %s" (:sql node)))
  (lib/replace (->value (arg node :this) resolve-column)
               (->value (arg node :expression) resolve-column)
               (->value (arg node :replacement) resolve-column)))

(mu/defn- substring->value :- ::value
  "`substring(x, start)` or `substring(x, start, length)`, with the same 1-based start and optional length as SQL."
  [node           :- ::node
   resolve-column :- ::resolve-column]
  (lib/expression-clause :substring
                         (into [(->value (arg node :this) resolve-column)
                                (->value (arg node :start) resolve-column)]
                               (when-let [length (arg node :length)]
                                 [(->value length resolve-column)]))
                         nil))

(mu/defn- operands :- [:sequential ::node]
  "The operands of a chain of `node-class` operators, `a AND b AND c`, flattened."
  [node       :- ::node
   node-class :- :string]
  (if (= node-class (:class node))
    (mapcat #(operands % node-class) [(arg node :this) (arg node :expression)])
    [node]))

(mu/defn- concatenate :- ::value
  "`concat` over the converted `nodes`; of one, just that one."
  [nodes          :- [:sequential ::node]
   resolve-column :- ::resolve-column]
  (let [values (map #(->value % resolve-column) nodes)]
    (if (next values)
      (apply lib/concat values)
      (first values))))

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

(mu/defn- extract->value :- ::value
  "`EXTRACT(part FROM x)` and `date_part('part', x)`, for the parts in [[extract-parts]]."
  [node           :- ::node
   resolve-column :- ::resolve-column]
  (let [part (arg (arg node :this) :this)]
    (if-let [get-part (get extract-parts part)]
      (get-part (->value (arg node :expression) resolve-column))
      (unsupported/throw! "extracting %s from a date is not supported" part))))

(def ^:private truncation-units
  "The units `date_trunc('unit', x)` takes, as sqlglot spells them, that are Metabase temporal units."
  {"MINUTE"  :minute
   "HOUR"    :hour
   "DAY"     :day
   "WEEK"    :week
   "MONTH"   :month
   "QUARTER" :quarter
   "YEAR"    :year})

(mu/defn- date-trunc->value :- ::value
  "`date_trunc('unit', column)` as the column bucketed by that temporal unit. Metabase truncates a column by bucketing
  its ref, so there is nothing to bucket when the argument is an expression rather than a column. sqlglot parses
  `date_trunc` as a `TimestampTrunc` or a `DateTrunc` depending on the dialect; both have the same children."
  [node           :- ::node
   resolve-column :- ::resolve-column]
  (let [unit-name (arg (arg node :unit) :this)
        unit      (get truncation-units unit-name)
        value     (->value (arg node :this) resolve-column)]
    (when-not unit
      (unsupported/throw! "truncating a date to %s is not supported" unit-name))
    (when-not (lib/clause-of-type? value :field)
      (unsupported/throw! "date_trunc over an expression is not supported, only over a column: %s" (:sql node)))
    (lib/with-temporal-bucket value unit)))

(mu/defn- boolean-typed? :- :boolean
  "Can `value` be a boolean: is its type `:type/Boolean`, or unknown (`:type/*`, a column the project does not type),
  which is trusted?"
  [value :- ::value]
  (boolean (some #(or (= % :type/*) (isa? % :type/Boolean)) (types-of value))))

(mu/defn- column->predicate :- ::condition
  "A bare column in a boolean position is a boolean column, `WHERE is_returned`, as `column = true`. One the project
  types as anything else cannot be, and the warehouse would reject it where Lib's `[:= x true]` would run, so it is
  [[unsupported/throw!]]."
  [node           :- ::node
   resolve-column :- ::resolve-column]
  (let [value (->value node resolve-column)]
    (when-not (boolean-typed? value)
      (unsupported/throw! "%s is not a boolean column, so it cannot stand alone as a condition" (:sql node)))
    (lib/= value true)))

(mu/defn- without-null-operands :- :nil
  "[[unsupported/throw!]] for the comparison `node` when any of its operand `nodes` is the literal `NULL`. In SQL a
  comparison against NULL is null, so never true; the Lib clause it would convert to treats a nil operand as a null
  check (`[:= x nil]` is `x IS NULL`) and matches the null rows instead."
  [node  :- ::node
   nodes :- [:sequential ::node]]
  (when (some #(= "Null" (:class (unparenthesized %))) nodes)
    (unsupported/throw! "%s compares against NULL, which is never true in SQL; use IS [NOT] NULL" (describe node))))

(mu/defn- comparison :- ::converter
  "The converter for a comparison node: `(lib-fn left right)` over its operands, neither of which may be `NULL` (see
  [[without-null-operands]])."
  [lib-fn :- ifn?]
  (fn [node resolve-column]
    (without-null-operands node [(arg node :this) (arg node :expression)])
    (binary-value lib-fn node resolve-column)))

(mu/defn- logical :- ::converter
  "The converter for an `AND` or `OR` node, `node-class`: `(lib-fn & operands)` over its flattened operands, so
  `a AND b AND c` is one `:and`."
  [lib-fn     :- ifn?
   node-class :- :string]
  (fn [node resolve-column]
    (apply lib-fn (map #(->predicate % resolve-column) (operands node node-class)))))

(mu/defn- is :- ::condition
  "`x IS NULL`, `x IS TRUE` or `x IS FALSE`, negated when `negate?`. `IS TRUE` is `x = true`, but `IS NOT TRUE` holds
  for a null `x` too where `x != true` is null, so the negated form is `x != b OR x IS NULL`."
  [node           :- ::node
   resolve-column :- ::resolve-column
   negate?        :- :boolean]
  (let [compared-to (arg node :expression)
        x           (fn [] (->value (arg node :this) resolve-column))]
    (case (:class compared-to)
      "Null"    (if negate? (lib/not-null (x)) (lib/is-null (x)))
      "Boolean" (let [b (boolean (arg compared-to :this))]
                  (if negate?
                    (lib/or (lib/!= (x) b) (lib/is-null (x)))
                    (lib/= (x) b)))
      (unsupported/throw! "%s is not supported, only IS [NOT] NULL, TRUE or FALSE" (describe node)))))

(mu/defn- in :- ::condition
  "`x IN (...)`, or with [[lib/not-in]] as `lib-fn`, `x NOT IN (...)`. Only over a list of values, none of them `NULL`
  (see [[without-null-operands]])."
  [node           :- ::node
   resolve-column :- ::resolve-column
   lib-fn         :- ifn?]
  (when (arg node :query)
    (unsupported/throw! "IN over a subquery is not supported, only over a list of values"))
  (without-null-operands node (cons (arg node :this) (arg node :expressions)))
  (apply lib-fn
         (->value (arg node :this) resolve-column)
         (map #(->value % resolve-column) (arg node :expressions))))

(mu/defn- null-safe-comparison :- ::condition
  "`a IS NOT DISTINCT FROM b`, or `a IS DISTINCT FROM b` when `distinct-from?`: equality that treats two nulls as the
  same and a null against a value as different, and is never null itself. Against a literal it is the `=` or `!=` Lib
  has: `=` is null, so false in a filter, for a null column, and Metabase compiles `!=` on a column to include the
  nulls. Between two columns (or expressions) it is spelled out over `IS NULL` checks with every branch two-valued,
  which runs on any warehouse where `IS DISTINCT FROM` or a boolean `COALESCE` would not."
  [node           :- ::node
   resolve-column :- ::resolve-column
   distinct-from? :- :boolean]
  ;; a value is converted afresh each time it appears in the clause, so that no two refs share a uuid
  (let [a #(->value (arg node :this) resolve-column)
        b #(->value (arg node :expression) resolve-column)
        [column literal] (cond
                           (and (lib/clause? (a)) (lib/clause? (b))) nil
                           (lib/clause? (a))                          [a (b)]
                           (lib/clause? (b))                          [b (a)]
                           :else (unsupported/throw! "%s compares two literals" (describe node)))]
    (cond
      (and column (nil? literal))
      (if distinct-from? (lib/not-null (column)) (lib/is-null (column)))

      column
      (if distinct-from?
        ;; `!=` on a column already includes the nulls; on an expression it does not, so say so
        (if (lib/clause-of-type? (column) :field)
          (lib/!= (column) literal)
          (lib/or (lib/!= (column) literal) (lib/is-null (column))))
        (lib/= (column) literal))

      distinct-from?
      (lib/or (lib/and (lib/not-null (a)) (lib/not-null (b)) (lib/!= (a) (b)))
              (lib/and (lib/is-null (a)) (lib/not-null (b)))
              (lib/and (lib/not-null (a)) (lib/is-null (b))))

      :else
      (lib/or (lib/and (lib/not-null (a)) (lib/not-null (b)) (lib/= (a) (b)))
              (lib/and (lib/is-null (a)) (lib/is-null (b)))))))

(mu/defn- not->predicate :- ::condition
  "`NOT x`. sqlglot wraps `NOT IN` and `NOT (x IS NULL)` in a `Not`; Lib has clauses for both, and `NOT (x IS TRUE)`
  has to keep the null semantics of `IS` rather than become `NOT (x = true)`."
  [node           :- ::node
   resolve-column :- ::resolve-column]
  (let [inner (unparenthesized (arg node :this))]
    (case (:class inner)
      "In" (in inner resolve-column lib/not-in)
      "Is" (is inner resolve-column (not (arg inner :negate)))
      (lib/not (->predicate inner resolve-column)))))

(mu/defn- between->predicate :- ::condition
  "`x BETWEEN low AND high`, none of them `NULL` (see [[without-null-operands]])."
  [node           :- ::node
   resolve-column :- ::resolve-column]
  (without-null-operands node [(arg node :this) (arg node :low) (arg node :high)])
  (lib/between (->value (arg node :this) resolve-column)
               (->value (arg node :low) resolve-column)
               (->value (arg node :high) resolve-column)))

(def ^:private regex-metacharacters
  "The characters a backslash makes literal in a POSIX regular expression."
  (set "\\^$.|?*+()[]{}"))

(mu/defn- regex-quote :- :string
  "`s` as a regular expression matching exactly `s`. Not `Pattern/quote`: its `\\Q...\\E` is Java's, not the
  warehouse's."
  [s :- :string]
  (str/join (map (fn [c] (if (regex-metacharacters c) (str "\\" c) c)) s)))

(mu/defn- regex-match :- ::condition
  "`value` matches `regex`, as a filter clause. Lib has no regex filter, but the first match `regex-match-first`
  finds is null exactly when the regex does not match, so the filter is that match being not null. The regex is wrapped
  in a group of its own, because a group inside it would make the match that group's, which can be null even when the
  regex matches (`(a)|b` against `b`); `(?i)` makes it case-insensitive. Needs the warehouse driver to support
  regular expressions."
  [value             :- ::value
   regex             :- :string
   case-insensitive? :- :boolean]
  (lib/not-null (lib/regex-match-first value (str (when case-insensitive? "(?i)") "(" regex ")"))))

(mr/def ::like-tokens
  "A `LIKE` pattern as tokens: a literal string, `:any` for `%`, `:one` for `_`, see [[like-tokens]]."
  [:sequential [:or :string [:enum :any :one]]])

(mu/defn- like-tokens :- ::like-tokens
  "The `LIKE` `pattern` as tokens: a literal string, `:any` for `%` (a run of `%` is one), `:one` for `_`. The
  character `escape` (nil for none) makes the character after it literal."
  [pattern :- :string
   escape  :- [:maybe char?]]
  (loop [[c & more :as remaining] (seq pattern)
         literal                  (StringBuilder.)
         tokens                   []]
    (let [flush-literal (fn [] (cond-> tokens (pos? (.length literal)) (conj (str literal))))]
      (cond
        (empty? remaining)
        (flush-literal)

        (= c escape)
        (do (when (empty? more)
              (unsupported/throw! "the pattern %s ends with its escape character" (pr-str pattern)))
            (recur (rest more) (.append literal (char (first more))) tokens))

        (= c \%)
        (recur more (StringBuilder.) (let [tokens (flush-literal)]
                                       (cond-> tokens (not= :any (peek tokens)) (conj :any))))

        (= c \_)
        (recur more (StringBuilder.) (conj (flush-literal) :one))

        :else
        (recur more (.append literal (char c)) tokens)))))

(mu/defn- like-regex :- :string
  "The regular expression equivalent to the `LIKE` pattern `tokens`, anchored at both ends; `transform-literal`
  (identity, or lower-case) is applied to each literal."
  [tokens            :- ::like-tokens
   transform-literal :- ifn?]
  (str "^"
       (str/join (map (fn [token]
                        (case token
                          :any ".*"
                          :one "."
                          (regex-quote (transform-literal token))))
                      tokens))
       "$"))

(mu/defn- like-clause :- ::condition
  "The filter clause for the value `thunk` returns (afresh each time, so that no two refs share a uuid) matching the
  `LIKE` pattern `tokens`, or `ILIKE` when `case-insensitive?`. Where Lib's string filters express the pattern exactly
  they are used, since they read as what was written and run on any warehouse: `%x%`, `x%` and `%x` are `:contains`,
  `:starts-with` and `:ends-with`, `x%y` adds a minimum `length` so that the two ends cannot overlap, and one literal
  with a run of `_` pins the exact `length`. A pattern with no wildcard is `=`, over `lower` for `ILIKE`. Anything else
  is the equivalent regular expression (see [[regex-match]]), over `lower` with lower-cased literals for `ILIKE`, so
  that it does not depend on the warehouse's regex flags."
  [thunk             :- ifn?
   tokens            :- ::like-tokens
   case-insensitive? :- :boolean]
  (let [options      (when case-insensitive? {:case-sensitive false})
        string-match (fn [operator body] (lib/expression-clause operator [(thunk) body] options))
        length       (fn [] (lib/length (thunk)))
        literal?     string?
        ones         (fn [tokens] (when (and (seq tokens) (every? #{:one} tokens)) (count tokens)))
        lower-case   (if case-insensitive? u/lower-case-en identity)]
    (b/cond
      (empty? tokens)
      (lib/= (thunk) "")

      :let [[a b c] tokens]

      (and (= 1 (count tokens)) (literal? a))
      (if case-insensitive? (lib/= (lib/lower (thunk)) (lower-case a)) (lib/= (thunk) a))

      (= [:any] tokens)
      (lib/not-null (thunk))

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
      (regex-match (if case-insensitive? (lib/lower (thunk)) (thunk)) (like-regex tokens lower-case) false))))

(mu/defn- pattern-literal :- :string
  "The string literal the pattern of `node` (a `LIKE`, `ILIKE` or `SIMILAR TO`) is, or [[unsupported/throw!]] naming
  the `operator`: a pattern that is a column or an expression has no Lib equivalent."
  [node           :- ::node
   resolve-column :- ::resolve-column
   operator       :- :string]
  (let [pattern (->value (arg node :expression) resolve-column)]
    (when-not (string? pattern)
      (unsupported/throw! "%s with a pattern that is not a string literal is not supported" operator))
    pattern))

(mu/defn- like :- ::condition
  "`LIKE` or, `case-insensitive?`, `ILIKE`, with `escape` as the pattern's escape character (nil for none); see
  [[like-clause]]."
  [node              :- ::node
   resolve-column    :- ::resolve-column
   case-insensitive? :- :boolean
   escape            :- [:maybe char?]]
  (let [pattern (pattern-literal node resolve-column (if case-insensitive? "ILIKE" "LIKE"))
        clause  (like-clause #(->value (arg node :this) resolve-column)
                             (like-tokens pattern escape)
                             case-insensitive?)]
    (if (arg node :negate) (lib/not clause) clause)))

(mu/defn- similar-to-regex :- :string
  "The POSIX regular expression for the SQL-standard one of `SIMILAR TO`: `%` is `.*`, `_` is `.`, `.` is a literal
  (outside a bracket expression), `escape` makes the next character literal, and the rest (`|`, `*`, `+`, `?`, `{}`,
  `()`, `[]`) is the same in both. Anchored at both ends, as `SIMILAR TO` matches the whole string."
  [pattern :- :string
   escape  :- [:maybe char?]]
  (loop [[c & more :as remaining] (seq pattern)
         in-bracket?              false
         out                      (StringBuilder. "^")]
    (cond
      (empty? remaining)
      (str (.append out "$"))

      (and (= c escape) (not in-bracket?))
      (do (when (empty? more)
            (unsupported/throw! "the pattern %s ends with its escape character" (pr-str pattern)))
          (recur (rest more) in-bracket? (.append out (regex-quote (str (first more))))))

      in-bracket?
      (recur more (not= c \]) (.append out (char c)))

      :else
      (recur more (= c \[) (.append out (case c
                                          \% ".*"
                                          \_ "."
                                          \. "\\."
                                          (str c)))))))

(mu/defn- similar-to :- ::condition
  "`SIMILAR TO`, with `escape` as its escape character (SQL's default is a backslash), as a regex match."
  [node           :- ::node
   resolve-column :- ::resolve-column
   escape         :- [:maybe char?]]
  (regex-match (->value (arg node :this) resolve-column)
               (similar-to-regex (pattern-literal node resolve-column "SIMILAR TO") escape)
               false))

(mu/defn- escape->predicate :- ::condition
  "`x LIKE 'a!%' ESCAPE '!'`: the escape character wraps the pattern operator."
  [node           :- ::node
   resolve-column :- ::resolve-column]
  (let [escape-string (->value (arg node :expression) resolve-column)
        inner         (arg node :this)]
    (when-not (and (string? escape-string) (= 1 (count escape-string)))
      (unsupported/throw! "ESCAPE %s is not supported, only a one-character string literal is"
                          (:sql (arg node :expression))))
    (let [escape (first escape-string)]
      (case (:class inner)
        "Like"      (like inner resolve-column false escape)
        "ILike"     (like inner resolve-column true escape)
        "SimilarTo" (similar-to inner resolve-column escape)
        (unsupported/throw! "%s is not supported as a condition" (describe node))))))

(mu/defn- regexp-like :- ::condition
  "`x ~ 'regex'` (`regexp_like(x, 'regex')`), or `x ~* 'regex'` when `case-insensitive?`, as a regex match."
  [node              :- ::node
   resolve-column    :- ::resolve-column
   case-insensitive? :- :boolean]
  (regex-match (->value (arg node :this) resolve-column)
               (pattern-literal node resolve-column (if case-insensitive? "~*" "~"))
               case-insensitive?))

(def ^:private value-converters
  "The converter for each sqlglot node class the subset covers where a value is expected: columns, literals,
  arithmetic, `CASE`, casts and the functions that have a Lib expression function of the same meaning. The dispatch
  is [[->value]]."
  {"Column"           column->value
   "Literal"          literal->value
   "Boolean"          (fn [node _resolve-column] (boolean (arg node :this)))
   "Null"             (constantly nil)
   "Neg"              negation->value
   "Paren"            (fn [node resolve-column] (->value (arg node :this) resolve-column))
   "Add"              (arithmetic lib/+)
   "Sub"              (arithmetic lib/-)
   "Mul"              (arithmetic lib/*)
   "Div"              division->value
   "Pow"              (arithmetic lib/power)
   "Cast"             cast->value
   "Case"             case->value
   "Abs"              (unary lib/abs)
   "Floor"            (unary lib/floor)
   "Ceil"             (unary lib/ceil)
   "Sqrt"             (unary lib/sqrt)
   "Exp"              (unary lib/exp)
   "Log"              log->value
   "Round"            round->value
   "Coalesce"         coalesce->value
   "Nullif"           nullif->value
   "Lower"            (unary lib/lower)
   "Upper"            (unary lib/upper)
   "Length"           (unary lib/length)
   "Trim"             trim->value
   "Replace"          replace->value
   "Substring"        substring->value
   "Concat"           (fn [node resolve-column] (concatenate (arg node :expressions) resolve-column))
   ;; `a || b || c`
   "DPipe"            (fn [node resolve-column] (concatenate (operands node "DPipe") resolve-column))
   "Extract"          extract->value
   "TimestampTrunc"   date-trunc->value
   "DateTrunc"        date-trunc->value
   "CurrentTimestamp" (fn [_node _resolve-column] (lib/now))
   "CurrentDate"      (fn [_node _resolve-column] (lib/today))})

(def ^:private predicate-converters
  "The converter for each sqlglot node class the subset covers where a boolean is expected: a whole filter, a `WHEN`,
  an operand of `AND`, `OR` or `NOT`. The dispatch is [[->predicate]]."
  {"Column"      column->predicate
   "Paren"       (fn [node resolve-column] (->predicate (arg node :this) resolve-column))
   "EQ"          (comparison lib/=)
   "NEQ"         (comparison lib/!=)
   "GT"          (comparison lib/>)
   "GTE"         (comparison lib/>=)
   "LT"          (comparison lib/<)
   "LTE"         (comparison lib/<=)
   "And"         (logical lib/and "And")
   "Or"          (logical lib/or "Or")
   "Not"         not->predicate
   "Is"          (fn [node resolve-column] (is node resolve-column (boolean (arg node :negate))))
   "In"          (fn [node resolve-column] (in node resolve-column lib/in))
   "Between"     between->predicate
   "NullSafeEQ"  (fn [node resolve-column] (null-safe-comparison node resolve-column false))
   "NullSafeNEQ" (fn [node resolve-column] (null-safe-comparison node resolve-column true))
   "Like"        (fn [node resolve-column] (like node resolve-column false nil))
   "ILike"       (fn [node resolve-column] (like node resolve-column true nil))
   "SimilarTo"   (fn [node resolve-column] (similar-to node resolve-column \\))
   "Escape"      escape->predicate
   "RegexpLike"  (fn [node resolve-column] (regexp-like node resolve-column false))
   "RegexpILike" (fn [node resolve-column] (regexp-like node resolve-column true))})

(mu/defn- ->value :- ::value
  "The Lib expression for the sqlglot `node` used as a value, through [[value-converters]]: a column, a literal (a
  `NULL` is nil), arithmetic, or `CASE`. [[unsupported/throw!]] for a node class the subset does not cover, naming
  the function or the construct."
  [node           :- ::node
   resolve-column :- ::resolve-column]
  (if-let [convert (get value-converters (:class node))]
    (convert node resolve-column)
    (if-let [function-name (:func node)]
      (unsupported/throw! "the function %s is not supported" (u/lower-case-en function-name))
      (unsupported/throw! "%s is not supported" (describe node)))))

(mu/defn- ->predicate :- ::condition
  "The Lib filter clause for the sqlglot `node` used where a boolean is expected, through [[predicate-converters]].
  [[unsupported/throw!]] for a node class the subset does not cover as a condition."
  [node           :- ::node
   resolve-column :- ::resolve-column]
  (if-let [convert (get predicate-converters (:class node))]
    (convert node resolve-column)
    (unsupported/throw! "%s is not supported as a condition" (describe node))))

(mu/defn expression->mbql :- ::value
  "The Lib expression for the SQL value expression `sql` in `dialect`, resolving column names with `resolve-column`. A
  literal comes back as itself. Throws [[unsupported/throw!]] for SQL the subset does not cover."
  [dialect        :- ::dialect
   sql            :- :string
   resolve-column :- ::resolve-column]
  (->value (parse dialect sql) resolve-column))

(mu/defn condition->mbql :- ::condition
  "The Lib filter clause for the SQL condition `sql` in `dialect`, resolving column names with `resolve-column`.
  Throws [[unsupported/throw!]] for SQL the subset does not cover."
  [dialect        :- ::dialect
   sql            :- :string
   resolve-column :- ::resolve-column]
  (->predicate (parse dialect sql) resolve-column))

(mr/def ::reference
  "A MetricFlow object reference from a filter template: `Dimension('entity__name')`, `TimeDimension('entity__name',
  'grain')`, `Entity('name')` or `Metric('name', ...)`. `:grain` is the second argument of a `TimeDimension`, or the
  argument of a `.grain('month')` chained onto the reference, which means the same. `:arguments` is whatever followed
  the quoted arguments, `entity_path=['order']` or `group_by=['customer']`, as written; `:methods` is every other
  method call chained onto the reference, `.date_part('month')`, as written; both nil when there was none."
  [:map {:closed true}
   [:kind      [:enum :dimension :time-dimension :entity :metric]]
   [:name      :string]
   [:grain     [:maybe :string]]
   [:arguments [:maybe :string]]
   [:methods   [:maybe :string]]])

(mr/def ::rendered-filter
  "A filter template with its references replaced by placeholder identifiers, and what each placeholder stood for."
  [:map {:closed true}
   [:sql        :string]
   [:references [:map-of :string ::reference]]])

(def ^:private reference-re
  "`{{ Dimension('order__status') }}`, `{{ TimeDimension('metric_time', 'day') }}`, `{{ Entity('customer') }}`,
  `{{ Metric('revenue', group_by=['customer']) }}`, `{{ Dimension('order__ordered_at').grain('month') }}`: the
  object, its quoted first argument, an optional quoted second argument, whatever else precedes the closing
  parenthesis, and the method calls chained onto it."
  (re-pattern (str "\\{\\{\\s*(Dimension|TimeDimension|Entity|Metric)\\("
                   "\\s*(?:'([^']*)'|\"([^\"]*)\")\\s*"
                   "(?:,\\s*(?:'([^']*)'|\"([^\"]*)\"))?"
                   "([^)]*)\\)"
                   "((?:\\s*\\.\\s*\\w+\\([^)]*\\))*)"
                   "\\s*\\}\\}")))

(def ^:private method-re
  "One `.name(arguments)` call chained onto a reference."
  #"\.\s*(\w+)\(([^)]*)\)")

(mu/defn- extra-arguments :- [:maybe :string]
  "`remainder`, what a reference had after its quoted arguments, without the comma that separated it from them; nil
  when there was nothing but whitespace."
  [remainder :- :string]
  (not-empty (str/replace (str/trim remainder) #"^,\s*" "")))

(mu/defn- chained-methods :- [:map {:closed true}
                              [:grain   [:maybe :string]]
                              [:methods [:maybe :string]]]
  "What the method calls chained onto a reference, `chain`, say: `.grain('month')` names the grain (the last one wins),
  and anything else is `:methods`, as written, for the resolver to report."
  [chain :- :string]
  (reduce (fn [acc [call method-name arguments]]
            (if-let [grain (when (= method-name "grain")
                             (let [[_ single-quoted double-quoted]
                                   (re-matches #"\s*(?:'([^']*)'|\"([^\"]*)\")\s*" arguments)]
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

(mu/defn- parse-reference :- ::reference
  "What the MetricFlow reference `text`, one match of [[reference-re]], refers to."
  [text :- :string]
  (let [[_ object single-1 double-1 single-2 double-2 remainder chain] (re-matches reference-re text)
        {:keys [grain], method-calls :methods}                        (chained-methods chain)]
    {:kind      (reference-kinds object)
     :name      (or single-1 double-1)
     :grain     (or grain single-2 double-2)
     :arguments (extra-arguments remainder)
     :methods   method-calls}))

(mu/defn render-filter :- ::rendered-filter
  "Replace each MetricFlow reference in the filter `template` with a placeholder identifier, so the rest parses as SQL
  with [[condition->mbql]], whose column callback then sees the placeholders as column names. `:references` says what
  each placeholder stood for, arguments the converter does not read included, for the resolver to report. The same
  reference written twice is one placeholder. Jinja the regex does not recognise is left alone and fails to parse."
  [template :- :string]
  (let [placeholders (into {}
                           (map-indexed (fn [i text] [text (format "__dbt_ref_%d__" i)]))
                           (distinct (map first (re-seq reference-re template))))]
    {:sql        (str/replace template reference-re (fn [[text]] (placeholders text)))
     :references (into {} (map (fn [[text placeholder]] [placeholder (parse-reference text)])) placeholders)}))
