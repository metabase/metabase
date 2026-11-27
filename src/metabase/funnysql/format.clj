(ns metabase.funnysql.format
  "Compiles Honey SQL-shaped app-DB queries to `[sql & args]` for `:h2`, `:postgres` or `:mysql`. Closed: a clause or
  function absent from [[clause-fns]]/[[call!]] throws. Values bind as `?`; only integers, booleans, validated
  tokens, `[:literal s]` and `[:inline <number>]` are spliced. A map compiles as a query only at top level or when
  marked `^:allow-subquery`. No support at all for `:raw`."
  (:refer-clojure :exclude [format])
  (:require
   [clojure.string :as str]
   [flatland.ordered.map :as ordered-map]
   [flatland.ordered.set :as ordered-set]
   [honey.sql.pg-ops]
   [metabase.funnysql.schema :as funnysql.schema]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- default-context
  "A fresh compile context for `engine` and `options`."
  [engine options]
  {:engine  engine
   :options options
   :sql     (StringBuilder.)
   :args    (volatile! (transient []))})

(defn- engine
  "The engine `context` compiles for."
  [context]
  (:engine context))

(defn- options
  "The options `context` compiles with."
  [context]
  (:options context))

(defn- append-sql!
  "Append `s` to the SQL text of `context`."
  [context s]
  (.append ^StringBuilder (:sql context) (str s))
  nil)

(defn- append-arg!
  "Append `arg` to the arguments of `context`."
  [context arg]
  (vswap! (:args context) conj! arg)
  nil)

(defn- result!
  "The `[sql & args]` written to `context`."
  [context]
  (into [(str (:sql context))] (persistent! @(:args context))))

(declare expr! call! query!)

(defn- subquery?
  "Whether `x` is a map marked `^:allow-subquery`."
  [x]
  (boolean (and (map? x)
                (:allow-subquery (meta x)))))

(defn- call-form?
  "Whether `x` is a vector headed by a keyword, the shape of a call."
  [x]
  (and (vector? x)
       (keyword? (get x 0))))

(defn- call-of-type?
  "Whether `x` is a call of the operator `k-or-k-set`, or of one of the set of them."
  [x k-or-k-set]
  (and (call-form? x)
       (let [f (get x 0)]
         (if (set? k-or-k-set)
           (contains? k-or-k-set f)
           (= f k-or-k-set)))))

(defn- bind-value!
  "Write a `?` to the SQL text and bind `x` to it."
  [x context]
  (append-sql! context "?")
  (append-arg! context x))

(defn- splice-number!
  "Write `n` into the SQL text as a numeric literal. A Ratio is written as a double, since `1/2` is not SQL."
  [n context]
  (let [s (str (cond-> n (ratio? n) double))]
    ;; don't trust `(str n)` blindly -- fail closed instead of splicing whatever it produces. This rejects
    ;; non-finite Doubles (`NaN`, `Infinity`) and guards against a hostile custom `Number` implementation whose
    ;; `toString` isn't numeric SQL syntax.
    (when-not (re-matches #"-?\d+(\.\d+)?([eE][+-]?\d+)?" s)
      (throw (ex-info "Invalid number" {:n n})))
    (append-sql! context s)))

(defn- number!
  "Splice an integer; bind anything else. Postgres and H2 type a decimal literal like `0.5` as an exact `NUMERIC`, so a
  spliced Double, Float or Ratio would come back as a `BigDecimal`, and a Float would be written as its shortest
  decimal rather than the value it holds. Bound, each keeps its type -- [[metabase.app-db.jdbc-protocols]] sets a
  Ratio as a double -- which is what Honey SQL did (#9246). Use `[:inline n]` where a non-integral number has to be a
  literal."
  [n context]
  (if (integer? n)
    (splice-number! n context)
    (bind-value! n context)))

(defn- interpose-fn
  "Iterate all elements in `xs`. Execute `(x-fn <x>)` for each item in `xs`. Execute `(separator-fn)` in between each
  item in `xs`."
  [xs x-fn separator-fn]
  {:pre [(or (nil? xs) (coll? xs))]} ; maps are ok here, we can iterate over the pairs
  (when (seq xs)
    (loop [[x & more] xs]
      (x-fn x)
      (when (seq more)
        (separator-fn)
        (recur more)))))

(defn- ->sequence
  "Normalize a clause value that is allowed to be either a single item or a sequence of them. Honey SQL accepts
  `{:group-by :id}` as shorthand for `{:group-by [:id]}` -- likewise `:select`, `:order-by`, `:columns`, `:returning`
  and `:partition-by` -- and plenty of app-db queries rely on that, so accept it instead of blowing up on `(seq :id)`."
  [x]
  (cond
    ;; `nil` means the clause is absent, not a one-element list containing `NULL`
    (nil? x)                      nil
    (or (sequential? x) (set? x)) x
    :else                         [x]))

(defn- commas!
  "Compile `xs` separated by commas."
  [xs context]
  (interpose-fn xs #(expr! % context) #(append-sql! context ", ")))

(defn- parens!
  "Compile `x` wrapped in parens. A `^:allow-subquery` map is compiled directly rather than via [[expr!]], which
  would parenthesize it a second time."
  [x context]
  (append-sql! context "(")
  ((if (subquery? x) query! expr!) x context)
  (append-sql! context ")"))

(defn- list!
  "Compile `xs` as a parenthesized list."
  [xs context]
  (append-sql! context "(")
  (commas! xs context)
  (append-sql! context ")"))

(defn- check-identifier-form
  "Table/column-name positions must never silently fall through to [[bind-value!]]'s `?`-parameter handling just
  because someone passed the wrong shape of value (a string, a number, a map...) -- that produces a confusing
  runtime error from the database instead of a clear one from the compiler. Call this before compiling anything
  in one of those positions."
  [x]
  (when-not (keyword? x)
    (throw (ex-info "Expected an identifier" {:x x}))))

(defn- check-subquery-marked
  "In a position that only takes a query -- a CTE, `FROM`, a join, `EXISTS`, `UNION`, `INSERT INTO ... SELECT` -- a map
  not marked `^:allow-subquery` would be bound as a `?` the database can only reject, so throw instead, like `:in`
  does. Call this before compiling anything in one of those positions."
  [x]
  (when (and (map? x)
             (not (subquery? x)))
    (throw (ex-info "A subquery must be marked ^:allow-subquery" {:subquery x}))))

(defn- quoted-identifier!
  "Emit `s` as a single quoted identifier. `s` must already be validated -- it is not escaped."
  [s context]
  (let [engine     (engine context)
        quote-char (case engine
                     :mysql "`"
                     "\"")]
    (append-sql! context quote-char)
    (append-sql! context (case engine
                           :h2 (u/upper-case-en s)
                           s))
    (append-sql! context quote-char)))

(defn- identifier-part!
  "Emit a single quoted and escaped identifier part."
  [part context]
  (if (= part "*")
    (append-sql! context "*")
    (do
      (when-not (re-matches #"^[A-Za-z_][?A-Za-z0-9_-]*$" part)
        (throw (ex-info "Invalid identifier" {:identifier part})))
      (quoted-identifier! part context))))

(defn- identifier!
  "Emit a (possibly qualified) identifier composed of multiple [[identifier-part!]]s."
  [s context]
  (interpose-fn (str/split s #"\.") #(identifier-part! % context) #(append-sql! context ".")))

(defn- alias!
  "Emit the alias in `<x> AS <alias>`. An alias names a single thing, so like Honey SQL, an unqualified keyword alias is
  quoted whole rather than split on `.` into qualified parts -- `:report_card.name` is the column `\"report_card.name\"`,
  not `\"report_card\".\"name\"`, which isn't valid SQL in an alias. For the same reason a qualified keyword throws
  rather than compiling to `AS \"a\".\"b\"`."
  [alias context]
  (if (simple-keyword? alias)
    (let [s (name alias)]
      (when-not (re-matches #"^[A-Za-z_][?A-Za-z0-9_.-]*$" s)
        (throw (ex-info "Invalid alias" {:alias alias})))
      (quoted-identifier! s context))
    (throw (ex-info "Invalid alias: an alias cannot be qualified" {:alias alias}))))

(defn- identifier-with-optional-alias!
  "Handle an identifier form as seen in `:select`, `:from`, etc.; unwrapped or a vector with one element will act an
  unaliased identifier while a vector with two elements will emit `<x> AS <y>`. `check-lhs`, if given, is called with
  the unaliased part before it is compiled."
  [identifier context & {:keys [check-lhs include-as?], :or {include-as? true}}]
  (let [[lhs rhs] (if (vector? identifier)
                    identifier
                    [identifier])]
    (when check-lhs
      (check-lhs lhs))
    (expr! lhs context)
    (when rhs
      ;; the alias is a name, not a value: a string here would otherwise become a `?` parameter and the database
      ;; would reject `count(*) AS ?`
      (check-identifier-form rhs)
      (append-sql! context (if include-as? " AS " " "))
      (alias! rhs context))))

(defn- identifier-list!
  "Compile a parenthesized list of column names."
  [xs context]
  (let [xs (->sequence xs)]
    (run! check-identifier-form xs)
    (list! xs context)))

(defn- assignments!
  "Compile `col = value` assignments separated by commas."
  [kvs context]
  (letfn [(x-equals-y! [[x y]]
            (check-identifier-form x)
            (expr! x context)
            (append-sql! context " = ")
            (expr! y context))]
    (interpose-fn kvs x-equals-y! #(append-sql! context ", "))))

(defn- function-call!
  "Compile `f(args...)`."
  [f args context]
  (append-sql! context (name f))
  (list! args context))

(defn- type-name!
  "Compile a SQL type name, validated with [[h2x/raw-type-name?]] before it is spliced."
  [type-name context]
  (let [;; a keyword spells the spaces in a type name as dashes, e.g. `:timestamp-with-time-zone`. A string is the name
        ;; exactly as given, where a dash can be meaningful -- ClickHouse's `DateTime64(3, 'America/Port-au-Prince')`
        keyword-name  (fn [k]
                        (str/replace (name k) #"-" " "))
        type-name-str (cond
                        ;; support annoying forms like `[:varchar 26]` -- we still want to validate these so compile
                        ;; them recursively to a string like `varchar(26)` so we can validate them
                        (vector? type-name)
                        (let [recursive-context (default-context (engine context) (options context))]
                          (function-call! (keyword-name (first type-name)) (rest type-name) recursive-context)
                          (first (result! recursive-context)))

                        (keyword? type-name)
                        (keyword-name type-name)

                        :else
                        (name type-name))]
    (when-not (h2x/raw-type-name? type-name-str)
      (throw (ex-info "Invalid type" {:type type-name-str})))
    (append-sql! context type-name-str)))

(defn- string-literal!
  "Splice `s`, a hardcoded string or keyword, as a single-quoted SQL string literal."
  [s context]
  ;; only double backslashes on engines that actually treat `\` as an escape character inside a plain `'...'`
  ;; literal. MySQL always does, unless the session's `NO_BACKSLASH_ESCAPES` sql_mode is set (see
  ;; [[metabase.driver.mysql/utf8-string-literal]]'s docstring for the same caveat). Postgres and H2 do *not*, as long
  ;; as `standard_conforming_strings` is on (the default) -- doubling backslashes there would corrupt a value that
  ;; legitimately contains one instead of protecting it. See [[metabase.driver.sql.util/escape-sql]], which documents
  ;; this exact per-engine distinction (`:ansi` vs `:backslashes` vs `:ansi+backslashes`) and warns against relying on
  ;; any of these styles to sanitize untrusted input in the first place.
  (let [s (as-> s s
            (u/qualified-name s)
            (cond-> s
              (= (engine context) :mysql) (str/replace "\\" "\\\\"))
            (str/replace s "'" "''"))]
    (append-sql! context "'")
    (append-sql! context s)
    (append-sql! context "'")))

(defn- check-valid-unit
  "Throw unless `unit` is a token of letters and digits, safe to splice."
  [unit]
  (when-not (and ((some-fn keyword? string?) unit)
                 (re-matches #"^[a-zA-Z0-9]+$" (name unit)))
    (throw (ex-info "Invalid unit" {:unit unit}))))

(def ^:private predicate-operators
  "Operators that compile to a bare SQL predicate -- `x IS NULL`, `a AND b`, `x IN (...)`, `x < 1`. Used as the operand
  of a comparison these have to be parenthesized; everything else (function calls, `:cast`, arithmetic) either brings
  its own delimiters or binds tighter than a comparison already, and wrapping those would just add noise."
  #{:!=
    :<
    :<=
    :<>
    :=
    :>
    :>=
    :and
    :between
    :escape
    :exists
    :ilike
    :in
    :is
    :is-not
    :like
    :not
    :not-exists
    :not-in
    :not-like
    :not=
    :or
    :regexp
    honey.sql.pg-ops/atat})

(defn- predicate-call?
  "Whether `x` is a call of one of the [[predicate-operators]]."
  [x]
  (call-of-type? x predicate-operators))

(def ^:private infix-operators
  (into predicate-operators #{:+ :- :/ :* :% :||}))

(defn- infix-call?
  "Whether `x` compiles to a bare infix expression -- a [[predicate-call?]], arithmetic, `||`, or on Postgres a
  `:date-add` -- which needs parens as the operand of another infix operator: `[:* [:+ :x 1] 2]` is `(x + 1) * 2`, not
  `x + 1 * 2`. `:escape` is the exception. It is the postfix `ESCAPE` of the `LIKE` pattern it is the operand of, and
  `x LIKE (? ESCAPE '!')` is not valid SQL."
  [x context]
  (and (call-form? x)
       (not (call-of-type? x :escape))
       (or (call-of-type? x infix-operators)
           (and (call-of-type? x :date-add)
                (= (engine context) :postgres)))))

(defn- infix-operand!
  "Compile `x` as the operand of an infix operator like `*`, `IS`, `BETWEEN` or `IN`, parenthesized if it is an
  [[infix-call?]]."
  [x context]
  ((if (infix-call? x context) parens! expr!) x context))

(defn- infix!
  "Compile the operator `f` between `args`, or as a unary `+`/`-` when there is one."
  [f args context]
  (if (= (count args) 1)
    (let [x (first args)]
      (case f
        :+ (expr! x context)
        :- (if (number? x)
             (expr! (-' x) context)
             (do
               (append-sql! context "-")
               ;; always parenthesize the operand: written bare, one that compiles to a negative number would give
               ;; `--1`, which starts a SQL comment
               (parens! x context)))))
    (let [f-str (case f
                  :like     " LIKE "
                  :ilike    " ILIKE "
                  :not-like " NOT LIKE "
                  :is       " IS "
                  :is-not   " IS NOT "
                  (str \space (name f) \space))]
      (interpose-fn args #(infix-operand! % context) #(append-sql! context f-str)))))

(defn- equals!
  "Compile an equality `x <sql> y`, or `x <nil-sql>` when either side is `nil`."
  [sql nil-sql [x y :as args] context]
  (when-not (= (count args) 2)
    (throw (ex-info "Wrong number of args to :=/:!=/:<>/:not= (expected 2 args)" {:args args})))
  ;; A `nil` on *either* side becomes `IS [NOT] NULL` against whichever side is non-`nil`, matching Honey SQL's
  ;; `:transform-null-equals`. This has to cover `[:= nil x]` as well as `[:= x nil]`: compiling the `nil` as a plain
  ;; operand would give `NULL = x`, which evaluates to `NULL` rather than `TRUE` and so silently matches no rows.
  ;; `[:= nil nil]` keeps a literal `NULL` on the left, giving `NULL IS NULL`.
  (letfn [(operand! [v]
            ;; make sure if the operand is itself something like `[:= x nil]` we get `(x IS NULL) = <y>` instead of
            ;; the unparsable `x IS NULL = y`. (A scalar subquery gets the same treatment, but [[expr!]] already
            ;; parenthesizes those.)
            ((if (predicate-call? v) parens! expr!) v context))]
    (if (or (nil? x) (nil? y))
      (do
        (operand! (if (nil? x) y x))
        (append-sql! context nil-sql))
      (do
        (operand! x)
        (append-sql! context sql)
        (operand! y)))))

(defn- compound!
  "Compile a compound boolean expression like `:and` or `:or`. Like Honey SQL we ignore `nil` args -- this is what makes
  `[:and x (when y z)]` work -- and if nothing is left we compile `identity-value` (`TRUE` for AND, `FALSE` for OR)
  rather than emitting nothing at all."
  [sql identity-value xs context]
  (let [xs (filter some? xs)]
    (condp = (count xs)
      0 (expr! identity-value context)
      1 (expr! (first xs) context)
      (interpose-fn xs #(parens! % context) #(append-sql! context sql)))))

(defn- param-value
  "The value `context`'s options bind to `k`, for a `[:param k]` form. Throws if param named by `k` is missing from
  `:params` in the options map."
  [k context]
  {:pre [(keyword? k)]}
  ;; look the key up with a sentinel rather than testing the value for truthiness -- `false` and `nil` are both
  ;; legitimate parameter values.
  (let [v (get-in (options context) [:params k] ::not-found)]
    (when (= v ::not-found)
      (throw (ex-info "Missing value for :param" {:param k})))
    v))

(defn- lift-value
  "`x` with each call or keyword in it wrapped in `[:lift ...]`, so it is bound rather than compiled."
  [x]
  (cond
    ((some-fn call-form? keyword?) x)
    [:lift x]

    ((some-fn sequential? set?) x)
    (mapv lift-value x)

    :else
    x))

(defn- in-values
  "The values side of an `:in`/`:not-in` form, with a `[:param k]` naming a collection resolved to
  that collection.

  `IN` takes a list of values rather than one value, so a collection bound to a param has to expand
  into `(?, ?)`. Compiled as an ordinary param it emits a single `?` and binds the whole collection,
  which no database accepts -- and an empty one would slip past the rewrite below and emit `IN ()`.
  Honey SQL expands a collection-valued param in this position the same way.

  A param naming anything else is left alone, and compiles to a single `?` as it would in any other
  value slot. A scalar is not a list of values, and a map must stay one bound value rather than
  become a list of its entries."
  [vs context]
  (if (call-of-type? vs :param)
    (let [v (lift-value (param-value (second vs) context))]
      (if (or (sequential? v) (set? v))
        v
        vs))
    vs))

(defn- in!
  "Compile `lhs IN vs` or `lhs NOT IN vs`, or the constant an empty `vs` makes it."
  [f lhs vs context]
  (let [vs (in-values vs context)]
    (when-not (or (empty? vs)
                  (sequential? vs)
                  (set? vs)
                  (subquery? vs))
      (throw (ex-info "Invalid sequence of values (maps must be marked with ^:allow-subquery)" {:vs vs})))
    (if (empty? vs)
      (expr! (case f
               :in     false
               :not-in true)
             context)
      (do
        (infix-operand! lhs context)
        (append-sql! context (case f
                               :in     " IN "
                               :not-in " NOT IN "))
        (cond
          (subquery? vs)
          (expr! vs context)

          ;; sequence of sequences
          (and (sequential? (first vs))
               (not (call-form? (first vs))))
          (do
            (append-sql! context "(")
            (interpose-fn vs #(list! % context) #(append-sql! context ", "))
            (append-sql! context ")"))

          ;; Handle nonsense like`[:in :field [:inline [3]]]`
          (call-form? vs)
          (expr! vs context)

          :else
          (list! vs context))))))

(defn- exists!
  "Compile `<sql>(subquery)`."
  [sql subquery context]
  (check-subquery-marked subquery)
  (append-sql! context sql)
  (expr! subquery context))

(defn- interval-literal!
  "Compile an interval of `amount` `unit`s, `INTERVAL '2 day'` on Postgres and `INTERVAL 2 day` on MySQL."
  [amount unit context]
  (when-not (number? amount)
    (throw (ex-info "Invalid amount" {:amount amount})))
  (when-not (#{:millisecond :second :minute :hour :day :week :month :year} unit)
    (throw (ex-info "Invalid unit" {:unit unit})))
  (let [postgres? (= (engine context) :postgres)]
    (append-sql! context (if postgres? "INTERVAL '" "INTERVAL "))
    ;; always splice the amount: a non-integral one would otherwise be bound, and on Postgres the `?` would land inside
    ;; the quoted literal, where JDBC ignores it
    (splice-number! amount context)
    (append-sql! context " ")
    (append-sql! context (name unit))
    (when postgres?
      (append-sql! context "'"))))

(defn- cast-unless!
  "Compile `x`, or `CAST(x AS type)` unless `skip-cast?`."
  [x type-name skip-cast? context]
  (if skip-cast?
    (expr! x context)
    (do
      (append-sql! context "CAST(")
      (expr! x context)
      (append-sql! context " AS ")
      (type-name! type-name context)
      (append-sql! context ")"))))

(defn- expr-identifier!
  "Compile a keyword as a quoted and escaped identifier, throwing for Honey SQL's `:%f.arg` call shorthand, which Funny
  SQL does not support: a call is always the vector `[:f arg]`."
  [k context]
  (when (str/starts-with? (u/qualified-name k) "%")
    (throw (ex-info (clojure.core/format "Funny SQL doesn't support the %s call shorthand; write the call as a vector" k)
                    {:identifier k})))
  (if (qualified-keyword? k)
    (do
      (identifier! (namespace k) context)
      (append-sql! context ".")
      (identifier! (name k) context))
    (identifier! (name k) context)))

(defn- expr-value!
  "Compile a literal value: `NULL`, `TRUE`/`FALSE`, a number, or a bound `?`."
  [x context]
  (cond
    (nil? x)     (append-sql! context "NULL")
    (boolean? x) (append-sql! context (str x))
    (number? x)  (number! x context)
    :else        (bind-value! x context)))

(defn- expr-param!
  "Compile `[:param k]` as a `?` bound to the value of `k` in the options' `:params`."
  [[_ k] context]
  (bind-value! (param-value k context) context))

(defn- expr-subquery!
  "Compile a scalar subquery, derived table and the like, which below the top level is always parenthesized."
  [x context]
  (parens! x context))

(defn- expr-list!
  "Compile a parenthesized list of expressions."
  [xs context]
  ;; a function call has to be a vector. Compiled as a list of values, a seq like `(cons :or clauses)` gives
  ;; `("or", ...)`, which the database only rejects later with a misleading `Column "OR" not found`
  (when (and (sequential? xs)
             (keyword? (first xs)))
    (throw (ex-info "A function call must be a vector, not a seq" {:form xs})))
  (list! xs context))

(defn- expr!
  "Compile an expression, dispatching on its kind like [[::funnysql.schema/expr]]."
  [x context]
  (cond
    (keyword? x)                  (expr-identifier! x context)
    (map? x)                      ((if (subquery? x) expr-subquery! bind-value!) x context)
    (call-form? x)                ((if (= (first x) :param) expr-param! call!) x context)
    (or (sequential? x) (set? x)) (expr-list! x context)
    :else                         (expr-value! x context)))

(defn- call-=!
  "Compile `x = y`, or `x IS NULL` against a `nil`."
  [[_ & args] context]
  (equals! " = " " IS NULL" args context))

(defn- call-<>!
  "Compile `x <> y`, or `x IS NOT NULL` against a `nil`."
  [[_ & args] context]
  (equals! " <> " " IS NOT NULL" args context))

(defn- call-and!
  "Compile `a AND b ...`."
  [[_ & args] context]
  (compound! " AND " true args context))

(defn- call-or!
  "Compile `a OR b ...`."
  [[_ & args] context]
  (compound! " OR " false args context))

(defn- call-not!
  "Compile `NOT (x)`."
  [[_ x] context]
  (append-sql! context "NOT ")
  (parens! x context))

(defn- call-comparison!
  "Compile a binary comparison or pattern match."
  [[f & args] context]
  (infix! f args context))

(defn- call-arithmetic!
  "Compile arithmetic or string concatenation."
  [[f & args] context]
  (infix! f args context))

(defn- call-between!
  "Compile `x BETWEEN low AND high`."
  [[_ x y z] context]
  (infix-operand! x context)
  (append-sql! context " BETWEEN ")
  (infix-operand! y context)
  (append-sql! context " AND ")
  (infix-operand! z context))

(defn- call-case!
  "Compile `CASE WHEN ... THEN ... ELSE ... END`."
  [[_ & args] context]
  (append-sql! context "CASE ")
  (loop [[condition expr & more] args]
    (if-not (= condition :else)
      (do
        (append-sql! context "WHEN ")
        (expr! condition context)
        (append-sql! context " THEN ")
        (expr! expr context))
      (do
        (append-sql! context "ELSE ")
        (expr! expr context)))
    (when (seq more)
      (append-sql! context \space)
      (recur more)))
  (append-sql! context " END"))

(defn- call-cast!
  "Compile `CAST(x AS type)`."
  [[_ x type-name] context]
  (cast-unless! x type-name false context))

(defn- call-composite!
  "Compile a row constructor `(a, b, ...)`."
  [[_ & args] context]
  (list! args context))

(defn- call-current-timestamp!
  "Compile the current moment at the app DB's best precision, `now()`, or `now(6)` on MySQL where `now()` has whole
  seconds."
  [_form context]
  (append-sql! context (if (= (engine context) :mysql) "now(6)" "now()")))

(defn- call-date-add!
  "Compile `x` plus `amount` `unit`s: a timestamp plus an interval on Postgres, `date_add` on MySQL and `dateadd` on H2,
  casting `x` to a timestamp unless it is `[:current-timestamp]`."
  [[_ x amount unit] context]
  (let [now? (call-of-type? x :current-timestamp)]
    (case (engine context)
      :postgres
      (let [[amount unit] (if (= unit :quarter) [(* 3 amount) :month] [amount unit])]
        (cast-unless! x :timestamp now? context)
        (append-sql! context " + ")
        (interval-literal! amount unit context))

      :mysql
      (let [[amount unit] (if (= unit :millisecond) [(/ amount 1000.0) :second] [amount unit])]
        (append-sql! context "date_add(")
        (expr! x context)
        (append-sql! context ", ")
        (interval-literal! amount unit context)
        (append-sql! context ")"))

      :h2
      (let [[amount unit] (cond
                            (= unit :quarter)                                 [(* amount 3) :month]
                            (and (= unit :second) (not (zero? (rem amount 1)))) [(* amount 1000.0) :millisecond]
                            :else                                             [amount unit])]
        (append-sql! context "dateadd(")
        (string-literal! unit context)
        (append-sql! context ", ")
        (splice-number! (long amount) context)
        (append-sql! context ", ")
        (cast-unless! x :datetime now? context)
        (append-sql! context ")")))))

(defn- call-exists!
  "Compile `EXISTS (subquery)`."
  [[_ subquery] context]
  (exists! "EXISTS " subquery context))

(defn- call-not-exists!
  "Compile `NOT EXISTS (subquery)`."
  [[_ subquery] context]
  (exists! "NOT EXISTS " subquery context))

(defn- call-in!
  "Compile `x IN values`."
  [[_ lhs vs] context]
  (in! :in lhs vs context))

(defn- call-not-in!
  "Compile `x NOT IN values`."
  [[_ lhs vs] context]
  (in! :not-in lhs vs context))

(defn- call-inline!
  "Splice a number, boolean or `nil`, or a parenthesized list of them, into the SQL text."
  [[_ x] context]
  (letfn [(inlineable-atomic-value? [x]
            ((some-fn nil? number? boolean?) x))
          ;; splice numbers directly rather than via [[expr!]], since [[number!]] binds non-integral ones
          (inline-atomic-value! [x]
            ((if (number? x) splice-number! expr!) x context))]
    (cond
      (inlineable-atomic-value? x)
      (inline-atomic-value! x)

      (and ((some-fn sequential? set?) x)
           (every? inlineable-atomic-value? x))
      (do
        (append-sql! context "(")
        (interpose-fn x inline-atomic-value! #(append-sql! context ", "))
        (append-sql! context ")"))

      :else
      (throw (ex-info ":inline is only allowed for numbers, booleans and nil; use [:literal s] for a string"
                      {:inline x})))))

(defn- call-lift!
  "Bind `x` as a `?` parameter."
  [[_ x] context]
  (bind-value! x context))

(defn- call-over!
  "Compile `expr OVER (window)`."
  [[_ [expr m & more :as args]] context]
  ;; Honey SQL also accepts an alias inside the `:over` form, `[:over [expr window alias]]`. Don't silently drop it --
  ;; the query would fail later with a confusing `column "alias" does not exist`.
  (when (seq more)
    (throw (ex-info (str "`:over` only supports [<expression> <window>]; put the alias outside instead, e.g. "
                         "[[:over [<expression> <window>]] <alias>]")
                    {:args args})))
  ;; likewise don't silently drop anything else in the window -- [[query!]] would happily compile e.g. a `:where`, so
  ;; anything other than `:partition-by` and `:order-by` has to be rejected up front
  (let [unsupported-keys (remove #{:order-by :partition-by} (keys m))]
    (when (seq unsupported-keys)
      (throw (ex-info "`:over` only supports :partition-by and :order-by in the window"
                      {:window m, :unsupported-keys (vec unsupported-keys)}))))
  (expr! expr context)
  (append-sql! context " OVER (")
  (when (seq m)
    (query! m context))
  (append-sql! context ")"))

(defn- call-timestampdiff!
  "Compile `timestampdiff(unit, x, y)`."
  [[_ unit col-x col-y] context]
  (check-valid-unit unit)
  (append-sql! context "timestampdiff(")
  (append-sql! context (name unit))
  (append-sql! context ", ")
  (expr! col-x context)
  (append-sql! context ", ")
  (expr! col-y context)
  (append-sql! context ")"))

(defn- call-extract!
  "Compile `extract(unit FROM x)`."
  [[_ unit expr] context]
  (check-valid-unit unit)
  (append-sql! context "extract(")
  (append-sql! context (name unit))
  (append-sql! context " FROM ")
  (expr! expr context)
  (append-sql! context ")"))

(defn- call-distinct-count!
  "Compile `count(DISTINCT x)`."
  [[_ expr] context]
  (append-sql! context "count(DISTINCT ")
  (expr! expr context)
  (append-sql! context ")"))

(defn- call-percentile-cont!
  "Compile `percentile_cont(fraction) WITHIN GROUP (ORDER BY x)`."
  [[_ expr fraction] context]
  (when-not (number? fraction)
    (throw (ex-info "Invalid continuous percentile fraction" {:fraction fraction})))
  (append-sql! context "percentile_cont(")
  ;; splice the fraction as a literal, which [[number!]] would otherwise bind as a parameter
  (splice-number! fraction context)
  (append-sql! context ") WITHIN GROUP (ORDER BY ")
  (expr! expr context)
  (append-sql! context ")"))

(defn- call-collate!
  "Compile `x COLLATE collation`."
  [[_ expr collation] context]
  (when-not (re-matches #"^\w+$" (name collation))
    (throw (ex-info "Invalid collation" {:collation collation})))
  (expr! expr context)
  (append-sql! context " COLLATE ")
  (append-sql! context (name collation)))

(defn- call-literal!
  "Splice a hardcoded string as a single-quoted SQL string literal."
  [[_ s] context]
  (string-literal! s context))

(defn- call-escape!
  "Compile the `LIKE` pattern `pattern ESCAPE 'c'`, splicing the escape character as a literal."
  [[_ pattern escape-char] context]
  ;; `ESCAPE` is a postfix operator on a `LIKE` pattern (`... LIKE ? ESCAPE '!'`), not a function call -- compiling it
  ;; as `escape(?, '!')` produces a `Function "ESCAPE" not found` error from the database.
  (expr! pattern context)
  (append-sql! context " ESCAPE ")
  ((if (string? escape-char) string-literal! expr!) escape-char context))

(defn- call-position!
  "`[:position <substring> <string>]` compiles to `position(<substring> IN <string>)`, the 1-based index of the first
  occurrence of `substring` in `string`, or `0` if there isn't one. H2, Postgres and MySQL all accept this standard
  form, but Postgres rejects the comma form `position(<substring>, <string>)` that Honey SQL emits."
  [[_ & [substring s :as args]] context]
  (when-not (= (count args) 2)
    (throw (ex-info "Wrong number of args to :position (expected 2 args)" {:args args})))
  (append-sql! context "position(")
  (infix-operand! substring context)
  (append-sql! context " IN ")
  (infix-operand! s context)
  (append-sql! context ")"))

(defn- call-full-text-match!
  "Compile Postgres's full text search match `x @@ y`."
  [[_ lhs rhs] context]
  (check-identifier-form lhs)
  (check-identifier-form rhs)
  (expr! lhs context)
  (append-sql! context " @@ ")
  (expr! rhs context))

(defn- call-match-against!
  "Compile MySQL's Boolean-mode full text search match `MATCH (column) AGAINST (query IN BOOLEAN MODE)`."
  [[_ column query] context]
  (when-not (= (engine context) :mysql)
    (throw (ex-info "MATCH AGAINST requires MySQL" {:column column})))
  (check-identifier-form column)
  (append-sql! context "MATCH (")
  (expr! column context)
  (append-sql! context ") AGAINST (")
  (expr! query context)
  (append-sql! context " IN BOOLEAN MODE)"))

(defn- call-system-variable!
  "Compile MySQL's session system variable `@@name`, splicing the name, which must be a word."
  [[_ variable] context]
  (when-not (= (engine context) :mysql)
    (throw (ex-info "A system variable requires MySQL" {:variable variable})))
  (when-not (re-matches #"^\w+$" (name variable))
    (throw (ex-info "Invalid system variable" {:variable variable})))
  (append-sql! context "@@")
  (append-sql! context (name variable)))

(defn- call-function!
  "Compile a call of a whitelisted plain SQL function, `f(args...)`."
  [[f & args] context]
  (function-call! f args context))

(defn- call-call!
  "Compile `[:call f & args]` like `[f & args]`, the Honey SQL 1 spelling."
  [[_ & args] context]
  (call! (vec args) context))

(defn- call!
  "Compile a call, dispatching on its operator like [[::funnysql.schema/expr.call]]."
  [[f & args :as form] context]
  ;; This `case` has no default behavior for an unknown function on purpose: `f` can come from attacker-derived input,
  ;; so an unrecognized function name must throw instead of being spliced into the SQL raw. All allowed functions need
  ;; to be explicitly whitelisted.
  ;;
  ;; ⚠⚠⚠ DO NOT ADD SUPPORT FOR `:raw` -- IT IS NOT SUPPORTED ON PURPOSE ⚠⚠⚠
  ;;
  (case f
    :=                 (call-=! form context)
    (:<> :!= :not=)    (call-<>! form context)
    :and               (call-and! form context)
    :or                (call-or! form context)
    :not               (call-not! form context)
    :between           (call-between! form context)
    :case              (call-case! form context)
    :cast              (call-cast! form context)
    :composite         (call-composite! form context)
    :current-timestamp (call-current-timestamp! form context)
    :date-add          (call-date-add! form context)
    :exists            (call-exists! form context)
    :not-exists        (call-not-exists! form context)
    :in                (call-in! form context)
    :not-in            (call-not-in! form context)
    :inline            (call-inline! form context)
    :lift              (call-lift! form context)
    :over              (call-over! form context)
    :timestampdiff     (call-timestampdiff! form context)
    :extract           (call-extract! form context)
    :distinct-count    (call-distinct-count! form context)
    :percentile-cont   (call-percentile-cont! form context)
    :collate           (call-collate! form context)
    :literal           (call-literal! form context)
    :escape            (call-escape! form context)
    :position          (call-position! form context)
    :match-against     (call-match-against! form context)
    :system-variable   (call-system-variable! form context)
    :call              (call-call! form context)

    (:< :<= :> :>= :like :ilike :not-like :regexp :is :is-not)
    (call-comparison! form context)

    (:+ :- :/ :* :% :||)
    (call-arithmetic! form context)

    #_else
    (cond
      ;; [[honey.sql.pg-ops/atat]] is just `:@@`, but that doesn't work as a keyword literal, and [[case]] treats the
      ;; raw symbol as a compile-time constant instead of evaluating it to `:@@`
      (= f honey.sql.pg-ops/atat)
      (call-full-text-match! form context)

      (contains? funnysql.schema/function-names f)
      (call-function! form context)

      :else
      (throw (ex-info (clojure.core/format "Function %s is not currently supported; add it to metabase.funnysql.schema/function-arities or metabase.funnysql.format/call! if it should be"
                                           (pr-str f))
                      {:f f, :args args})))))

(defn- ctes!
  "Compile `<sql>` followed by CTEs."
  [sql ctes context]
  (append-sql! context sql)
  (letfn [(cte! [[identifier subquery & options]]
            (let [[identifier {:keys [columns]}] (if (vector? identifier)
                                                   identifier
                                                   [identifier])]
              (check-identifier-form identifier)
              (expr! identifier context)
              (when columns
                (append-sql! context \space)
                (identifier-list! columns context)))
            (append-sql! context " AS ")
            (doseq [option options]
              (case option
                :materialized (append-sql! context "MATERIALIZED ")))
            (check-subquery-marked subquery)
            (parens! subquery context))]
    (interpose-fn ctes cte! #(append-sql! context ", "))))

(defn- clause-with!
  "Compile `WITH` CTEs."
  [ctes context]
  (ctes! "WITH " ctes context))

(defn- clause-with-recursive!
  "Compile `WITH RECURSIVE` CTEs."
  [ctes context]
  (ctes! "WITH RECURSIVE " ctes context))

(defn- clause-create-table!
  "Compile `CREATE TABLE [IF NOT EXISTS] table`."
  [identifier context]
  (let [[identifier & options] (if (vector? identifier)
                                 identifier
                                 [identifier])]
    (check-identifier-form identifier)
    (append-sql! context "CREATE TABLE ")
    (doseq [option options]
      (case option
        :if-not-exists (append-sql! context "IF NOT EXISTS ")))
    (expr! identifier context)))

(defn- charset-or-collation!
  "Compile `COLLATE name` or `CHARACTER SET name`."
  [option identifier context]
  (check-identifier-form identifier)
  (append-sql! context (if (= option :collate) "COLLATE " "CHARACTER SET "))
  (expr! identifier context))

(defn- require-mysql!
  "Throw unless `context` compiles for MySQL."
  [what context]
  (when-not (= (engine context) :mysql)
    (throw (ex-info (str what " requires MySQL") {:engine (engine context)}))))

(defn- clause-engine!
  "Compile MySQL's `ENGINE InnoDB` table option, the only storage engine allowed."
  [storage-engine context]
  (require-mysql! "A table engine" context)
  (when-not (= storage-engine :innodb)
    (throw (ex-info "Table engine must be :innodb" {:storage-engine storage-engine})))
  (append-sql! context "ENGINE InnoDB"))

(defn- clause-character-set!
  "Compile MySQL's `CHARACTER SET name` table option."
  [identifier context]
  (require-mysql! "A table character set" context)
  (charset-or-collation! :character-set identifier context))

(defn- clause-collate!
  "Compile MySQL's `COLLATE name` table option."
  [identifier context]
  (require-mysql! "A table collation" context)
  (charset-or-collation! :collate identifier context))

(defn- clause-analyze-table!
  "Compile MySQL's `ANALYZE TABLE table`."
  [table context]
  (require-mysql! "ANALYZE TABLE" context)
  (check-identifier-form table)
  (append-sql! context "ANALYZE TABLE ")
  (expr! table context))

(defn- column-default!
  "Compile the value of a column's `DEFAULT`. DDL takes no parameters, so the value has to end up in the SQL text: a
  number is spliced even where [[number!]] would bind it, and anything that would compile to a `?` -- a string, say --
  throws rather than producing a `CREATE TABLE` the database rejects. Use `[:literal s]` for a string default."
  [x context]
  (if (number? x)
    (splice-number! x context)
    (let [recursive-context (default-context (engine context) (options context))
          _                 (expr! x recursive-context)
          [sql & args]      (result! recursive-context)]
      (when (seq args)
        (throw (ex-info "A column default cannot be a parameter; use [:literal s] for a string default"
                        {:default x, :args args})))
      (append-sql! context sql))))

(defn- clause-with-columns!
  "Compile the column definitions of `CREATE TABLE`."
  [column-specs context]
  (append-sql! context "(")
  (letfn [(column-identifier! [column-identifier]
            (check-identifier-form column-identifier)
            (expr! column-identifier context))
          (option! [option]
            (let [[option & args] (if (vector? option)
                                    option
                                    [option])]
              (case option
                :primary-key
                (append-sql! context "PRIMARY KEY")

                :generated-by-default-as-identity
                (append-sql! context "GENERATED BY DEFAULT AS IDENTITY")

                ;; `AUTO_INCREMENT` keeps its underscore -- it is a single keyword rather than a sequence of words
                ;; like the options above, so it is not spelled `AUTO INCREMENT`.
                :auto-increment
                (append-sql! context "AUTO_INCREMENT")

                (:collate :character-set)
                (charset-or-collation! option (first args) context)

                :not-null
                (append-sql! context "NOT NULL")

                :null
                (append-sql! context "NULL")

                :default
                ;; check `args` for emptiness rather than truthiness of its first element -- `false` and `nil` are
                ;; both perfectly good column defaults.
                (do
                  (when-not (seq args)
                    (throw (ex-info "Missing value for :default" {})))
                  (append-sql! context "DEFAULT ")
                  (column-default! (first args) context))

                (throw (ex-info "Unknown column option" {:option option, :args args})))))
          (options! [options]
            (when (seq options)
              (append-sql! context \space)
              (interpose-fn options option! #(append-sql! context \space))))
          (column-spec! [[column-identifier type-name & options]]
            (column-identifier! column-identifier)
            (append-sql! context \space)
            (type-name! type-name context)
            (options! options))]
    (interpose-fn column-specs column-spec! #(append-sql! context ", ")))
  (append-sql! context ")"))

(defn- clause-insert-into!
  "Compile `INSERT INTO table [(columns)] [subquery]`."
  [x context]
  (let [[identifier subquery] (if (and (vector? x)
                                       (vector? (get x 0)))
                                x
                                [x])]
    (append-sql! context "INSERT INTO ")
    (let [[identifier columns] (if (vector? identifier)
                                 identifier
                                 [identifier])]
      (check-identifier-form identifier)
      (expr! identifier context)
      (when (seq columns)
        (append-sql! context \space)
        (identifier-list! columns context)))
    (when subquery
      (check-subquery-marked subquery)
      (append-sql! context \space)
      ;; `INSERT INTO t SELECT ...` -- the subquery is not wrapped in parens here
      ((if (subquery? subquery) query! expr!) subquery context))))

(defn- clause-merge-into!
  "Compile H2's `MERGE INTO <table> [AS <alias>]`."
  [identifier context]
  (append-sql! context "MERGE INTO ")
  (identifier-with-optional-alias! identifier context :check-lhs check-identifier-form))

(defn- clause-using!
  "Compile the `USING <query> AS <alias>` source of a `MERGE`."
  [source context]
  (append-sql! context "USING ")
  (identifier-with-optional-alias! source context :check-lhs check-subquery-marked))

(defn- clause-on!
  "Compile the `ON` condition of a `MERGE`."
  [condition context]
  (append-sql! context "ON ")
  (expr! condition context))

(defn- clause-when-matched-update-set!
  "Compile `WHEN MATCHED THEN UPDATE SET ...`."
  [kvs context]
  (append-sql! context "WHEN MATCHED THEN UPDATE SET ")
  (assignments! kvs context))

(defn- clause-when-not-matched-insert!
  "Compile `WHEN NOT MATCHED THEN INSERT (<columns>) VALUES (<values>)` from `[columns values]`."
  [[columns values] context]
  (append-sql! context "WHEN NOT MATCHED THEN INSERT ")
  (identifier-list! columns context)
  (append-sql! context " VALUES ")
  (list! values context))

(defn- clause-columns!
  "Compile the parenthesized columns of an `INSERT` or `MERGE`."
  [columns context]
  (identifier-list! columns context))

(defn- clause-key!
  "Compile H2's `KEY (<columns>)`."
  [columns context]
  (append-sql! context "KEY ")
  (identifier-list! columns context))

(defn- clause-values!
  "Compile `VALUES` rows, with the columns of map rows before them."
  [rows context]
  (when-not (and (coll? rows)
                 (seq rows))
    (throw (ex-info ":values cannot have empty or nil rows" {:rows rows})))
  (if (map? (first rows))
    ;; if rows are maps, infer columns from the map keys; look at all rows to get the complete set since some maps
    ;; might be partial.
    (let [columns (into (ordered-set/ordered-set) (mapcat keys) rows)]
      (identifier-list! columns context)
      (append-sql! context " VALUES ")
      (interpose-fn rows #(list! (map (or % {}) columns) context) #(append-sql! context ", ")))
    ;; otherwise assume columns have been specified with `:columns` and assume `rows` is a sequence of sequences, one
    ;; for each row.
    (do
      (append-sql! context "VALUES ")
      (interpose-fn rows #(list! % context) #(append-sql! context ", ")))))

(defn- clause-drop-table!
  "Compile `DROP TABLE [IF EXISTS] table`."
  [table context]
  (let [options (butlast table)
        table   (last table)]
    (append-sql! context "DROP TABLE ")
    ;; options like `IF EXISTS` have to come before the table name -- Postgres and MySQL reject
    ;; `DROP TABLE x IF EXISTS` (H2 is the only one of the three that accepts it)
    (doseq [option options]
      (case option
        :if-exists (append-sql! context "IF EXISTS ")))
    (check-identifier-form table)
    (expr! table context)))

(defn- clause-update!
  "Compile `UPDATE table [alias]`."
  [identifier context]
  (append-sql! context "UPDATE ")
  (identifier-with-optional-alias! identifier context :check-lhs check-identifier-form, :include-as? false))

(defn- clause-set!
  "Compile `SET col = value, ...`."
  [kvs context]
  (append-sql! context "SET ")
  (assignments! kvs context))

(defn- clause-delete-from!
  "Compile `DELETE FROM table [alias]`."
  [identifier context]
  (append-sql! context "DELETE FROM ")
  (identifier-with-optional-alias! identifier context :check-lhs check-identifier-form, :include-as? false))

(defn- select-items!
  "Compile `<sql>` followed by select items."
  [sql cols context]
  (append-sql! context sql)
  (interpose-fn (->sequence cols) #(identifier-with-optional-alias! % context) #(append-sql! context ", ")))

(defn- clause-select!
  "Compile `SELECT items`."
  [cols context]
  (select-items! "SELECT " cols context))

(defn- clause-select-distinct!
  "Compile `SELECT DISTINCT items`."
  [cols context]
  (select-items! "SELECT DISTINCT " cols context))

(defn- clause-from!
  "Compile `FROM sources`."
  [from context]
  (append-sql! context "FROM ")
  (if (keyword? from)
    (identifier-with-optional-alias! from context)
    (interpose-fn from
                  #(identifier-with-optional-alias! % context :check-lhs check-subquery-marked)
                  #(append-sql! context ", "))))

(defn- joins!
  "Compile joins of `join-type`."
  [join-type joins context]
  ;; `joins` alternates `<thing-to-join> <condition>`. A missing or `nil` condition -- what a `(when ...)` around one
  ;; gives you -- would otherwise compile to `ON NULL`, which the database happily runs, silently returning no rows.
  (when-not (even? (count joins))
    (throw (ex-info "Every join needs a condition: expected [<thing-to-join> <condition> ...]" {:joins joins})))
  ;; don't spit out anything if `joins` is empty
  (when (seq joins)
    (let [join-type-sql (case join-type
                          :join  "JOIN "
                          :left  "LEFT JOIN "
                          :right "RIGHT JOIN "
                          :inner "INNER JOIN ")]
      (loop [[thing-to-join condition & more] joins]
        (when (nil? condition)
          (throw (ex-info "A join condition cannot be nil" {:thing-to-join thing-to-join})))
        (append-sql! context join-type-sql)
        (identifier-with-optional-alias! thing-to-join context :check-lhs check-subquery-marked)
        (append-sql! context " ON ")
        (expr! condition context)
        (when (seq more)
          (append-sql! context \space)
          (recur more))))))

(defn- clause-join!
  "Compile `JOIN`s."
  [joins context]
  (joins! :join joins context))

(defn- clause-left-join!
  "Compile `LEFT JOIN`s."
  [joins context]
  (joins! :left joins context))

(defn- clause-right-join!
  "Compile `RIGHT JOIN`s."
  [joins context]
  (joins! :right joins context))

(defn- clause-inner-join!
  "Compile `INNER JOIN`s."
  [joins context]
  (joins! :inner joins context))

(defn- condition!
  "Compile a `WHERE`/`HAVING` condition, dropping the clause entirely when there isn't one. Honey SQL ignores a nil or
  empty clause value and callers rely on that -- the `dashboard` search spec declares `:where []` to mean \"no extra
  filter\". Emitting it anyway is not merely untidy: `[]` compiles to `()`, which H2 reads as an empty ROW
  (`Data conversion error converting \"ROW to BOOLEAN\"`), and `WHERE NULL` would silently match no rows at all.

  Only `nil` and `[]` mean \"no condition\". Dropping a `WHERE` fails open -- the query matches every row -- so any
  other empty value, like `{}`, `#{}` or `()`, is compiled like any other condition rather than silently disappearing."
  [sql condition context]
  (when-not (or (nil? condition)
                (and (vector? condition) (empty? condition)))
    (append-sql! context sql)
    (expr! condition context)))

(defn- clause-where!
  "Compile `WHERE condition`."
  [condition context]
  (condition! "WHERE " condition context))

(defn- clause-group-by!
  "Compile `GROUP BY exprs`."
  [cols context]
  (when-let [cols (not-empty (->sequence cols))]
    (append-sql! context "GROUP BY ")
    (commas! cols context)))

(defn- clause-having!
  "Compile `HAVING condition`."
  [condition context]
  (condition! "HAVING " condition context))

(defn- clause-partition-by!
  "Compile `PARTITION BY exprs`."
  [xs context]
  (when-let [xs (not-empty (->sequence xs))]
    (append-sql! context "PARTITION BY ")
    (commas! xs context)))

(defn- union!
  "Compile the queries combined by a `UNION`. These are complete `SELECT`s rather than scalar subqueries, so unlike
  [[expr!]] don't wrap them in parens -- use `:nest` for that."
  [separator queries context]
  (interpose-fn queries
                (fn [query]
                  (check-subquery-marked query)
                  ((if (subquery? query) query! expr!) query context))
                #(append-sql! context separator)))

(defn- clause-union!
  "Compile queries combined by `UNION`."
  [queries context]
  (union! " UNION " queries context))

(defn- clause-union-all!
  "Compile queries combined by `UNION ALL`."
  [queries context]
  (union! " UNION ALL " queries context))

(def ^:private order-by-directions
  "Each `:order-by` direction as `[<sort direction> <placement of NULLs>]`; `nil` means the default."
  {:asc              [:asc nil]
   :desc             [:desc nil]
   :nulls-last       [nil :last]
   :nulls-first      [nil :first]
   :asc-nulls-last   [:asc :last]
   :desc-nulls-last  [:desc :last]
   :asc-nulls-first  [:asc :first]
   :desc-nulls-first [:desc :first]})

(defn- mysql-order-by-item!
  "MySQL and MariaDB have no `NULLS FIRST`/`NULLS LAST`. They sort `NULL` below every other value -- first ascending, last
  descending -- so when that isn't the placement asked for, sort on whether `expr` is `NULL` first."
  [expr sort-direction nulls context]
  (let [sort-direction (or sort-direction :asc)]
    (when (and nulls
               (not= nulls (case sort-direction
                             :asc  :first
                             :desc :last)))
      (append-sql! context "(")
      (expr! expr context)
      (append-sql! context (case nulls
                             :last  ") IS NULL ASC, "
                             :first ") IS NULL DESC, ")))
    (expr! expr context)
    (append-sql! context (case sort-direction
                           :asc  " ASC"
                           :desc " DESC"))))

(defn- clause-order-by!
  "Compile `ORDER BY items`."
  [subclauses context]
  (when-let [subclauses (not-empty (->sequence subclauses))]
    (append-sql! context "ORDER BY ")
    (letfn [(subclause! [subclause]
              (let [[expr direction :as args] (if (vector? subclause)
                                                subclause
                                                [subclause])]
                ;; Honey SQL 1 supported `[:field :asc :nulls-last]`, but in Funny SQL and Honey SQL 2 you should do
                ;; `[:field :asc-nulls-last]` instead. Interestingly enough HoneySQL doesn't error on these and just
                ;; silently ignores them 😢. Let's be nicer than that.
                (when (> (count args) 2)
                  (throw (ex-info "`:order-by` only supports [<expression> <direction>], but got more than 2 args" {:args args})))
                ;; the direction is optional, e.g. `[:field]` or `:field`, and defaults to `ASC`
                (let [[sort-direction nulls] (or (order-by-directions (or direction :asc))
                                                 (throw (ex-info "Invalid order by direction"
                                                                 {:direction direction, :subclause subclause})))]
                  (if (= (engine context) :mysql)
                    (mysql-order-by-item! expr sort-direction nulls context)
                    (do
                      (expr! expr context)
                      (when sort-direction
                        (append-sql! context (case sort-direction
                                               :asc  " ASC"
                                               :desc " DESC")))
                      (when nulls
                        (append-sql! context (case nulls
                                               :last  " NULLS LAST"
                                               :first " NULLS FIRST"))))))))]
      (interpose-fn subclauses subclause! #(append-sql! context ", ")))))

(defn- clause-limit!
  "Compile `LIMIT n`."
  [n context]
  (when-not ((some-fn nat-int? #(call-of-type? % :inline)) n)
    (throw (ex-info "Invalid limit" {:n n})))
  (append-sql! context "LIMIT ")
  (expr! n context))

(defn- clause-offset!
  "Compile `OFFSET n`."
  [n context]
  (when-not ((some-fn nat-int? #(call-of-type? % :inline)) n)
    (throw (ex-info "Invalid offset" {:n n})))
  (append-sql! context "OFFSET ")
  (expr! n context))

(defn- clause-for!
  "Compile `FOR` row locking options."
  [options context]
  (append-sql! context "FOR ")
  (let [options (if (vector? options)
                  options
                  [options])
        ;; other options like `:key-share`, `:no-key-update`, `:share`, `:nowait`, and `:of` exist, but we're not
        ;; currently using them; implement them if you need them.
        option! (fn [option]
                  (append-sql! context (case option
                                         :update      "UPDATE"
                                         :skip-locked "SKIP LOCKED")))]
    (interpose-fn options option! #(append-sql! context \space))))

(defn- clause-on-conflict!
  "Compile `ON CONFLICT [(columns)]`."
  [columns context]
  (append-sql! context "ON CONFLICT")
  (when (seq columns)
    (append-sql! context \space)
    (identifier-list! columns context)))

(defn- clause-do-update-set!
  "Compile `DO UPDATE SET ...`."
  [kvs context]
  (append-sql! context "DO UPDATE SET ")
  (assignments! kvs context))

(defn- clause-do-nothing!
  "Compile `DO NOTHING`."
  [_value context]
  (append-sql! context "DO NOTHING"))

(defn- clause-on-duplicate-key-update!
  "Compile `ON DUPLICATE KEY UPDATE ...`."
  [kvs context]
  (require-mysql! "ON DUPLICATE KEY UPDATE" context)
  (append-sql! context "ON DUPLICATE KEY UPDATE ")
  (assignments! kvs context))

(defn- clause-returning!
  "Compile `RETURNING exprs`."
  [cols context]
  (append-sql! context "RETURNING ")
  (commas! (->sequence cols) context))

(defn- clause-nest!
  "Compile an expression or subquery wrapped in parens."
  [x context]
  (parens! x context))

(def ^:private clause-fns
  (ordered-map/ordered-map
   :with                    clause-with!
   :with-recursive          clause-with-recursive!
   :create-table            clause-create-table!
   :with-columns            clause-with-columns!
   :engine                  clause-engine!
   :character-set           clause-character-set!
   :collate                 clause-collate!
   :analyze-table           clause-analyze-table!
   :insert-into             clause-insert-into!
   :merge-into              clause-merge-into!
   :using                   clause-using!
   :on                      clause-on!
   :when-matched-update-set clause-when-matched-update-set!
   :when-not-matched-insert clause-when-not-matched-insert!
   :columns                 clause-columns!
   :key                     clause-key!
   :values                  clause-values!
   :drop-table              clause-drop-table!
   :update                  clause-update!
   :set                     clause-set!
   :delete-from             clause-delete-from!
   :select                  clause-select!
   :select-distinct         clause-select-distinct!
   :from                    clause-from!
   :join                    clause-join!
   :left-join               clause-left-join!
   :right-join              clause-right-join!
   :inner-join              clause-inner-join!
   :where                   clause-where!
   :group-by                clause-group-by!
   :having                  clause-having!
   :partition-by            clause-partition-by!
   ;; a `UNION` combines complete `SELECT`s and any trailing `ORDER BY`/`LIMIT`/`OFFSET` applies to the combined
   ;; result, so the union body has to be emitted *before* those, not after
   :union                   clause-union!
   :union-all               clause-union-all!
   :order-by                clause-order-by!
   :limit                   clause-limit!
   :offset                  clause-offset!
   :for                     clause-for!
   :on-conflict             clause-on-conflict!
   :do-update-set           clause-do-update-set!
   :do-nothing              clause-do-nothing!
   :on-duplicate-key-update clause-on-duplicate-key-update!
   :returning               clause-returning!
   :nest                    clause-nest!))

(def ^:private clause-rank
  (into {}
        (map-indexed (fn [i [k _f]] [k i]))
        clause-fns))

(defn- query!
  "Compile a query map, its clauses in SQL order. This is normally only allowed by [[format]] but not by [[expr!]] to
  avoid accidentally compiling subqueries where unintended."
  [m context]
  (interpose-fn (sort-by clause-rank (keys m))
                (fn [k]
                  (let [f (or (clause-fns k)
                              (throw (ex-info (clojure.core/format "Top-level map key %s is not currently supported" (pr-str k))
                                              {:k k})))]
                    (f (get m k) context)))
                #(append-sql! context " ")))

(mu/defn format :- ::funnysql.schema/compiled
  "Compile `form`, a top-level map or an individual clause, to the standard `[sql & args]` for `engine`, with
  `:metabase.funnysql.core/compiled` metadata, throwing on unsupported or invalid forms."
  ([form :- ::funnysql.schema/form
    engine        :- ::funnysql.schema/engine]
   (format form engine nil))
  ([form :- ::funnysql.schema/form
    engine        :- ::funnysql.schema/engine
    options       :- ::funnysql.schema/options]
   {:pre [(#{:postgres :h2 :mysql} engine)]}
   (try
     (let [context (default-context engine options)]
       ;; [[expr!]] doesn't support compiling maps recursively unless marked `^:allow-subquery`
       ((if (map? form) query! expr!) form context)
       (with-meta (result! context) {:metabase.funnysql.core/compiled true}))
     (catch Exception e
       (throw (ex-info (str "Error compiling Funny SQL: " (ex-message e))
                       {:form form, :engine engine, :options options}
                       e))))))
