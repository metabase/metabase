(ns metabase.util.honeysql-extensions
  "Honey SQL 1 extensions. This is only used for QP stuff at this point in time -- application database stuff uses
  Toucan 2 and thus Honey SQL 2; the new namespace [[metabase.util.honey-sql-2-extensions]] provides Honey SQL 2
  versions of these functions."
  (:refer-clojure
   :exclude
   [+ - / * abs mod inc dec cast concat format second])
  (:require
   [honeysql.core :as hsql]
   [metabase.util.honey-sql-1-extensions :as h1x]
   [metabase.util.honey-sql-2-extensions :as h2x]
   [schema.core :as s]))

(def ^:dynamic ^{:added "0.46.0"} *honey-sql-version*
  "The version of Honey SQL to target when compiling. Currently, the Query Processor targets Honey SQL 1. The
  application database (via Toucan 2) targets Honey SQL 2. Since some application-database-related stuff uses some
  methods here (like [[add-interval-honeysql-form]]) you can rebind this to target Honey SQL 2 for drivers/clauses
  that support it (currently just H2/MySQL/Postgres for stuff needed by the application DB code).

  Perhaps in the future as we switch to Honey SQL 2 for QP stuff we can use this more generally."
  1)

(def IdentifierType
  "Schema for valid Identifier types."
  (s/enum
   :database
   :schema
   :constraint
   :index
   ;; Suppose we have a query like:
   ;; SELECT my_field f FROM my_table t
   ;; then:
   :table          ; is `my_table`
   :table-alias    ; is `t`
   :field          ; is `my_field`
   :field-alias))  ; is `f`

(defn identifier
  "Define an identifer of type with `components`. Prefer this to using keywords for identifiers, as those do not
  properly handle identifiers with slashes in them.

  `identifier-type` represents the type of identifier in question, which is important context for some drivers, such
  as BigQuery (which needs to qualify Tables identifiers with their dataset name.)

  This function automatically unnests any Identifiers passed as arguments, removes nils, and converts all args to
  strings."
  [identifier-type & components]
  (case *honey-sql-version*
    1 (apply h1x/identifier identifier-type components)
    2 (apply h2x/identifier identifier-type components)))

(defn literal
  "Wrap keyword or string `s` in single quotes and a HoneySQL `raw` form.

  We'll try to escape single quotes in the literal, unless they're already escaped (either as `''` or as `\\`, but
  this won't handle wacky cases like three single quotes in a row.

  DON'T USE `LITERAL` FOR THINGS THAT MIGHT BE WACKY (USER INPUT). Only use it for things that are hardcoded."
  [s]
  (case *honey-sql-version*
    1 (h1x/literal s)
    2 (h2x/literal s)))

(defn type-info
  "Return type information associated with `honeysql-form`, if any (i.e., if it is a `TypedHoneySQLForm`); otherwise
    returns `nil`."
  [honeysql-form]
  (case *honey-sql-version*
    1 (h1x/type-info honeysql-form)
    2 (h2x/type-info honeysql-form)))

(defn with-type-info
  "Add type information to a `honeysql-form`. Wraps `honeysql-form` and returns a `TypedHoneySQLForm`."
  [honeysql-form new-type-info]
  (case *honey-sql-version*
    1 (h1x/with-type-info honeysql-form new-type-info)
    2 (h2x/with-type-info honeysql-form new-type-info)))

(defn unwrap-typed-honeysql-form
  "If `honeysql-form` is a `TypedHoneySQLForm`, unwrap it and return the original form without type information.
  Otherwise, returns form as-is."
  [honeysql-form]
  (case *honey-sql-version*
    1 (h1x/unwrap-typed-honeysql-form honeysql-form)
    2 (h2x/unwrap-typed-honeysql-form honeysql-form)))

(defn type-info->db-type
  "For a given type-info, returns the `database-type`."
  [type-info]
  (case *honey-sql-version*
    1 (h1x/type-info->db-type type-info)
    2 (h2x/type-info->db-type type-info)))

(defn database-type
  "Returns the `database-type` from the type-info of `honeysql-form` if present.
   Otherwise, returns `nil`."
  [honeysql-form]
  (case *honey-sql-version*
    1 (h1x/database-type honeysql-form)
    2 (h2x/database-type honeysql-form)))

(defn is-of-type?
  "Is `honeysql-form` a typed form with `db-type`?
  Where `db-type` could be a string or a regex.

    (is-of-type? expr \"datetime\") ; -> true
    (is-of-type? expr #\"int*\") ; -> true"
  [honeysql-form db-type]
  (case *honey-sql-version*
    1 (h1x/is-of-type? honeysql-form db-type)
    2 (h2x/is-of-type? honeysql-form db-type)))

(defn with-database-type-info
  "Convenience for adding only database type information to a `honeysql-form`. Wraps `honeysql-form` and returns a
  `TypedHoneySQLForm`. Passing `nil` as `database-type` will remove any existing type info.

    (with-database-type-info :field \"text\")
    ;; -> #TypedHoneySQLForm{:form :field, :info {::hx/database-type \"text\"}}"
  {:style/indent [:form]}
  [honeysql-form db-type]
  (case *honey-sql-version*
    1 (h1x/with-database-type-info honeysql-form db-type)
    2 (h2x/with-database-type-info honeysql-form db-type)))

(defn cast
  "Generate a statement like `cast(expr AS sql-type)`. Returns a typed HoneySQL form."
  [db-type expr]
  (case *honey-sql-version*
    1 (h1x/cast db-type expr)
    2 (h2x/cast db-type expr)))

(defn quoted-cast
  "Generate a statement like `cast(expr AS \"sql-type\")`.

  Like `cast` but quotes `sql-type`. This is useful for cases where we deal with user-defined types or other types
  that may have a space in the name, for example Postgres enum types.

  Returns a typed HoneySQL form."
  [sql-type expr]
  (case *honey-sql-version*
    1 (h1x/quoted-cast sql-type expr)
    2 (h2x/quoted-cast sql-type expr)))

(defn maybe-cast
  "Cast `expr` to `sql-type`, unless `expr` is typed and already of that type. Returns a typed HoneySQL form."
  [sql-type expr]
  (case *honey-sql-version*
    1 (h1x/maybe-cast sql-type expr)
    2 (h2x/maybe-cast sql-type expr)))

(defn cast-unless-type-in
  "Cast `expr` to `desired-type` unless `expr` is of one of the `acceptable-types`. Returns a typed HoneySQL form.

    ;; cast to TIMESTAMP unless form is already a TIMESTAMP, TIMESTAMPTZ, or DATE
    (cast-unless-type-in \"timestamp\" #{\"timestamp\" \"timestamptz\" \"date\"} form)"
  [desired-type acceptable-types expr]
  (case *honey-sql-version*
    1 (h1x/cast-unless-type-in desired-type acceptable-types expr)
    2 (h2x/cast-unless-type-in desired-type acceptable-types expr)))

(defn +
  "Math operator. Interpose `+` between `exprs` and wrap in parentheses."
  [& exprs]
  (case *honey-sql-version*
    1 (apply h1x/+ exprs)
    2 (apply h2x/+ exprs)))

(defn -
  "Math operator. Interpose `-` between `exprs` and wrap in parentheses."
  [& exprs]
  (case *honey-sql-version*
    1 (apply h1x/- exprs)
    2 (apply h2x/- exprs)))

(defn /
  "Math operator. Interpose `/` between `exprs` and wrap in parentheses."
  [& exprs]
  (case *honey-sql-version*
    1 (apply h1x// exprs)
    2 (apply h2x// exprs)))

(defn *
  "Math operator. Interpose `*` between `exprs` and wrap in parentheses."
  [& exprs]
  (case *honey-sql-version*
    1 (apply h1x/* exprs)
    2 (apply h2x/* exprs)))

(defn mod
  "Math operator. Interpose `%` between `exprs` and wrap in parentheses."
  [& exprs]
  (case *honey-sql-version*
    1 (apply h1x/mod exprs)
    2 (apply h2x/mod exprs)))

(defn inc
  "Add 1 to `x`."
  [x]
  (case *honey-sql-version*
    1 (h1x/inc x)
    2 (h2x/inc x)))

(defn dec
  "Subtract 1 from `x`."
  [x]
  (case *honey-sql-version*
    1 (h1x/dec x)
    2 (h2x/dec x)))

(defn format
  "SQL `format` function."
  [format-str expr]
  (case *honey-sql-version*
    1 (h1x/format format-str expr)
    2 (h2x/format format-str expr)))

(defn round
  "SQL `round` function."
  [x decimal-places]
  (case *honey-sql-version*
    1 (h1x/round x decimal-places)
    2 (h2x/round x decimal-places)))

(defn ->date
  "CAST `x` to a `date`."
  [x]
  (case *honey-sql-version*
    1 (h1x/->date x)
    2 (h2x/->date x)))

(defn ->datetime
  "CAST `x` to a `datetime`."
  [x]
  (case *honey-sql-version*
    1 (h1x/->datetime x)
    2 (h2x/->datetime x)))

(defn ->timestamp
  "CAST `x` to a `timestamp`."
  [x]
  (case *honey-sql-version*
    1 (h1x/->timestamp x)
    2 (h2x/->timestamp x)))

(defn ->timestamp-with-time-zone
  "CAST `x` to a `timestamp with time zone`."
  [x]
  (case *honey-sql-version*
    1 (h1x/->timestamp-with-time-zone x)
    2 (h2x/->timestamp-with-time-zone x)))

(defn ->integer
  "CAST `x` to a `integer`."
  [x]
  (case *honey-sql-version*
    1 (h1x/->integer x)
    2 (h2x/->integer x)))

(defn ->time
  "CAST `x` to a `time` datatype"
  [x]
  (case *honey-sql-version*
    1 (h1x/->time x)
    2 (h2x/->time x)))

(defn ->boolean
  "CAST `x` to a `boolean` datatype"
  [x]
  (case *honey-sql-version*
    1 (h1x/->boolean x)
    2 (h2x/->boolean x)))

;;; Random SQL fns. Not all DBs support all these!
(defn abs
  "SQL `abs` function."
  [& exprs]
  (case *honey-sql-version*
    1 (apply h1x/abs exprs)
    2 (apply h2x/abs exprs)))

(defn ceil
  "SQL `ceil` function."
  [& exprs]
  (case *honey-sql-version*
    1 (apply h1x/ceil exprs)
    2 (apply h2x/ceil exprs)))

(defn floor
  "SQL `floor` function."
  [& exprs]
  (case *honey-sql-version*
    1 (apply h1x/floor exprs)
    2 (apply h2x/floor exprs)))

(defn second
  "SQL `second` function."
  [& exprs]
  (case *honey-sql-version*
    1 (apply h1x/second exprs)
    2 (apply h2x/second exprs)))

(defn minute
  "SQL `minute` function."
  [& exprs]
  (case *honey-sql-version*
    1 (apply h1x/minute exprs)
    2 (apply h2x/minute exprs)))

(defn hour
  "SQL `hour` function."
  [& exprs]
  (case *honey-sql-version*
    1 (apply h1x/hour exprs)
    2 (apply h2x/hour exprs)))

(defn day
  "SQL `day` function."
  [& exprs]
  (case *honey-sql-version*
    1 (apply h1x/day exprs)
    2 (apply h2x/day exprs)))

(defn week
  "SQL `week` function."
  [& exprs]
  (case *honey-sql-version*
    1 (apply h1x/week exprs)
    2 (apply h2x/week exprs)))

(defn month
  "SQL `month` function."
  [& exprs]
  (case *honey-sql-version*
    1 (apply h1x/month exprs)
    2 (apply h2x/month exprs)))

(defn quarter
  "SQL `quarter` function."
  [& exprs]
  (case *honey-sql-version*
    1 (apply h1x/quarter exprs)
    2 (apply h2x/quarter exprs)))

(defn year
  "SQL `year` function."
  [& exprs]
  (case *honey-sql-version*
    1 (apply h1x/year exprs)
    2 (apply h2x/year exprs)))

(defn concat
  "SQL `concat` function."
  [& exprs]
  (case *honey-sql-version*
    1 (apply h1x/concat exprs)
    2 (apply h2x/concat exprs)))

(defn at-time-zone
  "Return a Honey SQL `expr` at time `zone`."
  [expr zone]
  (case *honey-sql-version*
    1 (h1x/->AtTimeZone expr zone)
    2 (h2x/at-time-zone expr zone)))

(defn call
  "Like [[honeysql.core/call]] but works with either Honey SQL 1 or Honey SQL 2. Prefer using raw Honey SQL 2 code
  directly unless you need HoneySQL 1 compatibility."
  [f & args]
  #_{:clj-kondo/ignore [:discouraged-var]}
  (case *honey-sql-version*
    1 (apply hsql/call f args)
    2 (apply vector f args)))

(defn raw
  "Like [[honeysql.core/raw]] but works with either Honey SQL 1 or Honey SQL 2. Prefer using raw Honey SQL 2 code
  directly unless you need HoneySQL 1 compatibility."
  [x]
  #_{:clj-kondo/ignore [:discouraged-var]}
  (case *honey-sql-version*
    1 (hsql/raw x)
    2 [:raw x]))
