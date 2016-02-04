(ns metabase.driver
  (:require [clojure.java.classpath :as classpath]
            [clojure.math.numeric-tower :as math]
            [clojure.string :as s]
            [clojure.tools.logging :as log]
            [clojure.tools.namespace.find :as ns-find]
            [korma.core :as k]
            [medley.core :as m]
            [metabase.db :refer [ins sel upd]]
            (metabase.models [database :refer [Database]]
                             [query-execution :refer [QueryExecution]])
            [metabase.models.setting :refer [defsetting]]
            [metabase.util :as u])
  (:import clojure.lang.Keyword))

(declare query-fail query-complete save-query-execution)

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
  {:cannot-connect-check-host-and-port "Hmm, we couldn't connect to the database. Make sure your host and port settings are correct."
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
    "Return a map containing information that provides optional analysis values for TABLE.

     Each map should be structured as follows:

         {:rows   <row-count>
          :fields [{:name            <field-name>
                    :base-type       <field-base-type>
                    :field-type      <field-field-type>
                    :special-type    <field-special-type>
                    :preview-display <true|false>
                    :pk?             <true|false>]}")

  (can-connect? ^Boolean [this, ^Map details-map]
    "Check whether we can connect to a `Database` with DETAILS-MAP and perform a simple query. For example, a SQL database might
     try running a query like `SELECT 1;`. This function should return `true` or `false`.")

  (date-interval [this, ^Keyword unit, ^Number amount]
    "*OPTIONAL* Return an driver-appropriate representation of a moment relative to the current moment in time. By default, this returns an `Timestamp` by calling
     `metabase.util/relative-date`; but when possible drivers should return a native form so we can be sure the correct timezone is applied. For example, SQL drivers should
     return a Korma form to call the appropriate SQL fns:

       (date-interval (PostgresDriver.) :month 1) -> (k/raw* \"(NOW() + INTERVAL '1 month')\")")

  (describe-database ^java.util.Map [this, ^DatabaseInstance database]
    "Return a map containing information that describes all of the schema settings in DATABASE, most notably a set of tables.
     It is expected that this function will be peformant and avoid draining meaningful resources of the database.

     Each map should be structured as follows (NOTE that :tables is a Set):

         {:tables #{{:name   <table-name>
                     :schema <table-schema|nil>}}}")

  (describe-table ^java.util.Map [this, ^TableInstance table]
    "Return a map containing information that describes the physical schema of TABLE.
     It is expected that this function will be peformant and avoid draining meaningful resources of the database.

     Each map should be structured as follows (NOTE that :fields is a Set):

         {:name   <table-name>
          :schema <table-schema|nil>
          :fields #{{:name            <field-name>
                     :base-type       <field-base-type>
                     :special-type    <field-special-type>
                     :preview-display <true|false>
                     :pk?             <true|false>
                     :nested-fields   #{ same structure as a field }}}")

  (describe-table-fks ^java.util.Set [this, ^TableInstance table]
    "*OPTIONAL*, BUT REQUIRED FOR DRIVERS THAT SUPPORT `:foreign-keys`*

     Return a set of maps containing info about FK columns for TABLE.
     Each map should be structured as follows:

         {:fk-column-name    <column-name-of-fk-origin>
          :dest-table        {:name   <name-of-destination-table>,
                              :schema <schema-of-destination-table>}
          :dest-column-name  <column-name-of-fk-destination>}")

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

  (features ^java.util.Set [this]
    "*OPTIONAL*. A set of keyword names of optional features supported by this driver, such as `:foreign-keys`. Valid features are:

     *  `:foreign-keys`
     *  `:nested-fields`
     *  `:set-timezone`
     *  `:standard-deviation-aggregations`")

  (field-values-lazy-seq ^clojure.lang.Sequential [this, ^FieldInstance field]
    "Return a lazy sequence of all values of FIELD.
     This is used to implement some methods of the database sync process which require rows of data during execution.

     The lazy sequence should not return more than `max-sync-lazy-seq-results`, which is currently `10000`.
     For drivers that provide a chunked implementation, a recommended chunk size is `field-values-lazy-seq-chunk-size`, which is currently `500`.")

  (humanize-connection-error-message ^String [this, ^String message]
    "*OPTIONAL*. Return a humanized (user-facing) version of an connection error message string.
     Generic error messages are provided in the constant `connection-error-messages`; return one of these whenever possible.")

  (process-native [this, ^Map query]
    "Process a native QUERY. This function is called by `metabase.driver/process-query`.")

  (process-structured [this, ^Map query]
    "Process a native or structured QUERY. This function is called by `metabase.driver/process-query` after performing various driver-unspecific
     steps like Query Expansion and other preprocessing.")

  (process-query-in-context [this, ^IFn qp]
    "*OPTIONAL*. Similar to `sync-in-context`, but for running queries rather than syncing. This should be used to do things like open DB connections
     that need to remain open for the duration of post-processing. This function follows a middleware pattern and is injected into the QP
     middleware stack immediately after the Query Expander; in other words, it will receive the expanded query.
     See the Mongo and H2 drivers for examples of how this is intended to be used.

       (defn process-query-in-context [driver qp]
         (fn [query]
           (qp query)))")

  (sync-in-context [this, ^DatabaseInstance database, ^IFn f]
    "*OPTIONAL*. Drivers may provide this function if they need to do special setup before a sync operation such as `sync-database!`. The sync
     operation itself is encapsulated as the lambda F, which must be called with no arguments.

       (defn sync-in-context [driver database f]
         (with-connection [_ database]
           (f)))")

  (table-rows-seq ^clojure.lang.Sequential [this, ^DatabaseInstance database, ^String table-name]
    "*OPTIONAL*. Return a sequence of all the rows in a table with a given TABLE-NAME.
     Currently, this is only used for iterating over the values in a `_metabase_metadata` table. As such, the results are not expected to be returned lazily."))


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
    (if (= field-values-count 0) 0
        (int (math/round (/ (->> field-values
                                 (map str)
                                 (map count)
                                 (reduce +))
                            field-values-count))))))


(def IDriverDefaultsMixin
  "Default implementations of `IDriver` methods marked *OPTIONAL*."
  {:date-interval                     (fn [_ unit amount] (u/relative-date unit amount))
   :describe-table-fks                (constantly nil)
   :features                          (constantly nil)
   :humanize-connection-error-message (fn [_ message] message)
   :process-query-in-context          (fn [_ qp]      qp)
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
  (log/debug (format "Registered driver %s." engine)))

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
  (log/info "find-and-load-drivers!")
  (doseq [namespce (filter (fn [ns-symb]
                             (re-matches #"^metabase\.driver\.[a-z0-9_]+$" (name ns-symb)))
                           (ns-find/find-namespaces (classpath/classpath)))]
    (require namespce)))

(defn is-engine?
  "Is ENGINE a valid driver name?"
  [engine]
  (when engine
    (contains? (set (keys (available-drivers))) (keyword engine))))

(defn class->base-type
  "Return the `Field.base_type` that corresponds to a given class returned by the DB."
  [klass]
  (or ({Boolean                         :BooleanField
        Double                          :FloatField
        Float                           :FloatField
        Integer                         :IntegerField
        Long                            :IntegerField
        String                          :TextField
        java.math.BigDecimal            :DecimalField
        java.math.BigInteger            :BigIntegerField
        java.sql.Date                   :DateField
        java.sql.Timestamp              :DateTimeField
        java.util.Date                  :DateField
        java.util.UUID                  :TextField
        clojure.lang.PersistentArrayMap :DictionaryField
        clojure.lang.PersistentHashMap  :DictionaryField
        clojure.lang.PersistentVector   :ArrayField
        org.postgresql.util.PGobject    :UnknownField} klass)
      (condp isa? klass
        clojure.lang.IPersistentMap     :DictionaryField
        clojure.lang.IPersistentVector  :ArrayField
        nil)
      (do (log/warn (format "Don't know how to map class '%s' to a Field base_type, falling back to :UnknownField." klass))
          :UnknownField)))

;; ## Driver Lookup

(defn engine->driver
  "Return the driver instance that should be used for given ENGINE.
   This loads the corresponding driver if needed; it is expected that it resides in a var named

     metabase.driver.<engine>/<engine>"
  [engine]
  {:pre [engine]}
  (or ((keyword engine) @registered-drivers)
      (let [namespce (symbol (format "metabase.driver.%s" (name engine)))]
        (log/debug (format "Loading driver '%s'..." engine))
        (u/try-ignore-exceptions (require namespce))
        ((keyword engine) @registered-drivers))))


;; Can the type of a DB change?
(def ^{:arglists '([database-id])} database-id->driver
  "Memoized function that returns the driver instance that should be used for `Database` with ID.
   (Databases aren't expected to change their types, and this optimization makes things a lot faster).

   This loads the corresponding driver if needed."
  (let [db-id->engine (memoize (fn [db-id] (sel :one :field [Database :engine] :id db-id)))]
    (fn [db-id]
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
  {:pre [(keyword? engine)
         (map? details-map)]}
  (let [driver (engine->driver engine)]
    (try
      (u/with-timeout can-connect-timeout-ms
        (can-connect? driver details-map))
      (catch Throwable e
        (log/error "Failed to connect to database:" (.getMessage e))
        (when rethrow-exceptions
          (throw (Exception. (humanize-connection-error-message driver (.getMessage e)))))
        false))))

(defn sync-database!
  "Sync a `Database`, its `Tables`, and `Fields`.

   Takes an optional kwarg `:full-sync?` (default = `true`).  A full sync includes more in depth table analysis work."
  [database & {:keys [full-sync?]}]
  {:pre [(map? database)]}
  (require 'metabase.driver.sync)
  (@(resolve 'metabase.driver.sync/sync-database!) (engine->driver (:engine database)) database :full-sync? full-sync?))

(defn sync-table!
  "Sync a `Table` and its `Fields`.

   Takes an optional kwarg `:full-sync?` (default = `true`).  A full sync includes more in depth table analysis work."
  [table & {:keys [full-sync?]}]
  {:pre [(map? table)]}
  (require 'metabase.driver.sync)
  (@(resolve 'metabase.driver.sync/sync-table!) (database-id->driver (:db_id table)) table :full-sync? full-sync?))

(defn process-query
  "Process a structured or native query, and return the result."
  [query]
  (require 'metabase.driver.query-processor)
  (@(resolve 'metabase.driver.query-processor/process) (database-id->driver (:database query)) query))


;; ## Query Execution Stuff

(defn dataset-query
  "Process and run a json based dataset query and return results.

  Takes 2 arguments:

  1.  the json query as a dictionary
  2.  query execution options specified in a dictionary

  Depending on the database specified in the query this function will delegate to a driver specific implementation.
  For the purposes of tracking we record each call to this function as a QueryExecution in the database.

  Possible caller-options include:

    :executed_by [int]               (user_id of caller)"
  {:arglists '([query options])}
  [query {:keys [executed_by]
          :as options}]
  {:pre [(integer? executed_by)]}
  (let [query-execution {:uuid              (.toString (java.util.UUID/randomUUID))
                         :executor_id       executed_by
                         :json_query        query
                         :query_id          nil
                         :version           0
                         :status            :starting
                         :error             ""
                         :started_at        (u/new-sql-timestamp)
                         :finished_at       (u/new-sql-timestamp)
                         :running_time      0
                         :result_rows       0
                         :result_file       ""
                         :result_data       "{}"
                         :raw_query         ""
                         :additional_info   ""
                         :start_time_millis (System/currentTimeMillis)}]
    (try
      (let [query-result (process-query query)]
        (when-not (contains? query-result :status)
          (throw (Exception. "invalid response from database driver. no :status provided")))
        (when (= :failed (:status query-result))
          (log/error (u/pprint-to-str 'red query-result))
          (throw (Exception. (str (get query-result :error "general error")))))
        (query-complete query-execution query-result))
      (catch Exception e
        (log/error (u/format-color 'red "Query failure: %s" (.getMessage e)))
        (query-fail query-execution (.getMessage e))))))

(defn query-fail
  "Save QueryExecution state and construct a failed query response"
  [query-execution error-message]
  (let [updates {:status       :failed
                 :error        error-message
                 :finished_at  (u/new-sql-timestamp)
                 :running_time (- (System/currentTimeMillis) (:start_time_millis query-execution))}]
    ;; record our query execution and format response
    (-> query-execution
        (dissoc :start_time_millis)
        (merge updates)
        (save-query-execution)
        ;; this is just for the response for clien
        (assoc :error     error-message
               :row_count 0
               :data      {:rows    []
                           :cols    []
                           :columns []}))))

(defn query-complete
  "Save QueryExecution state and construct a completed (successful) query response"
  [query-execution query-result]
  ;; record our query execution and format response
  (-> (u/assoc<> query-execution
        :status       :completed
        :finished_at  (u/new-sql-timestamp)
        :running_time (- (System/currentTimeMillis) (:start_time_millis <>))
        :result_rows  (get query-result :row_count 0))
      (dissoc :start_time_millis)
      (save-query-execution)
      ;; at this point we've saved and we just need to massage things into our final response format
      (select-keys [:id :uuid])
      (merge query-result)))

(defn save-query-execution
  "Save (or update) a `QueryExecution`."
  [{:keys [id] :as query-execution}]
  (if id
    ;; execution has already been saved, so update it
    (do
      (m/mapply upd QueryExecution id query-execution)
      query-execution)
    ;; first time saving execution, so insert it
    (m/mapply ins QueryExecution query-execution)))


(u/require-dox-in-this-namespace)
