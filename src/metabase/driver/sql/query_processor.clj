(ns metabase.driver.sql.query-processor
  "The Query Processor is responsible for translating the Metabase Query Language into HoneySQL SQL forms."
  (:require
   [clojure.core.match :refer [match]]
   [clojure.string :as str]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase.driver :as driver]
   [metabase.driver.common :as driver.common]
   [metabase.driver.sql.query-processor.deprecated :as sql.qp.deprecated]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.annotate :as annotate]
   [metabase.query-processor.middleware.wrap-value-literals :as qp.wrap-value-literals]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.query-processor.util.nest-query :as nest-query]
   [metabase.query-processor.util.transformations.nest-breakouts :as qp.util.transformations.nest-breakouts]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (java.util UUID)))

(set! *warn-on-reflection* true)

(def source-query-alias
  "Alias to use for source queries, e.g.:

    SELECT source.*
    FROM ( SELECT * FROM some_table ) source"
  "source")

(def ^:dynamic *inner-query*
  "The INNER query currently being processed, for situations where we need to refer back to it."
  nil)

(defn make-nestable-sql*
  "See [[make-nestable-sql]] but does not wrap in result in parens."
  [sql]
  (-> sql
      (str/replace #";([\s;]*(--.*\n?)*)*$" "")
      str/trimr
      (as-> trimmed
        ;; Query could potentially end with a comment.
        (if (re-find #"--.*$" trimmed)
          (str trimmed "\n")
          trimmed))))

(defn make-nestable-sql
  "Do best effort edit to the `sql`, to make it nestable in subselect.

  That requires:

  - Removal of traling comments (after the semicolon).
  - Removing the semicolon(s).
  - Squashing whitespace at the end of the string and replacinig it with newline. This is required in case some
    comments were preceding semicolon.
  - Wrapping the result in parens.

  This implementation does not handle few cases cases properly. 100% correct comment and semicolon removal would
  probably require _parsing_ sql string and not just a regular expression replacement. Link to the discussion:
  https://github.com/metabase/metabase/pull/30677

  For the limitations see the [[metabase.driver.sql.query-processor-test/make-nestable-sql-test]]"  [sql]
  (str "(" (make-nestable-sql* sql) ")"))

(defn- format-sql-source-query [_clause [sql params]]
  (into [(make-nestable-sql* sql)] params))

(sql/register-clause! ::sql-source-query #'format-sql-source-query :select)

(defn sql-source-query
  "Wrap clause in `::sql-source-query`. Does additional validation."
  [sql params]
  (when-not (string? sql)
    (throw (ex-info (tru "Expected native source query to be a string, got: {0}"
                         (.getCanonicalName (class sql)))
                    {:type  qp.error-type/invalid-query
                     :query sql})))
  (when-not ((some-fn nil? sequential?) params)
    (throw (ex-info (tru "Expected native source query parameters to be sequential, got: {0}"
                         (.getCanonicalName (class params)))
                    {:type  qp.error-type/invalid-query
                     :query params})))
  {::sql-source-query [sql params]})

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Interface (Multimethods)                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti honey-sql-version
  "DEPRECATED: Prior to between 0.46.0 and 0.49.0, drivers could use either Honey SQL 1 or Honey SQL 2. In 0.49.0+, all
  drivers must use Honey SQL 2."
  {:arglists '(^Long [driver]), :added "0.46.0", :deprecated "0.49.0"}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defn inline-num
  "Wrap number `n` in `:inline` when targeting Honey SQL 2."
  {:added "0.46.0"}
  [n]
  {:pre [(number? n)]}
  [:inline n])

(defn inline?
  "Is `honeysql-expr` a Honey SQL 2 `:inline` format?"
  {:added "0.46.0"}
  [honeysql-expr]
  (and (vector? honeysql-expr)
       (= (first honeysql-expr) :inline)))

;; this is the primary way to override behavior for a specific clause or object class.

(defmulti ->integer
  "Cast to integer"
  {:changelog-test/ignore true :added "0.45.0" :arglists '([driver honeysql-expr])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod ->integer :sql
  [_ value]
  (h2x/->integer value))

(defmulti ->float
  "Cast to float."
  {:changelog-test/ignore true :added "0.45.0" :arglists '([driver honeysql-expr])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod ->float :sql
  [driver value]
  ;; optimization: we don't need to cast a number literal that is already a `Float` or a `Double` to `FLOAT`. Other
  ;; number literals can be converted to doubles in Clojure-land. Note that there is a little bit of a mismatch between
  ;; FLOAT and DOUBLE here, but that's mostly because I'm not 100% sure which drivers have both types. In the future
  ;; maybe we can fix this.
  (cond
    (float? value)
    (h2x/with-database-type-info (inline-num value) "float")

    (number? value)
    (recur driver (double value))

    (inline? value)
    (recur driver (second value))

    :else
    (h2x/cast :float value)))

(defmulti ->honeysql
  "Return an appropriate HoneySQL form for an object. Dispatches off both driver and either clause name or object class
  making this easy to override in any places needed for a given driver."
  {:added "0.37.0" :arglists '([driver mbql-expr-or-object])}
  (fn [driver x]
    [(driver/dispatch-on-initialized-driver driver) (mbql.u/dispatch-by-clause-name-or-class x)])
  :hierarchy #'driver/hierarchy)

(defn compiled
  "Wraps a `honeysql-expr` in an psudeo-MBQL clause that prevents double-compilation if [[->honeysql]] is called on it
  again."
  {:added "0.46.0"}
  [honeysql-expr]
  [::compiled honeysql-expr])

(defmethod ->honeysql [:sql ::compiled]
  [_driver [_compiled honeysql-expr :as compiled-form]]
  ;; preserve metadata attached to the compiled form
  (with-meta honeysql-expr (meta compiled-form)))

(defn- format-compiled
  [_compiled [honeysql-expr]]
  (sql/format-expr honeysql-expr {:nested true}))

(sql/register-fn! ::compiled #'format-compiled)

(defmulti current-datetime-honeysql-form
  "HoneySQL form that should be used to get the current `datetime` (or equivalent). Defaults to `:%now`. Should ideally
  include the database type info on the form (ex: via [[h2x/with-type-info]])."
  {:added "0.34.2" :arglists '([driver])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod current-datetime-honeysql-form :sql
  [_driver]
  :%now)

;; TODO - rename this to `temporal-bucket` or something that better describes what it actually does
(defmulti date
  "Return a HoneySQL form for truncating a date or timestamp field or value to a given resolution, or extracting a date
  component.

  `honeysql-expr` is already compiled to Honey SQL, so DO NOT call [[->honeysql]] on it."
  {:added "0.32.0" :arglists '([driver unit honeysql-expr])}
  (fn [driver unit _] [(driver/dispatch-on-initialized-driver driver) unit])
  :hierarchy #'driver/hierarchy)

;; default implementation for `:default` bucketing returns expression as-is
(defmethod date [:sql :default] [_ _ expr] expr)
;; We have to roll our own to account for arbitrary start of week

(defmethod date [:sql :second-of-minute] [_driver _ expr] (h2x/second expr))
(defmethod date [:sql :minute-of-hour]   [_driver _ expr] (h2x/minute expr))
(defmethod date [:sql :hour-of-day]      [_driver _ expr] (h2x/hour expr))

(defmethod date [:sql :week-of-year]
  [driver _ expr]
  ;; Some DBs truncate when doing integer division, therefore force float arithmetics
  (->honeysql driver [:ceil (compiled (h2x// (date driver :day-of-year (date driver :week expr)) 7.0))]))

(defmethod date [:sql :month-of-year]    [_driver _ expr] (h2x/month expr))
(defmethod date [:sql :quarter-of-year]  [_driver _ expr] (h2x/quarter expr))
(defmethod date [:sql :year-of-era]      [_driver _ expr] (h2x/year expr))
(defmethod date [:sql :week-of-year-iso] [_driver _ expr] (h2x/week expr))

(defmulti datetime-diff
  "Returns a HoneySQL form for calculating the datetime-diff for a given unit.
   This method is used by implementations of `->honeysql` for the `:datetime-diff`
   clause. It is recommended to implement this if you want to use the default SQL
   implementation of `->honeysql` for the `:datetime-diff`, which includes
   validation of argument types across all units."
  {:arglists '([driver unit field-or-value field-or-value]), :added "0.46.0"}
  (fn [driver unit _ _] [(driver/dispatch-on-initialized-driver driver) unit])
  :hierarchy #'driver/hierarchy)

(defn- days-till-start-of-first-full-week
  "Takes a datetime expession, return a HoneySQL form
  that calculate how many days from the Jan 1st till the start of `first full week`.

  A full week is a week that contains 7 days in the same year.

  Example:
  Assume start-of-week setting is :monday

    (days-till-start-of-first-full-week driver '2000-04-05')
    -> 2

  Because '2000-01-01' is Saturday, and 1st full week starts on Monday(2000-01-03)
  => 2 days"
  [driver honeysql-expr]
  (let [start-of-year                (date driver :year honeysql-expr)
        day-of-week-of-start-of-year (date driver :day-of-week start-of-year)]
    (h2x/- 8 day-of-week-of-start-of-year)))

(defn- week-of-year
  "Calculate the week of year for `:us` or `:instance` `mode`. Returns a Honey SQL expression.

  The idea for both modes are quite similar:
  - 1st Jan is always in the 1st week
  - the 2nd weeks start on the first `start-of-week` setting.

  The algorithm:
  week-of-year = 1 partial-week + `n` full-weeks
  Where:
  - partial-week: is the week that starts from 1st Jan, until the next `start-of-week`
  - full-weeks: are weeks that has all week-days are in the same year.

  Now, all we need to do is to find `full-weeks`, and it could be computed by this formula:
    full-weeks = ceil((doy - days-till-start-of-first-full-week) / 7)
  Where:
  - doy: is the day of year of the input date
  - days-till-start-of-first-full-week: is how many days from 1st Jan to the first start-of-week."
  [driver honeysql-expr mode]
  (let [days-till-start-of-first-full-week (binding [driver.common/*start-of-week*
                                                     (case mode
                                                       :us :sunday
                                                       :instance nil)]
                                             (days-till-start-of-first-full-week driver honeysql-expr))
        total-full-week-days               (h2x/- (date driver :day-of-year honeysql-expr)
                                                 days-till-start-of-first-full-week)
        total-full-weeks                   (->honeysql driver [:ceil (compiled (h2x// total-full-week-days 7.0))])]
    (->integer driver (h2x/+ 1 total-full-weeks))))

;; ISO8501 consider the first week of the year is the week that contains the 1st Thursday and week starts on Monday.
;; - If 1st Jan is Friday, then 1st Jan is the last week of previous year.
;; - If 1st Jan is Wednesday, then 1st Jan is in the 1st week.
(defmethod date
  [:sql :week-of-year-iso]
  [_driver _ honeysql-expr]
  (h2x/week honeysql-expr))

;; US consider the first week begins on 1st Jan, and 2nd week starts on the 1st Sunday
(defmethod date [:sql :week-of-year-us]
  [driver _ honeysql-expr]
  (week-of-year driver honeysql-expr :us))

;; First week begins on 1st Jan, the 2nd week will begins on the 1st [[metabase.public-settings/start-of-week]]
(defmethod date [:sql :week-of-year-instance]
  [driver _ honeysql-expr]
  (week-of-year driver honeysql-expr :instance))

(defmulti add-interval-honeysql-form
  "Return a HoneySQL form that performs represents addition of some temporal interval to the original `hsql-form`.
  `unit` is one of the units listed in [[metabase.util.date-2/add-units]].

    (add-interval-honeysql-form :my-driver hsql-form 1 :day) -> [:date_add hsql-form 1 (h2x/literal 'day')]

  `amount` is usually an integer, but can be floating-point for units like seconds."
  {:added "0.34.2" :arglists '([driver hsql-form amount unit])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(mu/defn adjust-start-of-week
  "Truncate to the day the week starts on.

  `truncate-fn` is a function with the signature

    (truncate-fn expr) => truncated-expr"
  [driver      :- :keyword
   truncate-fn :- [:=> [:cat :any] :any]
   expr]
  (let [offset (driver.common/start-of-week-offset driver)]
    (if (not= offset 0)
      (add-interval-honeysql-form driver
                                  (truncate-fn (add-interval-honeysql-form driver expr offset :day))
                                  (- offset) :day)
      (truncate-fn expr))))

(mu/defn adjust-day-of-week
  "Adjust day of week to respect the [[metabase.public-settings/start-of-week]] Setting.

  The value a `:day-of-week` extract should return depends on the value of `start-of-week`, by default Sunday.

  * `1` = first day of the week (e.g. Sunday)
  * `7` = last day of the week (e.g. Saturday)

  This assumes `day-of-week` as returned by the driver is already between `1` and `7` (adjust it if it's not). It
  adjusts as needed to match `start-of-week` by the [[driver.common/start-of-week-offset]], which comes
  from [[driver/db-start-of-week]]."
  ([driver day-of-week-honeysql-expr]
   (adjust-day-of-week driver day-of-week-honeysql-expr (driver.common/start-of-week-offset driver)))

  ([driver day-of-week-honeysql-expr offset]
   (adjust-day-of-week driver day-of-week-honeysql-expr offset h2x/mod))

  ([driver
    day-of-week-honeysql-expr
    offset :- :int
    mod-fn :- [:=> [:cat any? any?] any?]]
   (cond
     (inline? offset) (recur driver day-of-week-honeysql-expr (second offset) mod-fn)
     (zero? offset)   day-of-week-honeysql-expr
     (neg? offset)    (recur driver day-of-week-honeysql-expr (+ offset 7) mod-fn)
     :else            (-> [:coalesce
                           [:nullif
                            (mod-fn (h2x/+ day-of-week-honeysql-expr offset) (inline-num 7))
                            [:inline 0]]
                           [:inline 7]]
                          (h2x/with-database-type-info (or (h2x/database-type day-of-week-honeysql-expr)
                                                           "integer"))))))

(defmulti quote-style
  "Return the dialect that should be used by Honey SQL 2 when building a SQL statement. Defaults to `:ansi`, but other
  valid options are `:mysql`, `:sqlserver`, `:oracle`, and `:h2` (added in
  [[metabase.util.honey-sql-2]]; like `:ansi`, but uppercases the result). Check [[honey.sql/dialects]] for all
  available dialects, or register a custom one with [[honey.sql/register-dialect!]].

    (honey.sql/format ... :quoting (quote-style driver), :allow-dashed-names? true)

  (The name of this method reflects Honey SQL 1 terminology, where \"dialect\" was called \"quote style\". To avoid
  needless churn, I haven't changed it yet. -- Cam)"
  {:added "0.32.0" :arglists '([driver])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod quote-style :sql [_] :ansi)

(defmulti unix-timestamp->honeysql
  "Return a HoneySQL form appropriate for converting a Unix timestamp integer field or value to an proper SQL Timestamp.
  `seconds-or-milliseconds` refers to the resolution of the int in question and with be either `:seconds` or
  `:milliseconds`.

  There is a default implementation for `:milliseconds` the recursively calls with `:seconds` and `(expr / 1000)`."
  {:arglists '([driver seconds-or-milliseconds honeysql-expr]), :added "0.35.0"}
  (fn [driver seconds-or-milliseconds _] [(driver/dispatch-on-initialized-driver driver) seconds-or-milliseconds])
  :hierarchy #'driver/hierarchy)

(defmulti cast-temporal-string
  "Cast a string representing "
  {:arglists '([driver coercion-strategy honeysql-expr]), :added "0.38.0"}
  (fn [driver coercion-strategy _] [(driver/dispatch-on-initialized-driver driver) coercion-strategy])
  :hierarchy #'driver/hierarchy)

(defmethod cast-temporal-string :default
  [driver coercion-strategy _expr]
  (throw (ex-info (tru "Driver {0} does not support {1}" driver coercion-strategy)
                  {:type qp.error-type/unsupported-feature
                   :coercion-strategy coercion-strategy})))

(defmethod unix-timestamp->honeysql [:sql :milliseconds]
  [driver _ expr]
  (unix-timestamp->honeysql driver :seconds (h2x// expr 1000)))

(defmethod unix-timestamp->honeysql [:sql :microseconds]
  [driver _ expr]
  (unix-timestamp->honeysql driver :seconds (h2x// expr 1000000)))

(defmethod unix-timestamp->honeysql [:sql :nanoseconds]
  [driver _ expr]
  (unix-timestamp->honeysql driver :seconds (h2x// expr 1000000000)))

(defmulti cast-temporal-byte
  "Cast a byte field"
  {:arglists '([driver coercion-strategy expr]), :added "0.38.0"}
  (fn [driver coercion-strategy _] [(driver/dispatch-on-initialized-driver driver) coercion-strategy])
  :hierarchy #'driver/hierarchy)

(defmethod cast-temporal-byte :default
  [driver coercion-strategy _expr]
  (throw (ex-info (tru "Driver {0} does not support {1}" driver coercion-strategy)
                  {:type qp.error-type/unsupported-feature})))

(defmulti apply-top-level-clause
  "Implementations of this methods define how the SQL Query Processor handles various top-level MBQL clauses. Each
  method is called when a matching clause is present in `query`, and should return an appropriately modified version
  of `honeysql-form`. Most drivers can use the default implementations for all of these methods, but some may need to
  override one or more (e.g. SQL Server needs to override this method for the `:limit` clause, since T-SQL uses `TOP`
  instead of `LIMIT`)."
  {:added "0.32.0", :arglists '([driver top-level-clause honeysql-form inner-query]), :style/indent [:form]}
  (fn [driver top-level-clause _honeysql-form _inner-query]
    [(driver/dispatch-on-initialized-driver driver) top-level-clause])
  :hierarchy #'driver/hierarchy)

(defmethod apply-top-level-clause :default
  [_ _ honeysql-form _]
  honeysql-form)

(defmulti json-query
  "Reaches into a JSON field (that is, a field with a defined `:nfc-path`).

  Lots of SQL DB's have denormalized JSON fields and they all have some sort of special syntax for dealing with
  indexing into it. Implement the special syntax in this multimethod."
  {:changelog-test/ignore true, :arglists '([driver identifier json-field]), :added "0.43.1"}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Low-Level ->honeysql impls                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- throw-double-compilation-error
  "[[->honeysql]] shouldn't be getting called on something that is already Honey SQL. Prior to 46/Honey SQL 2, this
  would not usually cause problems because we could easily distinguish between MBQL clauses and Honey SQL record
  types; with Honey SQL 2, clauses are basically indistinguishable from MBQL, and some things exist in both, like `:/`
  and `:ceil`; it's more important that we be careful about avoiding double-compilation to prevent bugs or redundant
  expressions.

  The exception to this rule is [[h2x/identifier]] -- for historical reasons, drivers were encouraged to do this in
  the past and some rely on this behavior (see ;;; [[metabase.driver.bigquery-cloud-sdk.query-processor]]
  and [[metabase.driver.snowflake]] for example). Maybe we come up with some better way to handle this -- e.g. maybe
  [[h2x/identifier]] should be replaced with a `sql.qp` multimethod so driver-specific behavior can happen as we
  generate Honey SQL, not afterwards.

  If you see this warning, it usually means you are passing a Honey SQL form to a method that expects an MBQL form,
  usually [[->honeysql]]; this probably means you're recursively calling [[->honeysql]] when you should not be.

  You can use [[compiled]] to prevent this error, to work around situations where you need to compile something to
  Honey SQL and then pass it to a method that expects MBQL. This should be considered an icky HACK and you should only
  do this if you cannot actually fix your code."
  [driver x]
  ;; not i18n'ed because this is meant to be developer-facing.
  (throw
   (ex-info (format "%s called on something already compiled to Honey SQL, or something unknown. See %s for more info."
                    `->honeysql
                    `throw-double-compilation-error)
            {:driver driver
             :expr   x
             :type   qp.error-type/driver})))

(defmethod ->honeysql :default
  [driver x]
  (when (and (vector? x)
             (keyword? (first x)))
    (throw-double-compilation-error driver x))
  ;; user-facing only so it doesn't need to be i18n'ed
  (throw (ex-info (format "Don't know how to compile %s to Honey SQL: implement %s for %s"
                          (pr-str x)
                          `->honeysql
                          (pr-str [driver (mbql.u/dispatch-by-clause-name-or-class x)]))
                  {:driver driver
                   :expr   x
                   :type   qp.error-type/driver})))

(defmethod ->honeysql [:sql nil]
  [_driver _this]
  nil)

(defmethod ->honeysql [:sql Object]
  [_driver this]
  this)

(defmethod ->honeysql [:sql Number]
  [_driver n]
  (inline-num n))

(defmethod ->honeysql [:sql :value]
  [driver [_ value {base-type :base_type effective-type :effective_type}]]
  (when (some? value)
    (condp #(isa? %2 %1) (or effective-type base-type)
      ;; When we are dealing with a uuid type we should try to convert to a real UUID
      ;; If that fails,, we will add a fallback cast to "text"
      :type/UUID (when (not= "" value) ; support is-empty/non-empty checks
                   (try
                     (UUID/fromString value)
                     (catch IllegalArgumentException _
                       (h2x/with-type-info value {:database-type "varchar"}))))
      (->honeysql driver value))))

(defmethod ->honeysql [:sql :expression]
  [driver [_ expression-name {::add/keys [source-table source-alias]} :as _clause]]
  (let [expression-definition (mbql.u/expression-with-name *inner-query* expression-name)]
    (->honeysql driver (if (= source-table ::add/source)
                         (apply h2x/identifier :field source-query-alias source-alias)
                         expression-definition))))

(defmethod ->honeysql [:sql :now]
  [driver _clause]
  (current-datetime-honeysql-form driver))

(defn semantic-type->unix-timestamp-unit
  "Translates coercion types like `:Coercion/UNIXSeconds->DateTime` to the corresponding unit of time to use in
  [[unix-timestamp->honeysql]].  Throws an AssertionError if the argument does not descend from `:UNIXTime->Temporal`
  and an exception if the type does not have an associated unit."
  [coercion-type]
  (when-not (isa? coercion-type :Coercion/UNIXTime->Temporal)
    (throw (ex-info "Semantic type must be a UNIXTimestamp"
                    {:type          qp.error-type/invalid-query
                     :coercion-type coercion-type})))
  (or (get {:Coercion/UNIXNanoSeconds->DateTime :nanoseconds
            :Coercion/UNIXMicroSeconds->DateTime :microseconds
            :Coercion/UNIXMilliSeconds->DateTime :milliseconds
            :Coercion/UNIXSeconds->DateTime      :seconds}
           coercion-type)
      (throw (Exception. (tru "No magnitude known for {0}" coercion-type)))))

(defn cast-field-if-needed
  "Wrap a `field-identifier` in appropriate HoneySQL expressions if it refers to a UNIX timestamp Field."
  [driver {:keys [base-type coercion-strategy], :as field} honeysql-form]
  (if (some #(str/includes? (name %) "_") (keys field))
    (do
      (sql.qp.deprecated/log-deprecation-warning
       driver
       "metabase.driver.sql.query-processor/cast-field-id-needed with a legacy (snake_cased) :model/Field"
       "0.48.0")
      (recur driver (update-keys field u/->kebab-case-en) honeysql-form))
    (u/prog1 (match [base-type coercion-strategy]
               [(:isa? :type/Number) (:isa? :Coercion/UNIXTime->Temporal)]
               (unix-timestamp->honeysql driver
                                         (semantic-type->unix-timestamp-unit coercion-strategy)
                                         honeysql-form)

               [:type/Text (:isa? :Coercion/String->Temporal)]
               (cast-temporal-string driver coercion-strategy honeysql-form)

               [(:isa? :type/*) (:isa? :Coercion/Bytes->Temporal)]
               (cast-temporal-byte driver coercion-strategy honeysql-form)

               :else honeysql-form)
      (when-not (= <> honeysql-form)
        (log/tracef "Applied casting\n=>\n%s" (u/pprint-to-str <>))))))

;;; it's a little weird that we're calling [[->honeysql]] on an identifier, which is a Honey SQL form and not an MBQL
;;; form. See [[throw-double-compilation-error]] for more info.
(defmethod ->honeysql [:sql ::h2x/identifier]
  [_driver identifier]
  identifier)

(defn apply-temporal-bucketing
  "Apply temporal bucketing for the `:temporal-unit` in the options of a `:field` clause; return a new HoneySQL form that
  buckets `honeysql-form` appropriately."
  [driver {:keys [temporal-unit]} honeysql-form]
  (date driver temporal-unit honeysql-form))

(defn apply-binning
  "Apply `:binning` options from a `:field` clause; return a new HoneySQL form that bins `honeysql-form`
  appropriately."
  [{{:keys [bin-width min-value _max-value]} :binning} honeysql-form]
  ;;
  ;; Equation is | (value - min) |
  ;;             | ------------- | * bin-width + min-value
  ;;             |_  bin-width  _|
  ;;
  (cond-> honeysql-form
    (not (zero? min-value)) (h2x/- min-value)
    true                    (h2x// bin-width)
    true                    h2x/floor
    true                    (h2x/* bin-width)
    (not (zero? min-value)) (h2x/+ min-value)))

(mu/defn ^:private field-source-table-aliases :- [:maybe [:sequential ::lib.schema.common/non-blank-string]]
  "Get sequence of alias that should be used to qualify a `:field` clause when compiling (e.g. left-hand side of an
  `AS`).

    (field-source-table-aliases [:field 1 nil]) ; -> [\"public\" \"venues\"]"
  [[_ id-or-name {::add/keys [source-table]}]]
  (let [source-table (or source-table
                         (when (integer? id-or-name)
                           (:table-id (lib.metadata/field (qp.store/metadata-provider) id-or-name))))]
    (cond
      (= source-table ::add/source) [source-query-alias]
      (= source-table ::add/none)   nil
      (integer? source-table)       (let [{schema :schema, table-name :name} (lib.metadata/table
                                                                              (qp.store/metadata-provider)
                                                                              source-table)]
                                      (not-empty (filterv some? [schema table-name])))
      source-table                  [source-table])))

(defn- field-source-alias
  "Get alias that should be use to refer to a `:field` clause when compiling (e.g. left-hand side of an `AS`).

    (field-source-alias [:field 1 nil]) ; -> \"price\""
  [[_field id-or-name {::add/keys [source-alias]}]]
  (or source-alias
      (when (string? id-or-name)
        id-or-name)
      (when (integer? id-or-name)
        (:name (lib.metadata/field (qp.store/metadata-provider) id-or-name)))))

(defmethod ->honeysql [:sql :field]
  [driver [_ id-or-name {:keys [database-type] :as options}
           :as field-clause]]
  (try
    (let [source-table-aliases (field-source-table-aliases field-clause)
          source-alias         (field-source-alias field-clause)
          field                (when (integer? id-or-name)
                                 (lib.metadata/field (qp.store/metadata-provider) id-or-name))
          allow-casting?       (and field
                                    (not (:qp/ignore-coercion options)))
          database-type        (or database-type
                                   (:database-type field))
          ;; preserve metadata attached to the original field clause, for example BigQuery temporal type information.
          identifier           (-> (apply h2x/identifier :field
                                          (concat source-table-aliases [source-alias]))
                                   (with-meta (meta field-clause)))
          identifier           (->honeysql driver identifier)
          maybe-add-db-type    (fn [expr]
                                 (if (h2x/type-info->db-type (h2x/type-info expr))
                                   expr
                                   (h2x/with-database-type-info expr database-type)))]
      (u/prog1
        (cond->> identifier
          allow-casting?           (cast-field-if-needed driver field)
          ;; only add type info if it wasn't added by [[cast-field-if-needed]]
          database-type            maybe-add-db-type
          (:temporal-unit options) (apply-temporal-bucketing driver options)
          (:binning options)       (apply-binning options))
        (log/trace (binding [*print-meta* true]
                     (format "Compiled field clause\n%s\n=>\n%s"
                             (u/pprint-to-str field-clause) (u/pprint-to-str <>))))))
    (catch Throwable e
      (throw (ex-info (tru "Error compiling :field clause: {0}" (ex-message e))
                      {:clause field-clause}
                      e)))))

(defmethod ->honeysql [:sql :count]
  [driver [_ field]]
  (if field
    [:count (->honeysql driver field)]
    :%count.*))

(defmethod ->honeysql [:sql :avg]    [driver [_ field]] [:avg        (->honeysql driver field)])
(defmethod ->honeysql [:sql :median] [driver [_ field]] [:median     (->honeysql driver field)])
(defmethod ->honeysql [:sql :stddev] [driver [_ field]] [:stddev_pop (->honeysql driver field)])
(defmethod ->honeysql [:sql :var]    [driver [_ field]] [:var_pop    (->honeysql driver field)])
(defmethod ->honeysql [:sql :sum]    [driver [_ field]] [:sum        (->honeysql driver field)])
(defmethod ->honeysql [:sql :min]    [driver [_ field]] [:min        (->honeysql driver field)])
(defmethod ->honeysql [:sql :max]    [driver [_ field]] [:max        (->honeysql driver field)])

(defmethod ->honeysql [:sql :percentile]
  [driver [_ field p]]
  (let [field (->honeysql driver field)
        p     (->honeysql driver p)]
    [::h2x/percentile-cont field p]))

(defmethod ->honeysql [:sql :distinct]
  [driver [_ field]]
  (let [field (->honeysql driver field)]
    [::h2x/distinct-count field]))

(defmethod ->honeysql [:sql :floor] [driver [_ mbql-expr]] [:floor (->honeysql driver mbql-expr)])
(defmethod ->honeysql [:sql :ceil]  [driver [_ mbql-expr]] [:ceil  (->honeysql driver mbql-expr)])
(defmethod ->honeysql [:sql :round] [driver [_ mbql-expr]] [:round (->honeysql driver mbql-expr)])
(defmethod ->honeysql [:sql :abs]   [driver [_ mbql-expr]] [:abs (->honeysql driver mbql-expr)])
(defmethod ->honeysql [:sql :log]   [driver [_ mbql-expr]] [:log (inline-num 10) (->honeysql driver mbql-expr)])
(defmethod ->honeysql [:sql :exp]   [driver [_ mbql-expr]] [:exp (->honeysql driver mbql-expr)])
(defmethod ->honeysql [:sql :sqrt]  [driver [_ mbql-expr]] [:sqrt (->honeysql driver mbql-expr)])

(defmethod ->honeysql [:sql :power]
  [driver [_power mbql-expr power]]
  [:power
   (->honeysql driver mbql-expr)
   (->honeysql driver power)])

(defn- window-aggregation-over-expr-for-query-with-breakouts
  "Order by the first breakout, then partition by all the other ones. See #42003 and
  https://metaboat.slack.com/archives/C05MPF0TM3L/p1714084449574689 for more info."
  [driver inner-query]
  (let [num-breakouts   (count (:breakout inner-query))
        group-bys       (:group-by (apply-top-level-clause driver :breakout {} inner-query))
        partition-exprs (when (> num-breakouts 1)
                          (rest group-bys))
        order-expr      (first group-bys)]
    (merge
     (when (seq partition-exprs)
       {:partition-by (mapv (fn [expr]
                              [expr])
                            partition-exprs)})
     {:order-by [[order-expr :asc]]})))

(defn- window-aggregation-over-expr-for-query-without-breakouts [driver inner-query]
  (when-let [order-bys (not-empty (:order-by (apply-top-level-clause driver :order-by {} inner-query)))]
    {:order-by (vec order-bys)}))

(defn- window-aggregation-over-rows
  "Generate an OVER (...) window function expression for stuff like `:offset` (`lag` and `lead`)."
  ([driver expr]
   (window-aggregation-over-rows driver expr nil))

  ([driver expr additional-hsql]
   (let [f (cond
             (seq (:breakout *inner-query*))
             window-aggregation-over-expr-for-query-with-breakouts

             (seq (:order-by *inner-query*))
             window-aggregation-over-expr-for-query-without-breakouts

             :else
             (throw (ex-info (tru "Window function requires either breakouts or order by in the query")
                             {:type  qp.error-type/invalid-query
                              :query *inner-query*})))
         m (f driver *inner-query*)]
     (-> [:over [expr (merge m additional-hsql)]]
         (h2x/with-database-type-info (h2x/database-type expr))))))

(defn- format-rows-unbounded-preceding [_clause _args]
  ["ROWS UNBOUNDED PRECEDING"])

(sql/register-clause!
 ::rows-unbounded-preceding
 #'format-rows-unbounded-preceding
 nil)

(defn- cumulative-aggregation-over-rows
  "Generate an OVER (...) expression for stuff like cumulative sum or cumulative count.

  For a single breakout the generate SQL will look something like:

    OVER (
      ORDER BY created_at
      ROWS UNBOUNDED PRECEDING
    )

  Note that [[nest-breakouts-in-queries-with-window-fn-aggregations]] ensures we will always see a plain column
  identifier here.

  With more than one breakout, we `PARTITION BY` all breakouts except the last, then `ORDER BY` the last breakout. See
  #2862 for more information as to why we do this. Example:

    OVER (
      PARTITION BY city_name
      ORDER BY created_at
      ROWS UNBOUNDED PRECEDING
    )"
  [driver expr]
  (window-aggregation-over-rows driver expr {::rows-unbounded-preceding []}))

;;;    cum-count()
;;;
;;; should compile to SQL like
;;;
;;;    sum(count()) OVER (ORDER BY ...)
;;;
;;; where the ORDER BY matches what's in the query (i.e., the breakouts), or
;;;
;;;    sum(count()) OVER (ORDER BY 1 ROWS UNBOUNDED PRECEDING)
;;;
;;; if the database supports ordering by SELECT expression position
(defmethod ->honeysql [:sql :cum-count]
  [driver [_cum-count expr-or-nil]]
  ;; a cumulative count with no breakouts doesn't really mean anything, just compile it as a normal count.
  (if (empty? (:breakout *inner-query*))
    (->honeysql driver [:count expr-or-nil])
    (cumulative-aggregation-over-rows
     driver
     [:sum (if expr-or-nil
             [:count (->honeysql driver expr-or-nil)]
             [:count :*])])))

;;;    cum-sum(total)
;;;
;;; should compile to SQL like
;;;
;;;    sum(sum(total)) OVER (ORDER BY ...)
;;;
;;; where the ORDER BY matches what's in the query (i.e., the breakouts), or
;;;
;;;    sum(sum(total)) OVER (ORDER BY 1 ROWS UNBOUNDED PRECEDING)
;;;
;;; if the database supports ordering by SELECT expression position
(defmethod ->honeysql [:sql :cum-sum]
  [driver [_cum-sum expr]]
  ;; a cumulative sum with no breakouts doesn't really mean anything, just compile it as a normal sum.
  (if (empty? (:breakout *inner-query*))
    (->honeysql driver [:sum expr])
    (cumulative-aggregation-over-rows
     driver
     [:sum [:sum (->honeysql driver expr)]])))

(defmethod ->honeysql [:sql :offset]
  [driver [_offset _opts expr n]]
  {:pre [(integer? n) ((some-fn pos-int? neg-int?) n)]} ; offset not allowed to be zero
  (window-aggregation-over-rows
   driver
   (let [[f n]     (if (pos? n)
                     [:lead n]
                     [:lag (- n)])
         expr-hsql (->honeysql driver expr)]
     (-> [f expr-hsql [:inline n]]
         (h2x/with-database-type-info (h2x/database-type expr-hsql))))))

(defn- interval? [expr]
  (mbql.u/is-clause? :interval expr))

(defmethod ->honeysql [:sql :+]
  [driver [_ & args]]
  (if (some interval? args)
    (if-let [[field intervals] (u/pick-first (complement interval?) args)]
      (reduce (fn [hsql-form [_ amount unit]]
                (add-interval-honeysql-form driver hsql-form amount unit))
              (->honeysql driver field)
              intervals)
      (throw (ex-info "Summing intervals is not supported" {:args args})))
    (into [:+]
          (map (partial ->honeysql driver))
          args)))

(defmethod ->honeysql [:sql :-]
  [driver [_ & [first-arg & other-args :as args]]]
  (cond (interval? first-arg)
        (throw (ex-info (tru "Interval as first argrument to subtraction is not allowed.")
                        {:type qp.error-type/invalid-query
                         :args args}))
        (and (some interval? other-args)
             (not (every? interval? other-args)))
        (throw (ex-info (tru "All but first argument to subtraction must be an interval.")
                        {:type qp.error-type/invalid-query
                         :args args})))
  (if (interval? (first other-args))
    (reduce (fn [hsql-form [_ amount unit]]
              ;; We are adding negative amount. Inspired by `->honeysql [:sql :datetime-subtract]`.
              (add-interval-honeysql-form driver hsql-form (- amount) unit))
            (->honeysql driver first-arg)
            other-args)
    (into [:-]
          (map (partial ->honeysql driver))
          args)))

(defmethod ->honeysql [:sql :*]
  [driver [_ & args]]
  (into [:*]
        (map (partial ->honeysql driver))
        args))

;; for division we want to go ahead and convert any integer args to floats, because something like field / 2 will do
;; integer division and give us something like 1.0 where we would rather see something like 1.5
;;
;; also, we want to gracefully handle situations where the column is ZERO and just swap it out with NULL instead, so
;; we don't get divide by zero errors. SQL DBs always return NULL when dividing by NULL (AFAIK)

(defn- safe-denominator
  "Make sure we're not trying to divide by zero."
  [denominator]
  (cond
    ;; try not to generate hairy nonsense like `CASE WHERE 7.0 = 0 THEN NULL ELSE 7.0` if we're dealing with number
    ;; literals and can determine this stuff ahead of time.
    (and (number? denominator)
         (zero? denominator))
    nil

    (number? denominator)
    (inline-num denominator)

    (inline? denominator)
    (recur (second denominator))

    :else
    [:nullif denominator [:inline 0]]))

(defmethod ->honeysql [:sql :/]
  [driver [_ & mbql-exprs]]
  (let [[numerator & denominators] (for [mbql-expr mbql-exprs]
                                     (->honeysql driver (if (integer? mbql-expr)
                                                          (double mbql-expr)
                                                          mbql-expr)))]
    (into [:/ (->float driver numerator)]
          (map safe-denominator)
          denominators)))

(defmethod ->honeysql [:sql :sum-where]
  [driver [_ arg pred]]
  [:sum [:case
         (->honeysql driver pred) (->honeysql driver arg)
         :else                    [:inline 0.0]]])

(defmethod ->honeysql [:sql :count-where]
  [driver [_ pred]]
  (->honeysql driver [:sum-where 1 pred]))

(defmethod ->honeysql [:sql :share]
  [driver [_ pred]]
  [:/ (->honeysql driver [:count-where pred]) :%count.*])

(defmethod ->honeysql [:sql :trim]
  [driver [_ arg]]
  [:trim (->honeysql driver arg)])

(defmethod ->honeysql [:sql :ltrim]
  [driver [_ arg]]
  [:ltrim (->honeysql driver arg)])

(defmethod ->honeysql [:sql :rtrim]
  [driver [_ arg]]
  [:rtrim (->honeysql driver arg)])

(defmethod ->honeysql [:sql :upper]
  [driver [_ arg]]
  [:upper (->honeysql driver arg)])

(defmethod ->honeysql [:sql :lower]
  [driver [_ arg]]
  [:lower (->honeysql driver arg)])

(defmethod ->honeysql [:sql :coalesce]
  [driver [_ & args]]
  (into [:coalesce] (map (partial ->honeysql driver)) args))

(defmethod ->honeysql [:sql :replace]
  [driver [_ arg pattern replacement]]
  [:replace (->honeysql driver arg) (->honeysql driver pattern) (->honeysql driver replacement)])

(defmethod ->honeysql [:sql :concat]
  [driver [_ & args]]
  (into [:concat] (map (partial ->honeysql driver)) args))

(defmethod ->honeysql [:sql :substring]
  [driver [_ arg start length]]
  (if length
    [:substring (->honeysql driver arg) (->honeysql driver start) (->honeysql driver length)]
    [:substring (->honeysql driver arg) (->honeysql driver start)]))

(defmethod ->honeysql [:sql :length]
  [driver [_ arg]]
  [:length (->honeysql driver arg)])

(defmethod ->honeysql [:sql :case]
  [driver [_ cases options]]
  (into [:case]
        (comp cat
              (map (partial ->honeysql driver)))
        (concat cases
                (when (some? (:default options))
                  [[:else (:default options)]]))))

;; actual handling of the name is done in the top-level clause handler for aggregations
(defmethod ->honeysql [:sql :aggregation-options]
  [driver [_ ag]]
  (->honeysql driver ag))

;;  aggregation REFERENCE e.g. the ["aggregation" 0] fields we allow in order-by
(defmethod ->honeysql [:sql :aggregation]
  [driver [_ index]]
  (lib.util.match/match-one (nth (:aggregation *inner-query*) index)
    [:aggregation-options ag (options :guard :name)]
    (->honeysql driver (h2x/identifier :field-alias (:name options)))

    [:aggregation-options ag _]
    #_:clj-kondo/ignore
    (recur ag)

    ;; For some arcane reason we name the results of a distinct aggregation "count", everything else is named the
    ;; same as the aggregation
    :distinct
    (->honeysql driver (h2x/identifier :field-alias :count))

    #{:+ :- :* :/}
    (->honeysql driver &match)

    [:offset (options :guard :name) _expr _n]
    (->honeysql driver (h2x/identifier :field-alias (:name options)))

    ;; for everything else just use the name of the aggregation as an identifer, e.g. `:sum`
    ;;
    ;; TODO -- I don't think we will ever actually get to this anymore because everything should have been given a name
    ;; by [[metabase.query-processor.middleware.pre-alias-aggregations]]
    [ag-type & _]
    (->honeysql driver (h2x/identifier :field-alias ag-type))))

(defmethod ->honeysql [:sql :absolute-datetime]
  [driver [_ timestamp unit]]
  (date driver unit (->honeysql driver timestamp)))

(defmethod ->honeysql [:sql :time]
  [driver [_ value unit]]
  (date driver unit (->honeysql driver value)))

(defmethod ->honeysql [:sql :relative-datetime]
  [driver [_ amount unit]]
  (date driver unit (if (zero? amount)
                      (current-datetime-honeysql-form driver)
                      (add-interval-honeysql-form driver (current-datetime-honeysql-form driver) amount unit))))

(defmethod ->honeysql [:sql :temporal-extract]
  [driver [_ mbql-expr unit]]
  (date driver unit (->honeysql driver mbql-expr)))

(defmethod ->honeysql [:sql :datetime-add]
  [driver [_ arg amount unit]]
  (add-interval-honeysql-form driver (->honeysql driver arg) amount unit))

(defmethod ->honeysql [:sql :datetime-subtract]
  [driver [_ arg amount unit]]
  (add-interval-honeysql-form driver (->honeysql driver arg) (- amount) unit))

(defn datetime-diff-check-args
  "This util function is used by SQL implementations of ->honeysql for the `:datetime-diff` clause.
   It raises an exception if the database-type of the arguments `x` and `y` do not match the given predicate.
   Note this doesn't raise an error if the database-type is nil, which can be the case for some drivers."
  [x y pred]
  (doseq [arg [x y]
          :let [db-type (h2x/database-type arg)]
          :when (and db-type (not (pred db-type)))]
    (throw (ex-info (tru "datetimeDiff only allows datetime, timestamp, or date types. Found {0}"
                         (pr-str db-type))
                    {:found db-type
                     :type  qp.error-type/invalid-query}))))

(defmethod ->honeysql [:sql :datetime-diff]
  [driver [_ x y unit]]
  (let [x (->honeysql driver x)
        y (->honeysql driver y)]
    (datetime-diff-check-args x y (partial re-find #"(?i)^(timestamp|date)"))
    (datetime-diff driver unit x y)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Field Aliases (AS Forms)                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TODO -- this name is a bit of a misnomer since it also handles `:aggregation` and `:expression` clauses.
(mu/defn field-clause->alias :- some?
  "Generate HoneySQL for an approriate alias (e.g., for use with SQL `AS`) for a `:field`, `:expression`, or
  `:aggregation` clause of any type, or `nil` if the Field should not be aliased. By default uses the
  `::add/desired-alias` key in the clause options.

  Optional third parameter `unique-name-fn` is no longer used as of 0.42.0."
  ([driver                                                :- :keyword
    [clause-type id-or-name {::add/keys [desired-alias]}] :- vector?]
   (let [desired-alias (or desired-alias
                           ;; fallback behavior for anyone using SQL QP functions directly without including the stuff
                           ;; from [[metabase.query-processor.util.add-alias-info]]. We should probably disallow this
                           ;; going forward because it is liable to break
                           (when (string? id-or-name)
                             id-or-name)
                           (when (and (= clause-type :field)
                                      (integer? id-or-name))
                             (:name (lib.metadata/field (qp.store/metadata-provider) id-or-name))))]
     (->honeysql driver (h2x/identifier :field-alias desired-alias))))

  ([driver field-clause _unique-name-fn]
   (sql.qp.deprecated/log-deprecation-warning
    driver
    "metabase.driver.sql.query-processor/field-clause->alias with 3 args"
    "0.48.0")
   (field-clause->alias driver field-clause)))

(defn as
  "Generate HoneySQL for an `AS` form (e.g. `<form> AS <field>`) using the name information of a `clause`. The
  HoneySQL representation of on `AS` clause is a tuple like `[<form> <alias>]`.

  In some cases where the alias would be redundant, such as plain field literals, this returns the form as-is for
  Honey SQL 1. It's wrapped in a vector for Honey SQL 2 to eliminate ambiguity if the clause compiles to a Honey SQL
  vector. This is not allowed in Honey SQL 1 -- `[expr alias]` always has to have an alias.

  Honey SQL 2 seems to actually need an additional vector around the `alias` form, otherwise it doesn't work
  correctly. See https://clojurians.slack.com/archives/C1Q164V29/p1675301408026759

    ;; Honey SQL 1
    (as [:field \"x\" {:base-type :type/Text}])
    ;; -> (Identifier ...)
    ;; -> SELECT \"x\"

    ;; Honey SQL 2
    (as [:field \"x\" {:base-type :type/Text}])
    ;; -> [[::h2x/identifier ...]]
    ;; -> SELECT \"x\"

    ;; Honey SQL 1
    (as [:field \"x\" {:base-type :type/Text, :temporal-unit :month}])
    ;; -> [(Identifier ...) (Identifier ...)]
    ;; -> SELECT date_extract(\"x\", 'month') AS \"x\"

    ;; Honey SQL 2
    (as [:field \"x\" {:base-type :type/Text, :temporal-unit :month}])
    ;; -> [[::h2x/identifier ...] [[::h2x/identifier ...]]]
    ;; -> SELECT date_extract(\"x\", 'month') AS \"x\""
  [driver clause & _unique-name-fn]
  (let [honeysql-form (->honeysql driver clause)
        field-alias   (field-clause->alias driver clause)]
    (if field-alias
      [honeysql-form [field-alias]]
      [honeysql-form])))

;; Certain SQL drivers require that we refer to Fields using the alias we give in the `SELECT` clause in
;; `ORDER BY` and `GROUP BY` rather than repeating definitions.
;; BigQuery does this generally, other DB's require this in JSON columns.
;;
;; See #17536 and #18742

(defn rewrite-fields-to-force-using-column-aliases
  "Rewrite `:field` clauses to force them to use the column alias regardless of where they appear."
  ([form]
   (rewrite-fields-to-force-using-column-aliases form {:is-breakout false}))
  ([form {is-breakout :is-breakout}]
   (lib.util.match/replace form
     [:field id-or-name opts]
     [:field id-or-name (cond-> opts
                          true
                          (assoc ::add/source-alias        (::add/desired-alias opts)
                                 ::add/source-table        ::add/none
                                 ;; this key will tell the SQL QP not to apply casting here either.
                                 :qp/ignore-coercion       true
                                 ;; used to indicate that this is a forced alias
                                 ::forced-alias            true)
                          ;; don't want to do temporal bucketing or binning inside the order by only.
                          ;; That happens inside the `SELECT`
                          ;; (#22831) however, we do want it in breakout
                          (not is-breakout)
                          (dissoc :temporal-unit :binning))])))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Clause Handlers                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; -------------------------------------------------- aggregation ---------------------------------------------------

(defmethod apply-top-level-clause [:sql :aggregation]
  [driver _top-level-clause honeysql-form {aggregations :aggregation, :as inner-query}]
  (let [honeysql-ags (vec (for [ag   aggregations
                                :let [ag-expr  (->honeysql driver ag)
                                      ag-name  (annotate/aggregation-name inner-query ag)
                                      ag-alias (->honeysql driver (h2x/identifier
                                                                   :field-alias
                                                                   (driver/escape-alias driver ag-name)))]]
                            [ag-expr [ag-alias]]))]
    (reduce (if (:select-top honeysql-form)
              sql.helpers/select-top
              sql.helpers/select)
            honeysql-form
            honeysql-ags)))


;;; ----------------------------------------------- breakout & fields ------------------------------------------------

(defmethod apply-top-level-clause [:sql :breakout]
  [driver _ honeysql-form {breakout-fields :breakout, fields-fields :fields :as _query}]
  (let [select (if (:select-top honeysql-form)
                 sql.helpers/select-top
                 sql.helpers/select)]
    (as-> honeysql-form new-hsql
      (apply select new-hsql (->> breakout-fields
                                  (remove (set fields-fields))
                                  (mapv (fn [field-clause]
                                          (as driver field-clause)))))
      (apply sql.helpers/group-by new-hsql (mapv (partial ->honeysql driver) breakout-fields)))))

(defmethod apply-top-level-clause [:sql :fields]
  [driver _ honeysql-form {fields :fields}]
  (apply (if (:select-top honeysql-form)
           sql.helpers/select-top
           sql.helpers/select)
         honeysql-form
         (for [field-clause fields]
           (as driver field-clause))))


;;; ----------------------------------------------------- filter -----------------------------------------------------

(defn- like-clause
  "Generate honeysql like clause used in `:starts-with`, `:contains` or `:ends-with.
  If matching case insensitively, `pattern` is lowercased earlier in [[generate-pattern]]."
  [field pattern {:keys [case-sensitive] :or {case-sensitive true} :as _options}]
  ;; TODO - don't we need to escape underscores and percent signs in the pattern, since they have special meanings in
  ;; LIKE clauses? That's what we're doing with Druid... (Cam)
  ;;
  ;; TODO - Postgres supports `ILIKE`. Does that make a big enough difference performance-wise that we should do a
  ;; custom implementation? (Cam)
  [:like
   (if case-sensitive
     field
     [:lower field])
   pattern])

(def ^:private StringValueOrFieldOrExpression
  [:or
   [:and mbql.s/value
    [:fn {:error/message "string value"} #(string? (second %))]]
   ::mbql.s/FieldOrExpressionDef])

(mu/defn ^:private generate-pattern
  "Generate pattern to match against in like clause. Lowercasing for case insensitive matching also happens here."
  [driver
   pre
   [type _ :as arg] :- StringValueOrFieldOrExpression
   post
   {:keys [case-sensitive] :or {case-sensitive true} :as _options}]
  (if (= :value type)
    (->honeysql driver (update arg 1 #(cond-> (str pre % post)
                                        (not case-sensitive) u/lower-case-en)))
    (let [expr (->honeysql driver (into [:concat] (remove nil?) [pre arg post]))]
      (if case-sensitive
        expr
        [:lower expr]))))


(defn- uuid-field?
  [x]
  (and (mbql.u/mbql-clause? x)
       (isa? (or (:effective-type (get x 2))
                 (:base-type (get x 2)))
             :type/UUID)))

(mu/defn ^:private maybe-cast-uuid-for-equality
  "For := and :!=. Comparing UUID fields against non-uuid values requires casting."
  [driver field arg]
  (if (and (uuid-field? field)
             ;; If the arg is a uuid we are happy especially for joins (#46558)
             (not (uuid-field? arg))
             ;; If we could not convert the arg to a UUID then we have to cast the Field.
             ;; This will not hit indexes, but then we're passing an arg that can only be compared textually.
             (not (uuid? (->honeysql driver arg)))
             ;; Check for inlined values
             (not (= (:database-type (h2x/type-info (->honeysql driver arg))) "uuid")))
      [::cast field "varchar"]
      field))

(mu/defn ^:private maybe-cast-uuid-for-text-compare
  "For :contains, :starts-with, and :ends-with.
   Comparing UUID fields against with these operations requires casting as the right side will have `%` for `LIKE` operations."
  [field]
  (if (uuid-field? field)
    [::cast field "varchar"]
    field))

(defmethod ->honeysql [:sql ::cast]
  [driver [_ expr database-type]]
  (h2x/maybe-cast database-type (->honeysql driver expr)))

(defmethod ->honeysql [:sql :starts-with]
  [driver [_ field arg options]]
  (like-clause (->honeysql driver (maybe-cast-uuid-for-text-compare field))
               (generate-pattern driver nil arg "%" options) options))

(defmethod ->honeysql [:sql :contains]
  [driver [_ field arg options]]
  (like-clause (->honeysql driver (maybe-cast-uuid-for-text-compare field))
               (generate-pattern driver "%" arg "%" options) options))

(defmethod ->honeysql [:sql :ends-with]
  [driver [_ field arg options]]
  (like-clause (->honeysql driver (maybe-cast-uuid-for-text-compare field))
               (generate-pattern driver "%" arg nil options) options))

(defmethod ->honeysql [:sql :between]
  [driver [_ field min-val max-val]]
  [:between (->honeysql driver field) (->honeysql driver min-val) (->honeysql driver max-val)])

(defmethod ->honeysql [:sql :>]
  [driver [_ field value]]
  [:> (->honeysql driver field) (->honeysql driver value)])

(defmethod ->honeysql [:sql :<]
  [driver [_ field value]]
  [:< (->honeysql driver field) (->honeysql driver value)])

(defmethod ->honeysql [:sql :>=]
  [driver [_ field value]]
  [:>= (->honeysql driver field) (->honeysql driver value)])

(defmethod ->honeysql [:sql :<=]
  [driver [_ field value]]
  [:<= (->honeysql driver field) (->honeysql driver value)])

(defmethod ->honeysql [:sql :=]
  [driver [_ field value]]
  (assert field)
  [:= (->honeysql driver (maybe-cast-uuid-for-equality driver field value)) (->honeysql driver value)])

(defn- correct-null-behaviour
  [driver [op & args :as clause]]
  (if-let [field-arg (lib.util.match/match-one args
                       :field          &match
                       :expression     &match)]
    ;; We must not transform the head again else we'll have an infinite loop
    ;; (and we can't do it at the call-site as then it will be harder to fish out field references)
    [:or
     (into [op] (map (partial ->honeysql driver)) args)
     [:= (->honeysql driver field-arg) nil]]
    clause))

(defmethod ->honeysql [:sql :!=]
  [driver [_ field value]]
  (if (nil? (qp.wrap-value-literals/unwrap-value-literal value))
    [:not= (->honeysql driver (maybe-cast-uuid-for-equality driver field value)) (->honeysql driver value)]
    (correct-null-behaviour driver [:not= (maybe-cast-uuid-for-equality driver field value) value])))

(defmethod ->honeysql [:sql :and]
  [driver [_tag & subclauses]]
  (into [:and]
        (map (partial ->honeysql driver))
        subclauses))

(defmethod ->honeysql [:sql :or]
  [driver [_tag & subclauses]]
  (into [:or]
        (map (partial ->honeysql driver))
        subclauses))

(def ^:private clause-needs-null-behaviour-correction?
  (comp #{:contains :starts-with :ends-with} first))

(defmethod ->honeysql [:sql :not]
  [driver [_tag subclause]]
  (if (clause-needs-null-behaviour-correction? subclause)
    (correct-null-behaviour driver [:not subclause])
    [:not (->honeysql driver subclause)]))

(defmethod apply-top-level-clause [:sql :filter]
  [driver _ honeysql-form {clause :filter}]
  (sql.helpers/where honeysql-form (->honeysql driver clause)))


;;; -------------------------------------------------- join tables ---------------------------------------------------

(declare mbql->honeysql)

(defmulti join->honeysql
  "Compile a single MBQL `join` to HoneySQL."
  {:added "0.32.9" :arglists '([driver join])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti join-source
  "Generate HoneySQL for a table or query to be joined."
  {:added "0.32.9" :arglists '([driver join])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod join-source :sql
  [driver {:keys [source-table source-query]}]
  (cond
    (and source-query (:native source-query))
    (sql-source-query (:native source-query) (:params source-query))

    source-query
    (mbql->honeysql driver {:query source-query})

    :else
    (->honeysql driver (lib.metadata/table (qp.store/metadata-provider) source-table))))

(def ^:private HoneySQLJoin
  "Schema for HoneySQL for a single JOIN. Used to validate that our join-handling code generates correct clauses."
  [:tuple
   ;;join source and alias
   [:tuple
    ;; join source
    :some
    ;; join alias
    :some]
   ;; join condition
   [:sequential :any]])

(mu/defmethod join->honeysql :sql :- HoneySQLJoin
  [driver {:keys [condition], join-alias :alias, :as join} :- mbql.s/Join]
  [[(join-source driver join)
    (let [table-alias (->honeysql driver (h2x/identifier :table-alias join-alias))]
      [table-alias])]
   (->honeysql driver condition)])

(defn- apply-joins-honey-sql-2
  "Use Honey SQL 2's `:join-by` so the joins are in the same order they are specified in MBQL (#15342).
  See [[metabase.query-processor-test.explicit-joins-test/join-order-test]]."
  [driver honeysql-form joins]
  (letfn [(append-joins [join-by]
            (into (vec join-by)
                  (mapcat (fn [{:keys [strategy], :as join}]
                            [strategy (join->honeysql driver join)]))
                  joins))]
    (update honeysql-form :join-by append-joins)))

(defmethod apply-top-level-clause [:sql :joins]
  [driver _ honeysql-form {:keys [joins]}]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (let [f apply-joins-honey-sql-2]
    (f driver honeysql-form joins)))


;;; ---------------------------------------------------- order-by ----------------------------------------------------

(defmethod ->honeysql [:sql :asc]
  [driver [direction field]]
  [(->honeysql driver field) direction])

(defmethod ->honeysql [:sql :desc]
  [driver [direction field]]
  [(->honeysql driver field) direction])

(defmethod apply-top-level-clause [:sql :order-by]
  [driver _ honeysql-form {subclauses :order-by}]
  (reduce sql.helpers/order-by honeysql-form (mapv (partial ->honeysql driver) subclauses)))

;;; -------------------------------------------------- limit & page --------------------------------------------------

(defmethod apply-top-level-clause [:sql :limit]
  [_driver _top-level-clause honeysql-form {value :limit}]
  (sql.helpers/limit honeysql-form (inline-num value)))

(defmethod apply-top-level-clause [:sql :page]
  [_driver _top-level-clause honeysql-form {{:keys [items page]} :page}]
  (-> honeysql-form
      (sql.helpers/limit (inline-num items))
      (sql.helpers/offset (inline-num (* items (dec page))))))


;;; -------------------------------------------------- source-table --------------------------------------------------

(defn- has-to-honeysql-impl-for-legacy-table? [driver]
  (not (identical? (get-method ->honeysql [driver :model/Table])
                   (get-method ->honeysql [:sql :model/Table]))))

(defmethod ->honeysql [:sql :model/Table]
  [driver table]
  (sql.qp.deprecated/log-deprecation-warning
   driver
   "metabase.driver.sql.query-processor/->honeysql for metabase.models.table/Table or :model/Table"
   "0.48.0")
  (let [{table-name :name, schema :schema} table]
    (->honeysql driver (h2x/identifier :table schema table-name))))

(defmethod ->honeysql [:sql :metadata/table]
  [driver table]
  (if (has-to-honeysql-impl-for-legacy-table? driver)
    (do
      (sql.qp.deprecated/log-deprecation-warning
       driver
       "metabase.driver.sql.query-processor/->honeysql for metabase.models.table/Table or :model/Table"
       "0.48.0")
      (->honeysql driver #_{:clj-kondo/ignore [:deprecated-var]} (qp.store/->legacy-metadata table)))
    (let [{table-name :name, schema :schema} table]
      (->honeysql driver (h2x/identifier :table schema table-name)))))

(defmethod apply-top-level-clause [:sql :source-table]
  [driver _top-level-clause honeysql-form {source-table-id :source-table}]
  (let [table (lib.metadata/table (qp.store/metadata-provider) source-table-id)
        expr  (->honeysql driver table)]
    (sql.helpers/from honeysql-form [expr])))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Building the HoneySQL Form                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private top-level-clause-application-order
  "Order to apply top-level clauses in. This is important because we build things like the `SELECT` clause progressively
  and MBQL requires us to return results with `:breakout` columns before `:aggregation`, etc.

  Map of clause -> index, e.g.

    {:source-table 0, :breakout 1, ...}"
  (into {} (map-indexed
            #(vector %2 %1)
            [:source-table :breakout :aggregation :fields :filter :joins :order-by :page :limit])))

(defn- query->keys-in-application-order
  "Return the keys present in an MBQL `inner-query` in the order they should be processed."
  [inner-query]
  ;; sort first by any known top-level clauses according to the `top-level-application-clause-order` defined above,
  ;; then sort any unknown clauses by name.
  (sort-by (fn [clause] [(get top-level-clause-application-order clause Integer/MAX_VALUE) clause])
           (keys inner-query)))

(defn- format-honeysql-2 [dialect honeysql-form]
  ;; throw people a bone and make sure they're not trying to use Honey SQL 1 stuff inside Honey SQL 2.
  (lib.util.match/match honeysql-form
    (form :guard record?)
    (throw (ex-info (format "Not supported by Honey SQL 2: ^%s %s"
                            (.getCanonicalName (class form))
                            (pr-str form))
                    {:honeysql-form honeysql-form, :form form})))
  (if (map? honeysql-form)
    #_{:clj-kondo/ignore [:discouraged-var]}
    (sql/format honeysql-form {:dialect dialect, :quoted true, :quoted-snake false})
    ;; for weird cases when we want to compile just one particular snippet. Why are we doing this? Who knows. This seems
    ;; to not really be supported by Honey SQL 2, so hack around it for now. See upstream issue
    ;; https://github.com/seancorfield/honeysql/issues/456
    (binding [sql/*dialect*      (sql/get-dialect dialect)
              sql/*quoted*       true
              sql/*quoted-snake* false]
      (sql/format-expr honeysql-form {:nested true}))))

(defn format-honeysql
  "Compile a `honeysql-form` to a vector of `[sql & params]`. `honeysql-form` can either be a map (for a top-level
  query), or some sort of expression."
  ([driver honeysql-form]
   (format-honeysql nil (quote-style driver) honeysql-form))

  ;; TODO -- get rid of this unused param without breaking things.
  ([_version dialect honeysql-form]
   (try
     (format-honeysql-2 dialect honeysql-form)
     (catch Throwable e
       (try
         (log/error e (u/format-color :red
                                      "Invalid HoneySQL form: %s\n%s"
                                      (ex-message e) (u/pprint-to-str honeysql-form)))
         (finally
           (throw (ex-info (tru "Error compiling HoneySQL form: {0}" (ex-message e))
                           {:dialect dialect
                            :form    honeysql-form
                            :type    qp.error-type/driver}
                           e))))))))

(defn- default-select [driver {[from] :from, :as _honeysql-form}]
  (let [table-identifier (if (sequential? from)
                           ;; Grab the alias part.
                           ;;
                           ;; Honey SQL 2 = [expr [alias]]
                           (first (second from))
                           from)
        [raw-identifier] (format-honeysql driver table-identifier)
        expr             (if (seq raw-identifier)
                           [:raw (format "%s.*" raw-identifier)]
                           :*)]
    [[expr]]))

(defn- add-default-select
  "Add `SELECT *` to `honeysql-form` if no `:select` clause is present."
  [driver {:keys [select select-top], :as honeysql-form}]
  ;; TODO - this is hacky -- we should ideally never need to add `SELECT *`, because we should know what fields to
  ;; expect from the source query, and middleware should be handling that for us
  (cond
    (and (empty? select)
         (empty? select-top))
    (assoc honeysql-form :select (default-select driver honeysql-form))

    ;; select-top currently only has the first arg, the limit
    (= (count select-top) 1)
    (update honeysql-form :select-top (fn [existing]
                                        (into existing (default-select driver honeysql-form))))

    :else
    honeysql-form))

(defn- apply-top-level-clauses
  "`apply-top-level-clause` for all of the top-level clauses in `inner-query`, progressively building a HoneySQL form.
  Clauses are applied according to the order in `top-level-clause-application-order`."
  ([driver honeysql-form inner-query]
   (apply-top-level-clauses driver honeysql-form inner-query identity))

  ([driver honeysql-form inner-query xform]
   (transduce
    xform
    (fn
      ([honeysql-form]
       (add-default-select driver honeysql-form))
      ([honeysql-form k]
       (apply-top-level-clause driver k honeysql-form inner-query)))
    honeysql-form
    (query->keys-in-application-order inner-query))))

(declare apply-clauses)

(defn- apply-source-query
  "Handle a `:source-query` clause by adding a recursive `SELECT` or native query.
   If the source query has ambiguous column names, use a `WITH` statement to rename the source columns.
   At the time of this writing, all source queries are aliased as `source`."
  [driver honeysql-form {{:keys [native params] persisted :persisted-info/native :as source-query} :source-query
                         source-metadata :source-metadata}]
  (let [table-alias (->honeysql driver (h2x/identifier :table-alias source-query-alias))
        source-clause (cond
                        persisted
                        (sql-source-query persisted nil)

                        native
                        (sql-source-query native params)

                        :else
                        (apply-clauses driver {} source-query))
        ;; TODO: Use MLv2 here to get source and desired-aliases
        alias-info (mapv (fn [{[_ desired-ref-name] :field_ref source-name :name}]
                           [source-name desired-ref-name])
                         source-metadata)
        source-aliases (mapv first alias-info)
        desired-aliases (mapv second alias-info)
        duplicate-source-aliases? (and (> (count source-aliases) 1)
                                       (not (apply distinct? source-aliases)))
        needs-columns? (and (seq desired-aliases)
                            (> (count desired-aliases) 1)
                            duplicate-source-aliases?
                            (apply distinct? desired-aliases)
                            (every? string? desired-aliases))]
    (merge
      honeysql-form
      (if needs-columns?
        ;; HoneySQL cannot expand [::h2x/identifier :table "source"] in the with alias.
        ;; This is ok since we control the alias.
        {:with [[[source-query-alias {:columns (mapv #(h2x/identifier :field %) desired-aliases)}]
                 source-clause]]
         :from [[table-alias]]}
        {:from [[source-clause [table-alias]]]}))))

(defn- apply-clauses
  "Like [[apply-top-level-clauses]], but handles `source-query` as well, which needs to be handled in a special way
  because it is aliased."
  [driver honeysql-form {:keys [source-query], :as inner-query}]
  (binding [*inner-query* inner-query]
    (if source-query
      (apply-top-level-clauses
       driver
       (apply-source-query driver honeysql-form inner-query)
       inner-query
       ;; don't try to do anything with the source query recursively.
       (remove (partial = :source-query)))
      (apply-top-level-clauses driver honeysql-form inner-query))))

(defmulti preprocess
  "Do miscellaneous transformations to the MBQL before compiling the query. These changes are idempotent, so it is safe
  to use this function in your own implementations of [[driver/mbql->native]], if you want to apply changes to the
  same version of the query that we will ultimately be compiling."
  {:changelog-test/ignore true, :arglists '([driver inner-query]), :added "0.42.0"}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

;;; This is a wrapper
;;; around [[qp.util.transformations.nest-breakouts/nest-breakouts-in-stages-with-window-aggregation]], which is
;;; written for pMBQL, so we can use it with a legacy inner query. Once we rework the SQL QP to use pMBQL we can remove
;;; this.
(mu/defn ^:private nest-breakouts-in-queries-with-window-fn-aggregations :- mbql.s/MBQLQuery
  [inner-query :- mbql.s/MBQLQuery]
  (let [metadata-provider (qp.store/metadata-provider)
        database-id       (u/the-id (lib.metadata/database (qp.store/metadata-provider)))]
    (-> (lib.query/query-from-legacy-inner-query metadata-provider database-id inner-query)
        qp.util.transformations.nest-breakouts/nest-breakouts-in-stages-with-window-aggregation
        lib.convert/->legacy-MBQL
        :query)))

;;; [[qp.util.transformations.nest-breakouts/nest-breakouts-in-stages-with-window-aggregation]] already does
;;; basically the same check, this is here mostly to avoid the performance hit of converting to pMBQL and back in
;;; queries that have no cumulative aggregations at all. Once we convert the SQL QP to pMBQL we can remove this.
(defn- has-window-function-aggregations? [inner-query]
  (or (lib.util.match/match (mapcat inner-query [:aggregation :expressions])
        #{:cum-sum :cum-count :offset}
        true)
      (when-let [source-query (:source-query inner-query)]
        (has-window-function-aggregations? source-query))))

(defn- maybe-nest-breakouts-in-queries-with-window-fn-aggregations [inner-query]
  (cond-> inner-query
    (has-window-function-aggregations? inner-query) nest-breakouts-in-queries-with-window-fn-aggregations))

(defmethod preprocess :sql
  [_driver inner-query]
  (-> inner-query
      maybe-nest-breakouts-in-queries-with-window-fn-aggregations
      add/add-alias-info
      nest-query/nest-expressions))

(mu/defn mbql->honeysql :- :map
  "Build the HoneySQL form we will compile to SQL and execute."
  [driver               :- :keyword
   {inner-query :query} :- :map]
  (binding [driver/*driver* driver]
    (let [inner-query (preprocess driver inner-query)]
      (log/tracef "Compiling MBQL query\n%s" (u/pprint-to-str 'magenta inner-query))
      (u/prog1 (apply-clauses driver {} inner-query)
        (log/debugf "\nHoneySQL Form: %s\n%s" (u/emoji "🍯") (u/pprint-to-str 'cyan <>))))))

;;;; MBQL -> Native

(mu/defn mbql->native :- [:map
                          [:query  :string]
                          [:params [:maybe [:sequential :any]]]]
  "Transpile MBQL query into a native SQL statement. This is the `:sql` driver implementation
  of [[driver/mbql->native]] (actual multimethod definition is in [[metabase.driver.sql]]."
  [driver      :- :keyword
   outer-query :- :map]
  (let [honeysql-form (mbql->honeysql driver outer-query)
        [sql & args]  (format-honeysql driver honeysql-form)]
    {:query sql, :params args}))
