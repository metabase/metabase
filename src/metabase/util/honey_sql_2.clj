(ns ^{:added  "0.46.0"} metabase.util.honey-sql-2
  "Honey SQL 2 utilities and extra registered functions/operators."
  (:refer-clojure
   :exclude
   [+ - / * abs mod inc dec cast concat format second])
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [honey.sql.protocols :as sql.protocols]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [potemkin.types :as p.types])
  (:import
   (java.util Locale)))

(set! *warn-on-reflection* true)

(defn- escape-like-pattern
  "Escape `%`, `_` and the escape character `!` so `s` matches literally in a `LIKE` pattern."
  ^String [^String s]
  (str/replace s #"([!%_])" "!$1"))

(defn like-pattern
  "`LIKE` right-hand side matching `s` literally, with an explicit `ESCAPE` clause so it behaves the same on every app DB.
  `wrap` receives the escaped string and returns the final pattern (string or HoneySQL expr), e.g. to add wildcards."
  ([s]
   (like-pattern s identity))
  ([s wrap]
   [:escape (wrap (escape-like-pattern s)) ^:allow-raw-sql [:inline "!"]]))

(defn like-substring
  "`LIKE` right-hand side matching `s` case-insensitively as a literal substring; compare it against a lowercased column."
  [s]
  (like-pattern (u/lower-case-en s) #(str "%" % "%")))

(defn like-prefix
  "`LIKE` right-hand side matching `s` case-insensitively as a literal prefix; compare it against a lowercased column."
  [s]
  (like-pattern (u/lower-case-en s) #(str % "%")))

;;; `[:inline <clojure.lang.Ratio>] should emit something wrapped in parens. Because otherwise the result could be
;;; something unintended. e.g.
;;;
;;;    [:/ 4 (/ 1 3)] => 4 / 1 / 3
;;;
;;; is a different result than
;;;
;;;    [:/ 4 (/ 1 3)] => 4 / (1 / 3)
;;;
;;; See #28354
(extend-protocol sql.protocols/InlineValue
  clojure.lang.Ratio
  (sqlize [this]
    (let [numerator   (.numerator ^clojure.lang.Ratio this)
          denominator (.denominator ^clojure.lang.Ratio this)]
      (clojure.core/format "(%d.0 / %d.0)" numerator denominator))))

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

;;; this is mostly a convenience for tests, disables quoting completely.
(sql/register-dialect!
 ::unquoted-dialect
 (assoc (sql/get-dialect :ansi) :quote identity))

;; register the `::extract` function with HoneySQL
(defn- format-extract
  "(sql/format-expr [::extract :a :b])
   => \"extract(a from b)\""
  [_tag [unit expr]]
  (let [[sql & args] (sql/format-expr expr {:nested true})]
    (into [(clojure.core/format "extract(%s from %s)" (name unit) sql)]
          args)))

(sql/register-fn! ::extract #'format-extract)

(defn extract
  "Create a Honey SQL form that will compile to SQL like

    extract(unit FROM expr)"
  [unit expr]
  ;; make sure no one tries to be sneaky and pass some sort of malicious unit in.
  {:pre [(some-fn keyword? string?) (re-matches #"^[a-zA-Z0-9]+$" (name unit))]}
  [::extract unit expr])

;; register the function `::distinct-count` with HoneySQL
(defn- format-distinct-count
  "(sql/format-expr [::h2x/distinct-count :x])
   =>
   count(distinct x)"
  [_tag [expr]]
  (let [[sql & args] (sql/format-expr expr)]
    (into [(str "count(distinct " sql ")")]
          args)))

(sql/register-fn! ::distinct-count #'format-distinct-count)

;; register the function `percentile` with HoneySQL
(defn- format-percentile-cont
  "(hsql/format (sql/call :percentile-cont :a 0.9)) => \"percentile_cont(0.9) within group (order by a)\""
  [_tag [expr p]]
  (let [p                      (if (number? p)
                                 [:inline p]
                                 p)
        [expr-sql & expr-args] (sql/format-expr expr)
        [p-sql & p-args]       (sql/format-expr p)]
    (into [(clojure.core/format "PERCENTILE_CONT(%s) within group (order by %s)" p-sql expr-sql)]
          cat
          [expr-args
           p-args])))

(sql/register-fn! ::percentile-cont #'format-percentile-cont)

(defn- format-collate
  "Force a specific collation on `expr` -- e.g. a case-insensitive `COLLATE` for a `LIKE` against a case-sensitive
  MySQL/MariaDB column.

    (sql/format-expr [::collate [:like :name \"x%\"] \"utf8mb4_unicode_ci\"])
    => [\"name LIKE ? COLLATE utf8mb4_unicode_ci\" \"x%\"]

  `collation` must be a bare collation identifier; it is interpolated into the SQL, so it is held to word characters."
  [_fn [expr collation]]
  (when-not (re-matches #"\w+" (name collation))
    (throw (ex-info (str "Invalid collation: " (pr-str collation)) {:collation collation})))
  (let [[expr-sql & expr-args] (sql/format-expr expr)]
    (into [(clojure.core/format "%s COLLATE %s" expr-sql (name collation))]
          expr-args)))

(sql/register-fn! ::collate #'format-collate)

(def IdentifierType
  "Malli schema for valid [[identifier]] types."
  [:enum
   :database
   :schema
   :constraint
   :index
   ;; Suppose we have a query like:
   ;; SELECT my_field f FROM my_table t
   ;; then:
   :table       ; is `my_table`
   :table-alias ; is `t`
   :field       ; is `my_field`
   :field-alias ; is `f`
   ;; for [[cast]]
   :type-name])

(defn identifier?
  "Whether `x` is a valid `::identifier`."
  [x]
  (and (vector? x)
       (= (first x) ::identifier)))

(def Identifier
  "Malli schema for an [[identifier]]."
  [:tuple
   [:= ::identifier]
   IdentifierType
   [:sequential {:min 1} :string]])

(defn- format-identifier [_tag [_identifier-type components :as _args]]
  ;; don't error if the identifier has something 'suspicious' like a semicolon in it -- it's ok because we're quoting
  ;; everything
  (binding [sql/*options* (assoc @#'sql/*options* :allow-suspicious-entities true)]
    [(str/join \. (map (fn [component]
                         ;; `:aliased` `true` => don't split dots in the middle of components
                         (sql/format-entity component {:aliased true}))
                       components))]))

(sql/register-fn! ::identifier #'format-identifier)

(mu/defn identifier :- Identifier
  "Define an identifier of type with `components`. Prefer this to using keywords for identifiers, as those do not
  properly handle identifiers with slashes in them.

  `identifier-type` represents the type of identifier in question, which is important context for some drivers, such
  as BigQuery (which needs to qualify Tables identifiers with their dataset name.)

  This function automatically unnests any Identifiers passed as arguments, removes nils, and converts all args to
  strings."
  [identifier-type :- IdentifierType
   & components    :- [:* {:min 1} [:maybe [:or :keyword :string [:fn identifier?]]]]]
  [::identifier
   identifier-type
   (vec (for [component components
              component (if (identifier? component)
                          (last component)
                          [component])
              :when     (some? component)]
          (u/qualified-name component)))])

(mu/defn identifier->components :- [:sequential string?]
  "Given an identifier return its components
  (identifier->components (identifier :field :metabase :user :email))
  => (\"metabase\" \"user\" \"email\"))"
  [identifier :- [:fn identifier?]]
  (last identifier))

;;; Single-quoted string literal

(defn- escape-and-quote-literal [s]
  ;; double EVERY single quote, unconditionally -- SQL string-literal escaping is not
  ;; context-sensitive on neighboring characters. An earlier version of this only doubled a `'` that
  ;; wasn't already preceded/followed by `\` or `'`, on the theory that those were "already escaped"
  ;; -- but a `\` before a quote is a plain backslash CHARACTER on any standard-conforming-strings
  ;; database (Oracle, Vertica, Postgres, Trino), not an escape sequence, so `\'` in the input is a
  ;; genuine, unescaped string terminator, not something to skip over.
  (as-> s s
    (str/replace s "'" "''")
    (str \' s \')))

(defn- format-literal [_tag [s]]
  [(escape-and-quote-literal s)])

(sql/register-fn! ::literal #'format-literal)

(def Literal "A `literal` tagged string or keyword" [:tuple [:= ::literal] :string])

(mu/defn literal :- Literal
  "Wrap keyword or string `s` in single quotes and a HoneySQL `raw` form.

  We'll try to escape single quotes in the literal, unless they're already escaped (either as `''` or as `\\`, but
  this won't handle wacky cases like three single quotes in a row.

  DON'T USE `LITERAL` FOR THINGS THAT MIGHT BE WACKY (USER INPUT). Only use it for things that are hardcoded."
  [s]
  [::literal (u/qualified-name s)])

(defn- format-at-time-zone [_tag [expr zone]]
  (let [[expr-sql & expr-args] (sql/format-expr expr {:nested true})
        [zone-sql & zone-args] (sql/format-expr (literal zone))]
    (into [(clojure.core/format "(%s AT TIME ZONE %s)"
                                expr-sql
                                zone-sql)]
          cat
          [expr-args zone-args])))

(sql/register-fn! ::at-time-zone #'format-at-time-zone)

(defn at-time-zone
  "Create a Honey SQL form that returns `expr` at time `zone`. Does not add type info! Add appropriate DB type info
  yourself to the result."
  [expr zone]
  [::at-time-zone expr zone])

(p.types/defprotocol+ TypedHoneySQL
  "Protocol for a HoneySQL form that has type information such as `:database-type`.
  See #15115 for background."
  (type-info [honeysql-form]
    "Return type information associated with `honeysql-form`, if any (i.e., if it is a `TypedHoneySQLForm`); otherwise
    returns `nil`.")
  (with-type-info [honeysql-form new-type-info]
    "Add type information to a `honeysql-form`. Wraps `honeysql-form` and returns a `TypedHoneySQLForm`.")
  (unwrap-typed-honeysql-form [honeysql-form]
    "If `honeysql-form` is a `TypedHoneySQLForm`, unwrap it and return the original form without type information.
    Otherwise, returns form as-is."))

(defn- format-typed [_tag [expr _type-info]]
  (sql/format-expr expr {:nested true}))

(sql/register-fn! ::typed #'format-typed)

(def ^:private NormalizedTypeInfo
  [:map
   [:database-type
    {:optional true}
    [:and
     ms/NonBlankString
     [:fn
      {:error/message "lowercased string"}
      (fn [s]
        (= s (u/lower-case-en s)))]]]])

(mu/defn- normalize-type-info :- NormalizedTypeInfo
  "Normalize the values in the `type-info` for a `TypedHoneySQLForm` for easy comparisons (e.g., normalize
  `:database-type` to a lower-case string)."
  [type-info]
  (cond-> type-info
    (:database-type type-info)
    (update :database-type (comp u/lower-case-en name))))

(defn typed?
  "True if `x` is a `TypedHoneySQL` form, i.e. `[::typed <expr> <type-info>]`."
  [x]
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
  {:added "0.39.0"}
  [type-info]
  (:database-type type-info))

(defn database-type
  "Returns the `database-type` from the type-info of `honeysql-form` if present.
   Otherwise, returns `nil`."
  [honeysql-form]
  (some-> honeysql-form type-info type-info->db-type))

(defn effective-type
  "Returns the Metabase effective type from the type-info of `honeysql-form` if present,
   falling back to `:base-type`. Returns `nil` if neither is set."
  [honeysql-form]
  (let [info (type-info honeysql-form)]
    (or (:effective-type info) (:base-type info))))

(defn database-or-effective-type-isa?
  "Returns true if `honeysql-form`'s known `database-type` (case-insensitive) equals `db-type`, OR — when no
  `database-type` is attached — if its [[effective-type]] descends from `effective-type-supertype`. Useful in driver
  bucketing code that special-cases columns by their warehouse type and needs to fall back when the column reached
  the driver from a nested query (so the database-type was lost) but its Metabase effective type is still known."
  [honeysql-form db-type effective-type-supertype]
  (let [dbt (database-type honeysql-form)]
    (if dbt
      (= (u/lower-case-en dbt) (u/lower-case-en (name db-type)))
      (when effective-type-supertype
        (isa? (effective-type honeysql-form) effective-type-supertype)))))

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
    ;; -> [::typed :field \"text\"]"
  {:style/indent [:form]}
  [honeysql-form db-type :- [:maybe ms/KeywordOrString]]
  (if (some? db-type)
    (with-type-info honeysql-form {:database-type db-type})
    (unwrap-typed-honeysql-form honeysql-form)))

(def ^:private TypedExpression
  [:fn {:error/message "::h2x/typed Honey SQL form"} typed?])

(def ^:private raw-cast-type-name-re
  "Shape of an SQL type name that [[cast]] emits as a raw, unquoted CAST target: word characters and
  spaces (`timestamp with time zone`, `TIMESTAMP_NTZ`), optionally a trailing precision like `(2)` or `(10, 2)`
  (`datetime(2)`).

  The shape is what makes raw emission safe: the alphabet contains no quote, semicolon, dash, or slash, so a matching
  name cannot open a string, start a comment, or terminate the `CAST(` and continue with attacker SQL -- the only `)`
  allowed is the one closing its own `(`. A hostile name matching this shape yields at worst invalid SQL
  (`Unsupported data type`), never injection."
  #"(?i)[a-z][a-z0-9_ ]*(?:\(\d+(?:, ?\d+)?\))?")

(defn raw-type-name?
  "Whether `sql-type` is a plain SQL type name — letters, digits, underscores, and spaces with an optional precision
  suffix, e.g. `varchar(10)` or `double precision` — and is therefore safe to splice into SQL unquoted. Cast targets
  that don't match (e.g. a `database-type` coming from field metadata) must be quoted as identifiers or rejected
  instead of being emitted raw."
  [sql-type]
  (boolean (re-matches raw-cast-type-name-re (name sql-type))))

(mu/defn cast :- TypedExpression
  "Generate a statement like `cast(expr AS sql-type)`. Returns a typed HoneySQL form.

  A `sql-type` matching [[raw-cast-type-name-re]] -- a sane bare type-name token -- is emitted raw, because most
  dialects only accept a bare type-name there and reject a quoted one (Snowflake fails `CAST(x AS \"date\")` with
  `Unsupported data type 'date'`). Anything else -- e.g. a `database_type` copied verbatim from an untrusted warehouse
  schema, which can name arbitrary user-defined types -- is quoted as an identifier, so it cannot be spliced into the
  query as SQL."
  [sql-type expr]
  (-> (if (raw-type-name? sql-type)
        [:cast expr ^:allow-raw-sql [:raw (name sql-type)]]
        [:cast expr (identifier :type-name (name sql-type))])
      (with-database-type-info sql-type)))

(mu/defn maybe-cast :- TypedExpression
  "Cast `expr` to `sql-type`, unless `expr` is typed and already of that type. Returns a typed HoneySQL form.

  `sql-type` need not be a sane type name -- [[cast]] quotes anything that isn't a bare type-name token -- so this is
  also safe for an `sql-type` copied verbatim from a warehouse `database_type`."
  [sql-type expr]
  (if (or (nil? sql-type)
          (is-of-type? expr sql-type))
    expr
    (cast sql-type expr)))

(defn cast-unless-type-in
  "Cast `expr` to `desired-type` unless `expr` is of one of the `acceptable-types`. Returns a typed HoneySQL form.

   When `database-type` is not available on `expr` but `effective-type` is, and `effective-type` is a descendant of
   `effective-type-supertype`, the cast is also skipped. This handles card-sourced fields that lack `database-type`
   metadata but have Metabase type information.

    ;; cast to TIMESTAMP unless form is already a TIMESTAMP, TIMESTAMPTZ, or DATE
    (cast-unless-type-in \"timestamp\" #{\"timestamp\" \"timestamptz\" \"date\"} form)

    ;; same, but also skip the cast if effective-type isa? :type/Temporal
    (cast-unless-type-in \"timestamp\" #{\"timestamp\" \"timestamptz\" \"date\"} :type/Temporal form)"
  {:added "0.42.0"}
  ([desired-type acceptable-types expr]
   (cast-unless-type-in desired-type acceptable-types nil expr))
  ([desired-type acceptable-types effective-type-supertype expr]
   {:pre [(string? desired-type) (set? acceptable-types)]}
   (if (or (some (partial is-of-type? expr) acceptable-types)
           (when (and effective-type-supertype (not (database-type expr)))
             (isa? (effective-type expr) effective-type-supertype)))
     expr
     (cast desired-type expr))))

(defn- math-operator [operator]
  (fn [& args]
    (let [arg-db-type (some (fn [arg]
                              (-> arg type-info type-info->db-type))
                            args)]
      (cond-> (into [operator]
                    (map (fn [arg]
                           (if (number? arg)
                             [:inline arg]
                             arg)))
                    args)
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

(defn current-datetime-honeysql-form
  "HoneySQL form that should be used to get the current `datetime` (or equivalent), e.g. `:%now`."
  [db-type]
  (case db-type
    (:h2 :h2-mbql5) (with-database-type-info :%now "timestamp")
    :mysql    (with-database-type-info [:now [:inline 6]] "timestamp")
    (:postgres :postgres-mbql5) (with-database-type-info :%now "timestamptz")))

(defn- format-postgres-interval
  "Generate a Postgres 'INTERVAL' literal.

    (sql/format-expr [::postgres-interval 2 :day])
    =>
    [\"INTERVAL '2 day'\"]"
  ;; I tried to write this with Malli but couldn't figure out how to make it work. See
  ;; https://metaboat.slack.com/archives/CKZEMT1MJ/p1676076592468909
  [_fn [amount unit]]
  {:pre [(number? amount)
         (#{:millisecond :second :minute :hour :day :week :month :year} unit)]}
  [(clojure.core/format "INTERVAL '%s %s'" (num amount) (name unit))])

(sql/register-fn! ::postgres-interval #'format-postgres-interval)

(defn- pg-interval [amount unit]
  (with-database-type-info [::postgres-interval amount unit] "interval"))

(defn ->pg-timestamp
  "Cast to timestamp, preserving timestamptz if present."
  [honeysql-form]
  (cast-unless-type-in "timestamp" #{"timestamp" "timestamptz" "timestamp with time zone" "date"} :type/HasDate honeysql-form))

(defmulti add-interval-honeysql-form
  "Return a HoneySQL form that represents addition of some temporal interval to the original `hsql-form`.
  `unit` is one of the units listed in [[metabase.util.date-2/add-units]].

    (add-interval-honeysql-form :my-driver hsql-form 1 :day) -> [:date_add hsql-form 1 (h2x/literal 'day')]

  `amount` is usually an integer, but can be floating-point for units like seconds.

  This multimethod is intended for use in app DB queries; other drivers should extend
  metabase.driver.sql.query-processor/add-interval-honeysql-form instead."
  {:arglists '([db-type hsql-form amount unit])}
  (fn [db-type _hsql-form _amount _unit]
    (keyword db-type)))

(defmethod add-interval-honeysql-form :postgres
  [db-type hsql-form amount unit]
  ;; Postgres doesn't support quarter in intervals (#20683)
  (cond
    (= unit :quarter)
    (recur db-type hsql-form (clojure.core/* 3 amount) :month)

    ;; date + interval -> timestamp, so cast the expression back to date
    (is-of-type? hsql-form "date")
    (cast "date" (+ hsql-form (pg-interval amount unit)))

    :else
    (let [hsql-form (->pg-timestamp hsql-form)]
      (-> (+ hsql-form (pg-interval amount unit))
          (with-type-info (type-info hsql-form))))))

(defmethod add-interval-honeysql-form :postgres-mbql5
  [db-type hsql-form amount unit]
  ((get-method add-interval-honeysql-form :postgres) db-type hsql-form amount unit))

(def ^:private mysql-interval-units
  "Allow-list of the temporal-interval units MySQL's `INTERVAL` accepts."
  #{:second :minute :hour :day :week :month :quarter :year})

(defn- format-mysql-interval
  "Generate a MySQL `INTERVAL` literal.

    (sql/format-expr [::mysql-interval 2 :day])
    =>
    [\"INTERVAL 2 day\"]"
  [_fn [amount unit]]
  (when-not (number? amount)
    (throw (ex-info "Invalid interval amount" {:amount amount})))
  (when-not (contains? mysql-interval-units unit)
    (throw (ex-info (str "Invalid temporal unit: " (pr-str unit)) {:unit unit})))
  [(clojure.core/format "INTERVAL %s %s" (num amount) (name unit))])

(sql/register-fn! ::mysql-interval #'format-mysql-interval)

(defmethod add-interval-honeysql-form :mysql
  [db-type hsql-form amount unit]
  ;; MySQL doesn't support `:millisecond` as an option, but does support fractional seconds
  (if (= unit :millisecond)
    (recur db-type hsql-form (clojure.core// amount 1000.0) :second)
    (do
      (when-not (contains? mysql-interval-units unit)
        (throw (ex-info (str "Invalid temporal unit: " (pr-str unit)) {:unit unit})))
      (when-not (number? amount)
        (throw (ex-info "Invalid interval amount" {:amount amount})))
      [:date_add hsql-form [::mysql-interval amount unit]])))

(defn- dateadd-h2 [unit amount expr]
  (let [expr (cast-unless-type-in "datetime" #{"datetime" "timestamp" "timestamp with time zone" "date"} expr)]
    (-> [:dateadd
         (literal unit)
         (if (number? amount)
           [:inline (long amount)]
           (cast-unless-type-in "integer" #{"long" "integer"} amount))
         expr]
        (with-database-type-info (database-type expr)))))

(defmethod add-interval-honeysql-form :h2
  [db-type hsql-form amount unit]
  (cond
    (= unit :quarter)
    (recur db-type hsql-form (* amount 3) :month)

    ;; H2 only supports long ints in the `dateadd` amount field; since we want to support fractional seconds (at least
    ;; for application DB purposes) convert to `:millisecond`
    (and (= unit :second)
         (not (zero? (rem amount 1))))
    (recur db-type hsql-form (clojure.core/* amount 1000.0) :millisecond)

    :else
    (dateadd-h2 unit amount hsql-form)))

(defmethod add-interval-honeysql-form :h2-mbql5
  [db-type hsql-form amount unit]
  ((get-method add-interval-honeysql-form :h2) db-type hsql-form amount unit))

(defmethod add-interval-honeysql-form :default
  [db-type hsql-form amount unit]
  (throw (ex-info (clojure.core/format (str "metabase.util.honey-sql-2/add-interval-honeysql-form not implemented for db-type %s. "
                                            "You might want to be calling metabase.driver.sql.query-processor/add-interval-honeysql-form instead.")
                                       db-type)
                  {:db-type db-type
                   :hsql-form hsql-form
                   :amount amount
                   :unit unit})))

(defmulti calculate-interval-honeysql-form
  "Return a HoneySQL form representing the temporal interval `end-form` minus `start-form`.

  Inverse of [[add-interval-honeysql-form]]. The return value is monotonic in the actual duration but
  its absolute units differ per DB: Postgres returns an `interval`, MySQL returns microseconds, H2
  returns milliseconds. Suitable for ORDER BY purposes; do NOT rely on the units when the value is
  exposed to callers.

    (calculate-interval-honeysql-form :my-driver hsql-end-form hsql-start-form)
      -> [:- hsql-end-form hsql-start-form]

  This multimethod is intended for use in app DB queries; other drivers should extend
  metabase.driver.sql.query-processor/datetime-diff instead."
  {:arglists '([db-type end-form start-form])}
  (fn [db-type _end-form _start-form]
    (keyword db-type)))

(defmethod calculate-interval-honeysql-form :postgres
  [_db-type end-form start-form]
  ;; Postgres timestamp subtraction returns an interval that orders correctly.
  [:- end-form start-form])

(defmethod calculate-interval-honeysql-form :postgres-mbql5
  [db-type end-form start-form]
  ((get-method calculate-interval-honeysql-form :postgres) db-type end-form start-form))

(defmethod calculate-interval-honeysql-form :mysql
  [_db-type end-form start-form]
  [:timestampdiff ^:allow-raw-sql [:raw "MICROSECOND"] start-form end-form])

(defmethod calculate-interval-honeysql-form :h2
  [_db-type end-form start-form]
  [:datediff (literal "MILLISECOND") start-form end-form])

(defmethod calculate-interval-honeysql-form :h2-mbql5
  [db-type end-form start-form]
  ((get-method calculate-interval-honeysql-form :h2) db-type end-form start-form))

(defmethod calculate-interval-honeysql-form :default
  [db-type end-form start-form]
  (throw (ex-info (clojure.core/format
                   "metabase.util.honey-sql-2/calculate-interval-honeysql-form not implemented for db-type %s. You might want to be calling metabase.driver.sql.query-processor/datetime-diff instead."
                   db-type)
                  {:db-type    db-type
                   :end-form   end-form
                   :start-form start-form})))
