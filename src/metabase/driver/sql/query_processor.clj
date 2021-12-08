(ns metabase.driver.sql.query-processor
  "The Query Processor is responsible for translating the Metabase Query Language into HoneySQL SQL forms."
  (:require [clojure.core.match :refer [match]]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [honeysql.format :as hformat]
            [honeysql.helpers :as h]
            [metabase.driver :as driver]
            [metabase.driver.common :as driver.common]
            [metabase.driver.sql.query-processor.deprecated :as deprecated]
            [metabase.mbql.schema :as mbql.s]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.field :as field :refer [Field]]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor.error-type :as qp.error-type]
            [metabase.query-processor.middleware.annotate :as annotate]
            [metabase.query-processor.middleware.wrap-value-literals :as value-literal]
            [metabase.query-processor.store :as qp.store]
            [metabase.query-processor.util.add-alias-info :as add]
            [metabase.query-processor.util.nest-query :as nest-query]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.util.i18n :refer [deferred-tru tru]]
            [potemkin :as p]
            [pretty.core :refer [PrettyPrintable]]
            [schema.core :as s])
  (:import metabase.models.field.FieldInstance
           [metabase.util.honeysql_extensions Identifier TypedHoneySQLForm]))

(def source-query-alias
  "Alias to use for source queries, e.g.:

    SELECT source.*
    FROM ( SELECT * FROM some_table ) source"
  "source")

(def ^:dynamic *inner-query*
  "The INNER query currently being processed, for situations where we need to refer back to it."
  nil)

;; use [[sql-source-query]] below to construct this pls
(p/deftype+ SQLSourceQuery [sql params]
  hformat/ToSql
  (to-sql [_]
    (dorun (map hformat/add-anon-param params))
    ;; strip off any trailing semicolons
    (str "(" (str/replace sql #";+\s*$" "") ")"))

  PrettyPrintable
  (pretty [_]
    (list 'SQLSourceQuery. sql params))

  Object
  (equals [_ other]
    (and (instance? SQLSourceQuery other)
         (= sql    (.sql ^SQLSourceQuery other))
         (= params (.params ^SQLSourceQuery other)))))

(alter-meta! #'->SQLSourceQuery assoc :private true)

(defn sql-source-query
  "Preferred way to construct an instance of [[SQLSourceQuery]]. Does additional validation."
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
  (SQLSourceQuery. sql params))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Interface (Multimethods)                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;; this is the primary way to override behavior for a specific clause or object class.

(defmulti ->honeysql
  "Return an appropriate HoneySQL form for an object. Dispatches off both driver and either clause name or object class
  making this easy to override in any places needed for a given driver."
  {:arglists '([driver x])}
  (fn [driver x]
    [(driver/dispatch-on-initialized-driver driver) (mbql.u/dispatch-by-clause-name-or-class x)])
  :hierarchy #'driver/hierarchy)

(defmulti current-datetime-honeysql-form
  "HoneySQL form that should be used to get the current `datetime` (or equivalent). Defaults to `:%now`. Should ideally
  include the database type info on the form (ex: via [[hx/with-type-info]])."
  {:arglists '([driver])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod current-datetime-honeysql-form :sql
  [_driver]
  :%now)

;; TODO - rename this to `temporal-bucket` or something that better describes what it actually does
(defmulti date
  "Return a HoneySQL form for truncating a date or timestamp field or value to a given resolution, or extracting a date
  component."
  {:arglists '([driver unit field-or-value])}
  (fn [driver unit _] [(driver/dispatch-on-initialized-driver driver) unit])
  :hierarchy #'driver/hierarchy)

;; default implementation for `:default` bucketing returns expression as-is
(defmethod date [:sql :default] [_ _ expr] expr)

;; We have to roll our own to account for arbitrary start of week
(defmethod date [:sql :week-of-year]
  [driver _ expr]
  ;; Some DBs truncate when doing integer division, therefore force float arithmetics
  (->honeysql driver [:ceil (hx// (date driver :day-of-year (date driver :week expr)) 7.0)]))

(defmulti add-interval-honeysql-form
  "Return a HoneySQL form that performs represents addition of some temporal interval to the original `hsql-form`.

    (add-interval-honeysql-form :my-driver hsql-form 1 :day) -> (hsql/call :date_add hsql-form 1 (hx/literal 'day'))

  `amount` is usually an integer, but can be floating-point for units like seconds."
  {:arglists '([driver hsql-form amount unit])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defn adjust-start-of-week
  "Truncate to the day the week starts on."
  [driver truncate-fn expr]
  (let [offset (driver.common/start-of-week-offset driver)]
    (if (not= offset 0)
      (add-interval-honeysql-form driver
                                  (truncate-fn (add-interval-honeysql-form driver expr offset :day))
                                  (- offset) :day)
      (truncate-fn expr))))

(s/defn adjust-day-of-week
  "Adjust day of week wrt start of week setting."
  ([driver day-of-week]
   (adjust-day-of-week driver day-of-week (driver.common/start-of-week-offset driver)))

  ([driver day-of-week offset]
   (adjust-day-of-week driver day-of-week offset hx/mod))

  ([_driver
    day-of-week
    offset :- s/Int
    mod-fn :- (s/pred fn?)]
   (if (not= offset 0)
     (hsql/call :case
       (hsql/call := (mod-fn (hx/+ day-of-week offset) 7) 0) 7
       :else                                                 (mod-fn (hx/+ day-of-week offset) 7))
     day-of-week)))

(defmulti quote-style
  "Return the quoting style that should be used by [HoneySQL](https://github.com/jkk/honeysql) when building a SQL
  statement. Defaults to `:ansi`, but other valid options are `:mysql`, `:sqlserver`, `:oracle`, and `:h2` (added in
  [[metabase.util.honeysql-extensions]]; like `:ansi`, but uppercases the result).

    (hsql/format ... :quoting (quote-style driver), :allow-dashed-names? true)"
  {:arglists '([driver])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod quote-style :sql [_] :ansi)

(defmulti unix-timestamp->honeysql
  "Return a HoneySQL form appropriate for converting a Unix timestamp integer field or value to an proper SQL Timestamp.
  `seconds-or-milliseconds` refers to the resolution of the int in question and with be either `:seconds` or
  `:milliseconds`.

  There is a default implementation for `:milliseconds` the recursively calls with `:seconds` and `(expr / 1000)`."
  {:arglists '([driver seconds-or-milliseconds expr]), :added "0.35.0"}
  (fn [driver seconds-or-milliseconds _] [(driver/dispatch-on-initialized-driver driver) seconds-or-milliseconds])
  :hierarchy #'driver/hierarchy)

(defmulti cast-temporal-string
  "Cast a string representing "
  {:arglists '([driver coercion-strategy expr]), :added "0.38.0"}
  (fn [driver coercion-strategy _] [(driver/dispatch-on-initialized-driver driver) coercion-strategy])
  :hierarchy #'driver/hierarchy)

(defmethod cast-temporal-string :default
  [driver coercion-strategy _expr]
  (throw (ex-info (tru "Driver {0} does not support {1}" driver coercion-strategy)
                  {:type qp.error-type/unsupported-feature
                   :coercion-strategy coercion-strategy})))

(defmethod unix-timestamp->honeysql [:sql :milliseconds]
  [driver _ expr]
  (unix-timestamp->honeysql driver :seconds (hx// expr 1000)))

(defmethod unix-timestamp->honeysql [:sql :microseconds]
  [driver _ expr]
  (unix-timestamp->honeysql driver :seconds (hx// expr 1000000)))

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
  {:arglists '([driver top-level-clause honeysql-form query]), :style/indent 2}
  (fn [driver top-level-clause _ _]
    [(driver/dispatch-on-initialized-driver driver) top-level-clause])
  :hierarchy #'driver/hierarchy)

(defmethod apply-top-level-clause :default
  [_ _ honeysql-form _]
  honeysql-form)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Low-Level ->honeysql impls                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod ->honeysql [:sql nil]    [_ _]    nil)
(defmethod ->honeysql [:sql Object] [_ this] this)

(defmethod ->honeysql [:sql :value] [driver [_ value]] (->honeysql driver value))

(defmethod ->honeysql [:sql :expression]
  [driver [_ expression-name {::add/keys [source-table source-alias]} :as _clause]]
  (let [expression-definition (mbql.u/expression-with-name *inner-query* expression-name)]
    (->honeysql driver (if (= source-table ::add/source)
                         (apply hx/identifier :field source-query-alias source-alias)
                         expression-definition))))

(defn semantic-type->unix-timestamp-unit
  "Translates coercion types like `:Coercion/UNIXSeconds->DateTime` to the corresponding unit of time to use in
  [[unix-timestamp->honeysql]].  Throws an AssertionError if the argument does not descend from `:UNIXTime->Temporal`
  and an exception if the type does not have an associated unit."
  [coercion-type]
  (when-not (isa? coercion-type :Coercion/UNIXTime->Temporal)
    (throw (ex-info "Semantic type must be a UNIXTimestamp"
                    {:type          qp.error-type/invalid-query
                     :coercion-type coercion-type})))
  (or (get {:Coercion/UNIXMicroSeconds->DateTime :microseconds
            :Coercion/UNIXMilliSeconds->DateTime :milliseconds
            :Coercion/UNIXSeconds->DateTime      :seconds}
           coercion-type)
      (throw (Exception. (tru "No magnitude known for {0}" coercion-type)))))

(defn cast-field-if-needed
  "Wrap a `field-identifier` in appropriate HoneySQL expressions if it refers to a UNIX timestamp Field."
  [driver field honeysql-form]
  (u/prog1 (match [(:base_type field) (:coercion_strategy field)]
            [(:isa? :type/Number) (:isa? :Coercion/UNIXTime->Temporal)]
            (unix-timestamp->honeysql driver
                                      (semantic-type->unix-timestamp-unit (:coercion_strategy field))
                                      honeysql-form)

            [:type/Text (:isa? :Coercion/String->Temporal)]
            (cast-temporal-string driver (:coercion_strategy field) honeysql-form)

            [(:isa? :type/*) (:isa? :Coercion/Bytes->Temporal)]
            (cast-temporal-byte driver (:coercion_strategy field) honeysql-form)

            :else honeysql-form)
    (when-not (= <> honeysql-form)
      (log/tracef "Applied casting\n=>\n%s" (u/pprint-to-str <>)))))

(defmethod ->honeysql [:sql TypedHoneySQLForm]
  [driver typed-form]
  (->honeysql driver (hx/unwrap-typed-honeysql-form typed-form)))

;; default implmentation is a no-op; other drivers can override it as needed
(defmethod ->honeysql [:sql Identifier]
  [_ identifier]
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
  (-> honeysql-form
      (hx/- min-value)
      (hx// bin-width)
      hx/floor
      (hx/* bin-width)
      (hx/+ min-value)))

(defn- field-source-table-aliases
  "Get sequence of alias that should be used to qualify a `:field` clause when compiling (e.g. left-hand side of an
  `AS`).

    (field-source-table-aliases [:field 1 nil]) ; -> [\"public\" \"venues\"]"
  [[_ id-or-name {::add/keys [source-table]}]]
  (let [source-table (or source-table
                         (when (integer? id-or-name)
                           (:table_id (qp.store/field id-or-name))))]
    (cond
      (= source-table ::add/source) [source-query-alias]
      (= source-table ::add/none)   nil
      (integer? source-table)       (let [{schema :schema, table-name :name} (qp.store/table source-table)]
                                      [schema table-name])
      source-table                  [source-table])))

(defn- field-source-alias
  "Get alias that should be use to refer to a `:field` clause when compiling (e.g. left-hand side of an `AS`).

    (field-source-alias [:field 1 nil]) ; -> \"price\""
  [[_ id-or-name {::add/keys [source-alias]}]]
  (or source-alias
      (when (string? id-or-name)
        id-or-name)
      (when (integer? id-or-name)
        (:name (qp.store/field id-or-name)))))

(defmethod ->honeysql [:sql :field]
  [driver [_ id-or-name {:keys             [database-type]
                         ::nest-query/keys [outer-select]
                         :as               options}
           :as field-clause]]
  (try
    (let [source-table-aliases (field-source-table-aliases field-clause)
          source-alias         (field-source-alias field-clause)
          field                (when (integer? id-or-name)
                                 (qp.store/field id-or-name))
          allow-casting?       (and field
                                    (not outer-select))
          database-type        (or database-type
                                   (:database_type field))
          identifier           (->honeysql driver
                                           (apply hx/identifier :field
                                                  (concat source-table-aliases [source-alias])))
          maybe-add-db-type    (fn [expr]
                                 (if (hx/type-info->db-type (hx/type-info expr))
                                   expr
                                   (hx/with-database-type-info expr database-type)))]
      (u/prog1
        (cond->> identifier
          allow-casting?           (cast-field-if-needed driver field)
          database-type            maybe-add-db-type                         ; only add type info if it wasn't added by [[cast-field-if-needed]]
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
    (hsql/call :count (->honeysql driver field))
    :%count.*))

(defmethod ->honeysql [:sql :avg]        [driver [_ field]]   (hsql/call :avg             (->honeysql driver field)))
(defmethod ->honeysql [:sql :median]     [driver [_ field]]   (hsql/call :median          (->honeysql driver field)))
(defmethod ->honeysql [:sql :percentile] [driver [_ field p]] (hsql/call :percentile-cont (->honeysql driver field) (->honeysql driver p)))
(defmethod ->honeysql [:sql :distinct]   [driver [_ field]]   (hsql/call :distinct-count  (->honeysql driver field)))
(defmethod ->honeysql [:sql :stddev]     [driver [_ field]]   (hsql/call :stddev_pop      (->honeysql driver field)))
(defmethod ->honeysql [:sql :var]        [driver [_ field]]   (hsql/call :var_pop         (->honeysql driver field)))
(defmethod ->honeysql [:sql :sum]        [driver [_ field]]   (hsql/call :sum             (->honeysql driver field)))
(defmethod ->honeysql [:sql :min]        [driver [_ field]]   (hsql/call :min             (->honeysql driver field)))
(defmethod ->honeysql [:sql :max]        [driver [_ field]]   (hsql/call :max             (->honeysql driver field)))

(defmethod ->honeysql [:sql :floor] [driver [_ field]] (hsql/call :floor (->honeysql driver field)))
(defmethod ->honeysql [:sql :ceil]  [driver [_ field]] (hsql/call :ceil  (->honeysql driver field)))
(defmethod ->honeysql [:sql :round] [driver [_ field]] (hsql/call :round (->honeysql driver field)))
(defmethod ->honeysql [:sql :abs]   [driver [_ field]] (hsql/call :abs (->honeysql driver field)))

(defmethod ->honeysql [:sql :log]   [driver [_ field]] (hsql/call :log 10 (->honeysql driver field)))
(defmethod ->honeysql [:sql :exp]   [driver [_ field]] (hsql/call :exp (->honeysql driver field)))
(defmethod ->honeysql [:sql :sqrt]  [driver [_ field]] (hsql/call :sqrt (->honeysql driver field)))
(defmethod ->honeysql [:sql :power] [driver [_ field power]]
  (hsql/call :power (->honeysql driver field) (->honeysql driver power)))

(defmethod ->honeysql [:sql :+]
  [driver [_ & args]]
  (if (mbql.u/datetime-arithmetics? args)
    (let [[field & intervals] args]
      (reduce (fn [hsql-form [_ amount unit]]
                (add-interval-honeysql-form driver hsql-form amount unit))
              (->honeysql driver field)
              intervals))
    (apply hsql/call :+ (map (partial ->honeysql driver) args))))

(defmethod ->honeysql [:sql :-] [driver [_ & args]] (apply hsql/call :- (map (partial ->honeysql driver) args)))
(defmethod ->honeysql [:sql :*] [driver [_ & args]] (apply hsql/call :* (map (partial ->honeysql driver) args)))

;; for division we want to go ahead and convert any integer args to floats, because something like field / 2 will do
;; integer division and give us something like 1.0 where we would rather see something like 1.5
;;
;; also, we want to gracefully handle situations where the column is ZERO and just swap it out with NULL instead, so
;; we don't get divide by zero errors. SQL DBs always return NULL when dividing by NULL (AFAIK)

(defmulti ->float
  "Cast to float"
  {:arglists '([driver value])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod ->float :sql
  [_ value]
  (hx/cast :float value))

(defmethod ->honeysql [:sql :/]
  [driver [_ & args]]
  (let [[numerator & denominators] (for [arg args]
                                     (->honeysql driver (if (integer? arg)
                                                          (double arg)
                                                          arg)))]
    (apply hsql/call :/
           (->float driver numerator)
           (for [denominator denominators]
             (hsql/call :case
               (hsql/call := denominator 0) nil
               :else                        denominator)))))

(defmethod ->honeysql [:sql :sum-where]
  [driver [_ arg pred]]
  (hsql/call :sum (hsql/call :case
                    (->honeysql driver pred) (->honeysql driver arg)
                    :else                    0.0)))

(defmethod ->honeysql [:sql :count-where]
  [driver [_ pred]]
  (->honeysql driver [:sum-where 1 pred]))

(defmethod ->honeysql [:sql :share]
  [driver [_ pred]]
  (hsql/call :/ (->honeysql driver [:count-where pred]) :%count.*))

(defmethod ->honeysql [:sql :trim]
  [driver [_ arg]]
  (hsql/call :trim (->honeysql driver arg)))

(defmethod ->honeysql [:sql :ltrim]
  [driver [_ arg]]
  (hsql/call :ltrim (->honeysql driver arg)))

(defmethod ->honeysql [:sql :rtrim]
  [driver [_ arg]]
  (hsql/call :rtrim (->honeysql driver arg)))

(defmethod ->honeysql [:sql :upper]
  [driver [_ arg]]
  (hsql/call :upper (->honeysql driver arg)))

(defmethod ->honeysql [:sql :lower]
  [driver [_ arg]]
  (hsql/call :lower (->honeysql driver arg)))

(defmethod ->honeysql [:sql :coalesce]
  [driver [_ & args]]
  (apply hsql/call :coalesce (mapv (partial ->honeysql driver) args)))

(defmethod ->honeysql [:sql :replace]
  [driver [_ arg pattern replacement]]
  (hsql/call :replace (->honeysql driver arg) (->honeysql driver pattern) (->honeysql driver replacement)))

(defmethod ->honeysql [:sql :concat]
  [driver [_ & args]]
  (apply hsql/call :concat (mapv (partial ->honeysql driver) args)))

(defmethod ->honeysql [:sql :substring]
  [driver [_ arg start length]]
  (if length
    (hsql/call :substring (->honeysql driver arg) (->honeysql driver start) (->honeysql driver length))
    (hsql/call :substring (->honeysql driver arg) (->honeysql driver start))))

(defmethod ->honeysql [:sql :length]
  [driver [_ arg]]
  (hsql/call :length (->honeysql driver arg)))

(defmethod ->honeysql [:sql :case]
  [driver [_ cases options]]
  (->> (concat cases
               (when (:default options)
                 [[:else (:default options)]]))
       (apply concat)
       (mapv (partial ->honeysql driver))
       (apply hsql/call :case)))

;; actual handling of the name is done in the top-level clause handler for aggregations
(defmethod ->honeysql [:sql :aggregation-options]
  [driver [_ ag]]
  (->honeysql driver ag))

;;  aggregation REFERENCE e.g. the ["aggregation" 0] fields we allow in order-by
(defmethod ->honeysql [:sql :aggregation]
  [driver [_ index]]
  (mbql.u/match-one (nth (:aggregation *inner-query*) index)
    [:aggregation-options ag (options :guard :name)]
    (->honeysql driver (hx/identifier :field-alias (:name options)))

    [:aggregation-options ag _]
    #_:clj-kondo/ignore
    (recur ag)

    ;; For some arcane reason we name the results of a distinct aggregation "count", everything else is named the
    ;; same as the aggregation
    :distinct
    (->honeysql driver (hx/identifier :field-alias :count))

    #{:+ :- :* :/}
    (->honeysql driver &match)

    ;; for everything else just use the name of the aggregation as an identifer, e.g. `:sum`
    ;;
    ;; TODO -- I don't think we will ever actually get to this anymore because everything should have been given a name
    ;; by [[metabase.query-processor.middleware.pre-alias-aggregations]]
    [ag-type & _]
    (->honeysql driver (hx/identifier :field-alias ag-type))))

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

;; date extraction functions
(defmethod ->honeysql [:sql :get-year]
  [driver [_ arg]]
  (hx/year (->honeysql driver arg)))

(defmethod ->honeysql [:sql :get-quarter]
  [driver [_ arg]]
  (hx/quarter (->honeysql driver arg)))

(defmethod ->honeysql [:sql :get-month]
  [driver [_ arg]]
  (hx/month (->honeysql driver arg)))

(defmethod ->honeysql [:sql :get-day]
  [driver [_ arg]]
  (hx/day (->honeysql driver arg)))

(defmethod ->honeysql [:sql :get-day-of-week]
  [driver [_ arg]]
  (date driver :day-of-week (->honeysql driver arg)))

(defmethod ->honeysql [:sql :get-hour]
  [driver [_ arg]]
  (hx/hour (->honeysql driver arg)))

(defmethod ->honeysql [:sql :get-minute]
  [driver [_ arg]]
  (hx/minute (->honeysql driver arg)))

(defmethod ->honeysql [:sql :get-second]
  [driver [_ arg]]
  (hsql/call :second (->honeysql driver arg)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Field Aliases (AS Forms)                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TODO -- this name is a bit of a misnomer since it also handles `:aggregation` and `:expression` clauses.
(s/defn field-clause->alias :- (s/pred some? "non-nil")
  "Generate HoneySQL for an approriate alias (e.g., for use with SQL `AS`) for a `:field`, `:expression`, or
  `:aggregation` clause of any type, or `nil` if the Field should not be aliased. By default uses the
  `::add/desired-alias` key in the clause options.

  Optional third parameter `unique-name-fn` is no longer used as of 0.42.0."
  [driver [clause-type id-or-name {::add/keys [desired-alias]}] & _unique-name-fn]
  (let [desired-alias (or desired-alias
                          ;; fallback behavior for anyone using SQL QP functions directly without including the stuff
                          ;; from [[metabase.query-processor.util.add-alias-info]]. We should probably disallow this
                          ;; going forward because it is liable to break
                          (when (string? id-or-name)
                            id-or-name)
                          (when (and (= clause-type :field)
                                     (integer? id-or-name))
                            (:name (qp.store/field id-or-name))))]
    (->honeysql driver (hx/identifier :field-alias desired-alias))))

(defn as
  "Generate HoneySQL for an `AS` form (e.g. `<form> AS <field>`) using the name information of a `clause`. The
  HoneySQL representation of on `AS` clause is a tuple like `[<form> <alias>]`.

  In some cases where the alias would be redundant, such as plain field literals, this returns the form as-is.

    (as [:field \"x\" {:base-type :type/Text}])
    ;; -> <compiled-form>
    ;; -> SELECT \"x\"

    (as [:field \"x\" {:base-type :type/Text, :temporal-unit :month}])
    ;; -> [<compiled-form> :x]
    ;; -> SELECT date_extract(\"x\", 'month') AS \"x\""
  [driver clause & _unique-name-fn]
  (let [honeysql-form (->honeysql driver clause)
        field-alias   (field-clause->alias driver clause)]
    (if field-alias
      [honeysql-form field-alias]
      honeysql-form)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Clause Handlers                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; -------------------------------------------------- aggregation ---------------------------------------------------

(defmethod apply-top-level-clause [:sql :aggregation]
  [driver _ honeysql-form {aggregations :aggregation}]
  (let [honeysql-ags (vec (for [ag aggregations]
                            [(->honeysql driver ag)
                             (->honeysql driver (hx/identifier
                                                 :field-alias
                                                 (driver/escape-alias driver (annotate/aggregation-name ag))))]))]
    (reduce h/merge-select honeysql-form honeysql-ags)))


;;; ----------------------------------------------- breakout & fields ------------------------------------------------

(defmethod apply-top-level-clause [:sql :breakout]
  [driver _ honeysql-form {breakout-fields :breakout, fields-fields :fields :as _query}]
  (as-> honeysql-form new-hsql
    (apply h/merge-select new-hsql (->> breakout-fields
                                        (remove (set fields-fields))
                                        (mapv (fn [field-clause]
                                                (as driver field-clause)))))
    (apply h/group new-hsql (mapv (partial ->honeysql driver) breakout-fields))))

(defmethod apply-top-level-clause [:sql :fields]
  [driver _ honeysql-form {fields :fields}]
  (apply h/merge-select honeysql-form (vec (for [field-clause fields]
                                             (as driver field-clause)))))


;;; ----------------------------------------------------- filter -----------------------------------------------------

(defn- like-clause
  "Generate a SQL `LIKE` clause. `value` is assumed to be a `Value` object (a record type with a key `:value` as well as
  some sort of type info) or similar as opposed to a raw value literal."
  [driver field value options]
  ;; TODO - don't we need to escape underscores and percent signs in the pattern, since they have special meanings in
  ;; LIKE clauses? That's what we're doing with Druid...
  ;;
  ;; TODO - Postgres supports `ILIKE`. Does that make a big enough difference performance-wise that we should do a
  ;; custom implementation?
  (if (get options :case-sensitive true)
    [:like field                    (->honeysql driver value)]
    [:like (hsql/call :lower field) (->honeysql driver (update value 1 str/lower-case))]))

(s/defn ^:private update-string-value :- mbql.s/value
  [value :- (s/constrained mbql.s/value #(string? (second %)) "string value"), f]
  (update value 1 f))

(defmethod ->honeysql [:sql :starts-with]
  [driver [_ field value options]]
  (like-clause driver (->honeysql driver field) (update-string-value value #(str % \%)) options))

(defmethod ->honeysql [:sql :contains]
  [driver [_ field value options]]
  (like-clause driver (->honeysql driver field) (update-string-value value #(str \% % \%)) options))

(defmethod ->honeysql [:sql :ends-with]
  [driver [_ field value options]]
  (like-clause driver (->honeysql driver field) (update-string-value value #(str \% %)) options))

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
  [:= (->honeysql driver field) (->honeysql driver value)])

(defn- correct-null-behaviour
  [driver [op & args]]
  (let [field-arg (mbql.u/match-one args
                    FieldInstance &match
                    :field        &match)]
    ;; We must not transform the head again else we'll have an infinite loop
    ;; (and we can't do it at the call-site as then it will be harder to fish out field references)
    [:or
     (into [op] (map (partial ->honeysql driver)) args)
     [:= (->honeysql driver field-arg) nil]]))

(defmethod ->honeysql [:sql :!=]
  [driver [_ field value]]
  (if (nil? (value-literal/unwrap-value-literal value))
    [:not= (->honeysql driver field) (->honeysql driver value)]
    (correct-null-behaviour driver [:not= field value])))

(defmethod ->honeysql [:sql :and]
  [driver [_ & subclauses]]
  (apply vector :and (mapv (partial ->honeysql driver) subclauses)))

(defmethod ->honeysql [:sql :or]
  [driver [_ & subclauses]]
  (apply vector :or (mapv (partial ->honeysql driver) subclauses)))

(def ^:private clause-needs-null-behaviour-correction?
  (comp #{:contains :starts-with :ends-with} first))

(defmethod ->honeysql [:sql :not]
  [driver [_ subclause]]
  (if (clause-needs-null-behaviour-correction? subclause)
    (correct-null-behaviour driver [:not subclause])
    [:not (->honeysql driver subclause)]))

(defmethod apply-top-level-clause [:sql :filter]
  [driver _ honeysql-form {clause :filter}]
  (h/where honeysql-form (->honeysql driver clause)))


;;; -------------------------------------------------- join tables ---------------------------------------------------

(declare mbql->honeysql)

(defmulti join->honeysql
  "Compile a single MBQL `join` to HoneySQL."
  {:arglists '([driver join])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti join-source
  "Generate HoneySQL for a table or query to be joined."
  {:arglists '([driver join])}
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
    (->honeysql driver (qp.store/table source-table))))

(def ^:private HoneySQLJoin
  "Schema for HoneySQL for a single JOIN. Used to validate that our join-handling code generates correct clauses."
  [(s/one
    [(s/one (s/pred some?) "join source")
     (s/one (s/pred some?) "join alias")]
    "join source and alias")
   (s/one (s/pred sequential?) "join condition")])

(s/defmethod join->honeysql :sql :- HoneySQLJoin
  [driver {:keys [condition], join-alias :alias, :as join} :- mbql.s/Join]
  [[(join-source driver join)
    (->honeysql driver (hx/identifier :table-alias join-alias))]
   (->honeysql driver condition)])

(def ^:private join-strategy->merge-fn
  {:left-join  h/merge-left-join
   :right-join h/merge-right-join
   :inner-join h/merge-join
   :full-join  h/merge-full-join})

(defmethod apply-top-level-clause [:sql :joins]
  [driver _ honeysql-form {:keys [joins]}]
  (reduce
   (fn [honeysql-form {:keys [strategy], :as join}]
     (apply (join-strategy->merge-fn strategy) honeysql-form (join->honeysql driver join)))
   honeysql-form
   joins))


;;; ---------------------------------------------------- order-by ----------------------------------------------------

(defmethod ->honeysql [:sql :asc]
  [driver [direction field]]
  [(->honeysql driver field) direction])

(defmethod ->honeysql [:sql :desc]
  [driver [direction field]]
  [(->honeysql driver field) direction])

(defmethod apply-top-level-clause [:sql :order-by]
  [driver _ honeysql-form {subclauses :order-by}]
  (reduce h/merge-order-by honeysql-form (mapv (partial ->honeysql driver) subclauses)))

;;; -------------------------------------------------- limit & page --------------------------------------------------

(defmethod apply-top-level-clause [:sql :limit]
  [_ _ honeysql-form {value :limit}]
  (h/limit honeysql-form value))

(defmethod apply-top-level-clause [:sql :page]
  [_ _ honeysql-form {{:keys [items page]} :page}]
  (-> honeysql-form
      (h/limit items)
      (h/offset (* items (dec page)))))


;;; -------------------------------------------------- source-table --------------------------------------------------

(defmethod ->honeysql [:sql (class Table)]
  [driver table]
  (let [{table-name :name, schema :schema} table]
    (->honeysql driver (hx/identifier :table schema table-name))))

(defmethod apply-top-level-clause [:sql :source-table]
  [driver _ honeysql-form {source-table-id :source-table}]
  (h/from honeysql-form (->honeysql driver (qp.store/table source-table-id))))


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

(defn format-honeysql
  "Convert `honeysql-form` to a vector of SQL string and params, like you'd pass to JDBC."
  [driver honeysql-form]
  (try
    (binding [hformat/*subquery?* false]
      (hsql/format honeysql-form
        :quoting             (quote-style driver)
        :allow-dashed-names? true))
    (catch Throwable e
      (try
        (log/error (u/format-color 'red
                       (str (deferred-tru "Invalid HoneySQL form:")
                            "\n"
                            (u/pprint-to-str honeysql-form))))
        (finally
          (throw (ex-info (tru "Error compiling HoneySQL form")
                          {:driver driver
                           :form   honeysql-form
                           :type   qp.error-type/driver}
                          e)))))))

(defn- add-default-select
  "Add `SELECT *` to `honeysql-form` if no `:select` clause is present."
  [driver {:keys [select], [from] :from, :as honeysql-form}]
  ;; TODO - this is hacky -- we should ideally never need to add `SELECT *`, because we should know what fields to
  ;; expect from the source query, and middleware should be handling that for us
  (cond-> honeysql-form
    (empty? select) (assoc :select (let [table-identifier (if (sequential? from)
                                                            (second from)
                                                            from)
                                         [raw-identifier] (format-honeysql driver table-identifier)]
                                     (if (seq raw-identifier)
                                       [(hsql/raw (format "%s.*" raw-identifier))]
                                       [:*])))))

(defn- apply-top-level-clauses
  "`apply-top-level-clause` for all of the top-level clauses in `inner-query`, progressively building a HoneySQL form.
  Clauses are applied according to the order in `top-level-clause-application-order`."
  [driver honeysql-form inner-query]
  (->> (reduce
        (fn [honeysql-form k]
          (apply-top-level-clause driver k honeysql-form inner-query))
        honeysql-form
        (query->keys-in-application-order inner-query))
       (add-default-select driver)))

(declare apply-clauses)

(defn- apply-source-query
  "Handle a `:source-query` clause by adding a recursive `SELECT` or native query. At the time of this writing, all
  source queries are aliased as `source`."
  [driver honeysql-form {{:keys [native params], :as source-query} :source-query}]
  (assoc honeysql-form
         :from [[(if native
                   (sql-source-query native params)
                   (apply-clauses driver {} source-query))
                 (->honeysql driver (hx/identifier :table-alias source-query-alias))]]))


(defn- apply-clauses
  "Like `apply-top-level-clauses`, but handles `source-query` as well, which needs to be handled in a special way
  because it is aliased."
  [driver honeysql-form {:keys [source-query], :as inner-query}]
  (binding [*inner-query* inner-query]
    (if source-query
      (apply-top-level-clauses
       driver
       (apply-source-query driver honeysql-form inner-query)
       (dissoc inner-query :source-query))
      (apply-top-level-clauses driver honeysql-form inner-query))))

(defmulti preprocess
  "Do miscellaneous transformations to the MBQL before compiling the query. These changes are idempotent, so it is safe
  to use this function in your own implementations of [[driver/mbql->native]], if you want to apply changes to the
  same version of the query that we will ultimately be compiling."
  {:arglists '([driver inner-query]), :added "0.42.0"}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod preprocess :sql
  [_driver inner-query]
  (nest-query/nest-expressions (add/add-alias-info inner-query)))

(defn mbql->honeysql
  "Build the HoneySQL form we will compile to SQL and execute."
  [driver {inner-query :query}]
  (let [inner-query (preprocess driver inner-query)]
    (log/tracef "Compiling MBQL query\n%s" (u/pprint-to-str 'magenta inner-query))
    (u/prog1 (apply-clauses driver {} inner-query)
      (log/debugf "\nHoneySQL Form: %s\n%s" (u/emoji "🍯") (u/pprint-to-str 'cyan <>)))))

;;;; MBQL -> Native

(defn mbql->native
  "Transpile MBQL query into a native SQL statement. This is the `:sql` driver implementation
  of [[driver/mbql->native]] (actual multimethod definition is in [[metabase.driver.sql]]."
  [driver outer-query]
  (let [honeysql-form (mbql->honeysql driver outer-query)
        [sql & args]  (format-honeysql driver honeysql-form)]
    {:query sql, :params args}))



;;; DEPRECATED STUFF

(p/import-vars
 [deprecated
  *field-options*
  *source-query*
  *table-alias*
  escape-alias
  field->alias
  field->identifier
  prefix-field-alias])

;; deprecated, but we'll keep it here for now for backwards compatibility.
(defmethod ->honeysql [:sql (type Field)]
  [driver field]
  (deprecated/log-deprecation-warning driver "->honeysql [:sql (class Field)]" "0.42.0")
  (->honeysql driver [:field (:id field) nil]))

(defmethod field->identifier :sql
  [driver field]
  (deprecated/log-deprecation-warning driver `field->identifier "v0.42.0")
  (->honeysql driver field))
