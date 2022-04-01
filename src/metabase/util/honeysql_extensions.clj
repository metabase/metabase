(ns metabase.util.honeysql-extensions
  "HoneySQL 2.x extensions. These are primarily used by the `:sql` driver Query Processing
  code (e.g. [[metabase.driver.sql.query-processor]]) since Toucan and the application DB still use Toucan 1.x at the
  time of this writing. Use [[metabase.util.honeysql-1-extensions]] for app DB code."
  (:refer-clojure :exclude [+ - / * mod inc dec cast concat format])
  (:require [clojure.string :as str]
            [honey.sql :as hsql]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]))

;; register the `extract` function with HoneySQL
;; (hsql/format (hsql/call :extract :a :b)) -> "extract(a from b)"
(defn- format-extract [_ [unit expr]]
  (let [[expr-sql & expr-args] (hsql/format-expr expr)]
    (into [(str "extract(" (name unit) " from " expr-sql ")")
           expr-args])))

(hsql/register-fn! :extract format-extract)

;; register the function `distinct-count` with HoneySQL
;; (hsql/format :%distinct-count.x) -> "count(distinct x)"
(defn- format-distinct-count [_ [expr]]
  (let [[expr-sql & expr-args] (hsql/format-expr expr)]
    (into [(str "count(distinct " expr-sql ")")] expr-args)))

(hsql/register-fn! :distinct-count format-distinct-count)

(defn- format-ratio
  "Format a [[clojure.lang.Ratio]] as SQL. If the ratio is something representable (i.e., terminating) return a decimal
  representation; e.g.

      (/ 1 2) -> \"0.5\"

  but if not return an expression wrapped in parens e.g.

    (/ 1 3) -> \"(/ 1.0 3.0)\""
  [^clojure.lang.Ratio ratio]
  [(try
     (str (.decimalValue ratio))
     ;; thrown if it can't be represented
     (catch ArithmeticException _
       (clojure.core/format "(%s.0 / %s.0)" (.numerator ratio) (.denominator ratio))))])

;; HoneySQL 0.7.0+ parameterizes numbers to fix issues with NaN and infinity -- see
;; https://github.com/jkk/honeysql/pull/122. However, this broke some of Metabase's behavior, specifically queries
;; with calculated columns with numeric literals -- some SQL databases can't recognize that a calculated field in a
;; SELECT clause and a GROUP BY clause is the same thing if the calculation involves parameters. Go ahead an use the
;; old behavior so we can keep our HoneySQL dependency up to date.
(defn- format-numeric-literal [_ [n]]
  (cond
    (or (Double/isNaN n)
        (Double/isInfinite n))
    ["?" n]
    ;; Ratios are represented as the division of two numbers which may cause order-of-operation issues when dealing with
    ;; queries. Use our custom formatter which will
    (instance? clojure.lang.Ratio n)
    (format-ratio n)

    :else
    [(str n)]))

(hsql/register-fn! ::numeric-literal format-numeric-literal)

(s/defn numeric-literal
  "A HoneySQL form for numbers that will "
  [n :- Number]
  [::numeric-literal n])

;; register the function `percentile` with HoneySQL
;; (hsql/format (hsql/call :percentile-cont :a 0.9)) -> "percentile_cont(0.9) within group (order by a)"
(defn- format-percentile-cont [_ [expr p]]
  (let [p                      (if (number? p)
                                 (numeric-literal p)
                                 p)
        [p-sql & p-args]       (hsql/format-expr p)
        [expr-sql & expr-args] (hsql/format-expr expr)]
    (into
     [(str "percentile_cont(" p-sql ") within group (order by " expr-sql ")")]
     cat
     [p-args
      expr-args])))

(hsql/register-fn! :percentile-cont format-percentile-cont)

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

(def Identifier
  "Schema for an `::identifier` form."
  [(s/one (s/eq ::identifier) "form type")
   (s/one IdentifierType "identifier type")
   su/NonBlankString])

;; `::identifier` form looks like
;;
;;    [::identifier <identifier-type> & <component-strings>]
(defn- format-identifier [_ [_identifier-type & components]]
  ;; TODO -- not sure we really need to bind these here; [[metabase.driver.sql.query-processor/format-honeysql]] should
  ;; be passing these options anyway.
  (binding [hsql/*quoted*       true   ; quote the identifiers
            hsql/*quoted-snake* false] ; don't convert hyphens to underscores
    [(str/join
      \.
      (for [component components]
        ;; by passing `:aliased true` it won't split on any dots in the keyword/string
        (hsql/format-entity component {:aliased true})))]))

(hsql/register-fn! ::identifier format-identifier)

(defn identifier?
  "Whether `honeysql-form` is one of our special `::identifier` HoneySQL forms."
  [honeysql-form]
  (and (sequential? honeysql-form)
       (= (first honeysql-form) ::identifier)))

(defn identifier-type
  "If `honeysql-form` is an `::identifier`, return its identifier type e.g. `:table` or `:table-alias`."
  [honeysql-form]
  (when (identifier? honeysql-form)
    (second honeysql-form)))

(defn identifier-components
  "If `honeysql-form` is an `::identifier`, return its components."
  [honeysql-form]
  (when (identifier? honeysql-form)
    (drop 2 honeysql-form)))

(s/defn identifier :- (s/cond-pre s/Keyword Identifier)
  "Define an identifer of type with `components`. Prefer this to using keywords for identifiers, as those do not
  properly handle identifiers with slashes in them.

  `identifier-type` represents the type of identifier in question, which is important context for some drivers, such
  as BigQuery (which needs to qualify Tables identifiers with their dataset name.)

  This function automatically unnests any identifiers passed as arguments, removes nils, and converts all args to
  strings."
  [identifier-type :- IdentifierType & components]
  ;; NOCOMMIT -- It doesn't seem like `::identifier` works in the `alias` position in a `[source-identifier alias]` pair
  ;; -- unwrap for the time being until we figure out how to fix this
  (if (#{:table-alias :field-alias} identifier-type)
    (keyword (u/qualified-name (last components)))
    (into
     [::identifier identifier-type]
     (for [component components
           component (if (identifier? component)
                       (identifier-components component)
                       [component])
           :when     (some? component)]
       (u/qualified-name component)))))

;; Single-quoted string literal forms like
;;
;;    [::literal a-string]
(defn format-literal
  "Compile the clause produced by [[literal]] to SQL."
  [_ [literal-string]]
  [(as-> literal-string <>
     (str/replace <> #"(?<![\\'])'(?![\\'])"  "''")
     (str \' <> \'))])

(hsql/register-fn! ::literal format-literal)

(defn literal
  "Return a HoneySQL form that wraps keywords or string `s` in single quotes when compiled. We'll try to escape single
  quotes in the literal, unless they're already escaped (either as `''` or as `\\`, but this won't handle wacky cases
  like three single quotes in a row.

  DON'T USE `LITERAL` FOR THINGS THAT MIGHT BE WACKY (USER INPUT). Only use it for things that are hardcoded."
  [s]
  [::literal (u/qualified-name s)])

(defn- format-parens [_ [expr]]
  (let [[expr-sql & expr-args] (hsql/format-expr expr)]
    ;; only wrap if not already wrapped
    (into [(if (and (str/starts-with? expr-sql "(")
                    (str/ends-with? expr-sql ")"))
             expr-sql
             (str \( expr-sql \)))]
          expr-args)))

(hsql/register-fn! ::parens format-parens)

(defn- parens
  "Force `expr` to be wrapped in parens."
  [expr]
  [::parens expr])

(defn- math [operator args]
  (if (= (count args) 1)
    (first args)
    (parens
     (into [(keyword operator)]
           (map (fn [arg]
                  (if (number? arg)
                    (numeric-literal arg)
                    arg)))
           args))))

(def ^{:arglists '([num])} safe-zero?
  (every-pred number? zero?))

(defn +
  "Math operator. Interpose `+` between `exprs` and wrap in parentheses."
  [& exprs]
  ;; x + 0 = x so we can optimize out zeroes.
  (math :+ (remove safe-zero? exprs)))

(defn -
  "Math operator. Interpose `-` between `exprs` and wrap in parentheses."
  [& exprs]
  ;; x - 0 = x so we can optimize out zeroes.
  (math :- (remove safe-zero? exprs)))

;; TODO -- we can probably optimize this if it's x / 1 or whatever
(defn /
  "Math operator. Interpose `/` between `exprs` and wrap in parentheses."
  [& exprs]
  (math :/ exprs))

(defn- safe-one? [num]
  (and (number? num)
       (= (double num) 1.0)))

(defn *
  "Math operator. Interpose `*` between `exprs` and wrap in parentheses."
  [& exprs]
  ;; x * 1 = x so we can optimize out ones
  (math :* (remove safe-one? exprs)))

(defn mod
  "Math operator. Interpose `%` between `exprs` and wrap in parentheses."
  [& exprs]
  (math :% exprs))

(defn inc "Add 1 to `x`."        [x] (+ x 1))
(defn dec "Subtract 1 from `x`." [x] (- x 1))

;; `::typed` forms look like
;;
;;    [::typed <expr> <type-info-map>]

(def ^:private NormalizedTypeInfo
  {(s/optional-key ::database-type) (s/constrained
                                     su/NonBlankString
                                     (fn [s]
                                       (= s (str/lower-case s)))
                                     "lowercased string")
   s/Keyword                        s/Any})

(def TypedHoneySQLForm
  "Schema for a `::typed` HoneySQL form."
  [(s/one (s/eq ::typed) "keyword")
   (s/one s/Any "wrapped HoneySQL form")
   (s/one NormalizedTypeInfo "type info")])

(defn- format-typed [_ [expr]]
  (hsql/format-expr expr))

(hsql/register-fn! ::typed format-typed)

(defn typed?
  "Whether `honeysql-form` is one of our special `::typed` HoneySQL forms."
  [honeysql-form]
  (and (sequential? honeysql-form)
       (= (first honeysql-form) ::typed)))

(defn type-info
  "Return type information associated with `honeysql-form`, if it is a `::typed`; otherwise return `nil`."
  [honeysql-form]
  (when (typed? honeysql-form)
    (last honeysql-form)))

(defn unwrap-typed-honeysql-form
  "If `honeysql-form` is a `::typed`, unwrap it and return the original form without type information. Otherwise,
  returns form as-is."
  [honeysql-form]
  (if (typed? honeysql-form)
    (second honeysql-form)
    honeysql-form))

(s/defn ^:private normalize-type-info :- NormalizedTypeInfo
  "Normalize the values in the `type-info` for a `TypedHoneySQLForm` for easy comparisons (e.g., normalize
  `::database-type` to a lower-case string)."
  [type-info]
  (cond-> type-info
    (::database-type type-info) (update ::database-type (comp str/lower-case name))))

(s/defn with-type-info :- TypedHoneySQLForm
  "Add type information to a `honeysql-form`. Wraps `honeysql-form` and returns a `::typed`. Discards any existing type
  information."
  [honeysql-form new-type-info]
  [::typed (unwrap-typed-honeysql-form honeysql-form) (normalize-type-info new-type-info)])

(defn type-info->db-type
  "For a given type-info, returns the `database-type`."
  [type-info]
  {:added "0.39.0"}
  (::database-type type-info))

(defn is-of-type?
  "Is `honeysql-form` a typed form with `database-type`?

    (is-of-type? expr \"datetime\") ; -> true"
  [honeysql-form database-type]
  (= (some-> honeysql-form type-info type-info->db-type str/lower-case)
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
  [database-type expr]
  (-> [:cast expr [:raw (name database-type)]]
      (with-type-info {::database-type database-type})))

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

(defn cast-unless-type-in
  "Cast `expr` to `desired-type` unless `expr` is of one of the `acceptable-types`. Returns a typed HoneySQL form.

    ;; cast to TIMESTAMP unless form is already a TIMESTAMP, TIMESTAMPTZ, or DATE
    (cast-unless-type-in \"timestamp\" #{\"timestamp\" \"timestamptz\" \"date\"} form)"
  {:added "0.42.0"}
  [desired-type acceptable-types expr]
  (if (some (partial is-of-type? expr)
            acceptable-types)
    expr
    (cast desired-type expr)))

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
