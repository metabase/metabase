(ns metabase.sql-to-mbql.expression
  "One SQL expression in the warehouse's dialect → a Lib expression or filter clause: `sales / target`, or
  `status = 'Shipped' AND amount > 0`, with no surrounding SELECT. The module's API is [[metabase.sql-to-mbql.core]],
  and its README lists the subset of SQL that converts, what does not and why.

  [[metabase.sql-parsing.core/parse-expression]] (sqlglot) parses an expression on its own, without a surrounding
  SELECT, in the warehouse's dialect, and a subset of its tree is built with Lib's clause constructors: column
  references, literals, arithmetic, comparisons, AND/OR/NOT, IN, BETWEEN, IS [NOT] NULL/TRUE/FALSE, LIKE, ILIKE and
  SIMILAR TO patterns and regex matches (see [[like-clause]] and [[regex-match]]), both forms of CASE, casts to the
  types Lib has a conversion for (see [[cast-targets]]) and the functions that have a Lib expression function with the
  same meaning. Each sqlglot node class the subset covers has a
  converter in [[value-converters]], for a node used as a value, or [[predicate-converters]], for one used where a
  boolean is expected; [[->value]] and [[->predicate]] dispatch on the class. `NULLIF(x, 0)` as a divisor is plain
  division in Metabase (see [[safe-divisor]]). A negation keeps SQL's three-valued meaning, leaving the null rows out
  (see [[not-equal]] and [[negated-match]]), and a cast or a `LIKE` whose meaning depends on the warehouse is read in
  the dialect's terms (see [[cast->value]] and [[default-like-escape]]). Anything else is reported as unsupported,
  naming the construct.

  Column references are resolved through a callback, so this namespace knows nothing about tables or Metabase
  metadata. Unsupported constructs are thrown with [[throw-unsupported]], as an exception [[unsupported?]] recognises."
  (:require
   [better-cond.core :as b]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(mr/def ::value
  "What a SQL value expression converts to: a Lib expression, or a literal, nil for `NULL`."
  ::lib.schema.expression/expression)

(mr/def ::condition
  "What a SQL condition converts to: a Lib filter clause."
  ::lib.schema.expression/boolean)

(mr/def ::resolve-column
  "Callback turning a column name as written in the SQL (unquoted, unqualified) into the Lib ref that refers to it. A
  column used more than once is resolved once per use, and each call has to return a new ref, so that no two refs in
  the result share a `:lib/uuid`. The type of the ref decides what some SQL means: see [[integer-typed?]] and
  [[boolean-typed?]]."
  ifn?)

(mr/def ::dialect
  "A sqlglot dialect name (see [[metabase.sql-tools.core/driver->dialect]]), or nil for sqlglot's default."
  [:maybe :string])

(mr/def ::node
  "A node of the tree [[metabase.sql-parsing.core/parse-expression]] returns."
  [:map {:closed true}
   [:class :string]
   [:sql   :string]
   [:args  [:map-of {::mr/deliberately-open true, :description "sqlglot's named children, of any shape"}
            :keyword :any]]
   [:func  {:optional true} :string]])

(mr/def ::context
  "What a converter needs besides its node: the dialect the SQL was parsed in, for the converters whose meaning depends
  on the warehouse (see [[default-like-escape]] and [[cast->value]]), and the column callback."
  [:map {:closed true}
   [:dialect        ::dialect]
   [:resolve-column ::resolve-column]])

(mr/def ::converter
  "A function of a node and the [[::context]] that converts the node, see [[value-converters]] and
  [[predicate-converters]]."
  ifn?)

(mu/defn- throw-unsupported :- :nil
  "Throw the exception that says the SQL, or a part of it, has no Lib equivalent (see [[unsupported?]]). `reason` is
  the message, run through `format` with `args` when there are any; without them it is taken as it is, so a reason
  already formatted can carry a `%`."
  [reason :- :string
   & args :- [:* [:or :string number? :keyword :nil]]]
  (throw (ex-info (if (seq args) (apply format reason args) reason) {::unsupported true})))

(mu/defn unsupported? :- :boolean
  "Was `e` thrown because the SQL, or a part of it, has no Lib equivalent? Its message names the construct and says
  why. Any other exception is a bug, or SQL failing in a way the conversion did not anticipate."
  [e :- (ms/InstanceOfClass Throwable)]
  (boolean (and (instance? ExceptionInfo e) (::unsupported (ex-data e)))))

(mu/defn- dialect-name :- :string
  "`dialect` for a message."
  [dialect :- ::dialect]
  (or dialect "the default dialect"))

(mu/defn- parse :- ::node
  "Parse the SQL expression `sql` in `dialect`, or throw [[throw-unsupported]] saying why it could not be parsed."
  [dialect :- ::dialect
   sql     :- :string]
  (try
    (sql-parsing/parse-expression dialect sql)
    (catch Exception e
      (if (sql-parsing/parse-error? e)
        (throw-unsupported "could not parse %s: %s"
                     (pr-str sql) (first (str/split-lines (str (sql-parsing/parse-error-message e)))))
        (throw e)))))

(mu/defn- arg :- [:maybe [:or ::node [:sequential ::node] :string :boolean number?]]
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

(declare ->value ->predicate without-null-operands)

(mu/defn- parse-number :- number?
  "The number a SQL numeric literal `s` is: a long when it fits one, otherwise a double. [[throw-unsupported]] for
  one no double holds (`1e400`), which would be infinity."
  [s :- :string]
  (or (parse-long s)
      (let [d (parse-double s)]
        (when-not (and d (Double/isFinite d))
          (throw-unsupported "the number %s is too large to represent" s))
        d)))

(mu/defn- literal-number :- [:maybe number?]
  "The number `node` is, when it is a numeric literal; nil otherwise."
  [node :- ::node]
  (when (and (= "Literal" (:class node)) (not (arg node :is_string)))
    (parse-number (arg node :this))))

(mu/defn- column->value :- ::value
  "A column reference, as the callback resolves it. The table qualifier, if any, is dropped: the callback is passed
  the column's name alone."
  [node           :- ::node
   ctx            :- ::context]
  ((:resolve-column ctx) (arg (arg node :this) :this)))

(mu/defn- literal->value :- [:or :string number?]
  "A string literal as the string, a numeric literal as the number."
  [node            :- ::node
   _ctx            :- ::context]
  (let [text (arg node :this)]
    (if (arg node :is_string)
      text
      (parse-number text))))

(mu/defn- negation->value :- ::value
  "Unary minus: of a numeric literal, the negative number; of anything else, `0 - x`."
  [node           :- ::node
   ctx            :- ::context]
  (let [value (->value (arg node :this) ctx)]
    (if (number? value)
      (- value)
      (lib/- 0 value))))

(mu/defn- binary-value :- ::value
  "`(lib-fn left right)` over the two operands of `node`, converted as values."
  [lib-fn         :- ifn?
   node           :- ::node
   ctx            :- ::context]
  (lib-fn (->value (arg node :this) ctx) (->value (arg node :expression) ctx)))

(mu/defn- arithmetic :- ::converter
  "The converter for a binary operator node: `(lib-fn left right)`."
  [lib-fn :- ifn?]
  (fn [node ctx]
    (binary-value lib-fn node ctx)))

(mu/defn- unary :- ::converter
  "The converter for a one-argument function node: `(lib-fn x)`."
  [lib-fn :- ifn?]
  (fn [node ctx]
    (lib-fn (->value (arg node :this) ctx))))

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
  "Is `value` known to be an integer? A column whose ref has no type is `:type/*`, which is not known to be one."
  [value :- ::value]
  (every? #(isa? % :type/Integer) (types-of value)))

(mu/defn- division->value :- ::value
  "`x / y`. [[throw-unsupported]] when sqlglot marks the division `typed` and both operands are known integers: on
  Postgres, SQL Server, Redshift, Presto and SQLite an integer divided by an integer is truncated to an integer, where
  Metabase's `/` divides as floats, so the number would silently differ. MySQL, Snowflake, BigQuery and Oracle divide
  as decimals, as Metabase does, and are not marked. A `NULLIF(y, 0)` divisor is `y` (see [[safe-divisor]])."
  [node           :- ::node
   ctx            :- ::context]
  (let [dividend (->value (arg node :this) ctx)
        divisor  (->value (safe-divisor (arg node :expression)) ctx)]
    (when (and (arg node :typed) (integer-typed? dividend) (integer-typed? divisor))
      (throw-unsupported (str "%s divides an integer by an integer, which the warehouse truncates to a whole number"
                              " and Metabase does not; cast an operand to a decimal or float")
                         (:sql node)))
    (lib// dividend divisor)))

(def ^:private cast-targets
  "sqlglot's name for a SQL type (`cast(x as numeric(10, 2))` and `x::numeric` both arrive as `DECIMAL`) → the Lib
  conversion function that casts to it. Lib's `integer`, `float` and `text` take any expression; `date` takes a string
  to parse or a datetime to truncate; `datetime` takes a string, which is how SQL casts a text column to a timestamp.
  There is no cast to boolean or to an interval. `DECIMAL` and the integer types convert only where the warehouse
  keeps the same digits Metabase does, see [[cast->value]]."
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

(def ^:private unconstrained-decimal-dialects
  "The sqlglot dialects where `DECIMAL` with no precision and scale keeps every digit of the value, so that a cast to
  it is Metabase's `float` conversion: on Postgres a bare `numeric` is unconstrained, BigQuery's `NUMERIC` is fixed at
  nine decimal places, and SQLite has no fixed-point type at all. Everywhere else it is a fixed-point type of scale 0,
  which rounds to a whole number: MySQL, Spark/Databricks and Hive make it `DECIMAL(10, 0)`, SQL Server and Redshift
  `DECIMAL(18, 0)`, Oracle `NUMBER(38, 0)`, Snowflake `NUMBER(38, 0)` and Trino/Presto `DECIMAL(38, 0)`."
  #{"postgres" "bigquery" "sqlite"})

(def ^:private truncating-integer-cast-dialects
  "The sqlglot dialects of the drivers whose `integer` conversion Metabase compiles as `CAST(ROUND(x) AS BIGINT)` (see
  [[metabase.driver.sql.query-processor/->integer-with-round]]) although the warehouse's own `CAST(x AS INT)` drops
  the fraction: Spark/Databricks, SQLite, ClickHouse, and Redshift unless its `enable_numeric_rounding` setting is
  on (it is off by default). A cast of a value that is already an integer is the same on both."
  #{"spark" "databricks" "sqlite" "clickhouse" "redshift"})

(mu/defn- decimal-cast-check :- :nil
  "[[throw-unsupported]] for the `CAST(x AS DECIMAL ...)` `node` when the warehouse would round the value where
  Metabase's `float` conversion keeps it: a `DECIMAL(p, s)` rounds to `s` decimal places and a `DECIMAL(p)` to none,
  and a bare `DECIMAL` is one of scale 0 on every `dialect` but those in [[unconstrained-decimal-dialects]]."
  [node    :- ::node
   dialect :- ::dialect]
  (let [parameters (arg (arg node :to) :expressions)
        scale      (when (seq parameters)
                     (or (some-> (second parameters) (arg :this) literal-number) 0))]
    (cond
      scale
      (throw-unsupported "%s rounds to %d decimal places, which Metabase's float conversion does not; cast to a float"
                         (:sql node) scale)

      (not (contains? unconstrained-decimal-dialects dialect))
      (throw-unsupported (str "%s is a cast to a fixed-point type of scale 0 on %s, which rounds to a whole number"
                              " where Metabase's float conversion does not; cast to a float")
                         (:sql node) (dialect-name dialect)))))

(mu/defn- cast->value :- ::value
  "`CAST(x AS type)` or `x::type`, as the Lib conversion for the type (see [[cast-targets]]). [[throw-unsupported]]
  when the warehouse keeps different digits than the conversion does: a `DECIMAL` with a scale (see
  [[decimal-cast-check]]), or an integer cast of a value that is not one on a warehouse that truncates where Metabase
  rounds (see [[truncating-integer-cast-dialects]])."
  [node           :- ::node
   ctx            :- ::context]
  (let [target  (arg (arg node :to) :this)
        cast-fn (get cast-targets target)
        value   (when cast-fn (->value (arg node :this) ctx))]
    (cond
      (not cast-fn)
      (throw-unsupported "a cast to %s, %s, is not supported" target (:sql node))

      (= target "DECIMAL")
      (decimal-cast-check node (:dialect ctx))

      (and (= cast-fn lib/integer)
           (not (integer-typed? value))
           (contains? truncating-integer-cast-dialects (:dialect ctx)))
      (throw-unsupported (str "%s drops the fraction on %s, where Metabase's integer conversion rounds it; use"
                              " floor or round")
                         (:sql node) (dialect-name (:dialect ctx))))
    (cast-fn value)))

(mu/defn- case->value :- ::value
  "Both forms of `CASE`. The simple form, `CASE x WHEN v THEN ...`, is the searched form with `x = v` as each
  condition, so neither `x` nor a `v` may be `NULL` (see [[without-null-operands]]); `x` is converted once per branch
  so that each branch gets a column ref of its own."
  [node           :- ::node
   ctx            :- ::context]
  (let [operand   (arg node :this)
        condition (fn [when-node]
                    (if operand
                      (do (without-null-operands node [operand when-node])
                          (lib/= (->value operand ctx) (->value when-node ctx)))
                      (->predicate when-node ctx)))
        branches  (mapv (fn [if-node]
                          [(condition (arg if-node :this))
                           (->value (arg if-node :true) ctx)])
                        (arg node :ifs))]
    (if (contains? (:args node) :default)
      (lib/case branches (->value (arg node :default) ctx))
      (lib/case branches))))

(mu/defn- log->value :- ::value
  "`log(x)` or `log(10, x)`. Metabase's `log` is base 10, as a one-argument SQL `log` is (`ln` is the natural log and
  does not map); any other base is [[throw-unsupported]]."
  [node           :- ::node
   ctx            :- ::context]
  (let [base-node (when (arg node :expression) (arg node :this))
        x-node    (or (arg node :expression) (arg node :this))]
    (when (and base-node (not= 10 (literal-number base-node)))
      (throw-unsupported "log to a base other than 10 is not supported: %s" (:sql node)))
    (lib/log (->value x-node ctx))))

(def ^:private max-round-decimals
  "The most decimals `round(x, n)` converts to: `10^n` has to fit a long."
  18)

(mu/defn- round->value :- ::value
  "`round(x)`, or `round(x, n)` as `round(x * 10^n) / 10^n`, since Metabase rounds to a whole number only; `n` has to
  be a literal of at most [[max-round-decimals]]."
  [node           :- ::node
   ctx            :- ::context]
  (let [x        (->value (arg node :this) ctx)
        decimals (when-let [decimals-node (arg node :decimals)]
                   (let [n (literal-number decimals-node)]
                     (when-not (and (integer? n) (<= 0 n max-round-decimals))
                       (throw-unsupported "round to %s decimals is not supported; only a literal from 0 to %d is"
                                          (:sql decimals-node) max-round-decimals))
                     n))]
    (if (or (nil? decimals) (zero? decimals))
      (lib/round x)
      (let [scale (long (Math/pow 10.0 (double decimals)))]
        (lib// (lib/round (lib/* x scale)) scale)))))

(mu/defn- variadic :- ::value
  "`(lib-fn & values)`, or the one value when there is only one: `coalesce(x)` and `concat(x)` are `x`. `lib-fn` is a
  variadic Lib constructor, [[lib/coalesce]] or [[lib/concat]]; `values` are the Lib expressions it takes, at least
  one."
  [lib-fn :- ifn?
   values :- [:sequential ::value]]
  (if (next values)
    (apply lib-fn values)
    (first values)))

(mu/defn- coalesce->value :- ::value
  "`coalesce(x, ...)`; of one argument, just that argument."
  [node           :- ::node
   ctx            :- ::context]
  (variadic lib/coalesce (map #(->value % ctx) (cons (arg node :this) (arg node :expressions)))))

(mu/defn- nullif->value :- ::value
  "`NULLIF(x, y)` is `CASE WHEN x = y THEN NULL ELSE x END`; `x` is converted twice so that each use has its own ref."
  [node           :- ::node
   ctx            :- ::context]
  (lib/case [[(binary-value lib/= node ctx) nil]]
    (->value (arg node :this) ctx)))

(mu/defn- trim->value :- ::value
  "`trim`, `ltrim` and `rtrim`, of spaces only."
  [node           :- ::node
   ctx            :- ::context]
  (let [characters (arg node :expression)]
    (when (and characters (not= " " (->value characters ctx)))
      (throw-unsupported "TRIM of characters other than spaces is not supported: %s" (:sql node)))
    ((unary (case (arg node :position)
              "LEADING"  lib/ltrim
              "TRAILING" lib/rtrim
              lib/trim))
     node ctx)))

(mu/defn- replace->value :- ::value
  "`replace(x, from, to)`."
  [node           :- ::node
   ctx            :- ::context]
  (when-not (arg node :replacement)
    (throw-unsupported "REPLACE without a replacement is not supported: %s" (:sql node)))
  (lib/replace (->value (arg node :this) ctx)
               (->value (arg node :expression) ctx)
               (->value (arg node :replacement) ctx)))

(mu/defn- substring->value :- ::value
  "`substring(x, start)` or `substring(x, start, length)`, with the same 1-based start and optional length as SQL."
  [node           :- ::node
   ctx            :- ::context]
  (lib/expression-clause :substring
                         (into [(->value (arg node :this) ctx)
                                (->value (arg node :start) ctx)]
                               (when-let [length (arg node :length)]
                                 [(->value length ctx)]))
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
   ctx            :- ::context]
  (variadic lib/concat (map #(->value % ctx) nodes)))

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
   ctx            :- ::context]
  (let [part (arg (arg node :this) :this)]
    (if-let [get-part (get extract-parts part)]
      (get-part (->value (arg node :expression) ctx))
      (throw-unsupported "extracting %s from a date is not supported" part))))

(mu/defn truncation-unit :- [:maybe ::lib.schema.temporal-bucketing/unit.date-time.truncate]
  "The Metabase truncation unit named `unit-name`, a `date_trunc` unit as sqlglot spells it (`MONTH`) or as a caller
  names one (`month`), in either case singular or plural; nil when Metabase has no truncation unit of that name
  (`nanosecond`, `decade`). The units are [[lib.schema.temporal-bucketing/datetime-truncation-units]], `millisecond`
  through `year`, so a caller that reads unit names of its own through this function (a semantic layer's time grains)
  accepts the units `date_trunc` does. A `week` is accepted as Metabase's week, which starts on the day the instance's
  start-of-week setting names where an ISO week starts on Monday."
  [unit-name :- :string]
  (let [singular (str/replace (u/lower-case-en unit-name) #"s$" "")]
    (m/find-first #(= singular (name %)) lib.schema.temporal-bucketing/datetime-truncation-units)))

(mu/defn- date-trunc->value :- ::value
  "`date_trunc('unit', column)` as the column bucketed by that temporal unit (see [[truncation-unit]]). Metabase
  truncates a column by bucketing its ref, so there is nothing to bucket when the argument is an expression rather
  than a column. sqlglot parses `date_trunc` as a `TimestampTrunc` or a `DateTrunc` depending on the dialect; both
  have the same children."
  [node           :- ::node
   ctx            :- ::context]
  (let [unit-name (arg (arg node :unit) :this)
        unit      (truncation-unit unit-name)
        value     (->value (arg node :this) ctx)]
    (when-not unit
      (throw-unsupported "truncating a date to %s is not supported" unit-name))
    (when-not (lib/clause-of-type? value :field)
      (throw-unsupported "date_trunc over an expression is not supported, only over a column: %s" (:sql node)))
    (lib/with-temporal-bucket value unit)))

(mu/defn- boolean-typed? :- :boolean
  "Can `value` be a boolean: is its type `:type/Boolean`, or unknown (`:type/*`, a column whose ref has no type),
  which is trusted?"
  [value :- ::value]
  (boolean (some #(or (= % :type/*) (isa? % :type/Boolean)) (types-of value))))

(mu/defn- column->predicate :- ::condition
  "A bare column in a boolean position is a boolean column, `WHERE is_returned`, as `column = true`. One typed as
  anything else cannot be, and the warehouse would reject it where Lib's `[:= x true]` would run, so it is
  [[throw-unsupported]]."
  [node           :- ::node
   ctx            :- ::context]
  (let [value (->value node ctx)]
    (when-not (boolean-typed? value)
      (throw-unsupported "%s is not a boolean column, so it cannot stand alone as a condition" (:sql node)))
    (lib/= value true)))

(mu/defn- without-null-operands :- :nil
  "[[throw-unsupported]] for the comparison `node` when any of its operand `nodes` is the literal `NULL`. In SQL a
  comparison against NULL is null, so never true; the Lib clause it would convert to treats a nil operand as a null
  check (`[:= x nil]` is `x IS NULL`) and matches the null rows instead."
  [node  :- ::node
   nodes :- [:sequential ::node]]
  (when (some #(= "Null" (:class (unparenthesized %))) nodes)
    (throw-unsupported "%s compares against NULL, which is never true in SQL; use IS [NOT] NULL" (describe node))))

(mu/defn- comparison :- ::converter
  "The converter for a comparison node: `(lib-fn left right)` over its operands, neither of which may be `NULL` (see
  [[without-null-operands]])."
  [lib-fn :- ifn?]
  (fn [node ctx]
    (without-null-operands node [(arg node :this) (arg node :expression)])
    (binary-value lib-fn node ctx)))

(mu/defn- not-equal :- ::condition
  "`a != b` as `NOT (a = b)`, never as Lib's `!=`: Metabase compiles `[:!= x v]` on a column to `x <> v OR x IS NULL`,
  which counts the null rows, where SQL's `!=` is null for them and leaves them out. `NOT (a = b)` compiles to just
  that, and is what `NOT (a = b)` written in the SQL converts to as well."
  [a :- ::value
   b :- ::value]
  (lib/not (lib/= a b)))

(mu/defn- negated-match :- ::condition
  "`NOT clause`, where `clause` is a `LIKE`, `SIMILAR TO` or regex match over the value `thunk` returns, with the null
  rows left out as SQL leaves them out: Metabase compiles `NOT` over `contains`, `starts-with` and `ends-with` to
  include them, and the regex match (see [[regex-match]]) is two-valued, so `NOT` over it would turn null into true.
  `thunk` is called afresh, so that no two refs share a uuid."
  [thunk  :- ifn?
   clause :- ::condition]
  (lib/and (lib/not-null (thunk)) (lib/not clause)))

(mu/defn- logical :- ::converter
  "The converter for an `AND` or `OR` node, `node-class`: `(lib-fn & operands)` over its flattened operands, so
  `a AND b AND c` is one `:and`."
  [lib-fn     :- ifn?
   node-class :- :string]
  (fn [node ctx]
    (apply lib-fn (map #(->predicate % ctx) (operands node node-class)))))

(mu/defn- is :- ::condition
  "`x IS NULL`, `x IS TRUE` or `x IS FALSE`, negated when `negate?`. `IS TRUE` is `x = true`, but `IS NOT TRUE` holds
  for a null `x` too where `x != true` is null, so the negated form is `x != b OR x IS NULL`."
  [node           :- ::node
   ctx            :- ::context
   negate?        :- :boolean]
  (let [compared-to (arg node :expression)
        x           (fn [] (->value (arg node :this) ctx))]
    (case (:class compared-to)
      "Null"    (if negate? (lib/not-null (x)) (lib/is-null (x)))
      "Boolean" (let [b (boolean (arg compared-to :this))]
                  (if negate?
                    (lib/or (lib/!= (x) b) (lib/is-null (x)))
                    (lib/= (x) b)))
      (throw-unsupported "%s is not supported, only IS [NOT] NULL, TRUE or FALSE" (describe node)))))

(mu/defn- in :- ::condition
  "`x IN (...)`, or when `negate?` `x NOT IN (...)` as `NOT (x IN (...))`, never as Lib's `not-in`, which includes the
  null rows the way `!=` does (see [[not-equal]]). Only over a list of values, none of them `NULL` (see
  [[without-null-operands]])."
  [node           :- ::node
   ctx            :- ::context
   negate?        :- :boolean]
  (when (arg node :query)
    (throw-unsupported "IN over a subquery is not supported, only over a list of values"))
  (without-null-operands node (cons (arg node :this) (arg node :expressions)))
  (let [clause (apply lib/in
                      (->value (arg node :this) ctx)
                      (map #(->value % ctx) (arg node :expressions)))]
    (if negate? (lib/not clause) clause)))

(mr/def ::null-safe-comparison.shape
  "What the two operands of an `IS [NOT] DISTINCT FROM` are, see [[null-safe-comparison]]: an expression against
  `NULL`, an expression against another literal, or two expressions."
  [:enum :expression-and-null :expression-and-literal :two-expressions])

(mu/defn- null-safe-comparison-shape :- ::null-safe-comparison.shape
  "The shape of the comparison with the converted operands `a` and `b`, or [[throw-unsupported]] for `node` when
  neither is an expression."
  [node :- ::node
   a    :- ::value
   b    :- ::value]
  (let [literal (cond
                  (and (lib/clause? a) (lib/clause? b)) ::none
                  (lib/clause? a)                        b
                  (lib/clause? b)                        a
                  :else (throw-unsupported "%s compares two literals" (describe node)))]
    (cond
      (= literal ::none) :two-expressions
      (nil? literal)     :expression-and-null
      :else              :expression-and-literal)))

(mu/defn- null-safe-comparison :- ::condition
  "`a IS NOT DISTINCT FROM b`, or `a IS DISTINCT FROM b` when `distinct-from?`: equality that treats two nulls as the
  same and a null against a value as different, and is never null itself. Against a literal it is the `=` or `!=` Lib
  has: `=` is null, so false in a filter, for a null column, and Metabase compiles `!=` on a column to include the
  nulls. Between two columns (or expressions) it is spelled out over `IS NULL` checks with every branch two-valued,
  which runs on any warehouse where `IS DISTINCT FROM` or a boolean `COALESCE` would not."
  [node           :- ::node
   ctx            :- ::context
   distinct-from? :- :boolean]
  ;; a value is converted afresh each time it appears in the clause, so that no two refs share a uuid
  (let [a          #(->value (arg node :this) ctx)
        b          #(->value (arg node :expression) ctx)
        shape      (null-safe-comparison-shape node (a) (b))
        expression (if (lib/clause? (a)) a b)
        literal    (if (lib/clause? (a)) (b) (a))]
    (case [shape distinct-from?]
      [:expression-and-null false]
      (lib/is-null (expression))

      [:expression-and-null true]
      (lib/not-null (expression))

      [:expression-and-literal false]
      (lib/= (expression) literal)

      ;; `!=` on a column already includes the nulls; on an expression it does not, so say so
      [:expression-and-literal true]
      (if (lib/clause-of-type? (expression) :field)
        (lib/!= (expression) literal)
        (lib/or (lib/!= (expression) literal) (lib/is-null (expression))))

      [:two-expressions false]
      (lib/or (lib/and (lib/not-null (a)) (lib/not-null (b)) (lib/= (a) (b)))
              (lib/and (lib/is-null (a)) (lib/is-null (b))))

      [:two-expressions true]
      (lib/or (lib/and (lib/not-null (a)) (lib/not-null (b)) (lib/!= (a) (b)))
              (lib/and (lib/is-null (a)) (lib/not-null (b)))
              (lib/and (lib/not-null (a)) (lib/is-null (b)))))))

(def ^:private match-classes
  "The sqlglot node classes of the pattern and regex matches, whose `NOT` keeps the null rows out (see
  [[negated-match]]). `Escape` wraps one of the others."
  #{"Like" "ILike" "SimilarTo" "RegexpLike" "RegexpILike" "Escape"})

(mu/defn- match-subject :- ::node
  "The value a pattern or regex match `node` (one of [[match-classes]]) matches."
  [node :- ::node]
  (arg (if (= "Escape" (:class node)) (arg node :this) node) :this))

(mu/defn- not->predicate :- ::condition
  "`NOT x`. sqlglot wraps `NOT IN`, `!~`, `NOT SIMILAR TO` and `NOT (x IS NULL)` in a `Not`; `NOT IN` is `NOT (x IN)`
  (see [[in]]), a negated match keeps the null rows out (see [[negated-match]]), and `NOT (x IS TRUE)` has to keep the
  null semantics of `IS` rather than become `NOT (x = true)`."
  [node           :- ::node
   ctx            :- ::context]
  (let [inner (unparenthesized (arg node :this))]
    (cond
      (= "In" (:class inner))
      (in inner ctx true)

      (= "Is" (:class inner))
      (is inner ctx (not (arg inner :negate)))

      (contains? match-classes (:class inner))
      (negated-match #(->value (match-subject inner) ctx) (->predicate inner ctx))

      :else
      (lib/not (->predicate inner ctx)))))

(mu/defn- between->predicate :- ::condition
  "`x BETWEEN low AND high`, none of them `NULL` (see [[without-null-operands]])."
  [node           :- ::node
   ctx            :- ::context]
  (without-null-operands node [(arg node :this) (arg node :low) (arg node :high)])
  (lib/between (->value (arg node :this) ctx)
               (->value (arg node :low) ctx)
               (->value (arg node :high) ctx)))

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
              (throw-unsupported "the pattern %s ends with its escape character" (pr-str pattern)))
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

(mr/def ::like-shape
  "The shape of a `LIKE` pattern, as [[like-shape]] reads its tokens: the kind, and the literals and the number of `_`
  the clause for that kind is built from. `:other` is a pattern Lib's string filters cannot express exactly."
  [:map {:closed true}
   [:kind      [:enum :empty :literal :any :contains :starts-with :ends-with :starts-and-ends-with :ones
                :literal-then-ones :ones-then-literal :other]]
   [:literals  {:optional true} [:sequential :string]]
   [:n-ones    {:optional true} pos-int?]])

(mu/defn- n-ones :- [:maybe pos-int?]
  "How many `_` `tokens` are, when they are nothing but `_`; nil otherwise."
  [tokens :- ::like-tokens]
  (when (and (seq tokens) (every? #{:one} tokens))
    (count tokens)))

(mu/defn- like-shape :- ::like-shape
  "The shape of the `LIKE` pattern `tokens`, see [[like-clause]] for what each kind becomes."
  [tokens :- ::like-tokens]
  (let [[a b c] tokens
        n       (count tokens)
        z       (peek tokens)]
    (b/cond
      (zero? n)                                        {:kind :empty}
      (and (= n 1) (string? a))                        {:kind :literal, :literals [a]}
      (= [:any] tokens)                                {:kind :any}
      (and (= n 3) (= :any a) (string? b) (= :any c))  {:kind :contains, :literals [b]}
      (and (= n 2) (string? a) (= :any b))             {:kind :starts-with, :literals [a]}
      (and (= n 2) (= :any a) (string? b))             {:kind :ends-with, :literals [b]}
      (and (= n 3) (string? a) (= :any b) (string? c)) {:kind :starts-and-ends-with, :literals [a c]}
      :let [ones (n-ones tokens)]
      ones                                             {:kind :ones, :n-ones ones}
      :let [ones (when (string? a) (n-ones (rest tokens)))]
      ones                                             {:kind :literal-then-ones, :literals [a], :n-ones ones}
      :let [ones (when (string? z) (n-ones (pop tokens)))]
      ones                                             {:kind :ones-then-literal, :literals [z], :n-ones ones}
      :else                                            {:kind :other})))

(mu/defn- like-clause :- ::condition
  "The filter clause for the value `thunk` returns (afresh each time, so that no two refs share a uuid) matching the
  `LIKE` pattern `tokens`, or `ILIKE` when `case-insensitive?`, by the pattern's [[like-shape]]. Where Lib's string
  filters express the pattern exactly they are used, since they read as what was written and run on any warehouse:
  `%x%`, `x%` and `%x` are `:contains`, `:starts-with` and `:ends-with`, `x%y` adds a minimum `length` so that the two
  ends cannot overlap, and one literal with a run of `_` pins the exact `length`. A pattern with no wildcard is `=`,
  over `lower` for `ILIKE`. Anything else is the equivalent regular expression (see [[regex-match]]), over `lower`
  with lower-cased literals for `ILIKE`, so that it does not depend on the warehouse's regex flags."
  [thunk             :- ifn?
   tokens            :- ::like-tokens
   case-insensitive? :- :boolean]
  (let [options                       (when case-insensitive? {:case-sensitive false})
        string-match                  (fn [operator body] (lib/expression-clause operator [(thunk) body] options))
        length                        (fn [] (lib/length (thunk)))
        lower-case                    (if case-insensitive? u/lower-case-en identity)
        {:keys [kind literals], ones :n-ones} (like-shape tokens)
        [x y]                         literals]
    (case kind
      :empty                (lib/= (thunk) "")
      :literal              (if case-insensitive? (lib/= (lib/lower (thunk)) (lower-case x)) (lib/= (thunk) x))
      :any                  (lib/not-null (thunk))
      :contains             (string-match :contains x)
      :starts-with          (string-match :starts-with x)
      :ends-with            (string-match :ends-with x)
      :starts-and-ends-with (lib/and (string-match :starts-with x)
                                     (string-match :ends-with y)
                                     (lib/>= (length) (+ (count x) (count y))))
      :ones                 (lib/= (length) ones)
      :literal-then-ones    (lib/and (string-match :starts-with x) (lib/= (length) (+ (count x) ones)))
      :ones-then-literal    (lib/and (string-match :ends-with x) (lib/= (length) (+ (count x) ones)))
      :other                (regex-match (if case-insensitive? (lib/lower (thunk)) (thunk))
                                         (like-regex tokens lower-case)
                                         false))))

(mu/defn- pattern-literal :- :string
  "The string literal the pattern of `node` (a `LIKE`, `ILIKE` or `SIMILAR TO`) is, or [[throw-unsupported]] naming
  the `operator`: a pattern that is a column or an expression has no Lib equivalent."
  [node           :- ::node
   ctx            :- ::context
   operator       :- :string]
  (let [pattern (->value (arg node :expression) ctx)]
    (when-not (string? pattern)
      (throw-unsupported "%s with a pattern that is not a string literal is not supported" operator))
    pattern))

(def ^:private default-like-escape
  "sqlglot dialect → the character `LIKE` treats as its escape when there is no `ESCAPE` clause, as each warehouse
  documents it: a backslash on Postgres, Redshift, MySQL, BigQuery, Spark/Databricks, Hive and ClickHouse; none on
  Snowflake, SQL Server, Oracle, SQLite and Trino/Presto, where a backslash in the pattern is just a backslash. A
  dialect that is not here (Druid, or the default dialect) is not known either way, see [[default-escape]]."
  {"postgres"   \\
   "redshift"   \\
   "mysql"      \\
   "bigquery"   \\
   "spark"      \\
   "databricks" \\
   "hive"       \\
   "clickhouse" \\
   "snowflake"  nil
   "tsql"       nil
   "oracle"     nil
   "sqlite"     nil
   "trino"      nil
   "presto"     nil})

(mu/defn- default-escape :- [:maybe char?]
  "The escape character of the `LIKE` `pattern` written without an `ESCAPE` clause in `dialect` (see
  [[default-like-escape]]); [[throw-unsupported]] when the pattern has a backslash and the dialect's default is not
  known, since the pattern means two different things depending on it."
  [pattern :- :string
   dialect :- ::dialect]
  (if (contains? default-like-escape dialect)
    (get default-like-escape dialect)
    (when (str/includes? pattern "\\")
      (throw-unsupported (str "the pattern %s has a backslash, and whether %s reads one as the escape character"
                              " without an ESCAPE clause is not known; add ESCAPE")
                         (pr-str pattern) (dialect-name dialect)))))

(mu/defn- like :- ::condition
  "`LIKE` or, `case-insensitive?`, `ILIKE`, with `escape` as the pattern's escape character: `::default` for the
  dialect's own (see [[default-escape]]), when there is no `ESCAPE` clause. See [[like-clause]]. On SQL Server `[`
  opens a character class, which Lib's string filters cannot express, so a pattern with one is
  [[throw-unsupported]]."
  [node              :- ::node
   ctx               :- ::context
   case-insensitive? :- :boolean
   escape            :- [:or char? [:= ::default]]]
  (let [pattern (pattern-literal node ctx (if case-insensitive? "ILIKE" "LIKE"))
        escape  (if (= escape ::default) (default-escape pattern (:dialect ctx)) escape)
        thunk   #(->value (arg node :this) ctx)]
    (when (and (= (:dialect ctx) "tsql") (str/includes? pattern "["))
      (throw-unsupported "the pattern %s has a [, which SQL Server reads as a character class; that is not supported"
                         (pr-str pattern)))
    (let [clause (like-clause thunk (like-tokens pattern escape) case-insensitive?)]
      (if (arg node :negate) (negated-match thunk clause) clause))))

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
            (throw-unsupported "the pattern %s ends with its escape character" (pr-str pattern)))
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
   ctx            :- ::context
   escape         :- [:maybe char?]]
  (regex-match (->value (arg node :this) ctx)
               (similar-to-regex (pattern-literal node ctx "SIMILAR TO") escape)
               false))

(mu/defn- escape->predicate :- ::condition
  "`x LIKE 'a!%' ESCAPE '!'`: the escape character wraps the pattern operator."
  [node           :- ::node
   ctx            :- ::context]
  (let [escape-string (->value (arg node :expression) ctx)
        inner         (arg node :this)]
    (when-not (and (string? escape-string) (= 1 (count escape-string)))
      (throw-unsupported "ESCAPE %s is not supported, only a one-character string literal is"
                         (:sql (arg node :expression))))
    (let [escape (first escape-string)]
      (case (:class inner)
        "Like"      (like inner ctx false escape)
        "ILike"     (like inner ctx true escape)
        "SimilarTo" (similar-to inner ctx escape)
        (throw-unsupported "%s is not supported as a condition" (describe node))))))

(mu/defn- regexp-like :- ::condition
  "`x ~ 'regex'` (`regexp_like(x, 'regex')`), or `x ~* 'regex'` when `case-insensitive?`, as a regex match."
  [node              :- ::node
   ctx               :- ::context
   case-insensitive? :- :boolean]
  (regex-match (->value (arg node :this) ctx)
               (pattern-literal node ctx (if case-insensitive? "~*" "~"))
               case-insensitive?))

(def ^:private value-converters
  "The converter for each sqlglot node class the subset covers where a value is expected: columns, literals,
  arithmetic, `CASE`, casts and the functions that have a Lib expression function of the same meaning. The dispatch
  is [[->value]]."
  {"Column"           column->value
   "Literal"          literal->value
   "Boolean"          (fn [node _ctx] (boolean (arg node :this)))
   "Null"             (constantly nil)
   "Neg"              negation->value
   "Paren"            (fn [node ctx] (->value (arg node :this) ctx))
   "Add"              (arithmetic lib/+)
   "Sub"              (arithmetic lib/-)
   "Mul"              (arithmetic lib/*)
   "Div"              division->value
   "Pow"              (arithmetic lib/power)
   "Cast"             cast->value
   ;; sqlglot reads Spark's `CAST`, which is lenient, as a `TRY_CAST`; the two differ only in what a value that
   ;; cannot be converted does, an error or a null
   "TryCast"          cast->value
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
   "Concat"           (fn [node ctx] (concatenate (arg node :expressions) ctx))
   ;; `a || b || c`
   "DPipe"            (fn [node ctx] (concatenate (operands node "DPipe") ctx))
   "Extract"          extract->value
   "TimestampTrunc"   date-trunc->value
   "DateTrunc"        date-trunc->value
   "CurrentTimestamp" (fn [_node _ctx] (lib/now))
   "CurrentDate"      (fn [_node _ctx] (lib/today))})

(def ^:private predicate-converters
  "The converter for each sqlglot node class the subset covers where a boolean is expected: a whole filter, a `WHEN`,
  an operand of `AND`, `OR` or `NOT`. The dispatch is [[->predicate]]."
  {"Column"      column->predicate
   "Paren"       (fn [node ctx] (->predicate (arg node :this) ctx))
   "EQ"          (comparison lib/=)
   "NEQ"         (comparison not-equal)
   "GT"          (comparison lib/>)
   "GTE"         (comparison lib/>=)
   "LT"          (comparison lib/<)
   "LTE"         (comparison lib/<=)
   "And"         (logical lib/and "And")
   "Or"          (logical lib/or "Or")
   "Not"         not->predicate
   "Is"          (fn [node ctx] (is node ctx (boolean (arg node :negate))))
   "In"          (fn [node ctx] (in node ctx false))
   "Between"     between->predicate
   "NullSafeEQ"  (fn [node ctx] (null-safe-comparison node ctx false))
   "NullSafeNEQ" (fn [node ctx] (null-safe-comparison node ctx true))
   "Like"        (fn [node ctx] (like node ctx false ::default))
   "ILike"       (fn [node ctx] (like node ctx true ::default))
   "SimilarTo"   (fn [node ctx] (similar-to node ctx \\))
   "Escape"      escape->predicate
   "RegexpLike"  (fn [node ctx] (regexp-like node ctx false))
   "RegexpILike" (fn [node ctx] (regexp-like node ctx true))})

(mu/defn- ->value :- ::value
  "The Lib expression for the sqlglot `node` used as a value, through [[value-converters]]: a column, a literal (a
  `NULL` is nil), arithmetic, or `CASE`. [[throw-unsupported]] for a node class the subset does not cover, naming
  the function or the construct."
  [node           :- ::node
   ctx            :- ::context]
  (if-let [convert (get value-converters (:class node))]
    (convert node ctx)
    (if-let [function-name (:func node)]
      (throw-unsupported "the function %s is not supported" (u/lower-case-en function-name))
      (throw-unsupported "%s is not supported" (describe node)))))

(mu/defn- ->predicate :- ::condition
  "The Lib filter clause for the sqlglot `node` used where a boolean is expected, through [[predicate-converters]].
  [[throw-unsupported]] for a node class the subset does not cover as a condition."
  [node           :- ::node
   ctx            :- ::context]
  (if-let [convert (get predicate-converters (:class node))]
    (convert node ctx)
    (throw-unsupported "%s is not supported as a condition" (describe node))))

(mr/def ::options
  "Options for [[expression->mbql]]. `:condition?` says the SQL is a condition, read where SQL expects a boolean."
  [:maybe [:map {:closed true}
           [:condition? {:optional true} :boolean]]])

(mu/defn expression->mbql :- ::value
  "The Lib expression for the SQL expression `sql`, written in `dialect`, with each column name resolved by
  `resolve-column`. Only an expression converts, on its own: `sales / target` or `status = 'Shipped'`, never a
  `SELECT`.

  With `:condition?` in `options`, `sql` is a condition, read where SQL expects a boolean (a `WHERE`, a `WHEN`), and
  comes back as a Lib filter clause; a bare boolean column there is `column = true`. Otherwise it is a value, and
  comes back as a Lib expression, or as itself when it is a literal (nil for `NULL`); a comparison is a condition, not
  a value.

  Throws an exception [[unsupported?]] recognises, naming the construct, for SQL the subset does not cover."
  ([dialect        :- ::dialect
    sql            :- :string
    resolve-column :- ::resolve-column]
   (expression->mbql dialect sql resolve-column nil))

  ([dialect              :- ::dialect
    sql                  :- :string
    resolve-column       :- ::resolve-column
    {:keys [condition?]} :- ::options]
   (let [node (parse dialect sql)
         ctx  {:dialect dialect, :resolve-column resolve-column}]
     (if condition?
       (->predicate node ctx)
       (->value node ctx)))))
