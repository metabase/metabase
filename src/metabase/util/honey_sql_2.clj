(ns ^{:added  "0.46.0"} metabase.util.honey-sql-2
  "Honey SQL 2 extensions. Used for the application database. For QP/drivers stuff,
  see [[metabase.util.honeysql-extensions]], which at the time of this writing still uses Honey SQL 1."
  (:refer-clojure
   :exclude
   [+ - / * abs mod inc dec cast concat format second])
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [potemkin.types :as p.types])
  (:import
   (java.util Locale)))

(defn- english-upper-case
  "Use this function when you need to upper-case an identifier or table name. Similar to `clojure.string/upper-case`
  but always converts the string to upper-case characters in the English locale. Using `clojure.string/upper-case` for
  table names, like we are using below in the `:h2` `honeysql.format` function can cause issues when the user has
  changed the locale to a language that has different upper-case characters. Turkish is one example, where `i` gets
  converted to `İ`. This causes the `SETTING` table to become the `SETTİNG` table, which doesn't exist."
  [^CharSequence s]
  (-> s str (.toUpperCase Locale/ENGLISH)))

(sql/register-dialect!
 :h2
 (update (sql/get-dialect :ansi) :quote (fn [quote]
                                          (comp english-upper-case quote))))

;; register the `extract` function with HoneySQL
;; (hsql/format (sql/call :extract :a :b)) -> "extract(a from b)"
(defn- format-extract [_fn [unit expr]]
  (let [[sql & args] (sql/format-expr expr)]
    (into [(str "extract(" (name unit) " from " sql ")")]
          args)))

(sql/register-fn! ::extract format-extract)

;; register the function `distinct-count` with HoneySQL
(defn- format-distinct-count
  "(sql/format-expr [::h2x/distinct-count :x])
   =>
   count(distinct x)"
  [_fn [expr]]
  (let [[sql & args] (sql/format-expr expr)]
    (into [(str "count(distinct " sql ")")]
          args)))

(sql/register-fn! ::distinct-count format-distinct-count)

;; register the function `percentile` with HoneySQL
;; (hsql/format (sql/call :percentile-cont :a 0.9)) -> "percentile_cont(0.9) within group (order by a)"
(defn- format-percentile-cont [_fn [expr p]]
  {:pre [(number? p)]}
  (let [[sql & args] (sql/format-expr expr)]
    (into [(str "PERCENTILE_CONT(" p ") within group (order by " sql ")")]
          args)))

(sql/register-fn! ::percentile-cont format-percentile-cont)

;; HoneySQL 0.7.0+ parameterizes numbers to fix issues with NaN and infinity -- see
;; https://github.com/jkk/honeysql/pull/122. However, this broke some of Metabase's behavior, specifically queries
;; with calculated columns with numeric literals -- some SQL databases can't recognize that a calculated field in a
;; SELECT clause and a GROUP BY clause is the same thing if the calculation involves parameters. Go ahead an use the
;; old behavior so we can keep our HoneySQL dependency up to date.
#_(extend-protocol honeysql.format/ToSql
    Number
    (to-sql [x] (str x)))

(def IdentifierType
  "Malli schema for valid Identifier types."
  [:enum
   :database
   :schema
   :constraint
   :index
   ;; Suppose we have a query like:
   ;; SELECT my_field f FROM my_table t
   ;; then:
   :table                               ; is `my_table`
   :table-alias                         ; is `t`
   :field                               ; is `my_field`
   :field-alias])  ; is `f`

(defn- identifier? [x]
  (and (vector? x)
       (= (first x) ::identifier)))

(defn- format-identifier [_fn [_identifier-type components]]
  ;; `:aliased` `true` => don't split dots in the middle of components
  [(str/join \. (map (fn [component]
                       (sql/format-entity component {:aliased true}))
                     components))])

(sql/register-fn! ::identifier format-identifier)

(mu/defn identifier
  "Define an identifer of type with `components`. Prefer this to using keywords for identifiers, as those do not
  properly handle identifiers with slashes in them.

  `identifier-type` represents the type of identifier in question, which is important context for some drivers, such
  as BigQuery (which needs to qualify Tables identifiers with their dataset name.)

  This function automatically unnests any Identifiers passed as arguments, removes nils, and converts all args to
  strings."
  [identifier-type :- IdentifierType & components]
  [::identifier
   identifier-type
   (vec (for [component components
              component (if (identifier? component)
                          (last component)
                          [component])
              :when     (some? component)]
          (u/qualified-name component)))])

;;; Single-quoted string literal

(defn- escape-and-quote-literal [s]
  (as-> s <>
    (str/replace <> #"(?<![\\'])'(?![\\'])"  "''")
    (str \' <> \')))

(sql/register-fn!
 ::literal
 (fn [_fn [s]]
   [(escape-and-quote-literal s)]))

(defn literal
  "Wrap keyword or string `s` in single quotes and a HoneySQL `raw` form.

  We'll try to escape single quotes in the literal, unless they're already escaped (either as `''` or as `\\`, but
  this won't handle wacky cases like three single quotes in a row.

  DON'T USE `LITERAL` FOR THINGS THAT MIGHT BE WACKY (USER INPUT). Only use it for things that are hardcoded."
  [s]
  [::literal (u/qualified-name s)])

(defn- format-at-time-zone [_fn [expr zone]]
  (let [[expr-sql & expr-args] (sql/format-expr expr)
        [zone-sql & zone-args] (sql/format-expr (literal zone))]
    (into [(clojure.core/format "(%s AT TIME ZONE %s)"
                                expr-sql
                                zone-sql)]
          cat
          [expr-args zone-args])))

(sql/register-fn!
 ::at-time-zone
 format-at-time-zone)

(defn at-time-zone
  "Create a Honey SQL form that returns `expr` at time `zone`. Does not add type info! Add appropriate DB type info
  yourself to the result."
  [expr zone]
  [::at-time-zone expr zone])

(p.types/defprotocol+ TypedHoneySQL
  "Protocol for a HoneySQL form that has type information such as `:metabase.util.honeysql-extensions/database-type`.
  See #15115 for background."
  (type-info [honeysql-form]
    "Return type information associated with `honeysql-form`, if any (i.e., if it is a `TypedHoneySQLForm`); otherwise
    returns `nil`.")
  (with-type-info [honeysql-form new-type-info]
    "Add type information to a `honeysql-form`. Wraps `honeysql-form` and returns a `TypedHoneySQLForm`.")
  (unwrap-typed-honeysql-form [honeysql-form]
    "If `honeysql-form` is a `TypedHoneySQLForm`, unwrap it and return the original form without type information.
    Otherwise, returns form as-is."))

(defn- format-typed [_fn [expr _type-info]]
  (sql/format-expr expr))

(sql/register-fn! ::typed format-typed)

(def ^:private NormalizedTypeInfo
  [:map
   [:metabase.util.honeysql-extensions/database-type
    {:optional true}
    [:and
     ms/NonBlankString
     [:fn
      {:error/message "lowercased string"}
      (fn [s]
        (= s (u/lower-case-en s)))]]]])

(mu/defn ^:private normalize-type-info :- NormalizedTypeInfo
  "Normalize the values in the `type-info` for a `TypedHoneySQLForm` for easy comparisons (e.g., normalize
  `:metabase.util.honeysql-extensions/database-type` to a lower-case string)."
  [type-info]
  (cond-> type-info
    (:metabase.util.honeysql-extensions/database-type type-info)
    (update :metabase.util.honeysql-extensions/database-type (comp u/lower-case-en name))))

(defn- typed? [x]
  (and (vector? x)
       (= (first x) ::typed)))

(extend-protocol TypedHoneySQL
  Object
  (type-info [_]
    nil)
  (with-type-info [this new-info]
    [::typed this (normalize-type-info new-info)])
  (unwrap-typed-honeysql-form [this]
    this)

  nil
  (type-info [_]
    nil)
  (with-type-info [_ new-info]
    [::typed nil (normalize-type-info new-info)])
  (unwrap-typed-honeysql-form [_]
    nil)

  clojure.lang.IPersistentVector
  (type-info [this]
    (when (typed? this)
      (last this)))

  (with-type-info [this new-info]
    [::typed
     (if (typed? this)
       (clojure.core/second this)
       this)
     (normalize-type-info new-info)])

  (unwrap-typed-honeysql-form [this]
    (if (typed? this)
      (clojure.core/second this)
      this)))

(defn type-info->db-type
  "For a given type-info, returns the `database-type`."
  [type-info]
  {:added "0.39.0"}
  (:metabase.util.honeysql-extensions/database-type type-info))

(defn database-type
  "Returns the `database-type` from the type-info of `honeysql-form` if present.
   Otherwise, returns `nil`."
  [honeysql-form]
  (some-> honeysql-form type-info type-info->db-type))

(defn is-of-type?
  "Is `honeysql-form` a typed form with `db-type`?
  Where `db-type` could be a string or a regex.

    (is-of-type? expr \"datetime\") ; -> true
    (is-of-type? expr #\"int*\") ; -> true"
  [honeysql-form db-type]
  (let [form-type (some-> honeysql-form database-type u/lower-case-en)]
    (if (instance? java.util.regex.Pattern db-type)
      (and (some? form-type) (some? (re-find db-type form-type)))
      (= form-type
         (some-> db-type name u/lower-case-en)))))

(mu/defn with-database-type-info
  "Convenience for adding only database type information to a `honeysql-form`. Wraps `honeysql-form` and returns a
  `TypedHoneySQLForm`. Passing `nil` as `database-type` will remove any existing type info.

    (with-database-type-info :field \"text\")
    ;; -> #TypedHoneySQLForm{:form :field, :info {::hx/database-type \"text\"}}"
  {:style/indent [:form]}
  [honeysql-form db-type :- [:maybe ms/KeywordOrString]]
  (if (some? db-type)
    (with-type-info honeysql-form {:metabase.util.honeysql-extensions/database-type db-type})
    (unwrap-typed-honeysql-form honeysql-form)))

(def ^:private TypedExpression
  [:fn {:error/message "::h2x/typed Honey SQL form"} typed?])

(mu/defn cast :- TypedExpression
  "Generate a statement like `cast(expr AS sql-type)`. Returns a typed HoneySQL form."
  [db-type expr]
  (-> [:cast expr [:raw (name db-type)]]
      (with-type-info {:metabase.util.honeysql-extensions/database-type db-type})))

(mu/defn quoted-cast :- TypedExpression
  "Generate a statement like `cast(expr AS \"sql-type\")`.

  Like `cast` but quotes `sql-type`. This is useful for cases where we deal with user-defined types or other types
  that may have a space in the name, for example Postgres enum types.

  Returns a typed HoneySQL form."
  [sql-type expr]
  (-> [:cast expr (keyword sql-type)]
      (with-type-info {:metabase.util.honeysql-extensions/database-type sql-type})))

(mu/defn maybe-cast :- TypedExpression
  "Cast `expr` to `sql-type`, unless `expr` is typed and already of that type. Returns a typed HoneySQL form."
  [sql-type expr]
  (if (is-of-type? expr sql-type)
      expr
      (cast sql-type expr)))

(defn cast-unless-type-in
  "Cast `expr` to `desired-type` unless `expr` is of one of the `acceptable-types`. Returns a typed HoneySQL form.

    ;; cast to TIMESTAMP unless form is already a TIMESTAMP, TIMESTAMPTZ, or DATE
    (cast-unless-type-in \"timestamp\" #{\"timestamp\" \"timestamptz\" \"date\"} form)"
  {:added "0.42.0"}
  [desired-type acceptable-types expr]
  {:pre [(string? desired-type) (set? acceptable-types)]}
  (if (some (partial is-of-type? expr)
            acceptable-types)
    expr
    (cast desired-type expr)))

(defn- math-operator [operator]
  (fn [& args]
    (let [arg-db-type (some (fn [arg]
                              (-> arg type-info type-info->db-type))
                            args)]
      (cond-> (apply sql/call operator args)
        arg-db-type (with-database-type-info arg-db-type)))))

(def ^{:arglists '([& exprs])}  +  "Math operator. Interpose `+` between `exprs` and wrap in parentheses." (math-operator :+))
(def ^{:arglists '([& exprs])}  -  "Math operator. Interpose `-` between `exprs` and wrap in parentheses." (math-operator :-))
(def ^{:arglists '([& exprs])}  /  "Math operator. Interpose `/` between `exprs` and wrap in parentheses." (math-operator :/))
(def ^{:arglists '([& exprs])}  *  "Math operator. Interpose `*` between `exprs` and wrap in parentheses." (math-operator :*))
(def ^{:arglists '([& exprs])} mod "Math operator. Interpose `%` between `exprs` and wrap in parentheses." (math-operator :%))

(defn inc "Add 1 to `x`."        [x] (+ x 1))
(defn dec "Subtract 1 from `x`." [x] (- x 1))

(defn format
  "SQL `format` function."
  [format-str expr]
  (sql/call :format expr (literal format-str)))

(defn round
  "SQL `round` function."
  [x decimal-places]
  (sql/call :round x decimal-places))

(defn ->date                     "CAST `x` to a `date`."                     [x] (maybe-cast :date x))
(defn ->datetime                 "CAST `x` to a `datetime`."                 [x] (maybe-cast :datetime x))
(defn ->timestamp                "CAST `x` to a `timestamp`."                [x] (maybe-cast :timestamp x))
(defn ->timestamp-with-time-zone "CAST `x` to a `timestamp with time zone`." [x] (maybe-cast "timestamp with time zone" x))
(defn ->integer                  "CAST `x` to a `integer`."                  [x] (maybe-cast :integer x))
(defn ->time                     "CAST `x` to a `time` datatype"             [x] (maybe-cast :time x))
(defn ->boolean                  "CAST `x` to a `boolean` datatype"          [x] (maybe-cast :boolean x))

;;; Random SQL fns. Not all DBs support all these!
(def ^{:arglists '([& exprs])} abs     "SQL `abs` function."     (partial sql/call :abs))
(def ^{:arglists '([& exprs])} ceil    "SQL `ceil` function."    (partial sql/call :ceil))
(def ^{:arglists '([& exprs])} floor   "SQL `floor` function."   (partial sql/call :floor))
(def ^{:arglists '([& exprs])} second  "SQL `second` function."  (partial sql/call :second))
(def ^{:arglists '([& exprs])} minute  "SQL `minute` function."  (partial sql/call :minute))
(def ^{:arglists '([& exprs])} hour    "SQL `hour` function."    (partial sql/call :hour))
(def ^{:arglists '([& exprs])} day     "SQL `day` function."     (partial sql/call :day))
(def ^{:arglists '([& exprs])} week    "SQL `week` function."    (partial sql/call :week))
(def ^{:arglists '([& exprs])} month   "SQL `month` function."   (partial sql/call :month))
(def ^{:arglists '([& exprs])} quarter "SQL `quarter` function." (partial sql/call :quarter))
(def ^{:arglists '([& exprs])} year    "SQL `year` function."    (partial sql/call :year))
(def ^{:arglists '([& exprs])} concat  "SQL `concat` function."  (partial sql/call :concat))
