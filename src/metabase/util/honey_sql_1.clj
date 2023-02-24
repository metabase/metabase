(ns ^{:deprecated "0.46.0"} metabase.util.honey-sql-1
  "Everything in this namespace is deprecated in 0.46.0. Switch to [[metabase.util.honey-sql-2]] instead. This namespace
  is planned for removal in Metabase 0.49.0."
  (:refer-clojure
   :exclude
   [+ - / * abs mod inc dec cast concat format second])
  (:require
   [clojure.pprint :as pprint]
   [clojure.string :as str]
   [honeysql.core :as hsql]
   [honeysql.format :as hformat]
   [honeysql.types]
   [metabase.util :as u]
   [metabase.util.schema :as su]
   [potemkin.types :as p.types]
   [pretty.core :as pretty]
   [schema.core :as s])
  (:import
   (honeysql.format ToSql)
   (java.util Locale)))

(set! *warn-on-reflection* true)

(comment honeysql.types/keep-me)

(defn- ^{:deprecated "0.46.0"} english-upper-case
  "Use this function when you need to upper-case an identifier or table name. Similar to `clojure.string/upper-case`
  but always converts the string to upper-case characters in the English locale. Using `clojure.string/upper-case` for
  table names, like we are using below in the `:h2` `honeysql.format` function can cause issues when the user has
  changed the locale to a language that has different upper-case characters. Turkish is one example, where `i` gets
  converted to `İ`. This causes the `SETTING` table to become the `SETTİNG` table, which doesn't exist."
  [^CharSequence s]
  (-> s str (.toUpperCase Locale/ENGLISH)))

;; Add an `:h2` quote style that uppercases the identifier
(let [{ansi-quote-fn :ansi} @#'honeysql.format/quote-fns]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (alter-var-root #'hformat/quote-fns assoc :h2 (comp english-upper-case ansi-quote-fn)))

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

(def ^{:deprecated "0.46.0"} IdentifierType
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

(p.types/defrecord+ ^{:deprecated "0.46.0"} Identifier [identifier-type components]
  ToSql
  (to-sql [_]
    (binding [hformat/*allow-dashed-names?* true]
      (str/join
       \.
       (for [component components]
         (hformat/quote-identifier component, :split false)))))
  pretty/PrettyPrintable
  (pretty [this]
    #_{:clj-kondo/ignore [:deprecated-var]}
    (if (= (set (keys this)) #{:identifier-type :components})
      (cons `identifier (cons identifier-type components))
      ;; if there's extra info beyond the usual two keys print with the record type reader literal syntax e.g.
      ;; #metabase..Identifier {...}
      (list (symbol (str \# `Identifier)) (into {} this)))))

;;; don't use `->Identifier` or `map->Identifier`. Use the `identifier` function instead, which cleans up its input

#_{:clj-kondo/ignore [:deprecated-var]}
(alter-meta! #'->Identifier    assoc :private true)

#_{:clj-kondo/ignore [:deprecated-var]}
(alter-meta! #'map->Identifier assoc :private true)

#_{:clj-kondo/ignore [:deprecated-var]}
(s/defn identifier :- Identifier
  "Define an identifer of type with `components`. Prefer this to using keywords for identifiers, as those do not
  properly handle identifiers with slashes in them.

  `identifier-type` represents the type of identifier in question, which is important context for some drivers, such
  as BigQuery (which needs to qualify Tables identifiers with their dataset name.)

  This function automatically unnests any Identifiers passed as arguments, removes nils, and converts all args to
  strings."
  {:deprecated "0.46.0"}
  [identifier-type :- IdentifierType, & components]
  (Identifier.
   identifier-type
   (for [component components
         component (if (instance? Identifier component)
                     (:components component)
                     [component])
         :when     (some? component)]
     (u/qualified-name component))))

(defn identifier?
  "Whether `x` is an instance of `Identifier`."
  {:deprecated "0.46.0"}
  [x]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (instance? Identifier x))

;; Single-quoted string literal
(p.types/defrecord+ ^{:deprecated "0.46.0"} Literal [literal]
  ToSql
  (to-sql [_]
    #_{:clj-kondo/ignore [:deprecated-var]}
    (as-> literal <>
      (str/replace <> #"(?<![\\'])'(?![\\'])"  "''")
      (str \' <> \')))
  pretty/PrettyPrintable
  (pretty [_]
    #_{:clj-kondo/ignore [:deprecated-var]}
    (list `literal literal)))

;;; as with `Identifier` you should use the the `literal` function below instead of the auto-generated factory functions.

#_{:clj-kondo/ignore [:deprecated-var]}
(alter-meta! #'->Literal    assoc :private true)

#_{:clj-kondo/ignore [:deprecated-var]}
(alter-meta! #'map->Literal assoc :private true)

(defn literal
  "Wrap keyword or string `s` in single quotes and a HoneySQL `raw` form.

  We'll try to escape single quotes in the literal, unless they're already escaped (either as `''` or as `\\`, but
  this won't handle wacky cases like three single quotes in a row.

  DON'T USE `LITERAL` FOR THINGS THAT MIGHT BE WACKY (USER INPUT). Only use it for things that are hardcoded."
  {:deprecated "0.46.0"}
  [s]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (Literal. (u/qualified-name s)))

(p.types/defprotocol+ ^{:deprecated "0.46.0"} TypedHoneySQL
  "Protocol for a HoneySQL form that has type information such as `:metabase.util.honeysql-extensions/database-type`.
  See #15115 for background."
  (^{:deprecated "0.46.0"} type-info [honeysql-form]
    "Return type information associated with `honeysql-form`, if any (i.e., if it is a `TypedHoneySQLForm`); otherwise
    returns `nil`.")
  (^{:deprecated "0.46.0"} with-type-info [honeysql-form new-type-info]
    "Add type information to a `honeysql-form`. Wraps `honeysql-form` and returns a `TypedHoneySQLForm`.")
  (^{:deprecated "0.46.0"} unwrap-typed-honeysql-form [honeysql-form]
    "If `honeysql-form` is a `TypedHoneySQLForm`, unwrap it and return the original form without type information.
    Otherwise, returns form as-is."))

;; a wrapped for any HoneySQL form that records additional type information in an `info` map.
(p.types/defrecord+ ^{:deprecated "0.46.0"} TypedHoneySQLForm [form info]
  pretty/PrettyPrintable
  (pretty [_]
    `(with-type-info ~form ~info))

  ToSql
  (to-sql [_]
    (hformat/to-sql form)))

#_{:clj-kondo/ignore [:deprecated-var]}
(alter-meta! #'->TypedHoneySQLForm assoc :private true)

#_{:clj-kondo/ignore [:deprecated-var]}
(alter-meta! #'map->TypedHoneySQLForm assoc :private true)

(p.types/defrecord+ ^{:deprecated "0.46.0"} AtTimeZone
  [expr zone]
  hformat/ToSql
  (to-sql [_]
    #_{:clj-kondo/ignore [:deprecated-var]}
    (clojure.core/format "(%s AT TIME ZONE %s)"
                         (hformat/to-sql expr)
                         (hformat/to-sql (literal zone)))))

(def ^{:deprecated "0.46.0"} ^:private NormalizedTypeInfo
  {(s/optional-key :metabase.util.honeysql-extensions/database-type)
   (s/constrained
    su/NonBlankString
    (fn [s]
      (= s (u/lower-case-en s)))
    "lowercased string")})

#_{:clj-kondo/ignore [:deprecated-var]}
(s/defn ^:private normalize-type-info :- NormalizedTypeInfo
  "Normalize the values in the `type-info` for a `TypedHoneySQLForm` for easy comparisons (e.g., normalize
  `:metabase.util.honeysql-extensions/database-type` to a lower-case string)."
  {:deprecated "0.46.0"}
  [type-info]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (cond-> type-info
    (:metabase.util.honeysql-extensions/database-type type-info)
    (update :metabase.util.honeysql-extensions/database-type (comp u/lower-case-en name))))

(extend-protocol TypedHoneySQL
  Object
  (type-info [_]
    nil)
  (with-type-info [this new-info]
    #_{:clj-kondo/ignore [:deprecated-var]}
    (TypedHoneySQLForm. this (normalize-type-info new-info)))
  (unwrap-typed-honeysql-form [this]
    this)

  nil
  (type-info [_]
    nil)
  (with-type-info [_ new-info]
    #_{:clj-kondo/ignore [:deprecated-var]}
    (TypedHoneySQLForm. nil (normalize-type-info new-info)))
  (unwrap-typed-honeysql-form [_]
    nil)

  #_{:clj-kondo/ignore [:deprecated-var]}
  TypedHoneySQLForm
  (type-info [this]
    (:info this))
  (with-type-info [this new-info]
    #_{:clj-kondo/ignore [:deprecated-var]}
    (assoc this :info (normalize-type-info new-info)))
  (unwrap-typed-honeysql-form [this]
    (:form this)))

(defn type-info->db-type
  "For a given type-info, returns the `database-type`."
  [type-info]
  {:added "0.39.0", :deprecated "0.46.0"}
  (:metabase.util.honeysql-extensions/database-type type-info))

(defn database-type
  "Returns the `database-type` from the type-info of `honeysql-form` if present.
   Otherwise, returns `nil`."
  {:deprecated "0.46.0"}
  [honeysql-form]
  (some-> honeysql-form type-info type-info->db-type))

(defn is-of-type?
  "Is `honeysql-form` a typed form with `db-type`?
  Where `db-type` could be a string or a regex.

    (is-of-type? expr \"datetime\") ; -> true
    (is-of-type? expr #\"int*\") ; -> true"
  {:deprecated "0.46.0"}
  [honeysql-form db-type]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (let [form-type (some-> honeysql-form database-type u/lower-case-en)]
    (if (instance? java.util.regex.Pattern db-type)
      (and (some? form-type) (some? (re-find db-type form-type)))
      (= form-type
         (some-> db-type name u/lower-case-en)))))

(s/defn with-database-type-info
  "Convenience for adding only database type information to a `honeysql-form`. Wraps `honeysql-form` and returns a
  `TypedHoneySQLForm`. Passing `nil` as `database-type` will remove any existing type info.

    (with-database-type-info :field \"text\")
    ;; -> #TypedHoneySQLForm{:form :field, :info {::hx/database-type \"text\"}}"
  {:deprecated "0.46.0", :style/indent [:form]}
  [honeysql-form db-type :- (s/maybe su/KeywordOrString)]
  (if (some? db-type)
    (with-type-info honeysql-form {:metabase.util.honeysql-extensions/database-type db-type})
    (unwrap-typed-honeysql-form honeysql-form)))

#_{:clj-kondo/ignore [:deprecated-var]}
(s/defn cast :- TypedHoneySQLForm
  "Generate a statement like `cast(expr AS sql-type)`. Returns a typed HoneySQL form."
  {:deprecated "0.46.0"}
  [db-type expr]
  #_{:clj-kondo/ignore [:discouraged-var]}
  (-> (hsql/call :cast expr (hsql/raw (name db-type)))
      (with-type-info {:metabase.util.honeysql-extensions/database-type db-type})))

#_{:clj-kondo/ignore [:deprecated-var]}
(s/defn quoted-cast :- TypedHoneySQLForm
  "Generate a statement like `cast(expr AS \"sql-type\")`.

  Like `cast` but quotes `sql-type`. This is useful for cases where we deal with user-defined types or other types
  that may have a space in the name, for example Postgres enum types.

  Returns a typed HoneySQL form."
  {:deprecated "0.46.0"}
  [sql-type expr]
  #_{:clj-kondo/ignore [:discouraged-var]}
  (-> (hsql/call :cast expr (keyword sql-type))
      (with-type-info {:metabase.util.honeysql-extensions/database-type sql-type})))

#_{:clj-kondo/ignore [:deprecated-var]}
(s/defn maybe-cast :- TypedHoneySQLForm
  "Cast `expr` to `sql-type`, unless `expr` is typed and already of that type. Returns a typed HoneySQL form."
  [sql-type expr]
  {:deprecated "0.46.0"}
  (if (is-of-type? expr sql-type)
      expr
      (cast sql-type expr)))

(defn cast-unless-type-in
  "Cast `expr` to `desired-type` unless `expr` is of one of the `acceptable-types`. Returns a typed HoneySQL form.

    ;; cast to TIMESTAMP unless form is already a TIMESTAMP, TIMESTAMPTZ, or DATE
    (cast-unless-type-in \"timestamp\" #{\"timestamp\" \"timestamptz\" \"date\"} form)"
  {:added "0.42.0", :deprecated "0.46.0"}
  [desired-type acceptable-types expr]
  {:pre [(string? desired-type) (set? acceptable-types)]}
  #_{:clj-kondo/ignore [:deprecated-var]}
  (if (some (partial is-of-type? expr)
            acceptable-types)
    expr
    (cast desired-type expr)))

(defn- math-operator
  {:deprecated "0.46.0"}
  [operator]
  (fn [& args]
    (let [arg-db-type (some (fn [arg]
                              (-> arg type-info type-info->db-type))
                            args)]
      #_{:clj-kondo/ignore [:deprecated-var :discouraged-var]}
      (cond-> (apply hsql/call operator args)
        arg-db-type (with-database-type-info arg-db-type)))))

(def ^{:deprecated "0.46.0", :arglists '([& exprs])}  +
  "Math operator. Interpose `+` between `exprs` and wrap in parentheses."
  #_{:clj-kondo/ignore [:deprecated-var]}
  (math-operator :+))

(def ^{:deprecated "0.46.0", :arglists '([& exprs])}  -
  "Math operator. Interpose `-` between `exprs` and wrap in parentheses."
  #_{:clj-kondo/ignore [:deprecated-var]}
  (math-operator :-))

(def ^{:deprecated "0.46.0", :arglists '([& exprs])}  /
  "Math operator. Interpose `/` between `exprs` and wrap in parentheses."
  #_{:clj-kondo/ignore [:deprecated-var]}
  (math-operator :/))

(def ^{:deprecated "0.46.0", :arglists '([& exprs])}  *
  "Math operator. Interpose `*` between `exprs` and wrap in parentheses."
  #_{:clj-kondo/ignore [:deprecated-var]}
  (math-operator :*))

(def ^{:deprecated "0.46.0", :arglists '([& exprs])} mod
  "Math operator. Interpose `%` between `exprs` and wrap in parentheses."
  #_{:clj-kondo/ignore [:deprecated-var]}
  (math-operator :%))

(defn inc
  "Add 1 to `x`."
  {:deprecated "0.46.0"}
  [x]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (+ x 1))

(defn dec
  "Subtract 1 from `x`."
  {:deprecated "0.46.0"}
  [x]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (- x 1))

(defn ^{:deprecated "0.46.0"} format
  "SQL `format` function."
  [format-str expr]
  #_{:clj-kondo/ignore [:deprecated-var :discouraged-var]}
  (hsql/call :format expr (literal format-str)))

(defn ^{:deprecated "0.46.0"} round
  "SQL `round` function."
  [x decimal-places]
  #_{:clj-kondo/ignore [:discouraged-var]}
  (hsql/call :round x decimal-places))

(defn ^{:deprecated "0.46.0"} ->date                     "CAST `x` to a `date`."                     [x] (maybe-cast :date x))
(defn ^{:deprecated "0.46.0"} ->datetime                 "CAST `x` to a `datetime`."                 [x] (maybe-cast :datetime x))
(defn ^{:deprecated "0.46.0"} ->timestamp                "CAST `x` to a `timestamp`."                [x] (maybe-cast :timestamp x))
(defn ^{:deprecated "0.46.0"} ->timestamp-with-time-zone "CAST `x` to a `timestamp with time zone`." [x] (maybe-cast "timestamp with time zone" x))
(defn ^{:deprecated "0.46.0"} ->integer                  "CAST `x` to a `integer`."                  [x] (maybe-cast :integer x))
(defn ^{:deprecated "0.46.0"} ->time                     "CAST `x` to a `time` datatype"             [x] (maybe-cast :time x))
(defn ^{:deprecated "0.46.0"} ->boolean                  "CAST `x` to a `boolean` datatype"          [x] (maybe-cast :boolean x))

;;; Random SQL fns. Not all DBs support all these!
(def ^{:deprecated "0.46.0", :arglists '([& exprs])} abs     "SQL `abs` function."     (partial #_{:clj-kondo/ignore [:discouraged-var]} hsql/call :abs))
(def ^{:deprecated "0.46.0", :arglists '([& exprs])} ceil    "SQL `ceil` function."    (partial #_{:clj-kondo/ignore [:discouraged-var]} hsql/call :ceil))
(def ^{:deprecated "0.46.0", :arglists '([& exprs])} floor   "SQL `floor` function."   (partial #_{:clj-kondo/ignore [:discouraged-var]} hsql/call :floor))
(def ^{:deprecated "0.46.0", :arglists '([& exprs])} second  "SQL `second` function."  (partial #_{:clj-kondo/ignore [:discouraged-var]} hsql/call :second))
(def ^{:deprecated "0.46.0", :arglists '([& exprs])} minute  "SQL `minute` function."  (partial #_{:clj-kondo/ignore [:discouraged-var]} hsql/call :minute))
(def ^{:deprecated "0.46.0", :arglists '([& exprs])} hour    "SQL `hour` function."    (partial #_{:clj-kondo/ignore [:discouraged-var]} hsql/call :hour))
(def ^{:deprecated "0.46.0", :arglists '([& exprs])} day     "SQL `day` function."     (partial #_{:clj-kondo/ignore [:discouraged-var]} hsql/call :day))
(def ^{:deprecated "0.46.0", :arglists '([& exprs])} week    "SQL `week` function."    (partial #_{:clj-kondo/ignore [:discouraged-var]} hsql/call :week))
(def ^{:deprecated "0.46.0", :arglists '([& exprs])} month   "SQL `month` function."   (partial #_{:clj-kondo/ignore [:discouraged-var]} hsql/call :month))
(def ^{:deprecated "0.46.0", :arglists '([& exprs])} quarter "SQL `quarter` function." (partial #_{:clj-kondo/ignore [:discouraged-var]} hsql/call :quarter))
(def ^{:deprecated "0.46.0", :arglists '([& exprs])} year    "SQL `year` function."    (partial #_{:clj-kondo/ignore [:discouraged-var]} hsql/call :year))
(def ^{:deprecated "0.46.0", :arglists '([& exprs])} concat  "SQL `concat` function."  (partial #_{:clj-kondo/ignore [:discouraged-var]} hsql/call :concat))

;; Etc (Dev Stuff)

(extend-protocol pretty/PrettyPrintable
  honeysql.types.SqlCall
  (pretty [{fn-name :name, args :args, :as this}]
    #_{:clj-kondo/ignore [:discouraged-var]}
    (with-meta (apply list `hsql/call fn-name args)
               (meta this))))

(defmethod print-method honeysql.types.SqlCall
  [call writer]
  (print-method (pretty/pretty call) writer))

(defmethod pprint/simple-dispatch honeysql.types.SqlCall
  [call]
  (pprint/write-out (pretty/pretty call)))

(defmethod hformat/format-clause :returning [[_ fields] _]
  (->> (flatten fields)
       (map hformat/to-sql)
       (hformat/comma-join)
       (str "RETURNING ")))
