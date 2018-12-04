(ns metabase.driver
  "Metabase Drivers handle various things we need to do with connected data warehouse databases, including things like
  introspecting their schemas and processing and running MBQL queries. Drivers must implement some or all of the
  multimethods defined below, and register themselves with a call to `regsiter!`.

  SQL-based drivers can use the `:sql` driver as a parent, and JDBC-based SQL drivers can use `:sql-jdbc`. Both of
  these drivers define additional multimethods that child drivers should implement; see `metabase.driver.sql` and
  `metabase.driver.sql-jdbc` for more details."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.models.setting :refer [defsetting]]
            [metabase.util :as u]
            [metabase.util
             [date :as du]
             [i18n :refer [trs tru]]
             [schema :as su]]
            [schema.core :as s]))

(defsetting report-timezone (tru "Connection timezone to use when executing queries. Defaults to system timezone."))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 Current Driver                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:dynamic *driver*
  "Current driver (a keyword such as `:postgres`) in use by the Query Processor/tests/etc. Bind this with `with-driver`
  below. The QP binds the driver this way in the `bind-driver` middleware."
  nil)

(defmacro with-driver
  "Bind current driver to `driver` and execute `body`.

    (driver/with-driver :postgres
      ...)"
  {:style/indent 1}
  [driver & body]
  `(binding [*driver* ~driver]
     ~@body))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Driver Registration / Hierarchy                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defonce ^{:doc "Driver hierarchy. Used by driver multimethods for dispatch. Add new drivers with `regsiter!`."}
  hierarchy
  (make-hierarchy))

(defn registered?
  "Is `driver` a valid registered driver?"
  [driver]
  (isa? hierarchy driver ::driver))

(defn abstract?
  "Is `driver` an abstract \"base class\"?"
  [driver]
  (not (isa? hierarchy driver ::concrete)))

(defn- driver->expected-namespace [driver]
  (symbol
   (or (namespace driver)
       (str "metabase.driver." (name driver)))))

(defonce ^:private require-lock (Object.))

(defn- require-driver-ns [driver & require-options]
  (let [expected-ns (driver->expected-namespace driver)]
    ;; acquire an exclusive lock FOR THIS THREAD to make sure no other threads simultaneously call `require` when
    ;; loading drivers; e.g. if multiple queries are launched at once requiring different drivers.
    (locking require-lock
      (log/debug (trs "Loading driver {0} {1}"
                      (u/format-color 'blue driver) (apply list 'require expected-ns require-options)))
      (apply require expected-ns require-options))))

(defn- load-driver-namespace-if-needed
  "Load the expected namespace for a `driver` if it has not already been registed. This only works for core Metabase
  drivers, whose namespaces follow an expected pattern; drivers provided by 3rd-party plugins are expected to register
  themselves in their plugin initialization code.

  You should almost never need to do this directly; it is handled automatically when dispatching on a driver and by
  `register!` below (for parent drivers) and by `driver.u/database->driver` for drivers that have not yet been
  loaded."
  [driver]
  (when-not (registered? driver)
    (du/profile (trs "Load driver {0}" driver)
     (require-driver-ns driver)
     ;; ok, hopefully it was registered now. If not, try again, but reload the entire driver namespace
     (when-not (registered? driver)
       (require-driver-ns driver :reload)
       ;; if *still* not registered, throw an Exception
       (when-not (registered? driver)
         (throw (Exception. (str (tru "Driver not registered after loading: {0}" driver)))))))))

(defn the-driver
  "Like Clojure core `the-ns`. Converts argument to a keyword, then loads and registers the driver if not already done,
  throwing an Exception if it fails or is invalid. Returns keyword.

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
  (let [driver (keyword driver)]
    (load-driver-namespace-if-needed driver)
    driver))

(defn- check-abstractness-hasnt-changed
  "Check to make sure we're not trying to change the abstractness of an already registered driver"
  [driver new-abstract?]
  (let [old-abstract? (abstract? driver)]
    (when (and (registered? driver) (not= (boolean old-abstract?) (boolean new-abstract?)))
      (throw (Exception. (str (tru "Error: attempting to change {0} property `:abstract?` from {1} to {2}."
                                   driver old-abstract? new-abstract?)))))))

(defn add-parent!
  "Add a new parent to `driver`."
  [driver new-parent]
  (load-driver-namespace-if-needed driver)
  (load-driver-namespace-if-needed new-parent)
  (alter-var-root #'hierarchy derive driver new-parent))

(defn register!
  "Register a driver.

    (register! :sql, :abstract? true)

    (register! :postgres, :parent :sql-jdbc)

  Valid options are:

  ###### `:parent` (default = none)

  Parent driver(s) to derive from. Drivers inherit method implementations from their parents similar to the way
  inheritance works in OOP. Specify multiple direct parents by passing a collection of parents.

  You can add additional parents to a driver using `add-parent!` below; this is how test extensions are implemented.

  ###### `:abstract?` (default = false)

  Is this an abstract driver (i.e. should we hide it in the admin interface, and disallow running queries with it)?

  Note that because concreteness is implemented as part of our keyword hierarchy it is not currently possible to
  create an abstract driver with a concrete driver as its parent, since it would still ultimately derive from
  `::concrete`."
  [driver & {:keys [parent abstract?]}]
  {:pre [(keyword? driver)]}
  ;; validate that the registration isn't stomping on things
  (check-abstractness-hasnt-changed driver abstract?)
  ;; ok, if that was successful we can derive the driver from `::driver`/`::concrete` and parent(s)
  (let [derive! (partial alter-var-root #'hierarchy derive driver)]
    (derive! ::driver)
    (when-not abstract?
      (derive! ::concrete))
    (doseq [parent (cond
                     (coll? parent) parent
                     parent         [parent])
            :when  parent]
      (load-driver-namespace-if-needed parent)
      (derive! parent)))
  ;; ok, log our great success
  (when-not (metabase.driver/abstract? driver)
    (log/info (trs "Registered driver {0} {1}" (u/format-color 'blue driver) (u/emoji "🚚")))))

(defn dispatch-on-driver
  "Dispatch function to use for driver multimethods. Dispatches on first arg, a driver keyword; loads that driver's
  namespace if not already done."
  [x & _]
  (the-driver x))


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

(defmulti available?
  "Is this driver available for use? (i.e. should we show it as an option when adding a new database?) This is `true` by
  default for all non-abstract driver types and false for abstract ones; some drivers might want to override this to
  return false even if the driver isn't abstract -- for example, the Oracle driver might return false if the JDBC
  driver it depends on is not available.

  This method is also used in tests to determine whether the standard set of Query Processor tests should
  automatically against it; for one-off test drivers to test specific functionality, you should return `false`."
  {:arglists '([driver])}
  dispatch-on-driver
  :hierarchy #'hierarchy)

(defmethod available? ::driver [driver]
  (isa? hierarchy driver ::concrete))


(defmulti display-name
  "A nice name for the driver that we'll display to in the admin panel, e.g. \"PostgreSQL\" for `:postgres`. Default
  implementation capitializes the name of the driver, e.g. `:presto` becomes \"Presto\"."
  {:arglists '([driver])}
  dispatch-on-driver
  :hierarchy #'hierarchy)

(defmethod display-name :default [driver]
  (str/capitalize (name driver)))


(defmulti can-connect?
  "Check whether we can connect to a `Database` with DETAILS-MAP and perform a simple query. For example, a SQL
  database might try running a query like `SELECT 1;`. This function should return `true` or `false`."
  {:arglists '([driver details])}
  dispatch-on-driver
  :hierarchy #'hierarchy)


(defmulti date-interval
  "Return an driver-appropriate representation of a moment relative to the current moment in time. By default, this
  returns an `Timestamp` by calling `metabase.util.date/relative-date`; but when possible drivers should return a
  native form so we can be sure the correct timezone is applied. For example, SQL drivers should return a HoneySQL
  form to call the appropriate SQL fns:

    (date-interval :postgres :month 1) -> (hsql/call :+ :%now (hsql/raw \"INTERVAL '1 month'\"))"
  {:arglists '([driver unit amount])}
  dispatch-on-driver
  :hierarchy #'hierarchy)

(defmethod date-interval ::driver [_ unit amount]
  (du/relative-date unit amount))


(defmulti describe-database
  "Return a map containing information that describes all of the tables in a `database`, an instance of the `Database`
  model. It is expected that this function will be peformant and avoid draining meaningful resources of the database.
  Results should match the `DatabaseMetadata` schema."
  {:arglists '([driver database])}
  dispatch-on-driver
  :hierarchy #'hierarchy)


(defmulti describe-table
  "Return a map containing information that describes the physical schema of `table` (i.e. the fields contained
  therein). `database` will be an instance of the `Database` model; and `table` an instance of the `Table` model. It is
  expected that this function will be peformant and avoid draining meaningful resources of the database. Results
  should match the `TableMetadata` schema."
  {:arglists '([driver database table])}
  dispatch-on-driver
  :hierarchy #'hierarchy)


(defmulti describe-table-fks
  "Return information about the foreign keys in a `table`. Required for drivers that support `:foreign-keys`. Results
  should match the `FKMetadata` schema."
  {:arglists '([this database table])}
  dispatch-on-driver
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
    (s/optional-key :type) (s/enum :string :integer :boolean :password)

    ;; A default value for this field if the user hasn't set an explicit value. This is shown in the UI as a
    ;; placeholder.
    (s/optional-key :default) s/Any

    ;; Placeholder value to show in the UI if user hasn't set an explicit value. Similar to `:default`, but this value
    ;; is *not* saved to `:details` if no explicit value is set. Since `:default` values are also shown as
    ;; placeholders, you cannot specify both `:default` and `:placeholder`.
    (s/optional-key :placeholder) s/Any

    ;; Is this property required? Defaults to `false`.
    (s/optional-key :required?) s/Bool}

   (complement (every-pred #(contains? % :default) #(contains? % :placeholder)))
   "connection details that does not have both default and placeholder"))

(defmulti connection-properties
  "Return information about the connection properties that should be exposed to the user for databases that will use
  this driver. This information is used to build the UI for editing a Database `details` map, and for validating it on
  the backend. It should include things like `host`, `port`, and other driver-specific parameters. Each property must
  conform to the `ConnectionDetailsProperty` schema above.

  There are several definitions for common properties available in the `metabase.driver.common` namespace, such as
  `default-host-details` and `default-port-details`. Prefer using these if possible."
  {:arglists '([driver])}
  dispatch-on-driver
  :hierarchy #'hierarchy)


(defmulti execute-query
  "Execute a *native* query against the database and return the results.

  The query passed in will conform to the schema in `metabase.mbql.schema/Query`. MBQL queries are transformed to
  native queries via the `mbql->native` QP middleware, which in turn calls this driver's implementation of
  `mbql->native` before reaching this method.

  Results should look like:

    {:columns [\"id\", \"name\"]
     :rows    [[1 \"Lucky Bird\"]
               [2 \"Rasta Can\"]]}"
  {:arglists '([driver query]), :style/indent 1}
  dispatch-on-driver
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

    ;; Does this driver support standard deviation aggregations?
    :standard-deviation-aggregations

    ;; Does this driver support expressions (e.g. adding the values of 2 columns together)?
    :expressions

    ;; Does the driver support parameter substitution on native queries?
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
    :case-sensitivity-string-filter-options})

(defmulti supports?
  "Does this driver support a certain `feature`? (A feature is a keyword, and can be any of the ones listed above in
  `driver-features`.)

    (supports? :postgres :set-timezone) ; -> true"
  {:arglists '([driver feature])}
  (fn [driver feature]
    (when-not (driver-features feature)
      (throw (Exception. (str (tru "Invalid driver feature: {0}" feature)))))
    [(dispatch-on-driver driver) feature])
  :hierarchy #'hierarchy)

(defmethod supports? :default [_ _] false)

(defmethod supports? [::driver :basic-aggregations] [_ _] true)

(defmethod supports? [::driver :case-sensitivity-string-filter-options] [_ _] true)


(defmulti format-custom-field-name
  "Return the custom name passed via an MBQL `:named` clause so it matches the way it is returned in the results. This
  is used by the post-processing annotation stage to find the correct metadata to include with fields in the results.
  The default implementation is `identity`, meaning the resulting field will have exactly the same name as passed to
  the `:named` clause. Certain drivers like Redshift always lowercase these names, so this method is provided for
  those situations."
  {:arglists '([driver custom-field-name])}
  dispatch-on-driver
  :hierarchy #'hierarchy)

(defmethod format-custom-field-name ::driver [_ custom-field-name]
  custom-field-name)


(defmulti ^String humanize-connection-error-message
  "Return a humanized (user-facing) version of an connection error message string. Generic error messages are provided
  in `metabase.driver.common/connection-error-messages`; return one of these whenever possible."
  {:arglists '([this message])}
  dispatch-on-driver
  :hierarchy #'hierarchy)

(defmethod humanize-connection-error-message ::driver [_ message]
  message)


(defmulti mbql->native
  "Transpile an MBQL query into the appropriate native query form. `query` will match the schema for an MBQL query in
  `metabase.mbql.schema/Query`; this function should return a native query that conforms to that schema.

  If the underlying query language supports remarks or comments, the driver should use `query->remark` to generate an
  appropriate message and include that in an appropriate place; alternatively a driver might directly include the
  query's `:info` dictionary if the underlying language is JSON-based.

  The result of this function will be passed directly into calls to `execute-query`.

  For example, a driver like Postgres would build a valid SQL expression and return a map such as:

    {:query \"-- Metabase card: 10 user: 5
              SELECT * FROM my_table\"}"
  {:arglists '([driver query])}
  dispatch-on-driver
  :hierarchy #'hierarchy)


(defmulti notify-database-updated
  "Notify the driver that the attributes of a `database` have changed, or that `database was deleted. This is
  specifically relevant in the event that the driver was doing some caching or connection pooling; the driver should
  release ALL related resources when this is called."
  {:arglists '([driver database])}
  dispatch-on-driver
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
  dispatch-on-driver
  :hierarchy #'hierarchy)

(defmethod sync-in-context ::driver [_ _ f] (f))


(defmulti process-query-in-context
  "Similar to `sync-in-context`, but for running queries rather than syncing. This should be used to do things like
  open DB connections that need to remain open for the duration of post-processing. This function follows a middleware
  pattern and is injected into the QP middleware stack immediately after the Query Expander; in other words, it will
  receive the expanded query. See the Mongo and H2 drivers for examples of how this is intended to be used.

       (defn process-query-in-context [driver qp]
         (fn [query]
           (qp query)))"
  {:arglists '([driver qp])}
  dispatch-on-driver
  :hierarchy #'hierarchy)

(defmethod process-query-in-context ::driver [_ qp] qp)


(defmulti table-rows-seq
  "Return a sequence of *all* the rows in a given TABLE, which is guaranteed to have at least `:name` and `:schema`
  keys. (It is guaranteed to satisfy the `DatabaseMetadataTable` schema in `metabase.sync.interface`.) Currently, this
  is only used for iterating over the values in a `_metabase_metadata` table. As such, the results are not expected to
  be returned lazily. There is no expectation that the results be returned in any given order.

  This method is currently only used by the H2 driver to load the Sample Dataset, so it is not neccesary for any other
  drivers to implement it at this time."
  {:arglists '([driver database table])}
  dispatch-on-driver
  :hierarchy #'hierarchy)

(defmulti current-db-time
  "Return the current time and timezone from the perspective of `database`. You can use
  `metabase.driver.common/current-db-time` to implement this."
  {:arglists '([driver database])}
  dispatch-on-driver
  :hierarchy #'hierarchy)

(defmethod current-db-time ::driver [_ _] nil)
