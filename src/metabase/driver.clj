(ns metabase.driver
  (:require [clojure.math.numeric-tower :as math]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.models
             [database :refer [Database]]
             field
             [setting :refer [defsetting]]
             table]
            [metabase.util :as u]
            [toucan.db :as db])
  (:import clojure.lang.Keyword
           metabase.models.database.DatabaseInstance
           metabase.models.field.FieldInstance
           metabase.models.table.TableInstance))

;;; ## INTERFACE + CONSTANTS

(def ^:const max-sync-lazy-seq-results
  "The maximum number of values we should return when using `field-values-lazy-seq`.
   This many is probably fine for inferring special types and what-not; we don't want
   to scan millions of values at any rate."
  10000)

(def ^:const field-values-lazy-seq-chunk-size
  "How many Field values should be fetched at a time for a chunked implementation of `field-values-lazy-seq`?"
  ;; Hopefully this is a good balance between
  ;; 1. Not doing too many DB calls
  ;; 2. Not running out of mem
  ;; 3. Not fetching too many results for things like mark-json-field! which will fail after the first result that isn't valid JSON
  500)

(def ^:const connection-error-messages
  "Generic error messages that drivers should return in their implementation of `humanize-connection-error-message`."
  {:cannot-connect-check-host-and-port "Hmm, we couldn't connect to the database. Make sure your host and port settings are correct"
   :ssh-tunnel-auth-fail               "We couldn't connect to the ssh tunnel host. Check the username, password"
   :ssh-tunnel-connection-fail         "We couldn't connect to the ssh tunnel host. Check the hostname and port"
   :database-name-incorrect            "Looks like the database name is incorrect."
   :invalid-hostname                   "It looks like your host is invalid. Please double-check it and try again."
   :password-incorrect                 "Looks like your password is incorrect."
   :password-required                  "Looks like you forgot to enter your password."
   :username-incorrect                 "Looks like your username is incorrect."
   :username-or-password-incorrect     "Looks like the username or password is incorrect."})

(defprotocol IDriver
  "Methods that Metabase drivers must implement. Methods marked *OPTIONAL* have default implementations in `IDriverDefaultsMixin`.
   Drivers should also implement `getName` form `clojure.lang.Named`, so we can call `name` on them:

     (name (PostgresDriver.)) -> \"PostgreSQL\"

   This name should be a \"nice-name\" that we'll display to the user."

  (analyze-table ^java.util.Map [this, ^TableInstance table, ^java.util.Set new-field-ids]
    "*OPTIONAL*. Return a map containing information that provides optional analysis values for TABLE.
     Output should match the `AnalyzeTable` schema.")

  (can-connect? ^Boolean [this, ^java.util.Map details-map]
    "Check whether we can connect to a `Database` with DETAILS-MAP and perform a simple query. For example, a SQL database might
     try running a query like `SELECT 1;`. This function should return `true` or `false`.")

  (date-interval [this, ^Keyword unit, ^Number amount]
    "*OPTIONAL* Return an driver-appropriate representation of a moment relative to the current moment in time. By default, this returns an `Timestamp` by calling
     `metabase.util/relative-date`; but when possible drivers should return a native form so we can be sure the correct timezone is applied. For example, SQL drivers should
     return a HoneySQL form to call the appropriate SQL fns:

       (date-interval (PostgresDriver.) :month 1) -> (hsql/call :+ :%now (hsql/raw \"INTERVAL '1 month'\"))")

  (describe-database ^java.util.Map [this, ^DatabaseInstance database]
    "Return a map containing information that describes all of the schema settings in DATABASE, most notably a set of tables.
     It is expected that this function will be peformant and avoid draining meaningful resources of the database.
     Results should match the `DescribeDatabase` schema.")

  (describe-table ^java.util.Map [this, ^DatabaseInstance database, ^java.util.Map table]
    "Return a map containing information that describes the physical schema of TABLE.
     It is expected that this function will be peformant and avoid draining meaningful resources of the database.
     Results should match the `DescribeTable` schema.")

  (describe-table-fks ^java.util.Set [this, ^DatabaseInstance database, ^java.util.Map table]
    "*OPTIONAL*, BUT REQUIRED FOR DRIVERS THAT SUPPORT `:foreign-keys`*
     Results should match the `DescribeTableFKs` schema.")

  (details-fields ^clojure.lang.Sequential [this]
    "A vector of maps that contain information about connection properties that should
     be exposed to the user for databases that will use this driver. This information is used to build the UI for editing
     a `Database` `details` map, and for validating it on the Backend. It should include things like `host`,
     `port`, and other driver-specific parameters. Each field information map should have the following properties:

   *  `:name`

      The key that should be used to store this property in the `details` map.

   *  `:display-name`

      Human-readable name that should be displayed to the User in UI for editing this field.

   *  `:type` *(OPTIONAL)*

      `:string`, `:integer`, `:boolean`, or `:password`. Defaults to `:string`.

   *  `:default` *(OPTIONAL)*

       A default value for this field if the user hasn't set an explicit value. This is shown in the UI as a placeholder.

   *  `:placeholder` *(OPTIONAL)*

      Placeholder value to show in the UI if user hasn't set an explicit value. Similar to `:default`, but this value is
      *not* saved to `:details` if no explicit value is set. Since `:default` values are also shown as placeholders, you
      cannot specify both `:default` and `:placeholder`.

   *  `:required` *(OPTIONAL)*

      Is this property required? Defaults to `false`.")

  (execute-query ^java.util.Map [this, ^java.util.Map query]
    "Execute a query against the database and return the results.

  The query passed in will contain:

         {:database ^DatabaseInstance
          :native   {... driver specific query form such as one returned from a call to `mbql->native` ...}
          :settings {:report-timezone \"US/Pacific\"
                     :other-setting   \"and its value\"}}

  Results should look like:

         {:columns [\"id\", \"name\"]
          :rows    [[1 \"Lucky Bird\"]
                    [2 \"Rasta Can\"]]}")

  (features ^java.util.Set [this]
    "*OPTIONAL*. A set of keyword names of optional features supported by this driver, such as `:foreign-keys`. Valid features are:

  *  `:foreign-keys` - Does this database support foreign key relationships?
  *  `:nested-fields` - Does this database support nested fields (e.g. Mongo)?
  *  `:set-timezone` - Does this driver support setting a timezone for the query?
  *  `:basic-aggregations` - Does the driver support *basic* aggregations like `:count` and `:sum`? (Currently, everything besides standard deviation is considered \"basic\"; only GA doesn't support this).
  *  `:standard-deviation-aggregations` - Does this driver support [standard deviation aggregations](https://github.com/metabase/metabase/wiki/Query-Language-'98#stddev-aggregation)?
  *  `:expressions` - Does this driver support [expressions](https://github.com/metabase/metabase/wiki/Query-Language-'98#expressions) (e.g. adding the values of 2 columns together)?
  *  `:dynamic-schema` -  Does this Database have no fixed definitions of schemas? (e.g. Mongo)
  *  `:native-parameters` - Does the driver support parameter substitution on native queries?
  *  `:expression-aggregations` - Does the driver support using expressions inside aggregations? e.g. something like \"sum(x) + count(y)\" or \"avg(x + y)\"")

  (field-values-lazy-seq ^clojure.lang.Sequential [this, ^FieldInstance field]
    "Return a lazy sequence of all values of FIELD.
     This is used to implement some methods of the database sync process which require rows of data during execution.

  The lazy sequence should not return more than `max-sync-lazy-seq-results`, which is currently `10000`.
  For drivers that provide a chunked implementation, a recommended chunk size is `field-values-lazy-seq-chunk-size`, which is currently `500`.")

  (format-custom-field-name ^String [this, ^String custom-field-name]
    "*OPTIONAL*. Return the custom name passed via an MBQL `:named` clause so it matches the way it is returned in the results.
     This is used by the post-processing annotation stage to find the correct metadata to include with fields in the results.
     The default implementation is `identity`, meaning the resulting field will have exactly the same name as passed to the `:named` clause.
     Certain drivers like Redshift always lowercase these names, so this method is provided for those situations.")

  (humanize-connection-error-message ^String [this, ^String message]
    "*OPTIONAL*. Return a humanized (user-facing) version of an connection error message string.
     Generic error messages are provided in the constant `connection-error-messages`; return one of these whenever possible.")

  (mbql->native ^java.util.Map [this, ^java.util.Map query]
    "Transpile an MBQL structured query into the appropriate native query form.

  The input QUERY will be a [fully-expanded MBQL query](https://github.com/metabase/metabase/wiki/Expanded-Queries) with
  all the necessary pieces of information to build a properly formatted native query for the given database.

  If the underlying query language supports remarks or comments, the driver should use `query->remark` to generate an appropriate message and include that in an appropriate place;
  alternatively a driver might directly include the query's `:info` dictionary if the underlying language is JSON-based.

  The result of this function will be passed directly into calls to `execute-query`.

  For example, a driver like Postgres would build a valid SQL expression and return a map such as:

       {:query \"-- [Contents of `(query->remark query)`]
                 SELECT * FROM my_table\"}")

  (notify-database-updated [this, ^DatabaseInstance database]
    "*OPTIONAL*. Notify the driver that the attributes of the DATABASE have changed.  This is specifically relevant in
     the event that the driver was doing some caching or connection pooling.")

  (process-query-in-context [this, ^clojure.lang.IFn qp]
    "*OPTIONAL*. Similar to `sync-in-context`, but for running queries rather than syncing. This should be used to do things like open DB connections
     that need to remain open for the duration of post-processing. This function follows a middleware pattern and is injected into the QP
     middleware stack immediately after the Query Expander; in other words, it will receive the expanded query.
     See the Mongo and H2 drivers for examples of how this is intended to be used.

       (defn process-query-in-context [driver qp]
         (fn [query]
           (qp query)))")

  (sync-in-context [this, ^DatabaseInstance database, ^clojure.lang.IFn f]
    "*OPTIONAL*. Drivers may provide this function if they need to do special setup before a sync operation such as `sync-database!`. The sync
     operation itself is encapsulated as the lambda F, which must be called with no arguments.

       (defn sync-in-context [driver database f]
         (with-connection [_ database]
           (f)))")

  (table-rows-seq ^clojure.lang.Sequential [this, ^DatabaseInstance database, ^java.util.Map table]
    "*OPTIONAL*. Return a sequence of *all* the rows in a given TABLE, which is guaranteed to have at least `:name` and `:schema` keys.
     Currently, this is only used for iterating over the values in a `_metabase_metadata` table. As such, the results are not expected to be returned lazily.
     There is no expectation that the results be returned in any given order."))


(defn- percent-valid-urls
  "Recursively count the values of non-nil values in VS that are valid URLs, and return it as a percentage."
  [vs]
  (loop [valid-count 0, non-nil-count 0, [v & more :as vs] vs]
    (cond (not (seq vs)) (if (zero? non-nil-count) 0.0
                             (float (/ valid-count non-nil-count)))
          (nil? v)       (recur valid-count non-nil-count more)
          :else          (let [valid? (and (string? v)
                                           (u/is-url? v))]
                           (recur (if valid? (inc valid-count) valid-count)
                                  (inc non-nil-count)
                                  more)))))

(defn default-field-percent-urls
  "Default implementation for optional driver fn `field-percent-urls` that calculates percentage in Clojure-land."
  [driver field]
  (->> (field-values-lazy-seq driver field)
       (filter identity)
       (take max-sync-lazy-seq-results)
       percent-valid-urls))

(defn default-field-avg-length
  "Default implementation of optional driver fn `field-avg-length` that calculates the average length in Clojure-land via `field-values-lazy-seq`."
  [driver field]
  (let [field-values        (->> (field-values-lazy-seq driver field)
                                 (filter identity)
                                 (take max-sync-lazy-seq-results))
        field-values-count (count field-values)]
    (if (zero? field-values-count)
      0
      (int (math/round (/ (->> field-values
                               (map str)
                               (map count)
                               (reduce +))
                          field-values-count))))))


(def IDriverDefaultsMixin
  "Default implementations of `IDriver` methods marked *OPTIONAL*."
  {:analyze-table                     (constantly nil)
   :date-interval                     (u/drop-first-arg u/relative-date)
   :describe-table-fks                (constantly nil)
   :features                          (constantly nil)
   :format-custom-field-name          (u/drop-first-arg identity)
   :humanize-connection-error-message (u/drop-first-arg identity)
   :notify-database-updated           (constantly nil)
   :process-query-in-context          (u/drop-first-arg identity)
   :sync-in-context                   (fn [_ _ f] (f))
   :table-rows-seq                    (constantly nil)})


;;; ## CONFIG

(defsetting report-timezone "Connection timezone to use when executing queries. Defaults to system timezone.")

(defonce ^:private registered-drivers
  (atom {}))

(defn register-driver!
  "Register a DRIVER, an instance of a class that implements `IDriver`, for ENGINE.

     (register-driver! :postgres (PostgresDriver.))"
  [^Keyword engine, driver-instance]
  {:pre [(keyword? engine) (map? driver-instance)]}
  (swap! registered-drivers assoc engine driver-instance)
  (log/debug (format "Registered driver %s %s" (u/format-color 'blue engine) (u/emoji "🚚"))))

(defn available-drivers
  "Info about available drivers."
  []
  (m/map-vals (fn [driver]
                {:details-fields (details-fields driver)
                 :driver-name    (name driver)
                 :features       (features driver)})
              @registered-drivers))

(defn find-and-load-drivers!
  "Search Classpath for namespaces that start with `metabase.driver.`, then `require` them and look for the `driver-init`
   function which provides a uniform way for Driver initialization to be done."
  []
  (doseq [ns-symb @u/metabase-namespace-symbols
          :when   (re-matches #"^metabase\.driver\.[a-z0-9_]+$" (name ns-symb))]
    (require ns-symb)))

(defn is-engine?
  "Is ENGINE a valid driver name?"
  [engine]
  (contains? (available-drivers) (keyword engine)))

(defn driver-supports?
  "Tests if a driver supports a given feature."
  [driver feature]
  (contains? (features driver) feature))

(defn class->base-type
  "Return the `Field.base_type` that corresponds to a given class returned by the DB.
   This is used to infer the types of results that come back from native queries."
  [klass]
  (or (some (fn [[mapped-class mapped-type]]
              (when (isa? klass mapped-class)
                mapped-type))
            [[Boolean                        :type/Boolean]
             [Double                         :type/Float]
             [Float                          :type/Float]
             [Integer                        :type/Integer]
             [Long                           :type/Integer]
             [java.math.BigDecimal           :type/Decimal]
             [java.math.BigInteger           :type/BigInteger]
             [Number                         :type/Number]
             [String                         :type/Text]
             [java.sql.Date                  :type/Date]
             [java.sql.Timestamp             :type/DateTime]
             [java.util.Date                 :type/DateTime]
             [org.joda.time.DateTime         :type/DateTime]
             [java.util.UUID                 :type/Text]       ; shouldn't this be :type/UUID ?
             [clojure.lang.IPersistentMap    :type/Dictionary]
             [clojure.lang.IPersistentVector :type/Array]
             [org.bson.types.ObjectId        :type/MongoBSONID]
             [org.postgresql.util.PGobject   :type/*]])
      (log/warn (format "Don't know how to map class '%s' to a Field base_type, falling back to :type/*." klass))
      :type/*))

;; ## Driver Lookup

(defn engine->driver
  "Return the driver instance that should be used for given ENGINE keyword.
   This loads the corresponding driver if needed; this is done with a call like

     (require 'metabase.driver.<engine>)

   The namespace itself should register itself by passing an instance of a class that
   implements `IDriver` to `metabase.driver/register-driver!`."
  [engine]
  {:pre [engine]}
  (or ((keyword engine) @registered-drivers)
      (let [namespce (symbol (format "metabase.driver.%s" (name engine)))]
        (u/ignore-exceptions (require namespce))
        ((keyword engine) @registered-drivers))))


;; Can the type of a DB change?
(def ^{:arglists '([database-id])} database-id->driver
  "Memoized function that returns the driver instance that should be used for `Database` with ID.
   (Databases aren't expected to change their types, and this optimization makes things a lot faster).

   This loads the corresponding driver if needed."
  (let [db-id->engine (memoize (fn [db-id] (db/select-one-field :engine Database, :id db-id)))]
    (fn [db-id]
      {:pre [db-id]}
      (engine->driver (db-id->engine db-id)))))


;; ## Implementation-Agnostic Driver API

(def ^:private ^:const can-connect-timeout-ms
  "Consider `can-connect?`/`can-connect-with-details?` to have failed after this many milliseconds."
  5000)

(defn can-connect-with-details?
  "Check whether we can connect to a database with ENGINE and DETAILS-MAP and perform a basic query
   such as `SELECT 1`. Specify optional param RETHROW-EXCEPTIONS if you want to handle any exceptions
   thrown yourself (e.g., so you can pass the exception message along to the user).

     (can-connect-with-details? :postgres {:host \"localhost\", :port 5432, ...})"
  [engine details-map & [rethrow-exceptions]]
  {:pre [(keyword? engine) (map? details-map)]}
  (let [driver (engine->driver engine)]
    (try
      (u/with-timeout can-connect-timeout-ms
        (can-connect? driver details-map))
      (catch Throwable e
        (log/error "Failed to connect to database:" (.getMessage e))
        (when rethrow-exceptions
          (throw (Exception. (humanize-connection-error-message driver (.getMessage e)))))
        false))))
