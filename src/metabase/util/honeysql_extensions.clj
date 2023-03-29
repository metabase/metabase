(ns ^{:deprecated "0.46.0"}
 metabase.util.honeysql-extensions
  "Honey SQL 1 extensions. This is only used for QP stuff at this point in time -- application database stuff uses
  Toucan 2 and thus Honey SQL 2; the new namespace [[metabase.util.honey-sql-2]] provides Honey SQL 2
  versions of these functions.

  DEPRECATED in Metabase 0.46.0. Planned for removal in Metabase 0.49.0. Migrate your code
  to [[metabase.util.honey-sql-2]]."
  (:refer-clojure
   :exclude
   [+ - / * abs mod inc dec cast concat format second])
  (:require
   [honeysql.core :as hsql]
   [metabase.util.honey-sql-1 :as h1x]
   [metabase.util.honey-sql-2 :as h2x]))

(def ^:dynamic ^{:added "0.46.0", :deprecated "0.46.0"} ^Long *honey-sql-version*
  "The version of Honey SQL to target when compiling. Currently, the Query Processor targets Honey SQL 1. The
  application database (via Toucan 2) targets Honey SQL 2. Since some application-database-related stuff uses some
  methods here (like [[add-interval-honeysql-form]]) you can rebind this to target Honey SQL 2 for drivers/clauses
  that support it (currently just H2/MySQL/Postgres for stuff needed by the application DB code).

  Perhaps in the future as we switch to Honey SQL 2 for QP stuff we can use this more generally."
  1)

(def ^{:deprecated "0.46.0"} IdentifierType
  "Schema for valid Identifier types."
  #_{:clj-kondo/ignore [:deprecated-var]}
  h1x/IdentifierType)

(defn identifier
  "Define an identifer of type with `components`. Prefer this to using keywords for identifiers, as those do not
  properly handle identifiers with slashes in them.

  `identifier-type` represents the type of identifier in question, which is important context for some drivers, such
  as BigQuery (which needs to qualify Tables identifiers with their dataset name.)

  This function automatically unnests any Identifiers passed as arguments, removes nils, and converts all args to
  strings."
  {:deprecated "0.46.0"}
  [identifier-type & components]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (apply h1x/identifier identifier-type components)
    2 (apply h2x/identifier identifier-type components)))

(defn identifier?
  "Whether `x` is a valid identifier for the current Honey SQL version."
  {:deprecated "0.46.0"}
  [x]
  #_{:clj-kondo/ignore [:deprecated-var]}
  ((case (long *honey-sql-version*)
     1 h1x/identifier?
     2 h2x/identifier?) x))

(defn literal
  "Wrap keyword or string `s` in single quotes and a HoneySQL `raw` form.

  We'll try to escape single quotes in the literal, unless they're already escaped (either as `''` or as `\\`, but
  this won't handle wacky cases like three single quotes in a row.

  DON'T USE `LITERAL` FOR THINGS THAT MIGHT BE WACKY (USER INPUT). Only use it for things that are hardcoded."
  {:deprecated "0.46.0"}
  [s]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/literal s)
    2 (h2x/literal s)))

(defn type-info
  "Return type information associated with `honeysql-form`, if any (i.e., if it is a `TypedHoneySQLForm`); otherwise
  returns `nil`."
  {:deprecated "0.46.0"}
  [honeysql-form]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/type-info honeysql-form)
    2 (h2x/type-info honeysql-form)))

(defn with-type-info
  "Add type information to a `honeysql-form`. Wraps `honeysql-form` and returns a `TypedHoneySQLForm`."
  {:deprecated "0.46.0"}
  [honeysql-form new-type-info]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/with-type-info honeysql-form new-type-info)
    2 (h2x/with-type-info honeysql-form new-type-info)))

(defn unwrap-typed-honeysql-form
  "If `honeysql-form` is a `TypedHoneySQLForm`, unwrap it and return the original form without type information.
  Otherwise, returns form as-is."
  {:deprecated "0.46.0"}
  [honeysql-form]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/unwrap-typed-honeysql-form honeysql-form)
    2 (h2x/unwrap-typed-honeysql-form honeysql-form)))

(defn type-info->db-type
  "For a given type-info, returns the `database-type`."
  {:deprecated "0.46.0"}
  [type-info]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/type-info->db-type type-info)
    2 (h2x/type-info->db-type type-info)))

(defn database-type
  "Returns the `database-type` from the type-info of `honeysql-form` if present. Otherwise, returns `nil`."
  {:deprecated "0.46.0"}
  [honeysql-form]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/database-type honeysql-form)
    2 (h2x/database-type honeysql-form)))

(defn is-of-type?
  "Is `honeysql-form` a typed form with `db-type`?
  Where `db-type` could be a string or a regex.

    (is-of-type? expr \"datetime\") ; -> true
    (is-of-type? expr #\"int*\") ; -> true"
  {:deprecated "0.46.0"}
  [honeysql-form db-type]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/is-of-type? honeysql-form db-type)
    2 (h2x/is-of-type? honeysql-form db-type)))

#_{:clj-kondo/ignore [:deprecated-var]}
(defn with-database-type-info
  "Convenience for adding only database type information to a `honeysql-form`. Wraps `honeysql-form` and returns a
  `TypedHoneySQLForm`. Passing `nil` as `database-type` will remove any existing type info.

    (with-database-type-info :field \"text\")
    ;; -> #TypedHoneySQLForm{:form :field, :info {::hx/database-type \"text\"}}"
  {:deprecated "0.46.0", :style/indent [:form]}
  [honeysql-form db-type]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/with-database-type-info honeysql-form db-type)
    2 (h2x/with-database-type-info honeysql-form db-type)))

(defn cast
  "Generate a statement like `cast(expr AS sql-type)`. Returns a typed HoneySQL form."
  {:deprecated "0.46.0"}
  [db-type expr]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/cast db-type expr)
    2 (h2x/cast db-type expr)))

(defn quoted-cast
  "Generate a statement like `cast(expr AS \"sql-type\")`.

  Like `cast` but quotes `sql-type`. This is useful for cases where we deal with user-defined types or other types
  that may have a space in the name, for example Postgres enum types.

  Returns a typed HoneySQL form."
  {:deprecated "0.46.0"}
  [sql-type expr]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/quoted-cast sql-type expr)
    2 (h2x/quoted-cast sql-type expr)))

(defn maybe-cast
  "Cast `expr` to `sql-type`, unless `expr` is typed and already of that type. Returns a typed HoneySQL form."
  {:deprecated "0.46.0"}
  [sql-type expr]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/maybe-cast sql-type expr)
    2 (h2x/maybe-cast sql-type expr)))

(defn cast-unless-type-in
  "Cast `expr` to `desired-type` unless `expr` is of one of the `acceptable-types`. Returns a typed HoneySQL form.

    ;; cast to TIMESTAMP unless form is already a TIMESTAMP, TIMESTAMPTZ, or DATE
    (cast-unless-type-in \"timestamp\" #{\"timestamp\" \"timestamptz\" \"date\"} form)"
  {:deprecated "0.46.0"}
  [desired-type acceptable-types expr]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/cast-unless-type-in desired-type acceptable-types expr)
    2 (h2x/cast-unless-type-in desired-type acceptable-types expr)))

(defn +
  "Math operator. Interpose `+` between `exprs` and wrap in parentheses."
  {:deprecated "0.46.0"}
  [& exprs]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (apply h1x/+ exprs)
    2 (apply h2x/+ exprs)))

#_{:clj-kondo/ignore [:deprecated-var]}
(defn -
  "Math operator. Interpose `-` between `exprs` and wrap in parentheses."
  {:deprecated "0.46.0"}
  [& exprs]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (apply h1x/- exprs)
    2 (apply h2x/- exprs)))

(defn /
  "Math operator. Interpose `/` between `exprs` and wrap in parentheses."
  {:deprecated "0.46.0"}
  [& exprs]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (apply h1x// exprs)
    2 (apply h2x// exprs)))

(defn *
  "Math operator. Interpose `*` between `exprs` and wrap in parentheses."
  {:deprecated "0.46.0"}
  [& exprs]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (apply h1x/* exprs)
    2 (apply h2x/* exprs)))

(defn mod
  "Math operator. Interpose `%` between `exprs` and wrap in parentheses."
  {:deprecated "0.46.0"}
  [& exprs]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (apply h1x/mod exprs)
    2 (apply h2x/mod exprs)))

(defn inc
  "Add 1 to `x`."
  {:deprecated "0.46.0"}
  [x]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/inc x)
    2 (h2x/inc x)))

(defn dec
  "Subtract 1 from `x`."
  {:deprecated "0.46.0"}
  [x]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/dec x)
    2 (h2x/dec x)))

(defn format
  "SQL `format` function."
  {:deprecated "0.46.0"}
  [format-str expr]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/format format-str expr)
    2 (h2x/format format-str expr)))

(defn round
  "SQL `round` function."
  {:deprecated "0.46.0"}
  [x decimal-places]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/round x decimal-places)
    2 (h2x/round x decimal-places)))

(defn ->date
  "CAST `x` to a `date`."
  {:deprecated "0.46.0"}
  [x]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/->date x)
    2 (h2x/->date x)))

(defn ->datetime
  "CAST `x` to a `datetime`."
  {:deprecated "0.46.0"}
  [x]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/->datetime x)
    2 (h2x/->datetime x)))

(defn ->timestamp
  "CAST `x` to a `timestamp`."
  {:deprecated "0.46.0"}
  [x]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/->timestamp x)
    2 (h2x/->timestamp x)))

(defn ->timestamp-with-time-zone
  "CAST `x` to a `timestamp with time zone`."
  {:deprecated "0.46.0"}
  [x]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/->timestamp-with-time-zone x)
    2 (h2x/->timestamp-with-time-zone x)))

(defn ->integer
  "CAST `x` to a `integer`."
  {:deprecated "0.46.0"}
  [x]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/->integer x)
    2 (h2x/->integer x)))

(defn ->time
  "CAST `x` to a `time` datatype"
  {:deprecated "0.46.0"}
  [x]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/->time x)
    2 (h2x/->time x)))

(defn ->boolean
  "CAST `x` to a `boolean` datatype"
  {:deprecated "0.46.0"}
  [x]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/->boolean x)
    2 (h2x/->boolean x)))

;;;; Random SQL fns. Not all DBs support all these!

(defn abs
  "SQL `abs` function."
  {:deprecated "0.46.0"}
  [& exprs]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (apply h1x/abs exprs)
    2 (apply h2x/abs exprs)))

(defn ceil
  "SQL `ceil` function."
  {:deprecated "0.46.0"}
  [& exprs]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (apply h1x/ceil exprs)
    2 (apply h2x/ceil exprs)))

(defn floor
  "SQL `floor` function."
  {:deprecated "0.46.0"}
  [& exprs]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (apply h1x/floor exprs)
    2 (apply h2x/floor exprs)))

(defn second
  "SQL `second` function."
  {:deprecated "0.46.0"}
  [& exprs]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (apply h1x/second exprs)
    2 (apply h2x/second exprs)))

(defn minute
  "SQL `minute` function."
  {:deprecated "0.46.0"}
  [& exprs]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (apply h1x/minute exprs)
    2 (apply h2x/minute exprs)))

(defn hour
  "SQL `hour` function."
  {:deprecated "0.46.0"}
  [& exprs]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (apply h1x/hour exprs)
    2 (apply h2x/hour exprs)))

(defn day
  "SQL `day` function."
  {:deprecated "0.46.0"}
  [& exprs]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (apply h1x/day exprs)
    2 (apply h2x/day exprs)))

(defn week
  "SQL `week` function."
  {:deprecated "0.46.0"}
  [& exprs]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (apply h1x/week exprs)
    2 (apply h2x/week exprs)))

(defn month
  "SQL `month` function."
  {:deprecated "0.46.0"}
  [& exprs]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (apply h1x/month exprs)
    2 (apply h2x/month exprs)))

(defn quarter
  "SQL `quarter` function."
  {:deprecated "0.46.0"}
  [& exprs]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (apply h1x/quarter exprs)
    2 (apply h2x/quarter exprs)))

(defn year
  "SQL `year` function."
  {:deprecated "0.46.0"}
  [& exprs]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (apply h1x/year exprs)
    2 (apply h2x/year exprs)))

(defn concat
  "SQL `concat` function."
  {:deprecated "0.46.0"}
  [& exprs]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (apply h1x/concat exprs)
    2 (apply h2x/concat exprs)))

(defn at-time-zone
  "Return a Honey SQL `expr` at time `zone`."
  {:added "0.46.0", :deprecated "0.46.0"}
  [expr zone]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (case (long *honey-sql-version*)
    1 (h1x/->AtTimeZone expr zone)
    2 (h2x/at-time-zone expr zone)))

(defn call
  "Like [[honeysql.core/call]] but works with either Honey SQL 1 or Honey SQL 2. Prefer using raw Honey SQL 2 code
  directly unless you need HoneySQL 1 compatibility."
  {:added "0.46.0", :deprecated "0.46.0"}
  [f & args]
  #_{:clj-kondo/ignore [:deprecated-var :discouraged-var]}
  (case (long *honey-sql-version*)
    1 (apply hsql/call f args)
    2 (apply vector f args)))

(defn raw
  "Like [[honeysql.core/raw]] but works with either Honey SQL 1 or Honey SQL 2. Prefer using raw Honey SQL 2 code
  directly unless you need HoneySQL 1 compatibility."
  {:added "0.46.0", :deprecated "0.46.0"}
  [x]
  #_{:clj-kondo/ignore [:deprecated-var :discouraged-var]}
  (case (long *honey-sql-version*)
    1 (hsql/raw x)
    2 [:raw x]))
