(ns metabase.driver
  "Metabase Drivers handle various things we need to do with connected data warehouse databases, including things like
  introspecting their schemas and processing and running MBQL queries. Drivers must implement some or all of the
  multimethods defined below, and register themselves with a call to `register!`.

  SQL-based drivers can use the `:sql` driver as a parent, and JDBC-based SQL drivers can use `:sql-jdbc`. Both of
  these drivers define additional multimethods that child drivers should implement; see `metabase.driver.sql` and
  `metabase.driver.sql-jdbc` for more details."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.driver.impl :as impl]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.plugins.classloader :as classloader]
            [metabase.util
             [i18n :refer [deferred-tru trs tru]]
             [schema :as su]]
            [potemkin :as p]
            [schema.core :as s]
            [toucan.db :as db])
  (:import org.joda.time.DateTime))

(declare notify-database-updated)

(defn- notify-all-databases-updated
  "Send notification that all Databases should immediately release cached resources (i.e., connection pools).

  Currently only used below by `report-timezone` setter (i.e., only used when report timezone changes). Reusing pooled
  connections with the old session timezone can have weird effects, especially if report timezone is changed to nil
  (meaning subsequent queries will not attempt to change the session timezone) or something considered invalid by a
  given Database (meaning subsequent queries will fail to change the session timezone)."
  []
  (doseq [{driver :engine, id :id, :as database} (db/select 'Database)]
    (try
      (notify-database-updated driver database)
      (catch Throwable e
        (log/error e (trs "Failed to notify {0} Database {1} updated" driver id))))))

(defsetting report-timezone
  (deferred-tru "Connection timezone to use when executing queries. Defaults to system timezone.")
  :setter
  (fn [new-value]
    (setting/set-string! :report-timezone new-value)
    (notify-all-databases-updated)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 Current Driver                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:dynamic *driver*
  "Current driver (a keyword such as `:postgres`) in use by the Query Processor/tests/etc. Bind this with `with-driver`
  below. The QP binds the driver this way in the `bind-driver` middleware."
  nil)

(declare the-driver)

(defn do-with-driver
  "Impl for `with-driver`."
  [driver f]
  (binding [*driver* (the-driver driver)]
    (f)))

(defmacro with-driver
  "Bind current driver to `driver` and execute `body`.

    (driver/with-driver :postgres
      ...)"
  {:style/indent 1}
  [driver & body]
  `(do-with-driver ~driver (fn [] ~@body)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                             Driver Registration / Hierarchy / Multimethod Dispatch                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(p/import-vars [impl hierarchy register! initialized?])

(add-watch
 #'hierarchy
 nil
 (fn [_ _ _ _]
   (when (not= hierarchy impl/hierarchy)
     ;; this is a dev-facing error so no need to i18n it.
     (throw (Exception. (str "Don't alter #'metabase.driver/hierarchy directly, since it is imported from "
                             "metabase.driver.impl. Alter #'metabase.driver.impl/hierarchy instead if you need to "
                             "alter the var directly."))))))

(defn available?
  "Is this driver available for use? (i.e. should we show it as an option when adding a new database?) This is `true`
  for all registered, non-abstract drivers and false everything else.

  Note that an available driver is not necessarily initialized yet; for example lazy-loaded drivers are *registered*
  when Metabase starts up (meaning this will return `true` for them) and only initialized when first needed."
  [driver]
  ((every-pred impl/registered? impl/concrete?) driver))

(defn the-driver
  "Like Clojure core `the-ns`. Converts argument to a keyword, then loads and registers the driver if not already done,
  throwing an Exception if it fails or is invalid. Returns keyword. Note that this does not neccessarily mean the
  driver is initialized (e.g., its full implementation and deps might not be loaded into memory) -- see also
  `the-initialized-driver`.

  This is useful in several cases:

    ;; Ensuring a driver is loaded & registered
    (isa? driver/hierarchy (the-driver :postgres) (the-driver :sql-jdbc)

    ;; Accepting either strings or keywords (e.g., in API endpoints)
    (the-driver \"h2\") ; -> :h2

    ;; Ensuring a driver you are passed is valid
    (db/insert! Database :engine (name (the-driver driver)))

    (the-driver :postgres) ; -> :postgres
    (the-driver :baby)     ; -> Exception"
  [driver]
  {:pre [((some-fn keyword? string?) driver)]}
  (classloader/the-classloader)
  (let [driver (keyword driver)]
    (impl/load-driver-namespace-if-needed! driver)
    driver))

(defn add-parent!
  "Add a new parent to `driver`."
  [driver new-parent]
  (when-not *compile-files*
    (impl/load-driver-namespace-if-needed! driver)
    (impl/load-driver-namespace-if-needed! new-parent)
    (alter-var-root #'impl/hierarchy derive driver new-parent)))

(defn- dispatch-on-uninitialized-driver
  "Dispatch function to use for driver multimethods. Dispatches on first arg, a driver keyword; loads that driver's
  namespace if not already done. DOES NOT INITIALIZE THE DRIVER.

  Driver multimethods for abstract drivers like `:sql` or `:sql-jdbc` should use `dispatch-on-initialized-driver` to
  ensure the driver is initialized (i.e., its method implementations will be loaded)."
  [driver & _]
  (the-driver driver))

(declare initialize!)

(defn the-initialized-driver
  "Like `the-driver`, but also initializes the driver if not already initialized."
  [driver]
  (let [driver (the-driver driver)]
    (impl/initialize-if-needed! driver initialize!)
    driver))

(defn dispatch-on-initialized-driver
  "Like `dispatch-on-uninitialized-driver`, but guarantees a driver is initialized before dispatch. Prefer `the-driver`
  for trivial methods that should do not require the driver to be initialized (e.g., ones that simply return
  information about the driver, but do not actually connect to any databases.)"
  [driver & _]
  (the-initialized-driver driver))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Interface (Multimethod Defintions)                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Methods a driver can implement. Not all of these are required; some have default implementations immediately below
;; them.
;;
;; SOME TIPS:
;;
;; To call the Clojure equivalent of the superclass implementation of a method, use `get-method` with the parent driver:
;;
;;    (driver/register-driver! :my-driver, :parent :sql-jdbc)
;;
;;    (defmethod driver/describe-table :my-driver [driver database table]
;;      (-> ((get-method driver/describe-table :sql-jdbc) driver databse table)
;;          (update :tables add-materialized-views)))
;;
;; Make sure to pass along the `driver` parameter-as when you call other methods, rather than hardcoding the name of
;; the current driver (e.g. `:my-driver` in the example above). This way if other drivers use your driver as a parent
;; in the future their implementations of any methods called by those methods will get used.

(defmulti initialize!
  "DO NOT CALL THIS METHOD DIRECTLY. Called automatically once and only once the first time a non-trivial driver method
  is called; implementers should do one-time initialization as needed (for example, registering JDBC drivers used
  internally by the driver.)

  'Trivial' methods include a tiny handful of ones like `connection-properties` that simply provide information about
  the driver, but do not connect to databases; these can be be supplied, for example, by a Metabase plugin manifest
  file (which is supplied for lazy-loaded drivers). Methods that require connecting to a database dispatch off of
  `the-initialized-driver`, which will initialize a driver if not already done so.

  You will rarely need to write an implentation for this method yourself. A lazy-loaded driver (like most of the
  Metabase drivers in v1.0 and above) are automatiaclly given an implentation of this method that performs the
  `init-steps` specified in the plugin manifest (such as loading namespaces in question).

  If you do need to implement this method yourself, you do not need to call parent implementations. We'll take care of
  that for you."
  {:arglists '([driver])}
  dispatch-on-uninitialized-driver
  ;; VERY IMPORTANT: Unlike all other driver multimethods, we DO NOT use the driver hierarchy for dispatch here. Why?
  ;; We do not want a driver to inherit parent drivers' implementations and have those implementations end up getting
  ;; called multiple times. If a driver does not implement `initialize!`, *always* fall back to the default no-op
  ;; implementation.
  ;;
  ;; `initialize-if-needed!` takes care to make sure a driver's parent(s) are initialized before initializing a driver.
  )

(defmethod initialize! :default [_]) ; no-op


(defmulti display-name
  "A nice name for the driver that we'll display to in the admin panel, e.g. \"PostgreSQL\" for `:postgres`. Default
  implementation capitializes the name of the driver, e.g. `:presto` becomes \"Presto\".

  When writing a driver that you plan to ship as a separate, lazy-loading plugin (including core drivers packaged this
  way, like SQLite), you do not need to implement this method; instead, specifiy it in your plugin manifest, and
  `lazy-loaded-driver` will create an implementation for you. Probably best if we only have one place where we set
  values for this."
  {:arglists '([driver])}
  dispatch-on-uninitialized-driver
  :hierarchy #'hierarchy)

(defmethod display-name :default [driver]
  (str/capitalize (name driver)))


(defmulti can-connect?
  "Check whether we can connect to a `Database` with `details-map` and perform a simple query. For example, a SQL
  database might try running a query like `SELECT 1;`. This function should return truthy if a connection to the DB
  can be made successfully, otherwise it should return falsey or throw an appropriate Exception. Exceptions if a
  connection cannot be made."
  {:arglists '([driver details])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti ^{:deprecated "0.34.2"} date-add
  "DEPRECATED -- this method is only used or implemented by `:sql` drivers. It has been superseded by
  `metabase.driver.sql.query-processor/add-interval-honeysql-form`. Use/implement that method instead. DO NOT use or
  implement this method for non-`:sql` drivers.

  This method will be removed at some point in the future."
  {:arglists '([driver hsql-form amount unit])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)


(defmulti describe-database
  "Return a map containing information that describes all of the tables in a `database`, an instance of the `Database`
  model. It is expected that this function will be peformant and avoid draining meaningful resources of the database.
  Results should match the `metabase.sync.interface/DatabaseMetadata` schema."
  {:arglists '([driver database])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)


(defmulti describe-table
  "Return a map containing information that describes the physical schema of `table` (i.e. the fields contained
  therein). `database` will be an instance of the `Database` model; and `table`, an instance of the `Table` model. It is
  expected that this function will be peformant and avoid draining meaningful resources of the database. Results
  should match the `metabase.sync.interface/TableMetadata` schema."
  {:arglists '([driver database table])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)


(defmulti describe-table-fks
  "Return information about the foreign keys in a `table`. Required for drivers that support `:foreign-keys`. Results
  should match the `metabase.sync.interface/FKMetadata` schema."
  {:arglists '([this database table])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod describe-table-fks ::driver [_ _ _]
  nil)


(def ConnectionDetailsProperty
  "Schema for a map containing information about a connection property we should ask the user to supply when setting up
  a new database, as returned by an implementation of `connection-properties`."
  (s/constrained
   {
    ;; The key that should be used to store this property in the `details` map.
    :name su/NonBlankString

    ;; Human-readable name that should be displayed to the User in UI for editing this field.
    :display-name su/NonBlankString

    ;; Type of this property. Defaults to `:string` if unspecified.
    ;; `:select` is a `String` in the backend.
    (s/optional-key :type) (s/enum :string :integer :boolean :password :select :text)

    ;; A default value for this field if the user hasn't set an explicit value. This is shown in the UI as a
    ;; placeholder.
    (s/optional-key :default) s/Any

    ;; Placeholder value to show in the UI if user hasn't set an explicit value. Similar to `:default`, but this value
    ;; is *not* saved to `:details` if no explicit value is set. Since `:default` values are also shown as
    ;; placeholders, you cannot specify both `:default` and `:placeholder`.
    (s/optional-key :placeholder) s/Any

    ;; Is this property required? Defaults to `false`.
    (s/optional-key :required?) s/Bool

    ;; Any options for `:select` types
    (s/optional-key :options) {s/Keyword s/Str}}

   (complement (every-pred #(contains? % :default) #(contains? % :placeholder)))
   "connection details that does not have both default and placeholder"))

(defmulti connection-properties
  "Return information about the connection properties that should be exposed to the user for databases that will use
  this driver. This information is used to build the UI for editing a Database `details` map, and for validating it on
  the backend. It should include things like `host`, `port`, and other driver-specific parameters. Each property must
  conform to the `ConnectionDetailsProperty` schema above.

  There are several definitions for common properties available in the `metabase.driver.common` namespace, such as
  `default-host-details` and `default-port-details`. Prefer using these if possible.

  Like `display-name`, lazy-loaded drivers should specify this in their plugin manifest; `lazy-loaded-driver` will
  automatically create an implementation for you."
  {:arglists '([driver])}
  dispatch-on-uninitialized-driver
  :hierarchy #'hierarchy)

(defmulti execute-reducible-query
  "Execute a native query against that database and return rows that can be reduced using `transduce`/`reduce`.

  Pass metadata about the columns and the reducible object to `respond`, which has the signature

    (respond results-metadata rows)

  You can use `qp.reducible/reducible-rows` to create reducible, streaming results.

  Example impl:

    (defmethod reducible-query :my-driver
      [_ query context respond]
      (with-open [results (run-query! query)]
        (respond
         {:cols [{:name \"my_col\"}]}
         (qp.reducible/reducible-rows (get-row results) (context/canceled-chan context)))))"
  {:added "0.35.0", :arglists '([driver query context respond])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(def driver-features
  "Set of all features a driver can support."
  #{
    ;; Does this database support foreign key relationships?
    :foreign-keys

    ;; Does this database support nested fields (e.g. Mongo)?
    :nested-fields

    ;; Does this driver support setting a timezone for the query?
    :set-timezone

    ;; Does the driver support *basic* aggregations like `:count` and `:sum`? (Currently, everything besides standard
    ;; deviation is considered \"basic\"; only GA doesn't support this).
    ;;
    ;; DEFAULTS TO TRUE.
    :basic-aggregations

    ;; Does this driver support standard deviation and variance aggregations?
    :standard-deviation-aggregations

    ;; Does this driver support expressions (e.g. adding the values of 2 columns together)?
    :expressions

    ;; Does this driver support parameter substitution in native queries, where parameter expressions are replaced
    ;; with a single value? e.g.
    ;;
    ;;    SELECT * FROM table WHERE field = {{param}}
    ;;    ->
    ;;    SELECT * FROM table WHERE field = 1
    :native-parameters

    ;; Does the driver support using expressions inside aggregations? e.g. something like \"sum(x) + count(y)\" or
    ;; \"avg(x + y)\"
    :expression-aggregations

    ;; Does the driver support using a query as the `:source-query` of another MBQL query? Examples are CTEs or
    ;; subselects in SQL queries.
    :nested-queries

    ;; Does the driver support binning as specified by the `binning-strategy` clause?
    :binning

    ;; Does this driver not let you specify whether or not our string search filter clauses (`:contains`,
    ;; `:starts-with`, and `:ends-with`, collectively the equivalent of SQL `LIKE`) are case-senstive or not? This
    ;; informs whether we should present you with the 'Case Sensitive' checkbox in the UI. At the time of this writing
    ;; SQLite, SQLServer, and MySQL do not support this -- `LIKE` clauses are always case-insensitive.
    ;;
    ;; DEFAULTS TO TRUE.
    :case-sensitivity-string-filter-options

    :left-join
    :right-join
    :inner-join
    :full-join

    :regex

    ;; Does the driver support advanced math expressions such as log, power, ...
    :advanced-math-expressions

    ;; Does the driver support percentile calculations (including median)
    :percentile-aggregations})

(defmulti supports?
  "Does this driver support a certain `feature`? (A feature is a keyword, and can be any of the ones listed above in
  `driver-features`.)

    (supports? :postgres :set-timezone) ; -> true"
  {:arglists '([driver feature])}
  (fn [driver feature]
    (when-not (driver-features feature)
      (throw (Exception. (tru "Invalid driver feature: {0}" feature))))
    [(dispatch-on-initialized-driver driver) feature])
  :hierarchy #'hierarchy)

(defmethod supports? :default [_ _] false)

(defmethod supports? [::driver :basic-aggregations] [_ _] true)

(defmethod supports? [::driver :case-sensitivity-string-filter-options] [_ _] true)


(defmulti ^:deprecated format-custom-field-name
  "Prior to Metabase 0.33.0, you could specifiy custom names for aggregations in MBQL by wrapping the clause in a
  `:named` clause:

    [:named [:count] \"My Count\"]

  This name was used for both the `:display_name` in the query results, and for the `:name` used as an alias in the
  query (e.g. the right-hand side of a SQL `AS` expression). Because some custom display names weren't allowed by some
  drivers, or would be transformed in some way (for example, Redshift always lowercases custom aliases), this method
  was needed so we could match the name we had given the column with the one in the query results.

  In 0.33.0, we started using `:named` internally to alias aggregations in middleware in *all* queries to prevent
  issues with referring to multiple aggregations of the same type when that query was used as a source query.
  See [#9767](https://github.com/metabase/metabase/issues/9767) for more details. After this change, it became
  desirable to differentiate between such internally-generated aliases and display names, which need not be used in
  the query at all; thus in MBQL 1.3.0 [`:named` was replaced by the more general
  `:aggregation-options`](https://github.com/metabase/mbql/pull/7). Because user-generated names are no longer used as
  aliases in native queries themselves, this method is no longer needed and will be removed in a future release."
  {:arglists '([driver custom-field-name])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod format-custom-field-name ::driver [_ custom-field-name]
  custom-field-name)


(defmulti humanize-connection-error-message
  "Return a humanized (user-facing) version of an connection error message.
  Generic error messages are provided in `metabase.driver.common/connection-error-messages`; return one of these
  whenever possible.
  Error messages can be strings, or localized strings, as returned by `metabase.util.i18n/trs` and
  `metabase.util.i18n/tru`."
  {:arglists '([this message])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod humanize-connection-error-message ::driver [_ message]
  message)


(defmulti mbql->native
  "Transpile an MBQL query into the appropriate native query form. `query` will match the schema for an MBQL query in
  `metabase.mbql.schema/Query`; this function should return a native query that conforms to that schema.

  If the underlying query language supports remarks or comments, the driver should use `query->remark` to generate an
  appropriate message and include that in an appropriate place; alternatively a driver might directly include the
  query's `:info` dictionary if the underlying language is JSON-based.

  The result of this function will be passed directly into calls to `execute-reducible-query`.

  For example, a driver like Postgres would build a valid SQL expression and return a map such as:

    {:query \"-- Metabase card: 10 user: 5
              SELECT * FROM my_table\"}"
  {:arglists '([driver query]), :style/indent 1}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)


(defmulti splice-parameters-into-native-query
  "For a native query that has separate parameters, such as a JDBC prepared statement, e.g.

    {:query \"SELECT * FROM birds WHERE name = ?\", :params [\"Reggae\"]}

  splice the parameters in to the native query as literals so it can be executed by the user, e.g.

    {:query \"SELECT * FROM birds WHERE name = 'Reggae'\"}

  This is used to power features such as 'Convert this Question to SQL' in the Query Builder. Normally when executing
  the query we'd like to leave the statement as a prepared one and pass parameters that way instead of splicing them
  in as literals so as to avoid SQL injection vulnerabilities. Thus the results of this method are not normally
  executed by the Query Processor when processing an MBQL query. However when people convert a
  question to SQL they can see what they will be executing and edit the query as needed.

  Input to this function follows the same shape as output of `mbql->native` -- that is, it will be a so-called 'inner'
  native query, with `:query` and `:params` keys, as in the example code above; output should be of the same format.
  This method might be called even if no splicing needs to take place, e.g. if `:params` is empty; implementations
  should be sure to handle this situation correctly.

  For databases that do not feature concepts like 'prepared statements', this method need not be implemented; the
  default implementation is an identity function."
  {:arglists '([driver query]), :style/indent 1}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod splice-parameters-into-native-query ::driver
  [_ query]
  query)


;; TODO - we should just have some sort of `core.async` channel to handle DB update notifications instead
(defmulti notify-database-updated
  "Notify the driver that the attributes of a `database` have changed, or that `database was deleted. This is
  specifically relevant in the event that the driver was doing some caching or connection pooling; the driver should
  release ALL related resources when this is called."
  {:arglists '([driver database])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod notify-database-updated ::driver [_ _]
  nil) ; no-op


(defmulti sync-in-context
  "Drivers may provide this function if they need to do special setup before a sync operation such as
  `sync-database!`. The sync operation itself is encapsulated as the lambda `f`, which must be called with no arguments.

    (defn sync-in-context [driver database f]
      (with-connection [_ database]
        (f)))"
  {:arglists '([driver database f]), :style/indent 2}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod sync-in-context ::driver [_ _ f] (f))


(defmulti table-rows-seq
  "Return a sequence of *all* the rows in a given `table`, which is guaranteed to have at least `:name` and `:schema`
  keys. (It is guaranteed to satisfy the `DatabaseMetadataTable` schema in `metabase.sync.interface`.) Currently, this
  is only used for iterating over the values in a `_metabase_metadata` table. As such, the results are not expected to
  be returned lazily. There is no expectation that the results be returned in any given order.

  This method is currently only used by the H2 driver to load the Sample Dataset, so it is not neccesary for any other
  drivers to implement it at this time."
  {:arglists '([driver database table])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti db-default-timezone
  "Return the *system* timezone ID name of this database, i.e. the timezone that local dates/times/datetimes are
  considered to be in by default. Ideally, this method should return a timezone ID like `America/Los_Angeles`, but an
  offset formatted like `-08:00` is acceptable in cases where the actual ID cannot be provided."
  {:added "0.34.0", :arglists '(^java.lang.String [driver database])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod db-default-timezone ::driver [_ _] nil)

;; TIMEZONE FIXME — remove this method entirely
(defmulti current-db-time
  "Return the current time and timezone from the perspective of `database`. You can use
  `metabase.driver.common/current-db-time` to implement this. This should return a Joda-Time `DateTime`.

  DEPRECATED — the only thing this method is ultimately used for is to determine the DB's system timezone.
  `db-default-timezone` has been introduced as an intended replacement for this method; implement it instead. This
  method will be removed in a future release."
  {:deprecated "0.34.0", :arglists '(^org.joda.time.DateTime [driver database])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod current-db-time ::driver [_ _] nil)

(defmulti substitute-native-parameters
  "For drivers that support `:native-parameters`. Substitute parameters in a normalized 'inner' native query.

    {:query \"SELECT count(*) FROM table WHERE id = {{param}}\"
     :template-tags {:param {:name \"param\", :display-name \"Param\", :type :number}}
     :parameters    [{:type   :number
                      :target [:variable [:template-tag \"param\"]]
                      :value  2}]}
    ->
    {:query \"SELECT count(*) FROM table WHERE id = 2\"}

  Much of the implementation for this method is shared across drivers and lives in the
  `metabase.driver.common.parameters.*` namespaces. See the `:sql` and `:mongo` drivers for sample implementations of
  this method.`Driver-agnostic end-to-end native parameter tests live in
  `metabase.query-processor-test.parameters-test` and other namespaces."
  {:arglists '([driver inner-query])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti default-field-order
  "Return how fields should be sorted by default for this database."
  {:added "0.36.0" :arglists '([driver])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod default-field-order ::driver [_] :database)
