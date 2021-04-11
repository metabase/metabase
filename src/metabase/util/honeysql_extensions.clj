(ns metabase.util.honeysql-extensions
  (:refer-clojure :exclude [+ - / * mod inc dec cast concat format])
  (:require [clojure.pprint :as pprint]
            [clojure.string :as str]
            [honeysql.core :as hsql]
            [honeysql.format :as hformat]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [potemkin.types :as p.types]
            [pretty.core :as pretty :refer [PrettyPrintable]]
            [schema.core :as s])
  (:import honeysql.format.ToSql
           java.util.Locale))

(defn- english-upper-case
  "Use this function when you need to upper-case an identifier or table name. Similar to `clojure.string/upper-case`
  but always converts the string to upper-case characters in the English locale. Using `clojure.string/upper-case` for
  table names, like we are using below in the `:h2` `honeysql.format` function can cause issues when the user has
  changed the locale to a language that has different upper-case characters. Turkish is one example, where `i` gets
  converted to `İ`. This causes the `SETTING` table to become the `SETTİNG` table, which doesn't exist."
  [^CharSequence s]
  (-> s str (.toUpperCase Locale/ENGLISH)))

;; Add an `:h2` quote style that uppercases the identifier
(let [{ansi-quote-fn :ansi} @#'honeysql.format/quote-fns]
  (alter-var-root #'honeysql.format/quote-fns assoc :h2 (comp english-upper-case ansi-quote-fn)))

;; register the `extract` function with HoneySQL
;; (hsql/format (hsql/call :extract :a :b)) -> "extract(a from b)"
(defmethod hformat/fn-handler "extract" [_ unit expr]
  (str "extract(" (name unit) " from " (hformat/to-sql expr) ")"))

;; register the function `distinct-count` with HoneySQL
;; (hsql/format :%distinct-count.x) -> "count(distinct x)"
(defmethod hformat/fn-handler "distinct-count" [_ field]
  (str "count(distinct " (hformat/to-sql field) ")"))

;; register the function `percentile` with HoneySQL
;; (hsql/format (hsql/call :percentile-cont :a 0.9)) -> "percentile_cont(0.9) within group (order by a)"
(defmethod hformat/fn-handler "percentile-cont" [_ field p]
  (str "PERCENTILE_CONT(" (hformat/to-sql p) ") within group (order by " (hformat/to-sql field) ")"))


;; HoneySQL 0.7.0+ parameterizes numbers to fix issues with NaN and infinity -- see
;; https://github.com/jkk/honeysql/pull/122. However, this broke some of Metabase's behavior, specifically queries
;; with calculated columns with numeric literals -- some SQL databases can't recognize that a calculated field in a
;; SELECT clause and a GROUP BY clause is the same thing if the calculation involves parameters. Go ahead an use the
;; old behavior so we can keep our HoneySQL dependency up to date.
(extend-protocol honeysql.format/ToSql
  Number
  (to-sql [x] (str x)))

;; Ratios are represented as the division of two numbers which may cause order-of-operation issues when dealing with
;; queries. The easiest way around this is to convert them to their decimal representations.
(extend-protocol honeysql.format/ToSql
  clojure.lang.Ratio
  (to-sql [x] (hformat/to-sql (double x))))

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

(p.types/defrecord+ Identifier [identifier-type components]
  ToSql
  (to-sql [_]
    (binding [hformat/*allow-dashed-names?* true]
      (str/join
       \.
       (for [component components]
         (hformat/quote-identifier component, :split false)))))
  PrettyPrintable
  (pretty [_]
    (cons 'hx/identifier (cons identifier-type components))))

;; don't use `->Identifier` or `map->Identifier`. Use the `identifier` function instead, which cleans up its input
(alter-meta! #'->Identifier    assoc :private true)
(alter-meta! #'map->Identifier assoc :private true)

(s/defn identifier :- Identifier
  "Define an identifer of type with `components`. Prefer this to using keywords for identifiers, as those do not
  properly handle identifiers with slashes in them.

  `identifier-type` represents the type of identifier in question, which is important context for some drivers, such
  as BigQuery (which needs to qualify Tables identifiers with their dataset name.)

  This function automatically unnests any Identifiers passed as arguments, removes nils, and converts all args to
  strings."
  [identifier-type :- IdentifierType, & components]
  (Identifier.
   identifier-type
   (for [component components
         component (if (instance? Identifier component)
                     (:components component)
                     [component])
         :when     (some? component)]
     (u/qualified-name component))))

;; Single-quoted string literal
(p.types/defrecord+ Literal [literal]
  ToSql
  (to-sql [_]
    (as-> literal <>
      (str/replace <> #"(?<![\\'])'(?![\\'])"  "''")
      (str \' <> \')))
  PrettyPrintable
  (pretty [_]
    (list 'literal literal)))

;; as with `Identifier` you should use the the `literal` function below instead of the auto-generated factory functions.
(alter-meta! #'->Literal    assoc :private true)
(alter-meta! #'map->Literal assoc :private true)

(defn literal
  "Wrap keyword or string `s` in single quotes and a HoneySQL `raw` form.

  We'll try to escape single quotes in the literal, unless they're already escaped (either as `''` or as `\\`, but
  this won't handle wacky cases like three single quotes in a row.

  DON'T USE `LITERAL` FOR THINGS THAT MIGHT BE WACKY (USER INPUT). Only use it for things that are hardcoded."
  [s]
  (Literal. (u/qualified-name s)))


(def ^{:arglists '([& exprs])}  +  "Math operator. Interpose `+` between `exprs` and wrap in parentheses." (partial hsql/call :+))
(def ^{:arglists '([& exprs])}  -  "Math operator. Interpose `-` between `exprs` and wrap in parentheses." (partial hsql/call :-))
(def ^{:arglists '([& exprs])}  /  "Math operator. Interpose `/` between `exprs` and wrap in parentheses." (partial hsql/call :/))
(def ^{:arglists '([& exprs])}  *  "Math operator. Interpose `*` between `exprs` and wrap in parentheses." (partial hsql/call :*))
(def ^{:arglists '([& exprs])} mod "Math operator. Interpose `%` between `exprs` and wrap in parentheses." (partial hsql/call :%))

(defn inc "Add 1 to `x`."        [x] (+ x 1))
(defn dec "Subtract 1 from `x`." [x] (- x 1))

(p.types/defprotocol+ TypedHoneySQL
  "Protocol for a HoneySQL form that has type information such as `::database-type`. See #15115 for background."
  (type-info [honeysql-form]
    "Return type information associated with `honeysql-form`, if any (i.e., if it is a `TypedHoneySQLForm`); otherwise
    returns `nil`.")
  (with-type-info [honeysql-form new-type-info]
    "Add type information to a `honeysql-form`. Wraps `honeysql-form` and returns a `TypedHoneySQLForm`.")
  (unwrap-typed-honeysql-form [honeysql-form]
    "If `honeysql-form` is a `TypedHoneySQLForm`, unwrap it and return the original form without type information.
    Otherwise, returns form as-is."))

;; a wrapped for any HoneySQL form that records additional type information in an `info` map.
(p.types/defrecord+ TypedHoneySQLForm [form info]
  PrettyPrintable
  (pretty [_]
    `(with-type-info ~form ~info))

  ToSql
  (to-sql [_]
    (hformat/to-sql form)))

(alter-meta! #'->TypedHoneySQLForm assoc :private true)
(alter-meta! #'map->TypedHoneySQLForm assoc :private true)

(def ^:private NormalizedTypeInfo
  {(s/optional-key ::database-type) (s/constrained
                                     su/NonBlankString
                                     (fn [s]
                                       (= s (str/lower-case s)))
                                     "lowercased string")})

(s/defn ^:private normalize-type-info :- NormalizedTypeInfo
  "Normalize the values in the `type-info` for a `TypedHoneySQLForm` for easy comparisons (e.g., normalize
  `::database-type` to a lower-case string)."
  [type-info]
  (cond-> type-info
    (::database-type type-info) (update ::database-type (comp str/lower-case name))))

(extend-protocol TypedHoneySQL
  Object
  (type-info [_]
    nil)
  (with-type-info [this new-info]
    (TypedHoneySQLForm. this (normalize-type-info new-info)))
  (unwrap-typed-honeysql-form [this]
    this)

  nil
  (type-info [_]
    nil)
  (with-type-info [_ new-info]
    (TypedHoneySQLForm. nil (normalize-type-info new-info)))
  (unwrap-typed-honeysql-form [_]
    nil)

  TypedHoneySQLForm
  (type-info [this]
    (:info this))
  (with-type-info [this new-info]
    (assoc this :info (normalize-type-info new-info)))
  (unwrap-typed-honeysql-form [this]
    (:form this)))

(defn is-of-type?
  "Is `honeysql-form` a typed form with `database-type`?

    (is-of-type? expr \"datetime\") ; -> true"
  [honeysql-form database-type]
  (= (::database-type (type-info honeysql-form))
     (some-> database-type name str/lower-case)))

(s/defn with-database-type-info
  "Convenience for adding only database type information to a `honeysql-form`. Wraps `honeysql-form` and returns a
  `TypedHoneySQLForm`. Passing `nil` as `database-type` will remove any existing type info.

    (with-database-type-info :field \"text\")
    ;; -> #TypedHoneySQLForm{:form :field, :info {::hx/database-type \"text\"}}"
  {:style/indent [:form]}
  [honeysql-form database-type :- (s/maybe su/KeywordOrString)]
  (if (some? database-type)
    (with-type-info honeysql-form {::database-type database-type})
    (unwrap-typed-honeysql-form honeysql-form)))

(s/defn cast :- TypedHoneySQLForm
  "Generate a statement like `cast(expr AS sql-type)`. Returns a typed HoneySQL form."
  [sql-type expr]
  (-> (hsql/call :cast expr (hsql/raw (name sql-type)))
      (with-type-info {::database-type sql-type})))

(s/defn quoted-cast :- TypedHoneySQLForm
  "Generate a statement like `cast(expr AS \"sql-type\")`.

  Like `cast` but quotes `sql-type`. This is useful for cases where we deal with user-defined types or other types
  that may have a space in the name, for example Postgres enum types.

  Returns a typed HoneySQL form."
  [sql-type expr]
  (-> (hsql/call :cast expr (keyword sql-type))
      (with-type-info {::database-type sql-type})))

(s/defn maybe-cast :- TypedHoneySQLForm
  "Cast `expr` to `sql-type`, unless `expr` is typed and already of that type. Returns a typed HoneySQL form."
  [sql-type expr]
  (if (is-of-type? expr sql-type)
      expr
      (cast sql-type expr)))

(defn format
  "SQL `format` function."
  [format-str expr]
  (hsql/call :format expr (literal format-str)))

(defn round
  "SQL `round` function."
  [x decimal-places]
  (hsql/call :round x decimal-places))

(defn ->date                     "CAST `x` to a `date`."                     [x] (maybe-cast :date x))
(defn ->datetime                 "CAST `x` to a `datetime`."                 [x] (maybe-cast :datetime x))
(defn ->timestamp                "CAST `x` to a `timestamp`."                [x] (maybe-cast :timestamp x))
(defn ->timestamp-with-time-zone "CAST `x` to a `timestamp with time zone`." [x] (maybe-cast "timestamp with time zone" x))
(defn ->integer                  "CAST `x` to a `integer`."                  [x] (maybe-cast :integer x))
(defn ->time                     "CAST `x` to a `time` datatype"             [x] (maybe-cast :time x))
(defn ->boolean                  "CAST `x` to a `boolean` datatype"          [x] (maybe-cast :boolean x))

;;; Random SQL fns. Not all DBs support all these!
(def ^{:arglists '([& exprs])} floor   "SQL `floor` function."   (partial hsql/call :floor))
(def ^{:arglists '([& exprs])} hour    "SQL `hour` function."    (partial hsql/call :hour))
(def ^{:arglists '([& exprs])} minute  "SQL `minute` function."  (partial hsql/call :minute))
(def ^{:arglists '([& exprs])} day     "SQL `day` function."     (partial hsql/call :day))
(def ^{:arglists '([& exprs])} week    "SQL `week` function."    (partial hsql/call :week))
(def ^{:arglists '([& exprs])} month   "SQL `month` function."   (partial hsql/call :month))
(def ^{:arglists '([& exprs])} quarter "SQL `quarter` function." (partial hsql/call :quarter))
(def ^{:arglists '([& exprs])} year    "SQL `year` function."    (partial hsql/call :year))
(def ^{:arglists '([& exprs])} concat  "SQL `concat` function."  (partial hsql/call :concat))

;; Etc (Dev Stuff)
(alter-meta! #'honeysql.core/format assoc :style/indent :defn)
(alter-meta! #'honeysql.core/call   assoc :style/indent :defn)

(require 'honeysql.types)
(extend-protocol PrettyPrintable
  honeysql.types.SqlCall
  (pretty [{fn-name :name, args :args, :as this}]
    (with-meta (apply list 'hsql/call fn-name args)
      (meta this))))

(defmethod print-method honeysql.types.SqlCall
  [call writer]
  (print-method (pretty/pretty call) writer))

(defmethod clojure.pprint/simple-dispatch honeysql.types.SqlCall
  [call]
  (clojure.pprint/write-out (pretty/pretty call)))
