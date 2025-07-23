#_{:clj-kondo/ignore [:metabase/namespace-name]}
(ns metabase.driver
  "Metabase Drivers handle various things we need to do with connected data warehouse databases, including things like
   introspecting their schemas and processing and running MBQL queries. Drivers must implement some or all of the
   multimethods defined below, and register themselves with a call to [[metabase.driver/register!]].

   SQL-based drivers can use the `:sql` driver as a parent, and JDBC-based SQL drivers can use `:sql-jdbc`. Both of
   these drivers define additional multimethods that child drivers should implement; see [[metabase.driver.sql]] and
   [[metabase.driver.sql-jdbc]] for more details."
  #_{:clj-kondo/ignore [:metabase/modules]}
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.auth-provider.core :as auth-provider]
   [metabase.classloader.core :as classloader]
   [metabase.driver.impl :as driver.impl]
   [metabase.driver.settings]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(comment metabase.driver.settings/keep-me)

(p/import-vars
 [metabase.driver.settings
  report-timezone
  report-timezone!])

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
  {:pre [(keyword? driver)]}
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

(p/import-vars [driver.impl hierarchy register! initialized?])

(add-watch
 #'hierarchy
 nil
 (fn [_key _ref _old-state _new-state]
   (when (not= hierarchy driver.impl/hierarchy)
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
  ((every-pred driver.impl/registered? driver.impl/concrete?) driver))

(defn the-driver
  "Like [[clojure.core/the-ns]]. Converts argument to a keyword, then loads and registers the driver if not already done,
  throwing an Exception if it fails or is invalid. Returns keyword. Note that this does not neccessarily mean the
  driver is initialized (e.g., its full implementation and deps might not be loaded into memory) -- see also
  [[the-initialized-driver]].

  This is useful in several cases:

    ;; Ensuring a driver is loaded & registered
    (isa? driver/hierarchy (the-driver :postgres) (the-driver :sql-jdbc)

    ;; Accepting either strings or keywords (e.g., in API endpoints)
    (the-driver \"h2\") ; -> :h2

    ;; Ensuring a driver you are passed is valid
    (t2/insert! Database :engine (name (the-driver driver)))

    (the-driver :postgres) ; -> :postgres
    (the-driver :baby)     ; -> Exception"
  [driver]
  {:pre [((some-fn keyword? string?) driver)]}
  (classloader/the-classloader)
  (let [driver (keyword driver)]
    (driver.impl/load-driver-namespace-if-needed! driver)
    driver))

(defn add-parent!
  "Add a new parent to `driver`."
  [driver new-parent]
  (when-not *compile-files*
    (driver.impl/load-driver-namespace-if-needed! driver)
    (driver.impl/load-driver-namespace-if-needed! new-parent)
    (alter-var-root #'driver.impl/hierarchy derive driver new-parent)))

(defn- dispatch-on-uninitialized-driver
  "Dispatch function to use for driver multimethods. Dispatches on first arg, a driver keyword; loads that driver's
  namespace if not already done. DOES NOT INITIALIZE THE DRIVER.

  Driver multimethods for abstract drivers like `:sql` or `:sql-jdbc` should use [[dispatch-on-initialized-driver]] to
  ensure the driver is initialized (i.e., its method implementations will be loaded)."
  [driver & _]
  (the-driver driver))

(declare initialize!)

(defn the-initialized-driver
  "Like [[the-driver]], but also initializes the driver if not already initialized."
  [driver]
  (let [driver (keyword driver)]
    ;; Fastpath: an initialized driver `driver` is always already registered. Checking for `initialized?` is faster
    ;; than doing the `registered?` check inside `load-driver-namespace-if-needed!`.
    (when-not (driver.impl/initialized? driver)
      (driver.impl/load-driver-namespace-if-needed! driver)
      (driver.impl/initialize-if-needed! driver initialize!))
    driver))

(defn dispatch-on-initialized-driver
  "Like [[dispatch-on-uninitialized-driver]], but guarantees a driver is initialized before dispatch. Prefer
  [[the-driver]] for trivial methods that should do not require the driver to be initialized (e.g., ones that simply
  return information about the driver, but do not actually connect to any databases.)"
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

  'Trivial' methods include a tiny handful of ones like [[connection-properties]] that simply provide information
  about the driver, but do not connect to databases; these can be be supplied, for example, by a Metabase plugin
  manifest file (which is supplied for lazy-loaded drivers). Methods that require connecting to a database dispatch
  off of [[the-initialized-driver]], which will initialize a driver if not already done so.

  You will rarely need to write an implentation for this method yourself. A lazy-loaded driver (like most of the
  Metabase drivers in v1.0 and above) are automatiaclly given an implentation of this method that performs the
  `init-steps` specified in the plugin manifest (such as loading namespaces in question).

  If you do need to implement this method yourself, you do not need to call parent implementations. We'll take care of
  that for you."
  {:added "0.32.0" :arglists '([driver])}
  dispatch-on-uninitialized-driver)
  ;; VERY IMPORTANT: Unlike all other driver multimethods, we DO NOT use the driver hierarchy for dispatch here. Why?
  ;; We do not want a driver to inherit parent drivers' implementations and have those implementations end up getting
  ;; called multiple times. If a driver does not implement `initialize!`, *always* fall back to the default no-op
  ;; implementation.
  ;;
  ;; `initialize-if-needed!` takes care to make sure a driver's parent(s) are initialized before initializing a driver.

(defmethod initialize! :default [_]) ; no-op

(defmulti display-name
  "A nice name for the driver that we'll display to in the admin panel, e.g. \"PostgreSQL\" for `:postgres`. Default
  implementation capitializes the name of the driver, e.g. `:oracle` becomes \"Oracle\".

  When writing a driver that you plan to ship as a separate, lazy-loading plugin (including core drivers packaged this
  way, like SQLite), you do not need to implement this method; instead, specifiy it in your plugin manifest, and
  `lazy-loaded-driver` will create an implementation for you. Probably best if we only have one place where we set
  values for this."
  {:added "0.32.0" :arglists '([driver])}
  dispatch-on-uninitialized-driver
  :hierarchy #'hierarchy)

(defmethod display-name :default [driver]
  (str/capitalize (name driver)))

(defmulti contact-info
  "The contact information for the driver"
  {:changelog-test/ignore true :added "0.43.0" :arglists '([driver])}
  dispatch-on-uninitialized-driver
  :hierarchy #'hierarchy)

(defmethod contact-info :default
  [_]
  nil)

(defn dispatch-on-initialized-driver-safe-keys
  "Dispatch on initialized driver, except checks for `classname`,
  `subprotocol`, `connection-uri` in the details map in order to
  prevent a mismatch in spec type vs driver."
  [driver details-map]
  (let [invalid-keys #{"classname" "subprotocol" "connection-uri"}
        ks           (->> details-map keys
                          (map name)
                          (map u/lower-case-en) set)]
    (when (seq (set/intersection ks invalid-keys))
      (throw (ex-info "Cannot specify subname, protocol, or connection-uri in details map"
                      {:invalid-keys (set/intersection ks invalid-keys)})))
    (dispatch-on-initialized-driver driver)))

(defmulti can-connect?
  "Check whether we can connect to a `Database` with `details-map` and perform a simple query. For example, a SQL
  database might try running a query like `SELECT 1;`. This function should return truthy if a connection to the DB
  can be made successfully, otherwise it should return falsey or throw an appropriate Exception. Exceptions if a
  connection cannot be made. Throw an `ex-info` containing a truthy `::can-connect-message?` in `ex-data`
  in order to suppress logging expected driver validation messages during setup."
  {:added "0.32.0" :arglists '([driver details])}
  dispatch-on-initialized-driver-safe-keys
  :hierarchy #'hierarchy)

(defmulti dbms-version
  "Return a map containing information that describes the version of the DBMS. This typically includes a
  `:version` containing the (semantic) version of the DBMS as a string and potentially a `:flavor`
  specifying the flavor like `MySQL` or `MariaDB`."
  {:changelog-test/ignore true :added "0.46.0" :arglists '([driver database])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

;; Some drivers like BigQuery or Snowflake cannot provide a meaningful stable version.
(defmethod dbms-version :default
  [_ _]
  nil)

(defmulti describe-database
  "Return a map containing information that describes all of the tables in a `database`, an instance of the `Database`
  model. It is expected that this function will be peformant and avoid draining meaningful resources of the database.
  Results should match the [[metabase.sync.interface/DatabaseMetadata]] schema."
  {:added "0.32.0" :arglists '([driver database])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti describe-table
  "Return a map containing a single field `:fields` that describes the fields in a `table`. `database` will be an
  instance of the `Database` model; and `table`, an instance of the `Table` model. It is expected that this function
  will be peformant and avoid draining meaningful resources of the database. The value of `:fields` should be a set of
  values matching the [[metabase.sync.interface/TableMetadataField]] schema."
  {:added "0.32.0" :arglists '([driver database table])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti describe-fields
  "Returns a reducible collection of maps, each containing information about fields. It includes which keys are
  primary keys, but not foreign keys. It does not include nested fields (e.g. fields within a JSON column).

  Takes keyword arguments to narrow down the results to a set of
  `schema-names` or `table-names`.

  Results match [[metabase.sync.interface/FieldMetadataEntry]].
  Results are optionally filtered by `schema-names` and `table-names` provided.
  Results are ordered by `table-schema`, `table-name`, and `database-position` in ascending order."
  {:added    "0.49.1"
   :arglists '([driver database & {:keys [schema-names table-names]}])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti describe-table-indexes
  "Returns a set of map containing information about the indexes of a table.
  Currently we only sync single column indexes or the first column of a composite index.
  Results should match the [[metabase.sync.interface/TableIndexMetadata]] schema."
  {:added "0.49.0" :arglists '([driver database table])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti describe-indexes
  "Returns a reducible collection of maps, each containing information about the indexes of a database.
  Currently we only sync single column indexes or the first column of a composite index. We currently only support
   indexes on unnested fields (i.e., where parent_id is null).

  Takes keyword arguments to narrow down the results to a set of
  `schema-names` or `table-names`.

  Results match [[metabase.sync.interface/FieldIndexMetadata]].
  Results are optionally filtered by `schema-names` and `table-names` provided."
  {:added "0.51.4" :arglists '([driver database & {:keys [schema-names table-names]}])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti escape-entity-name-for-metadata
  "escaping for when calling `.getColumns` or `.getTables` on table names or schema names. Useful for when a database
  driver has difference escaping rules for table or schema names when used from metadata.

  For example, oracle treats slashes differently when querying versus when used with `.getTables` or `.getColumns`"
  {:arglists '([driver entity-name]), :added "0.37.0"}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod escape-entity-name-for-metadata :default [_driver table-name] table-name)

(defmulti describe-table-fks
  "Return information about the foreign keys in a `table`. Required for drivers that support :metadata/key-constraints
  but not :describe-fks. Results should match the [[metabase.sync.interface/FKMetadata]] schema."
  {:added "0.32.0" :deprecated "0.49.0" :arglists '([driver database table])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

#_{:clj-kondo/ignore [:deprecated-var]}
(defmethod describe-table-fks ::driver [_ _ _]
  nil)

(defmulti describe-fks
  "Returns a reducible collection of maps, each containing information about foreign keys.
  Takes optional keyword arguments to narrow down the results to a set of `schema-names`
  and `table-names`.

  Results match [[metabase.sync.interface/FKMetadataEntry]].
  Results are optionally filtered by `schema-names` and `table-names` provided.
  Results are ordered by `fk-table-schema` and `fk-table-name` in ascending order.

  Required for drivers that support `:describe-fks`."
  {:added "0.49.0" :arglists '([driver database & {:keys [schema-names table-names]}])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod describe-fks ::driver [_ _]
  nil)

(defmulti describe-routines
  "Returns a reducible collection of maps, each containing information about stored procedures and functions.
  Takes optional keyword arguments to narrow down the results to a set of `schema-names`
  and `routine-names`.

  Results match [[metabase.sync.interface/RoutineMetadataEntry]].
  Results are optionally filtered by `schema-names` and `routine-names` provided.
  Results are ordered by `schema`, `name` in ascending order.

  Required for drivers that support `:describe-routines`."
  {:added "0.58.0" :arglists '([driver database & {:keys [schema-names routine-names]}])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod describe-routines ::driver [_ _]
  nil)

;;; this is no longer used but we can leave it around for not for documentation purposes. Maybe we can actually do
;;; something useful with it like write a test that validates that drivers return correct connection details?

#_(def ConnectionDetailsProperty
    "Schema for a map containing information about a connection property we should ask the user to supply when setting up
  a new database, as returned by an implementation of `connection-properties`."
    (s/constrained
     {;; The key that should be used to store this property in the `details` map.
      :name su/NonBlankString

      ;; Human-readable name that should be displayed to the User in UI for editing this field.
      :display-name su/NonBlankString

      ;; Human-readable text that gives context about a field's input.
      (s/optional-key :helper-text) s/Str

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
  conform to the [[ConnectionDetailsProperty]] schema above.

  There are several definitions for common properties available in the [[metabase.driver.common]] namespace, such as
  `default-host-details` and `default-port-details`. Prefer using these if possible.

  Like `display-name`, lazy-loaded drivers should specify this in their plugin manifest; `lazy-loaded-driver` will
  automatically create an implementation for you."
  {:added "0.32.0" :arglists '([driver])}
  dispatch-on-uninitialized-driver
  :hierarchy #'hierarchy)

(defmulti extra-info
  "extra driver info"
  {:added "0.56.0" :arglists '([driver])}
  dispatch-on-uninitialized-driver
  :hierarchy #'hierarchy)

(defmethod extra-info ::driver [_] nil)

(defmulti execute-reducible-query
  "Execute a native query against that database and return rows that can be reduced using `transduce`/`reduce`.

  Pass metadata about the columns and the reducible object to `respond`, which has the signature

    (respond results-metadata rows)

  You can use [[metabase.query-processor.reducible/reducible-rows]] to create reducible, streaming results.

  `respond` MUST BE CALLED SYNCHRONOUSLY!!!

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

(defmulti query-result-metadata
  "Optional. Efficiently calculate metadata about the columns that would be returned if we were to run a
  `query` (hopefully without actually running), for example:

    (query-results-metadata
     :postgres
     {:lib/type :mbql/query
      :stages   [{:lib/type :mbql.stage/native
                  :native   \"SELECT * FROM venues WHERE id = ?\"
                  :args     [1]}]
      ...})
    =>
    [{:lib/type      :metadata/column
      :name          \"ID\"
      :database-type \"BIGINT\"
      :base-type     :type/BigInteger}
     {:lib/type      :metadata/column
      :name          \"NAME\"
      :database-type \"CHARACTER VARYING\"
      :base-type     :type/Text}
      ...]

  Metadata should be returned as a sequence of column maps matching the `:metabase.lib.schema.metadata/column` shape.

  This is needed in certain circumstances such as saving native queries before they have been run; metadata for
  MBQL-only queries can usually be determined by looking at the query itself without any driver involvement.

  If this method does need to be invoked, ideally it can calculate this information without actually having to run the
  query in question; it that is not possible, ideally we'd run a faster version of the query with the equivalent of
  `LIMIT 0` or `LIMIT 1`.

  A naive default implementation of this method lives in [[metabase.query-processor.metadata]] that runs the query in
  question with a `LIMIT 1` added to it. Drivers that can infer result metadata in a more performant way (i.e.,
  without actually running the query) should implement this method.

  The `:sql-jdbc` parent driver provides a default implementation for JDBC-based drivers
  in [[metabase.driver.sql-jdbc.metadata/query-result-metadata]], so you shouldn't need to implement this yourself if
  your driver derives from `:sql-jdbc`. For other drivers, please use this implementation as a reference when working
  on your own one.

  There is no guarantee that `query` is already fully compiled from MBQL to the appropriate native query
  language (e.g. SQL), so you should call [[metabase.query-processor.compile/compile]] to get a fully-compiled native
  query."
  {:added "0.51.0", :arglists '([driver query])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(def features
  "Set of all features a driver can support."
  #{;; Does this database track and enforce primary key and foreign key constraints in the schema?
    ;; Is the database capable of reporting columns as PK or FK? (Relevant during sync.)
    ;;
    ;; Not to be confused with Metabase's notion of foreign key columns. Those are user definable and power eg.
    ;; implicit joins.
    :metadata/key-constraints

    ;; Does this database support nested fields for any and every field except primary key (e.g. Mongo)?
    :nested-fields

    ;; Does this database support nested fields but only for certain field types (e.g. Postgres and JSON / JSONB columns)?
    :nested-field-columns

    ;; Does this driver support setting a timezone for the query?
    :set-timezone

    ;; Does the driver support *basic* aggregations like `:count` and `:sum`? (Currently, everything besides standard
    ;; deviation is considered \"basic\"; only GA doesn't support this).
    ;;
    ;; DEFAULTS TO TRUE.
    :basic-aggregations

    ;; Does this driver support standard deviation and variance aggregations? Note that if variance is not supported
    ;; directly, you can calculate it manually by taking the square of the standard deviation. See the MongoDB driver
    ;; for example.
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

    ;; Does the driver support expressions consisting of a single literal value like `1`, `\"hello\"`, and `false`.
    :expression-literals

    ;; Does the driver support using a query as the `:source-query` of another MBQL query? Examples are CTEs or
    ;; subselects in SQL queries.
    :nested-queries

    ;; Does this driver support native template tag parameters of type `:card`, e.g. in a native query like
    ;;
    ;;    SELECT * FROM {{card}}
    ;;
    ;; do we support substituting `{{card}}` with another compiled (nested) query?
    ;;
    ;; By default, this is true for drivers that support `:native-parameters` and `:nested-queries`, but drivers can opt
    ;; out if they do not support Card ID template tag parameters.
    :native-parameter-card-reference

    ;; Does the driver support persisting models
    :persist-models
    ;; Is persisting enabled?
    :persist-models-enabled

    ;; Does the driver support binning as specified by the `binning-strategy` clause?
    :binning

    ;; Does this driver not let you specify whether or not our string search filter clauses (`:contains`,
    ;; `:starts-with`, and `:ends-with`, collectively the equivalent of SQL `LIKE`) are case-senstive or not? This
    ;; informs whether we should present you with the 'Case Sensitive' checkbox in the UI. At the time of this writing
    ;; SQLite, SQLServer, and MySQL do not support this -- `LIKE` clauses are always case-insensitive.
    ;;
    ;; DEFAULTS TO TRUE.
    :case-sensitivity-string-filter-options

    ;; Implicit joins require :left-join (only) to work.
    :left-join
    :right-join
    :inner-join
    :full-join

    :regex

    ;; Does the driver support advanced math expressions such as log, power, ...
    :advanced-math-expressions

    ;; Does the driver support percentile calculations (including median)
    :percentile-aggregations

    ;; Does the driver support date extraction functions? (i.e get year component of a datetime column)
    ;; DEFAULTS TO TRUE
    :temporal-extract

    ;; Does the driver support doing math with datetime? (i.e Adding 1 year to a datetime column)
    ;; DEFAULTS TO TRUE
    :date-arithmetics

    ;; Does the driver support the :now function
    :now

    ;; Does the driver support converting timezone?
    ;; DEFAULTS TO FALSE
    :convert-timezone

    ;; Does the driver support :datetime-diff functions
    :datetime-diff

    ;; Does the driver support experimental "writeback" actions like "delete this row" or "insert a new row" from 44+?
    :actions

    ;; Does the driver support storing table privileges in the application database for the current user?
    :table-privileges

    ;; Does the driver support uploading files
    :uploads

    ;; Does the driver support schemas (aka namespaces) for tables
    ;; DEFAULTS TO TRUE
    :schemas

    ;; Does the driver support multi-level-schema for e.g. multicatalog support in databricks
    :multi-level-schema

    ;; Does the driver support custom writeback actions. Drivers that support this must
    ;; implement [[execute-write-query!]]
    :actions/custom

    ;; Does changing the JVM timezone allow producing correct results? (See #27876 for details.)
    :test/jvm-timezone-setting

    ;; Does the driver support connection impersonation (i.e. overriding the role used for individual queries)?
    :connection-impersonation

    ;; Does the driver require specifying the default connection role for connection impersonation to work?
    :connection-impersonation-requires-role

    ;; Does the driver require specifying a collection (table) for native queries? (mongo)
    :native-requires-specified-collection

    ;; Index sync is turned off across the application as it is not used ATM.
    ;; Does the driver support column(s) support storing index info
    :index-info

    ;; Does the driver support a faster `sync-fks` step by fetching all FK metadata in a single collection?
    ;; if so, `metabase.driver/describe-fks` must be implemented instead of `metabase.driver/describe-table-fks`
    :describe-fks

    ;; Does the driver support a faster `sync-fields` step by fetching all FK metadata in a single collection?
    ;; if so, `metabase.driver/describe-fields` must be implemented instead of `metabase.driver/describe-table`
    :describe-fields

    ;; Does the driver support a faster `sync-indexes` step by fetching all index metadata in a single collection?
    ;; If true, `metabase.driver/describe-indexes` must be implemented instead of `metabase.driver/describe-table-indexes`
    :describe-indexes

    ;; Does the driver support fetching stored procedures and functions metadata?
    ;; If true, `metabase.driver/describe-routines` must be implemented
    :describe-routines

    ;; Does the driver support automatically adding a primary key column to a table for uploads?
    ;; If so, Metabase will add an auto-incrementing primary key column called `_mb_row_id` for any table created or
    ;; updated with CSV uploads, and ignore any `_mb_row_id` column in the CSV file.
    ;; DEFAULTS TO TRUE
    :upload-with-auto-pk

    ;; Does the driver support fingerprint the fields. Default is true
    :fingerprint

    ;; Does a connection to this driver correspond to a single database (false), or to multiple databases (true)?
    ;; Default is false; ie. a single database. This is common for classic relational DBs and some cloud databases.
    ;; Some have access to many databases from one connection; eg. Athena connects to an S3 bucket which might have
    ;; many databases in it.
    :connection/multiple-databases

    ;; Does the driver support identifiers for tables and columns that contain spaces. Defaults to `false`.
    :identifiers-with-spaces

    ;; Does this driver support UUID type
    :uuid-type

    ;; Does this driver support splitting strings and extracting a part?
    :split-part

    ;; True if this driver requires `:temporal-unit :default` on all temporal field refs, even if no temporal
    ;; bucketing was specified in the query.
    ;; Generally false, but a few time-series based analytics databases (eg. Druid) require it.
    :temporal/requires-default-unit

    ;; Does this driver support window functions like cumulative count and cumulative sum? (default: false)
    :window-functions/cumulative

    ;; Does this driver support the new `:offset` MBQL clause added in 50? (i.e. SQL `lag` and `lead` or equivalent
    ;; functions)
    :window-functions/offset

    ;; Does this driver support parameterized sql, eg. in prepared statements?
    :parameterized-sql

    ;; Does this driver support the :distinct-where function?
    :distinct-where

    ;; Does this driver support sandboxing with saved questions?
    :saved-question-sandboxing

    ;; Does this driver support casting text and floats to integers? (`integer()` custom expression function)
    :expressions/integer

    ;; Does this driver support casting values to text? (`text()` custom expression function)
    :expressions/text

    ;; Does this driver support casting text to dates? (`date()` custom expression function)
    :expressions/date

    ;; Does this driver support casting text to datetimes?? (`datetime()` custom expression function)
    :expressions/datetime

    ;; Does this driver support casting text to floats? (`float()` custom expression function)
    :expressions/float

    ;; Does this driver support returning the current date? (`today()` custom expression function)
    :expressions/today

    ;; Does this driver support "temporal-unit" template tags in native queries?
    :native-temporal-units

    ;; Whether the driver supports loading dynamic test datasets on each test run. Eg. datasets with names like
    ;; `checkins:4-per-minute` are created dynamically in each test run. This should be truthy for every driver we test
    ;; against except for Athena and Databricks which currently require test data to be loaded separately.
    :test/dynamic-dataset-loading

    ;; Some DBs allow you to connect to a DB that doesn't exist by creating it for you.
    ;; This is to allow such DBs to opt out of tests that rely on not being able to connect to non-existent DBs.
    :test/creates-db-on-connect

    ;; For some cloud DBs the test database is never created, and can't or shouldn't be destroyed.
    ;; This is to allow avoiding destroying the test DBs of such cloud DBs.
    :test/cannot-destroy-db

    ;; There are drivers that support uuids in queries, but not in create table as eg. Athena.
    :test/uuids-in-create-table-statements

    ;; Does this driver support Metabase's database routing feature?
    :database-routing

    ;; Does this driver support replication?
    :database-replication})

(defmulti database-supports?
  "Does this driver and specific instance of a database support a certain `feature`?
  (A feature is a keyword, and can be any of the ones listed above in `driver-features`.
  Note that it's the same set of `driver-features` with respect to
  both database-supports? and [[supports?]])

  Database is guaranteed to be a Database instance.

  Most drivers can always return true or always return false for a given feature
  (e.g., :left-join is not supported by any version of Mongo DB).

  In some cases, a feature may only be supported by certain versions of the database engine.
  In this case, after implementing `[[dbms-version]]` for your driver
  you can determine whether a feature is supported for this particular database.

    (database-supports? :mongo :set-timezone mongo-db) ; -> true"
  {:arglists '([driver feature database]), :added "0.41.0"}
  (fn [driver feature _database]
    ;; only make sure unqualified keywords are explicitly defined in [[features]].
    (when (simple-keyword? feature)
      (when-not (features feature)
        (throw (ex-info (tru "Invalid driver feature: {0}" feature)
                        {:feature feature}))))
    [(dispatch-on-initialized-driver driver) feature])
  :hierarchy #'hierarchy)

(defmethod database-supports?
  :default [_driver _feature _] false)

(doseq [[feature supported?] {:convert-timezone                       false
                              :basic-aggregations                     true
                              :case-sensitivity-string-filter-options true
                              :date-arithmetics                       true
                              :parameterized-sql                      false
                              :temporal-extract                       true
                              :schemas                                true
                              :test/jvm-timezone-setting              true
                              :fingerprint                            true
                              :upload-with-auto-pk                    true
                              :saved-question-sandboxing              true
                              :test/dynamic-dataset-loading           true
                              :test/uuids-in-create-table-statements  true}]
  (defmethod database-supports? [::driver feature] [_driver _feature _db] supported?))

;;; By default a driver supports `:native-parameter-card-reference` if it supports `:native-parameters` AND
;;; `:nested-queries`.
(defmethod database-supports? [::driver :native-parameter-card-reference]
  [driver _feature database]
  (and (database-supports? driver :native-parameters database)
       (database-supports? driver :nested-queries database)))

(defmulti ^String escape-alias
  "Escape a `column-or-table-alias` string in a way that makes it valid for your database. This method is used for
  existing columns; aggregate functions and other expressions; joined tables; and joined subqueries; be sure to return
  the lowest common denominator amongst if your database has different requirements for different identifier types.

  These aliases can be dynamically generated in [[metabase.query-processor.util.add-alias-info]] or elsewhere
  (usually based on underlying table or column names) but can also be specified in the MBQL query itself for explicit
  joins. For `:sql` drivers, the aliases generated here will be quoted in the resulting SQL.

  The default impl of [[escape-alias]] calls [[metabase.driver.impl/truncate-alias]] and truncates the alias
  to [[metabase.driver.impl/default-alias-max-length-bytes]]. You can call this function with a different max length
  if you need to generate shorter aliases.

  That method is currently only used drivers that derive from `:sql` and for drivers that support joins. If your
  driver is/does neither, you do not need to implement this method at this time."
  {:added "0.42.0", :arglists '([driver column-or-table-alias])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(mu/defmethod escape-alias ::driver :- :string
  [_driver alias-name :- :string]
  (driver.impl/truncate-alias alias-name))

(defmulti humanize-connection-error-message
  "Return a humanized (user-facing) version of an connection error message.
  Generic error messages provided in [[metabase.driver.util/connection-error-messages]]; should be returned
  as keywords whenever possible. This provides for both unified error messages and categories which let us point
  users to the erroneous input fields.
  Error messages can also be strings, or localized strings, as returned by [[metabase.util.i18n/trs]] and
  `metabase.util.i18n/tru`."
  {:added "0.32.0" :arglists '([this message])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod humanize-connection-error-message ::driver [_ message]
  message)

(defmulti mbql->native
  "Transpile an MBQL query into the appropriate native query form. `query` will match the schema for an MBQL query in
  [[metabase.legacy-mbql.schema/Query]]; this function should return a native query that conforms to that schema.

  If the underlying query language supports remarks or comments, the driver should
  use [[metabase.query-processor.util/query->remark]] to generate an appropriate message and include that in an
  appropriate place; alternatively a driver might directly include the query's `:info` dictionary if the underlying
  language is JSON-based.

  The result of this function will be passed directly into calls to [[execute-reducible-query]].

  For example, a driver like Postgres would build a valid SQL expression and return a map such as:

    {:query \"-- Metabase card: 10 user: 5
              SELECT * FROM my_table\"}

  In 0.51.0 and above, drivers should look the value of [[*compile-with-inline-parameters*]] and output a query with
  all parameters inline when it is truthy."
  {:added "0.32.0", :arglists '([driver query])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti prettify-native-form
  "Pretty-format native form presumably coming from compiled query.
  Used eg. in the API endpoint `/dataset/native`, to present the user with a nicely formatted query.

  # How to use and extend this method?

  At the time of writing, this method acts as identity for nosql drivers. However, story with sql drivers is a bit
  different. To extend it for sql drivers, developers could use [[metabase.driver.sql.util/format-sql]]. Function
  in question is implemented in a way, that developers, implemnting this multimethod can:
  - Avoid implementing it completely, if their driver keyword representation corresponds to key in
    [[metabase.driver.sql.util/dialects]] (eg. `:postgres`).
  - Ignore implementing it, if it is sufficient to format their drivers native form with dialect corresponding
    to `:standardsql`'s value from the dialects map (eg `:h2`).
  - Use [[metabase.driver.sql.util/format-sql]] in this method's implementation, providing dialect keyword
    representation that corresponds to to their driver's formatting (eg. `:sqlserver` uses `:tsql`).
  - Completly reimplement this method with their special formatting code."
  {:added "0.47.0", :arglists '([driver native-form])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod prettify-native-form ::driver
  [_ native-form]
  native-form)

(def ^:dynamic ^{:added "0.51.0"} *compile-with-inline-parameters*
  "Whether to compile an MBQL query to native with parameters spliced inline (as opposed to using placeholders like `?`
  and passing the parameters separately.) Normally we want to pass parameters separately to protect against SQL
  injection and whatnot, but when converting an MBQL query to SQL it's nicer for people to see

    WHERE bird_type = 'cockatiel'

  instead of

    WHERE bird_type = ?

  so we bind this to `true`.

  Drivers that have some notion of parameterized queries (e.g. `:sql-jdbc`-based drivers) should look at the value of
  this dynamic variable in their implementation of [[metabase.driver/mbql->native]] and adjust query compilation
  behavior accordingly."
  false)

(defmulti splice-parameters-into-native-query
  "Deprecated and unused in 0.51.0+; multimethod declaration left here so drivers implementing it can still compile
  until we remove this method completely in 0.54.0 or later.

  Instead of implementing this method, you should instead look at the value
  of [[metabase.driver/*compile-with-inline-parameters*]] in your implementation of [[metabase.driver/mbql->native]]
  and adjust behavior accordingly."
  {:added "0.32.0", :arglists '([driver inner-query]), :deprecated "0.51.0"}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

#_{:clj-kondo/ignore [:deprecated-var]}
(defmethod splice-parameters-into-native-query ::driver
  [_driver _query]
  (throw (ex-info (str "metabase.driver/splice-parameters-into-native-query is deprecated, bind"
                       " metabase.driver/*compile-with-inline-parameters* during query compilation instead.")
                  {:type ::qp.error-type/driver})))

;; TODO -- shouldn't this be called `notify-database-updated!`, since the expectation is that it is done for side
;; effects? issue: https://github.com/metabase/metabase/issues/39367
(defmulti notify-database-updated
  "Notify the driver that the attributes of a `database` have changed, or that `database was deleted. This is
  specifically relevant in the event that the driver was doing some caching or connection pooling; the driver should
  release ALL related resources when this is called."
  {:added "0.32.0" :arglists '([driver database])}
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
  {:added "0.32.0", :arglists '([driver database f])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod sync-in-context ::driver [_ _ f] (f))

(defmulti table-rows-seq
  "Return a sequence of *all* the rows in a given `table`, which is guaranteed to have at least `:name` and `:schema`
  keys. (It is guaranteed to satisfy the `DatabaseMetadataTable` schema in `metabase.sync.interface`.) Currently, this
  is only used for iterating over the values in a `_metabase_metadata` table. As such, the results are not expected to
  be returned lazily. There is no expectation that the results be returned in any given order.

  This method is currently only used by the H2 driver to load the Sample Database, so it is not neccesary for any other
  drivers to implement it at this time."
  {:added "0.32.0" :arglists '([driver database table])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti db-default-timezone
  "Return the *system* timezone ID name of this database, i.e. the timezone that local dates/times/datetimes are
  considered to be in by default. Ideally, this method should return a timezone ID like `America/Los_Angeles`, but an
  offset formatted like `-08:00` is acceptable in cases where the actual ID cannot be provided.

  This is currently used only when syncing the
  Database (see [[metabase.sync.sync-metadata.sync-timezone/sync-timezone!]]) -- the result of this method is stored
  in the `timezone` column of Database.

  *In theory* this method should probably not return `nil`, since every Database presumably assumes some timezone for
  LocalDate(Time)s types, but *in practice* implementations of this method return `nil` for some drivers. For example
  the default implementation for `:sql-jdbc` returns `nil` unless the driver in question
  implements [[metabase.driver.sql-jdbc.sync/db-default-timezone]]; the `:h2` driver does not for example. Why is
  this? Who knows, but it's something you should keep in mind.

  This method should return a [[String]], a [[java.time.ZoneId]], or a [[java.time.ZoneOffset]]."
  {:added "0.34.0", :arglists '([driver database])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod db-default-timezone ::driver
  [_driver _database]
  nil)

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
  [[metabase.query-processor-test.parameters-test]] and other namespaces."
  {:added "0.34.0" :arglists '([driver inner-query])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti default-field-order
  "Return how fields should be sorted by default for this database."
  {:added "0.36.0" :arglists '([driver])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod default-field-order ::driver [_] :database)

;; TODO -- this can vary based on session variables or connection options
;; Issue: https://github.com/metabase/metabase/pull/39386
(defmulti db-start-of-week
  "Return the day that is considered to be the start of week by `driver`. Should return a keyword such as `:sunday`."
  {:added "0.37.0" :arglists '([driver])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti incorporate-ssh-tunnel-details
  "A multimethod for driver-specific behavior required to incorporate details for an opened SSH tunnel into the DB
  details. In most cases, this will simply involve updating the :host and :port (to point to the tunnel entry point,
  instead of the backing database server), but some drivers may have more specific behavior.

  WARNING! Implementations of this method may create new SSH tunnels, which need to be cleaned up. DO NOT USE THIS
  METHOD DIRECTLY UNLESS YOU ARE GOING TO BE CLEANING UP ANY CREATED TUNNELS! Instead, you probably want to
  use [[metabase.driver.sql-jdbc.connection.ssh-tunnel/with-ssh-tunnel]]. See #24445 for more information."
  {:added "0.39.0" :arglists '([driver db-details])}
  dispatch-on-uninitialized-driver
  :hierarchy #'hierarchy)

(defmulti incorporate-auth-provider-details
  "A multimethod for driver specific behavior required to incorporate response of an auth-provider into the DB details.
   In most cases this means setting the :password and/or :username based on the auth-provider and its response."
  {:added "0.50.17" :arglists '([driver auth-provider auth-provider-response details])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod incorporate-auth-provider-details :default
  [_driver _auth-provider _auth-provider-response details]
  details)

(defmethod incorporate-auth-provider-details :sql-jdbc
  [_driver auth-provider auth-provider-response details]
  (case auth-provider
    (:oauth :azure-managed-identity)
    (let [{:keys [access_token expires_in]} auth-provider-response]
      (cond-> (assoc details :password access_token)
        expires_in (assoc :password-expiry-timestamp (+ (System/currentTimeMillis)
                                                        (* (- (parse-long expires_in)
                                                              auth-provider/azure-auth-token-renew-slack-seconds)
                                                           1000)))))

    (merge details auth-provider-response)))

;;; TODO:
;;;
;;; 1. We definitely should not be asking drivers to "update the value for `:details`". Drivers shouldn't touch the
;;;    application database.
;;; 2. Something that is done for side effects like updating the application DB NEEDS TO END IN AN EXCLAMATION MARK!
;;; Issue: https://github.com/metabase/metabase/issues/39392
(defmulti normalize-db-details
  "Normalizes db-details for the given driver. This is to handle migrations that are too difficult to perform via
  regular Liquibase queries. This multimethod will be called from a `:post-select` handler within the database model.
  The full `database` model object is passed as the 2nd parameter, and the multimethod implementation is expected to
  update the value for `:details`. The default implementation is essentially `identity` (i.e returns `database`
  unchanged). This multimethod will only be called if `:details` is actually present in the `database` map."
  {:added "0.41.0" :arglists '([driver database])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod normalize-db-details ::driver
  [_ database]
  ;; no normalization by default
  database)

(defmulti db-details-to-test-and-migrate
  "When `details` are in an ambiguous state, this should return a sequence of modified `details` of the
   possible, normalized, unambiguous states.

   The result of this function will be used to test each new `details`, in order,
   and the first one that succeeds will be saved in the database.

   If none of the details succeed, nothing will change.
   Returning `nil` will skip the test.

   This should, in practice, supersede `normalize-db-details`."
  {:added "0.52.12" :arglists '([driver details])}
  dispatch-on-initialized-driver-safe-keys
  :hierarchy #'hierarchy)

(defmethod db-details-to-test-and-migrate ::driver
  [_ _database]
  ;; nothing by default
  nil)

(defmulti superseded-by
  "Returns the driver that supersedes the given `driver`.  A non-nil return value means that the given `driver` is
  deprecated in Metabase and will eventually be replaced by the returned driver, in some future version (at which point
  any databases using it will be migrated to the new one).

  This is currently only used on the frontend for the purpose of showing/hiding deprecated drivers. A driver can make
  use of this facility by adding a top-level `superseded-by` key to its plugin manifest YAML file, or (less preferred)
  overriding this multimethod directly."
  {:added "0.41.0" :arglists '([driver])}
  dispatch-on-uninitialized-driver
  :hierarchy #'hierarchy)

(defmethod superseded-by :default
  [_]
  nil)

(defmulti execute-write-query!
  "Execute a writeback query e.g. one powering a custom `QueryAction` (see [[metabase.actions.models]]).
  Drivers that support `:actions/custom` must implement this method."
  {:changelog-test/ignore true, :added "0.44.0", :arglists '([driver query])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti table-rows-sample
  "Processes a sample of rows produced by `driver`, from the `table`'s `fields`
  using the query result processing function `rff`.
  The default implementation defined in [[[metabase.driver.common.table-rows-sample]] runs a
  row sampling MBQL query using the regular query processor to produce the
  sample rows. This is good enough in most cases so this multimethod should not
  be implemented unless really necessary.
  `opts` is a map that may contain additional parameters:
  `:truncation-size`: size to truncate text fields to if the driver supports
  expressions."
  {:arglists '([driver table fields rff opts]), :added "0.46.0"}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti set-role!
  "Sets the database role used on a connection. Called prior to query execution for drivers that support connection
  impersonation (an EE-only feature)."
  {:added "0.47.0" :arglists '([driver conn role])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    Upload                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:dynamic *insert-chunk-rows*
  "The number of rows to insert at a time when uploading data to a database. This can be bound for testing purposes."
  nil)

(defmulti table-name-length-limit
  "Return the maximum number of bytes allowed in a table name, or `nil` if there is no limit."
  {:changelog-test/ignore true, :added "0.47.0", :arglists '([driver])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti column-name-length-limit
  "Return the maximum number of bytes allowed in a column name, or `nil` if there is no limit."
  {:changelog-test/ignore true, :added "0.49.19", :arglists '([driver])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod column-name-length-limit :default [driver]
  ;; For most databases, the same limit is used for all identifier types.
  (table-name-length-limit driver))

(defmulti create-table!
  "Create a table named `table-name`. If the table already exists it will throw an error.
  `args` is an optional map with an optional entry `primary-key`. The `primary-key` value is a vector of column names
  that make up the primary key."
  {:added "0.47.0", :arglists '([driver database-id table-name column-definitions & args])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti drop-table!
  "Drop a table named `table-name`. If the table doesn't exist it will not be dropped. `table-name` may be qualified
  by schema e.g.

    schema.table"
  {:added "0.47.0", :arglists '([driver db-id ^String table-name])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti truncate!
  "Delete the current contents of `table-name`.
  If something like a SQL TRUNCATE statement is supported, we use that, but may otherwise fall back to explicitly
  deleting rows, or dropping and recreating the table.
  Depending on the driver, the semantics can vary on whether triggers are fired, AUTO_INCREMENT is reset etc.
  The application assumes that the implementation can be rolled back if inside a transaction."
  {:added "0.50.0", :arglists '([driver db-id table-name])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti insert-into!
  "Insert `values` into a table named `table-name`. `values` is a lazy sequence of rows, where each row's order matches
   `column-names`.

  The types in `values` may include:
  - java.lang.String
  - java.lang.Double
  - java.math.BigInteger
  - java.lang.Boolean
  - java.time.LocalDate
  - java.time.LocalDateTime
  - java.time.OffsetDateTime"
  {:added "0.47.0", :arglists '([driver db-id table-name column-names values])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti add-columns!
  "Add columns given by `column-definitions` to a table named `table-name`. If the table doesn't exist it will throw an error.
  `args` is an optional map with an optional key `primary-key`. The `primary-key` value is a vector of column names
  that make up the primary key. Currently only a single primary key is supported."
  {:added "0.49.0", :arglists '([driver db-id table-name column-definitions & args])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti alter-columns!
  "Alter columns given by `column-definitions` to a table named `table-name`. If the table doesn't exist it will throw an error.
  Currently, we do not currently support changing the primary key, or take any guidance on how to coerce values."
  {:added "0.49.0"
   :arglists '([driver db-id table-name column-definitions])
   :deprecated "0.54.0"}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti alter-table-columns!
  "Alter columns given by `column-definitions` to a table named `table-name`. If the table doesn't exist it will throw an error.
  Currently, we do not currently support changing the primary key.

  Used to change the types of columns when appending to or replacing uploads with a new .csv that infers a different type.

  `column-definitions` should be supplied as a map of column-name keyword to column type.
  e.g. `{:my-column [:varchar 255]}`

  Note: column types may be supplied as honeysql vectors (e.g. `[:varchar 255]`) or a raw string.
  Both should be handled by implementations.

  Options:

  - `:old-types`: a map of the existing column definitions, e.g `{:my-column [:bigint]}`
     Can be useful to infer an expression to convert old values to the new type
     where the database engine does not support it natively.
     Implementations are free to ignore this parameter if they cannot do anything with it.

  Replaces `alter-columns!` that was previously used for the same purpose in versions < `0.54.0`"
  {:added "0.54.0", :arglists '([driver db-id table-name column-definitions & opts])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

;; used for compatibility with drivers only implementing alter-columns!
;; remove once alter-columns! is deleted (v0.57+)
#_{:clj-kondo/ignore [:deprecated-var]}
(defmethod alter-table-columns! ::driver
  [driver db-id table-name column-definitions & _opts]
  (alter-columns! driver db-id table-name column-definitions))

(defmulti syncable-schemas
  "Returns the set of syncable schemas in the database (as strings)."
  {:added "0.47.0", :arglists '([driver database])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod syncable-schemas ::driver [_ _] #{})

(defmulti upload-type->database-type
  "Returns the database type for a given `metabase.upload` type as a HoneySQL spec. This will be a vector, which allows
  for additional options. Sample values:

  - [:bigint]
  - [[:varchar 255]]
  - [:generated-always :as :identity]"
  {:changelog-test/ignore true, :added "0.47.0", :arglists '([driver upload-type])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti allowed-promotions
  "Returns a mapping of which types a column can be implicitly relaxed to, based on the content of appended values.
  In the context of uploads, this permits certain appends or replacements of an existing csv table
  to change column types with `alter-table-columns!`.

  e.g. `{:metabase.upload/int #{:metabase.upload/float}}` would allow int columns to be migrated to floats.
  If we require a relaxation which is not allowed here, we will reject the corresponding file.

  It is expected that the returned map is transitively closed.
  If type A can be relaxed to B, and B can be relaxed to C, then A must also explicitly list C as a valid relaxation.
  This is to avoid situations where promotions are reachable but require additional user effort,
  such as filtering and re-uploading csv files.

  e.g.

  Valid (transitively closed):
  {:metabase.upload/int #{:metabase.upload/float}
   :metabase.upload/boolean #{:metabase.upload/int, :metabase.upload/float}}
  Since boolean -> int and int -> float, we also include boolean -> float.

  Invalid (not transitively closed):
  {:metabase.upload/int #{:metabase.upload/float}
   :metabase.upload/boolean #{:metabase.upload/int}}
  This would reject a boolean -> float transition, despite boolean reaching float through int."
  {:added "0.54.0", :arglists '([driver])}
  dispatch-on-uninitialized-driver
  :hierarchy #'hierarchy)

(defmethod allowed-promotions ::driver [_]
  ;; for compatibility with older drivers, in which this promotion was assumed
  {:metabase.upload/int #{:metabase.upload/float}})

(defmulti create-auto-pk-with-append-csv?
  "Returns true if the driver should create an auto-incrementing primary key column when appending CSV data to an existing
  upload table. This is because we want to add auto-pk columns for drivers that supported uploads before auto-pk columns
  were introduced by metabase#36249. It should return false if the driver supported the uploads feature in version 48 or later."
  {:added "0.49.0" :arglists '([driver])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod create-auto-pk-with-append-csv? ::driver [_] false)

(defmulti current-user-table-privileges
  "Returns the rows of data as arrays needed to populate the table_privileges table
   with the DB connection's current user privileges.
   The data contains the privileges that the user has on the given `database`.
   The privileges include select, insert, update, and delete.

   The rows have the following keys and value types:
     - role            :- [:maybe :string]
     - schema          :- [:maybe :string]
     - table           :- :string
     - select          :- :boolean
     - update          :- :boolean
     - insert          :- :boolean
     - delete          :- :boolean

   Either:
   (1) role is null, corresponding to the privileges of the DB connection's current user
   (2) role is not null, corresponding to the privileges of the role"
  {:added "0.48.0", :arglists '([driver database & args])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti dynamic-database-types-lookup
  "Generate mapping of `database-types` to base types for dynamic database types (eg. defined by user; postgres enums).

  The `sql-jdbc.sync/database-type->base-type` is used as simple look-up, while this method is expected to do database
  calls when necessary. At the time it was added, its purpose was to check for postgres enum types. Its meant to
  be extended also for other dynamic types when necessary."
  {:added "0.53.0" :arglists '([driver database database-types])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod dynamic-database-types-lookup ::driver
  [_driver _database _database-types]
  nil)

(defmulti adjust-schema-qualification
  "Adjust the given schema to either add or remove further schema qualification.

   In general, the database detail property `multi-level-schema` ought to drive whether a schema gets qualified or not.
   If it is true, schemas should be fully qualified to `catalog` or other addressable hierarchical concept. If false, they should not be.

   Returns a string either of the unchanged `schema` or the adjusted value."
  {:added "0.55.0" :arglists '([driver database schema])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmulti query-canceled?
  "Test if an exception is due to a query being canceled due to user action. For JDBC drivers this can
  happen when setting `.setQueryTimeout`."
  {:added "0.53.12" :arglists '([driver ^Throwable e])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod query-canceled? ::driver [_ _] false)

(defmulti table-known-to-not-exist?
  "Test if an exception is due to a table not existing."
  {:added "0.54.10" :arglists '([driver ^Throwable e])}
  dispatch-on-initialized-driver
  :hierarchy #'hierarchy)

(defmethod table-known-to-not-exist? ::driver [_ _] false)
