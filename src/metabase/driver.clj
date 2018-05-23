(ns metabase.driver
  "Metabase Drivers handle various things we need to do with connected data warehouse databases, including things like
  introspecting their schemas and processing and running MBQL queries. Each Metabase driver lives in a namespace like
  `metabase.driver.<driver>`, e.g. `metabase.driver.postgres`. Each driver must implement the `IDriver` protocol
  below.

  JDBC-based drivers for SQL databases can use the 'Generic SQL' driver which acts as a sort of base class and
  implements most of this protocol. Instead, those drivers should implement the `ISQLDriver` protocol which can be
  found in `metabase.driver.generic-sql`.

  This namespace also contains various other functions for fetching drivers, testing database connections, and the
  like."
  (:require [clj-time
             [coerce :as tcoerce]
             [core :as time]
             [format :as tformat]]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase
             [config :as config]
             [util :as u]]
            [metabase.models
             [database :refer [Database]]
             [setting :refer [defsetting]]]
            [metabase.sync.interface :as si]
            [metabase.util.date :as du]
            [puppetlabs.i18n.core :refer [trs tru]]
            [schema.core :as s]
            [toucan.db :as db])
  (:import clojure.lang.Keyword
           java.text.SimpleDateFormat
           org.joda.time.DateTime
           org.joda.time.format.DateTimeFormatter))

;;; ## INTERFACE + CONSTANTS

(def connection-error-messages
  "Generic error messages that drivers should return in their implementation of `humanize-connection-error-message`."
  {:cannot-connect-check-host-and-port (str (tru "Hmm, we couldn''t connect to the database.")
                                            " "
                                            (tru "Make sure your host and port settings are correct"))
   :ssh-tunnel-auth-fail               (str (tru "We couldn''t connect to the ssh tunnel host.")
                                            " "
                                            (tru "Check the username, password."))
   :ssh-tunnel-connection-fail         (str (tru "We couldn''t connect to the ssh tunnel host.")
                                            " "
                                            (tru "Check the hostname and port."))
   :database-name-incorrect            (tru "Looks like the database name is incorrect.")
   :invalid-hostname                   (str (tru "It looks like your host is invalid.")
                                            " "
                                            (tru "Please double-check it and try again."))
   :password-incorrect                 (tru "Looks like your password is incorrect.")
   :password-required                  (tru "Looks like you forgot to enter your password.")
   :username-incorrect                 (tru "Looks like your username is incorrect.")
   :username-or-password-incorrect     (tru "Looks like the username or password is incorrect.")})

(defprotocol IDriver
  "Methods that Metabase drivers must implement. Methods marked *OPTIONAL* have default implementations in
   `IDriverDefaultsMixin`. Drivers should also implement `getName` form `clojure.lang.Named`, so we can call `name` on
    them:

     (name (PostgresDriver.)) -> \"PostgreSQL\"

   This name should be a \"nice-name\" that we'll display to the user."

  (can-connect? ^Boolean [this, ^java.util.Map details-map]
    "Check whether we can connect to a `Database` with DETAILS-MAP and perform a simple query. For example, a SQL
     database might try running a query like `SELECT 1;`. This function should return `true` or `false`.")

  (date-interval [this, ^Keyword unit, ^Number amount]
    "*OPTIONAL* Return an driver-appropriate representation of a moment relative to the current moment in time. By
     default, this returns an `Timestamp` by calling `metabase.util.date/relative-date`; but when possible drivers should
     return a native form so we can be sure the correct timezone is applied. For example, SQL drivers should return a
     HoneySQL form to call the appropriate SQL fns:

       (date-interval (PostgresDriver.) :month 1) -> (hsql/call :+ :%now (hsql/raw \"INTERVAL '1 month'\"))")

  (describe-database ^java.util.Map [this database]
    "Return a map containing information that describes all of the schema settings in DATABASE, most notably a set of
     tables. It is expected that this function will be peformant and avoid draining meaningful resources of the
     database. Results should match the `DatabaseMetadata` schema.")

  (describe-table ^java.util.Map [this database table]
    "Return a map containing information that describes the physical schema of TABLE.
     It is expected that this function will be peformant and avoid draining meaningful resources of the database.
     Results should match the `TableMetadata` schema.")

  (describe-table-fks ^java.util.Set [this database table]
    "*OPTIONAL*, BUT REQUIRED FOR DRIVERS THAT SUPPORT `:foreign-keys`*
     Results should match the `FKMetadata` schema.")

  (details-fields ^clojure.lang.Sequential [this]
    "A vector of maps that contain information about connection properties that should
     be exposed to the user for databases that will use this driver. This information is used to build the UI for
     editing a `Database` `details` map, and for validating it on the Backend. It should include things like `host`,
     `port`, and other driver-specific parameters. Each field information map should have the following properties:

   *  `:name`

      The key that should be used to store this property in the `details` map.

   *  `:display-name`

      Human-readable name that should be displayed to the User in UI for editing this field.

   *  `:type` *(OPTIONAL)*

      `:string`, `:integer`, `:boolean`, or `:password`. Defaults to `:string`.

   *  `:default` *(OPTIONAL)*

       A default value for this field if the user hasn't set an explicit value. This is shown in the UI as a
       placeholder.

   *  `:placeholder` *(OPTIONAL)*

      Placeholder value to show in the UI if user hasn't set an explicit value. Similar to `:default`, but this value
      is *not* saved to `:details` if no explicit value is set. Since `:default` values are also shown as
      placeholders, you cannot specify both `:default` and `:placeholder`.

   *  `:required` *(OPTIONAL)*

      Is this property required? Defaults to `false`.")

  (^{:style/indent 1} execute-query ^java.util.Map [this, ^java.util.Map query]
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
    "*OPTIONAL*. A set of keyword names of optional features supported by this driver, such as `:foreign-keys`. Valid
     features are:

  *  `:foreign-keys` - Does this database support foreign key relationships?
  *  `:nested-fields` - Does this database support nested fields (e.g. Mongo)?
  *  `:set-timezone` - Does this driver support setting a timezone for the query?
  *  `:basic-aggregations` - Does the driver support *basic* aggregations like `:count` and `:sum`? (Currently,
      everything besides standard deviation is considered \"basic\"; only GA doesn't support this).
  *  `:standard-deviation-aggregations` - Does this driver support standard deviation aggregations?
  *  `:expressions` - Does this driver support expressions (e.g. adding the values of 2 columns together)?
  *  `:native-parameters` - Does the driver support parameter substitution on native queries?
  *  `:expression-aggregations` - Does the driver support using expressions inside aggregations? e.g. something like
      \"sum(x) + count(y)\" or \"avg(x + y)\"
  *  `:nested-queries` - Does the driver support using a query as the `:source-query` of another MBQL query? Examples
      are CTEs or subselects in SQL queries.
  *  `:no-case-sensitivity-string-filter-options` - An anti-feature: does this driver not let you specify whether or not
      our string search filter clauses (`:contains`, `:starts-with`, and `:ends-with`, collectively the equivalent of
      SQL `LIKE` are case-senstive or not? This informs whether we should present you with the 'Case Sensitive' checkbox
      in the UI. At the time of this writing SQLite, SQLServer, and MySQL have this 'feature' -- `LIKE` clauses are
      always case-insensitive.")

  (format-custom-field-name ^String [this, ^String custom-field-name]
    "*OPTIONAL*. Return the custom name passed via an MBQL `:named` clause so it matches the way it is returned in the
     results. This is used by the post-processing annotation stage to find the correct metadata to include with fields
     in the results. The default implementation is `identity`, meaning the resulting field will have exactly the same
     name as passed to the `:named` clause. Certain drivers like Redshift always lowercase these names, so this method
     is provided for those situations.")

  (humanize-connection-error-message ^String [this, ^String message]
    "*OPTIONAL*. Return a humanized (user-facing) version of an connection error message string.
     Generic error messages are provided in the constant `connection-error-messages`; return one of these whenever
     possible.")

  (mbql->native ^java.util.Map [this, ^java.util.Map query]
    "Transpile an MBQL structured query into the appropriate native query form.

  The input QUERY will be a [fully-expanded MBQL query](https://github.com/metabase/metabase/wiki/Expanded-Queries)
  with all the necessary pieces of information to build a properly formatted native query for the given database.

  If the underlying query language supports remarks or comments, the driver should use `query->remark` to generate an
  appropriate message and include that in an appropriate place; alternatively a driver might directly include the
  query's `:info` dictionary if the underlying language is JSON-based.

  The result of this function will be passed directly into calls to `execute-query`.

  For example, a driver like Postgres would build a valid SQL expression and return a map such as:

       {:query \"-- [Contents of `(query->remark query)`]
                 SELECT * FROM my_table\"}")

  (notify-database-updated [this database]
    "*OPTIONAL*. Notify the driver that the attributes of the DATABASE have changed. This is specifically relevant in
     the event that the driver was doing some caching or connection pooling.")

  (process-query-in-context [this, ^clojure.lang.IFn qp]
    "*OPTIONAL*. Similar to `sync-in-context`, but for running queries rather than syncing. This should be used to do
     things like open DB connections that need to remain open for the duration of post-processing. This function
     follows a middleware pattern and is injected into the QP middleware stack immediately after the Query Expander;
     in other words, it will receive the expanded query. See the Mongo and H2 drivers for examples of how this is
     intended to be used.

       (defn process-query-in-context [driver qp]
         (fn [query]
           (qp query)))")

  (^{:style/indent 2} sync-in-context [this database ^clojure.lang.IFn f]
    "*OPTIONAL*. Drivers may provide this function if they need to do special setup before a sync operation such as
     `sync-database!`. The sync operation itself is encapsulated as the lambda F, which must be called with no
     arguments.

       (defn sync-in-context [driver database f]
         (with-connection [_ database]
           (f)))")

  (table-rows-seq ^clojure.lang.Sequential [this database ^java.util.Map table]
    "*OPTIONAL*. Return a sequence of *all* the rows in a given TABLE, which is guaranteed to have at least `:name`
     and `:schema` keys. (It is guaranteed too satisfy the `DatabaseMetadataTable` schema in
     `metabase.sync.interface`.) Currently, this is only used for iterating over the values in a `_metabase_metadata`

     table. As such, the results are not expected to be returned lazily. There is no expectation that the results be
     returned in any given order.")

  (current-db-time ^org.joda.time.DateTime [this database]
    "Returns the current time and timezone from the perspective of `DATABASE`.")

  (default-to-case-sensitive? ^Boolean [this]
    "Should this driver default to case-sensitive string search filter clauses (e.g. `starts-with` or `contains`)? The
    default is `true` since that was the behavior of all drivers with the exception of GA before `0.29.0` when we
    introduced case-insensitive string search filters as an option."))

(def IDriverDefaultsMixin
  "Default implementations of `IDriver` methods marked *OPTIONAL*."
  {:date-interval                     (u/drop-first-arg du/relative-date)
   :describe-table-fks                (constantly nil)
   :features                          (constantly nil)
   :format-custom-field-name          (u/drop-first-arg identity)
   :humanize-connection-error-message (u/drop-first-arg identity)
   :notify-database-updated           (constantly nil)
   :process-query-in-context          (u/drop-first-arg identity)
   :sync-in-context                   (fn [_ _ f] (f))
   :table-rows-seq                    (fn [driver & _]
                                        (throw
                                         (NoSuchMethodException.
                                          (str (name driver) " does not implement table-rows-seq."))))
   :current-db-time                   (constantly nil)
   :default-to-case-sensitive?        (constantly true)})


;;; ## CONFIG

(defsetting report-timezone (tru "Connection timezone to use when executing queries. Defaults to system timezone."))

(defonce ^:private registered-drivers
  (atom {}))

(defn register-driver!
  "Register a DRIVER, an instance of a class that implements `IDriver`, for ENGINE.

     (register-driver! :postgres (PostgresDriver.))"
  [^Keyword engine, driver-instance]
  {:pre [(keyword? engine) (map? driver-instance)]}
  (swap! registered-drivers assoc engine driver-instance)
  (log/debug (trs "Registered driver {0} {1}" (u/format-color 'blue engine) (u/emoji "🚚"))))

(defn available-drivers
  "Info about available drivers."
  []
  (m/map-vals (fn [driver]
                {:details-fields (details-fields driver)
                 :driver-name    (name driver)
                 :features       (features driver)})
              @registered-drivers))

(defn- init-driver-in-namespace! [ns-symb]
  (require ns-symb)
  (if-let [register-driver-fn (ns-resolve ns-symb '-init-driver)]
    (register-driver-fn)
    (log/warn (trs "No -init-driver function found for ''{0}''" (name ns-symb)))))

(defn find-and-load-drivers!
  "Search Classpath for namespaces that start with `metabase.driver.`, then `require` them and look for the
   `driver-init` function which provides a uniform way for Driver initialization to be done."
  []
  (doseq [ns-symb @u/metabase-namespace-symbols
          :when   (re-matches #"^metabase\.driver\.[a-z0-9_]+$" (name ns-symb))]
    (init-driver-in-namespace! ns-symb)))

(defn is-engine?
  "Is ENGINE a valid driver name?"
  [engine]
  (contains? (available-drivers) (keyword engine)))

(defn driver-supports?
  "Tests if a driver supports a given feature."
  [driver feature]
  (contains? (features driver) feature))

(defn report-timezone-if-supported
  "Returns the report-timezone if `DRIVER` supports setting it's
  timezone and a report-timezone has been specified by the user"
  [driver]
  (when (driver-supports? driver :set-timezone)
    (let [report-tz (report-timezone)]
      (when-not (empty? report-tz)
        report-tz))))

(defprotocol ^:private ParseDateTimeString
  (^:private parse [this date-time-str] "Parse the `date-time-str` and return a `DateTime` instance"))

(extend-protocol ParseDateTimeString
  DateTimeFormatter
  (parse [formatter date-time-str]
    (tformat/parse formatter date-time-str)))

;; Java's SimpleDateFormat is more flexible on what it accepts for a time zone identifier. As an example, CEST is not
;; recognized by Joda's DateTimeFormatter but is recognized by Java's SimpleDateFormat. This defrecord is used to
;; dispatch parsing for SimpleDateFormat instances. Dispatching off of the SimpleDateFormat directly wouldn't be good
;; as it's not threadsafe. This will always create a new SimpleDateFormat instance and discard it after parsing the
;; date
(defrecord ^:private ThreadSafeSimpleDateFormat [format-str]
  :load-ns true
  ParseDateTimeString
  (parse [_ date-time-str]
    (let [sdf         (SimpleDateFormat. format-str)
          parsed-date (.parse sdf date-time-str)
          joda-tz     (-> sdf .getTimeZone .getID time/time-zone-for-id)]
      (time/to-time-zone (tcoerce/from-date parsed-date) joda-tz))))

(defn create-db-time-formatters
  "Creates date formatters from `DATE-FORMAT-STR` that will preserve the offset/timezone information. Will return a
  JodaTime date formatter and a core Java SimpleDateFormat. Results of this are threadsafe and can safely be def'd."
  [date-format-str]
  [(.withOffsetParsed ^DateTimeFormatter (tformat/formatter date-format-str))
   (ThreadSafeSimpleDateFormat. date-format-str)])

(defn- first-successful-parse
  "Attempt to parse `time-str` with each of `date-formatters`, returning the first successful parse. If there are no
  successful parses throws the exception that the last formatter threw."
  [date-formatters time-str]
  (or (some #(u/ignore-exceptions (parse % time-str)) date-formatters)
      (doseq [formatter (reverse date-formatters)]
        (parse formatter time-str))))

(defn make-current-db-time-fn
  "Takes a clj-time date formatter `DATE-FORMATTER` and a native query
  for the current time. Returns a function that executes the query and
  parses the date returned preserving it's timezone"
  [native-query date-formatters]
  (fn [driver database]
    (let [settings (when-let [report-tz (report-timezone-if-supported driver)]
                     {:settings {:report-timezone report-tz}})
          time-str (try
                     (->> (merge settings {:database database, :native {:query native-query}})
                          (execute-query driver)
                          :rows
                          ffirst)
                     (catch Exception e
                       (throw
                        (Exception.
                         (format "Error querying database '%s' for current time" (:name database)) e))))]
      (try
        (when time-str
          (first-successful-parse date-formatters time-str))
        (catch Exception e
          (throw
           (Exception.
            (tru "Unable to parse date string ''{0}'' for database engine ''{1}''"
                    time-str (-> database :engine name)) e)))))))

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
             [DateTime                       :type/DateTime]
             [java.util.UUID                 :type/Text]       ; shouldn't this be :type/UUID ?
             [clojure.lang.IPersistentMap    :type/Dictionary]
             [clojure.lang.IPersistentVector :type/Array]
             [org.bson.types.ObjectId        :type/MongoBSONID]
             [org.postgresql.util.PGobject   :type/*]])
      (log/warn (trs "Don''t know how to map class ''{0}'' to a Field base_type, falling back to :type/*." klass))
      :type/*))

(defn values->base-type
  "Given a sequence of VALUES, return the most common base type."
  [values]
  (->> values
       (take 100)                                   ; take up to 100 values
       (filter (complement nil?))                   ; filter out `nil` values
       (group-by (comp class->base-type class))     ; now group by their base-type
       (sort-by (comp (partial * -1) count second)) ; sort the map into pairs of [base-type count] with highest count as first pair
       ffirst))                                     ; take the base-type from the first pair


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
      (let [namespace-symb (symbol (format "metabase.driver.%s" (name engine)))]
        ;; TODO - Maybe this should throw the Exception instead of swallowing it?
        (u/ignore-exceptions (init-driver-in-namespace! namespace-symb))
        ((keyword engine) @registered-drivers))))


;; Can the type of a DB change?
(def ^{:arglists '([database-id])} database-id->driver
  "Memoized function that returns the driver instance that should be used for `Database` with ID.
   (Databases aren't expected to change their types, and this optimization makes things a lot faster).

   This loads the corresponding driver if needed."
  (let [db-id->engine (memoize (fn [db-id] (db/select-one-field :engine Database, :id db-id)))]
    (fn [db-id]
      (when-let [engine (db-id->engine (u/get-id db-id))]
        (engine->driver engine)))))

(defn ->driver
  "Return an appropraiate driver for ENGINE-OR-DATABASE-OR-DB-ID.
   Offered since this is somewhat more flexible in the arguments it accepts."
  ;; TODO - we should make `engine->driver` and `database-id->driver` private and just use this for everything
  [engine-or-database-or-db-id]
  (if (keyword? engine-or-database-or-db-id)
    (engine->driver engine-or-database-or-db-id)
    (database-id->driver (u/get-id engine-or-database-or-db-id))))


;; ## Implementation-Agnostic Driver API
(def ^:private can-connect-timeout-ms
  "Consider `can-connect?`/`can-connect-with-details?` to have failed after this many milliseconds.
   By default, this is 5 seconds. You can configure this value by setting the env var `MB_DB_CONNECTION_TIMEOUT_MS`."
  (or (config/config-int :mb-db-connection-timeout-ms)
      5000))

(defn can-connect-with-details?
  "Check whether we can connect to a database with ENGINE and DETAILS-MAP and perform a basic query
   such as `SELECT 1`. Specify optional param RETHROW-EXCEPTIONS if you want to handle any exceptions
   thrown yourself (e.g., so you can pass the exception message along to the user).

     (can-connect-with-details? :postgres {:host \"localhost\", :port 5432, ...})"
  ^Boolean [engine details-map & [rethrow-exceptions]]
  {:pre [(keyword? engine) (map? details-map)]}
  (let [driver (engine->driver engine)]
    (try
      (u/with-timeout can-connect-timeout-ms
        (can-connect? driver details-map))
      (catch Throwable e
        (log/error (trs "Failed to connect to database: {0}" (.getMessage e)))
        (when rethrow-exceptions
          (throw (Exception. (humanize-connection-error-message driver (.getMessage e)))))
        false))))


(def ^:const max-sample-rows
  "The maximum number of values we should return when using `table-rows-sample`.
   This many is probably fine for inferring special types and what-not; we don't want
   to scan millions of values at any rate."
  10000)

;; TODO - move this to the metadata-queries namespace or something like that instead
(s/defn ^{:style/indent 1} table-rows-sample :- (s/maybe si/TableSample)
  "Run a basic MBQL query to fetch a sample of rows belonging to a Table."
  [table :- si/TableInstance, fields :- [si/FieldInstance]]
  (let [results ((resolve 'metabase.query-processor/process-query)
                 {:database (:db_id table)
                  :type     :query
                  :query    {:source-table (u/get-id table)
                             :fields       (vec (for [field fields]
                                                  [:field-id (u/get-id field)]))
                             :limit        max-sample-rows}})]
    (get-in results [:data :rows])))
