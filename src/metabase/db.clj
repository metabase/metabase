(ns metabase.db
  "Database definition and helper functions for interacting with the database."
  (:require (clojure.java [io :as io]
                          [jdbc :as jdbc])
            [clojure.tools.logging :as log]
            (clojure [set :as set]
                     [string :as s]
                     [walk :as walk])
            (honeysql [core :as hsql]
                      [format :as hformat]
                      [helpers :as h])
            [medley.core :as m]
            [ring.util.codec :as codec]
            [metabase.config :as config]
            [metabase.db.spec :as dbspec]
            [metabase.models.interface :as models]
            [metabase.util :as u]
            metabase.util.honeysql-extensions) ; this needs to be loaded so the `:h2` quoting style gets added
  (:import (java.util.jar JarFile JarFile$JarEntryIterator JarFile$JarFileEntry)
           java.sql.Connection
           clojure.lang.Atom
           com.mchange.v2.c3p0.ComboPooledDataSource))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                              DB FILE & CONNECTION DETAILS                                              |
;;; +------------------------------------------------------------------------------------------------------------------------+

(def db-file
  "Path to our H2 DB file from env var or app config."
  ;; see http://h2database.com/html/features.html for explanation of options
  (delay (if (config/config-bool :mb-db-in-memory)
           ;; In-memory (i.e. test) DB
           "mem:metabase;DB_CLOSE_DELAY=-1"
           ;; File-based DB
           (let [db-file-name (config/config-str :mb-db-file)
                 db-file      (io/file db-file-name)
                 options      ";AUTO_SERVER=TRUE;DB_CLOSE_DELAY=-1"]
             (apply str "file:" (if (.isAbsolute db-file)
                                  ;; when an absolute path is given for the db file then don't mess with it
                                  [db-file-name options]
                                  ;; if we don't have an absolute path then make sure we start from "user.dir"
                                  [(System/getProperty "user.dir") "/" db-file-name options]))))))

(defn- parse-connection-string
  "Parse a DB connection URI like `postgres://cam@localhost.com:5432/cams_cool_db?ssl=true&sslfactory=org.postgresql.ssl.NonValidatingFactory` and return a broken-out map."
  [uri]
  (when-let [[_ protocol user pass host port db query] (re-matches #"^([^:/@]+)://(?:([^:/@]+)(?::([^:@]+))?@)?([^:@]+)(?::(\d+))?/([^/?]+)(?:\?(.*))?$" uri)]
    (merge {:type     (case (keyword protocol)
                        :postgres   :postgres
                        :postgresql :postgres
                        :mysql      :mysql)
            :user     user
            :password pass
            :host     host
            :port     port
            :dbname   db}
           (some-> query
                   codec/form-decode
                   walk/keywordize-keys))))

(def ^:private connection-string-details
  (delay (when-let [uri (config/config-str :mb-db-connection-uri)]
           (parse-connection-string uri))))

(defn db-type
  "The type of backing DB used to run Metabase. `:h2`, `:mysql`, or `:postgres`."
  ^clojure.lang.Keyword []
  (or (:type @connection-string-details)
      (config/config-kw :mb-db-type)))

(def db-connection-details
  "Connection details that can be used when pretending the Metabase DB is itself a `Database`
   (e.g., to use the Generic SQL driver functions on the Metabase DB itself)."
  (delay (or @connection-string-details
             (case (db-type)
               :h2       {:type     :h2                               ; TODO - we probably don't need to specifc `:type` here since we can just call (db-type)
                          :db       @db-file}
               :mysql    {:type     :mysql
                          :host     (config/config-str :mb-db-host)
                          :port     (config/config-int :mb-db-port)
                          :dbname   (config/config-str :mb-db-dbname)
                          :user     (config/config-str :mb-db-user)
                          :password (config/config-str :mb-db-pass)}
               :postgres {:type     :postgres
                          :host     (config/config-str :mb-db-host)
                          :port     (config/config-int :mb-db-port)
                          :dbname   (config/config-str :mb-db-dbname)
                          :user     (config/config-str :mb-db-user)
                          :password (config/config-str :mb-db-pass)}))))

(defn jdbc-details
  "Takes our own MB details map and formats them properly for connection details for JDBC."
  ([]
   (jdbc-details @db-connection-details))
  ([db-details]
   {:pre [(map? db-details)]}
   ;; TODO: it's probably a good idea to put some more validation here and be really strict about what's in `db-details`
   (case (:type db-details)
     :h2       (dbspec/h2       db-details)
     :mysql    (dbspec/mysql    (assoc db-details :db (:dbname db-details)))
     :postgres (dbspec/postgres (assoc db-details :db (:dbname db-details))))))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                                        MIGRATE!                                                        |
;;; +------------------------------------------------------------------------------------------------------------------------+

(defn- filename-without-path-or-prefix
  "Strip the path and/or prefix from a migration FILENAME if it has them."
  [filename]
  (s/replace filename #"^(?:migrations/)?([\w\d]+)(?:\.(?:json|yaml))?$" "$1"))

(defn- migration-files:jar
  "Return the set of migration filenames (without path or prefix) inside the uberjar.
   (`io/resource` doesn't work here; this approach adapted from [this StackOverflow answer](http://stackoverflow.com/a/20073154/1198455).)"
  []
  ;; get path to the jar -- see this SO answer http://stackoverflow.com/a/320595/1198455
  (let [^String                   jar-path (s/replace (-> ComboPooledDataSource .getProtectionDomain .getCodeSource .getLocation .getPath) #"%20" " ")
        ^JarFile$JarEntryIterator entries  (.entries (JarFile. jar-path))
        ^Atom                     files    (atom #{})]
    (while (.hasMoreElements entries)
      (let [^JarFile$JarFileEntry entry      (.nextElement entries)
            ^String               entry-name (.getName entry)]
        (when (and (.startsWith entry-name "migrations/")
                   (not= entry-name "migrations/"))       ; skip the directory itself
          (swap! files conj (filename-without-path-or-prefix entry-name)))))
    @files))

(defn- migration-files
  "Return the set of migration filenames (without path or prefix) in the `resources/migrations` directory or from the JAR."
  []
  ;; unfortunately io/as-file doesn't seem to work for directories inside a JAR. Try it for local dev but fall back to hacky Java interop method if that fails
  (try (set (map filename-without-path-or-prefix (.list (io/as-file (io/resource "migrations")))))
       (catch Throwable _
         (migration-files:jar))))

(declare quote-fn)

(defn- migration-entries
  "Return a set of migration files (without path or prefix) that have already been run.
   This is fetched from the `databasechangelog` table.
     (migration-entires) -> #{\"001_initial_schema\", \"002_add_session_table\", ...}"
  []
  ;; an Exception will get thrown if there is no databasechangelog table yet; just return nil in that case because nil will never equal any set
  (u/ignore-exceptions
    (set (for [{filename :filename} (jdbc/query (jdbc-details) [(format "SELECT %s AS filename FROM %s;" ((quote-fn) "filename") ((quote-fn) "databasechangelog"))])]
           (filename-without-path-or-prefix filename)))))

(defn- has-unrun-migration-files?
  "`true` if the set of migration files is the same as the set of migrations that have already been run."
  ^Boolean []
  (not= (migration-files)
        (migration-entries)))

(defn migrate!
  "Migrate the database (this can also be ran via command line like `java -jar metabase.jar migrate up` or `lein run migrate up`):

   *  `:up`            - Migrate up
   *  `:force`         - Force migrate up, ignoring locks and any DDL statements that fail.
   *  `:down-one`      - Rollback a single migration
   *  `:print`         - Just print the SQL for running the migrations, don't actually run them.
   *  `:release-locks` - Manually release migration locks left by an earlier failed migration.
                         (This shouldn't be necessary now that we run migrations inside a transaction, but is available just in case).

   Note that this only performs *schema migrations*, not data migrations. Data migrations are handled separately by `metabase.db.migrations/run-all!`.
   (`setup-db!`, below, calls both this function and `run-all!`)."
  ([]
   (migrate! :up))
  ([direction]
   (migrate! @db-connection-details direction))
  ([db-details direction]
   ;; Loading Liquibase is slow slow slow so only do it if we actually need to
   (require 'metabase.db.liquibase)
   ((resolve 'metabase.db.liquibase/migrate!) (jdbc-details db-details) direction)))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                          CONNECTION POOLS & TRANSACTION STUFF                                          |
;;; +------------------------------------------------------------------------------------------------------------------------+

(defn connection-pool
  "Create a C3P0 connection pool for the given database SPEC."
  [{:keys [subprotocol subname classname minimum-pool-size idle-connection-test-period excess-timeout]
    :or   {minimum-pool-size           3
           idle-connection-test-period 0
           excess-timeout              (* 30 60)}
    :as   spec}]
  {:datasource (doto (ComboPooledDataSource.)
                 (.setDriverClass                  classname)
                 (.setJdbcUrl                      (str "jdbc:" subprotocol ":" subname))
                 (.setMaxIdleTimeExcessConnections excess-timeout)
                 (.setMaxIdleTime                  (* 3 60 60))
                 (.setInitialPoolSize              3)
                 (.setMinPoolSize                  minimum-pool-size)
                 (.setMaxPoolSize                  15)
                 (.setIdleConnectionTestPeriod     idle-connection-test-period)
                 (.setTestConnectionOnCheckin      false)
                 (.setTestConnectionOnCheckout     false)
                 (.setPreferredTestQuery           nil)
                 (.setProperties                   (u/prog1 (java.util.Properties.)
                                                     (doseq [[k v] (dissoc spec :classname :subprotocol :subname :naming :delimiters :alias-delimiter
                                                                                :excess-timeout :minimum-pool-size :idle-connection-test-period)]
                                                       (.setProperty <> (name k) (str v))))))})

(def ^:private db-connection-pool
  (atom nil))

(defn- create-connection-pool!
  [spec]
  (reset! db-connection-pool (connection-pool spec)))

(def ^:private ^:dynamic *transaction-connection*
  "Transaction connection to the *Metabase* backing DB connection pool. Used internally by `transaction`."
  nil)

(declare setup-db-if-needed!)

(defn- db-connection
  "Get a JDBC connection spec for the Metabase DB."
  []
  (setup-db-if-needed!)
  (or *transaction-connection*
      @db-connection-pool
      (throw (Exception. "DB is not setup."))))

(defn do-in-transaction
  "Execute F inside a DB transaction. Prefer macro form `transaction` to using this directly."
  [f]
  (jdbc/with-db-transaction [conn (db-connection)]
    (binding [*transaction-connection* conn]
      (f))))

(defmacro transaction
  "Execute all queries within the body in a single transaction."
  {:arglists '([body] [options & body]), :style/indent 0}
  [& body]
  `(do-in-transaction (fn [] ~@body)))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                                       DB SETUP                                                         |
;;; +------------------------------------------------------------------------------------------------------------------------+


(def ^:private setup-db-has-been-called?
  (atom false))

(def ^:dynamic *allow-potentailly-unsafe-connections*
  "We want to make *every* database connection made by the drivers safe -- read-only, only connect if DB file exists, etc.
   At the same time, we'd like to be able to use driver functionality like `can-connect-with-details?` to check whether we can
   connect to the Metabase database, in which case we'd like to allow connections to databases that don't exist.

   So we need some way to distinguish the Metabase database from other databases. We could add a key to the details map
   specifying that it's the Metabase DB, but what if some shady user added that key to another database?

   We could check if a database details map matched `db-connection-details` above, but what if a shady user went Meta-Metabase
   and added the Metabase DB to Metabase itself? Then when they used it they'd have potentially unsafe access.

   So this is where dynamic variables come to the rescue. We'll make this one `true` when we use `can-connect?` for the
   Metabase DB, in which case we'll allow connection to non-existent H2 (etc.) files, and leave it `false` happily and
   forever after, making all other connnections \"safe\"."
  false)

(defn- verify-db-connection
  "Test connection to database with DETAILS and throw an exception if we have any troubles connecting."
  [engine details]
  {:pre [(keyword? engine) (map? details)]}
  (log/info (u/format-color 'cyan "Verifying %s Database Connection ..." (name engine)))
  (assert (binding [*allow-potentailly-unsafe-connections* true]
            (require 'metabase.driver)
            ((resolve 'metabase.driver/can-connect-with-details?) engine details))
    (format "Unable to connect to Metabase %s DB." (name engine)))
  (log/info "Verify Database Connection ... " (u/emoji "✅")))


(def ^:dynamic ^Boolean *disable-data-migrations*
  "Should we skip running data migrations when setting up the DB? (Default is `false`).
   There are certain places where we don't want to do this; for example, none of the migrations should be ran when Metabase is launched via `load-from-h2`.
   That's because they will end up doing things like creating duplicate entries for the \"magic\" groups and permissions entries. "
  false)

(defn- print-migrations-and-quit!
  "If we are not doing auto migrations then print out migration SQL for user to run manually.
   Then throw an exception to short circuit the setup process and make it clear we can't proceed."
  [db-details]
  (let [sql (migrate! db-details :print)]
    (log/info (str "Database Upgrade Required\n\n"
                   "NOTICE: Your database requires updates to work with this version of Metabase.  "
                   "Please execute the following sql commands on your database before proceeding.\n\n"
                   sql
                   "\n\n"
                   "Once your database is updated try running the application again.\n"))
    (throw (java.lang.Exception. "Database requires manual upgrade."))))

(defn- run-schema-migrations!
  "Run Liquibase migrations if needed if AUTO-MIGRATE? is enabled, otherwise print migrations and quit."
  [auto-migrate? db-details]
  (when-not auto-migrate?
    (print-migrations-and-quit! db-details))
  (log/info "Database has unrun migrations. Preparing to run migrations...")
  (migrate! db-details :up)
  (log/info "Database Migrations Current ... " (u/emoji "✅")))

(defn- run-schema-migrations-if-needed!
  "Check and see if we need to run any schema migrations, and run them if needed."
  [auto-migrate? db-details]
  (log/info "Checking to see if database has unrun migrations...")
  (if (has-unrun-migration-files?)
    (run-schema-migrations! auto-migrate? db-details)
    (log/info "Database migrations are up to date. Skipping loading Liquibase.")))

(defn- run-data-migrations!
  "Do any custom code-based migrations once the DB structure is up to date."
  []
  (require 'metabase.db.migrations)
  ((resolve 'metabase.db.migrations/run-all!)))

(defn setup-db!
  "Do general preparation of database by validating that we can connect.
   Caller can specify if we should run any pending database migrations."
  [& {:keys [db-details auto-migrate]
      :or   {db-details   @db-connection-details
             auto-migrate true}}]
  (reset! setup-db-has-been-called? true)
  (verify-db-connection (:type db-details) db-details)
  (run-schema-migrations-if-needed! auto-migrate db-details)
  (create-connection-pool! (jdbc-details db-details))
  (run-data-migrations!))

(defn setup-db-if-needed!
  "Call `setup-db!` if DB is not already setup; otherwise this does nothing."
  [& args]
  (when-not @setup-db-has-been-called?
    (apply setup-db! args)))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                         NEW HONEY-SQL BASED DB UTIL FUNCTIONS                                          |
;;; +------------------------------------------------------------------------------------------------------------------------+

(def ^:dynamic ^Boolean *disable-db-logging*
  "Should we disable logging for database queries? Normally `false`, but bind this to `true` to keep logging from getting too noisy during
   operations that require a lot of DB access, like the sync process."
  false)


(defn- entity-symb->ns
  "Return the namespace symbol where we'd expect to find an entity symbol.

     (entity-symb->ns 'CardFavorite) -> 'metabase.models.card-favorite"
  [symb]
  {:pre [(symbol? symb)]}
  (symbol (str "metabase.models." (s/lower-case (s/replace (name symb) #"([a-z])([A-Z])" "$1-$2")))))

(defn- resolve-entity-from-symbol
  "Resolve the entity associated with SYMB, calling `require` on its namespace if needed.

     (resolve-entity-from-symbol 'CardFavorite) -> metabase.models.card-favorite/CardFavorite"
  [symb]
  (let [entity-ns (entity-symb->ns symb)]
    @(try (ns-resolve entity-ns symb)
          (catch Throwable _
            (require entity-ns)
            (ns-resolve entity-ns symb)))))

(defn resolve-entity
  "Resolve a model entity *if* it's quoted. This also unwraps entities when they're inside vectores.

     (resolve-entity Database)         -> #'metabase.models.database/Database
     (resolve-entity [Database :name]) -> #'metabase.models.database/Database
     (resolve-entity 'Database)        -> #'metabase.models.database/Database"
  [entity]
  {:post [(:metabase.models.interface/entity %)]}
  (cond
    (:metabase.models.interface/entity entity) entity
    (vector? entity)                           (resolve-entity (first entity))
    (symbol? entity)                           (resolve-entity-from-symbol entity)
    :else                                      (throw (Exception. (str "Invalid entity: " entity)))))

(defn- quoting-style
  "Style of `:quoting` that should be passed to HoneySQL `format`."
  ^clojure.lang.Keyword []
  (case (db-type)
    :h2       :h2
    :mysql    :mysql
    :postgres :ansi))

(defn- quote-fn
  "The function that JDBC should use to quote identifiers for our database. This is passed as the `:entities` option to functions like `jdbc/insert!`."
  []
  ((quoting-style) @(resolve 'honeysql.format/quote-fns)))


(def ^:private ^:dynamic *call-count*
  "Atom used as a counter for DB calls when enabled.
   This number isn't *perfectly* accurate, only mostly; DB calls made directly to JDBC won't be logged."
  nil)

(defn -do-with-call-counting
  "Execute F with DB call counting enabled. F is passed a single argument, a function that can be used to retrieve the current call count.
   (It's probably more useful to use the macro form of this function, `with-call-counting`, instead.)"
  {:style/indent 0}
  [f]
  (binding [*call-count* (atom 0)]
    (f (partial deref *call-count*))))

(defmacro with-call-counting
  "Execute BODY and track the number of DB calls made inside it. CALL-COUNT-FN-BINDING is bound to a zero-arity function that can be used to fetch the current
   DB call count.

     (db/with-call-counting [call-count]
       ...
       (call-count))"
  {:style/indent 1}
  [[call-count-fn-binding] & body]
  `(-do-with-call-counting (fn [~call-count-fn-binding] ~@body)))

(defmacro debug-count-calls
  "Print the number of DB calls executed inside BODY to `stdout`. Intended for use during REPL development."
  [& body]
  `(with-call-counting [call-count#]
     (u/prog1 (do ~@body)
       (println "DB Calls:" (call-count#)))))


(defn- format-sql [sql]
  (when sql
    (loop [sql sql, [k & more] ["FROM" "LEFT JOIN" "INNER JOIN" "WHERE" "GROUP BY" "HAVING" "ORDER BY" "OFFSET" "LIMIT"]]
      (if-not k
        sql
        (recur (s/replace sql (re-pattern (format "\\s+%s\\s+" k)) (format "\n%s " k))
               more)))))

(def ^:dynamic ^:private *debug-print-queries* false)

(defn -do-with-debug-print-queries
  "Execute F with debug query logging enabled. Don't use this directly; prefer the `debug-print-queries` macro form instead."
  [f]
  (binding [*debug-print-queries* true]
    (f)))

(defmacro debug-print-queries
  "Print the HoneySQL and SQL forms of any queries executed inside BODY to `stdout`. Intended for use during REPL development."
  {:style/indent 0}
  [& body]
  `(-do-with-debug-print-queries (fn [] ~@body)))


(defn- honeysql->sql
  "Compile HONEYSQL-FORM to SQL.
  This returns a vector with the SQL string as its first item and prepared statement params as the remaining items."
  [honeysql-form]
  {:pre [(map? honeysql-form)]}
  ;; Not sure *why* but without setting this binding on *rare* occasion HoneySQL will unwantedly generate SQL for a subquery and wrap the query in parens like "(UPDATE ...)" which is invalid
  (u/prog1 (binding [hformat/*subquery?* false]
             (hsql/format honeysql-form, :quoting (quoting-style), :allow-dashed-names? true))
    (when *debug-print-queries*
      (println (u/pprint-to-str 'blue honeysql-form)
               (u/format-color 'green "\n%s\n%s" (format-sql (first <>)) (rest <>))))
    (when-not *disable-db-logging*
      (log/debug (str "DB Call: " (first <>)))
      (when *call-count*
        (swap! *call-count* inc)))))

(defn query
  "Compile HONEYSQL-FROM and call `jdbc/query` against the Metabase database.
   Options are passed along to `jdbc/query`."
  [honeysql-form & {:as options}]
  (jdbc/query (db-connection) (honeysql->sql honeysql-form) options))


(defn qualify
  "Qualify a FIELD-NAME name with the name its ENTITY. This is necessary for disambiguating fields for HoneySQL queries that contain joins.

     (db/qualify 'CardFavorite :id) -> :report_cardfavorite.id"
  ^clojure.lang.Keyword [entity field-name]
  (if (vector? field-name)
    [(qualify entity (first field-name)) (second field-name)]
    (hsql/qualify (:table (resolve-entity entity)) field-name)))

(defn qualified?
  "Is FIELD-NAME qualified by (e.g. with its table name)?"
  ^Boolean [field-name]
  (if (vector? field-name)
    (qualified? (first field-name))
    (boolean (re-find #"\." (name field-name)))))

(defn- maybe-qualify
  "Qualify FIELD-NAME with its table name if it's not already qualified."
  ^clojure.lang.Keyword [entity field-name]
  (if (qualified? field-name)
    field-name
    (qualify entity field-name)))


(defn- entity->fields
  "Get the fields that should be used in a query, destructuring ENTITY if it's wrapped in a vector, otherwise calling `default-fields`.
   This will return `nil` if the entity isn't wrapped in a vector and uses the default implementation of `default-fields`.

     (entity->fields 'User) -> [:id :email :date_joined :first_name :last_name :last_login :is_superuser :is_qbnewb]
     (entity->fields ['User :first_name :last_name]) -> [:first_name :last_name]
     (entity->fields 'Database) -> nil"
  [entity]
  (if (vector? entity)
    (let [[entity & fields] entity]
      (for [field fields]
        (maybe-qualify entity field)))
    (models/default-fields (resolve-entity entity))))


(defn do-post-select
  "Perform post-processing for objects fetched from the DB.
   Convert results OBJECTS to ENTITY record types and call the entity's `post-select` method on them."
  {:style/indent 1}
  [entity objects]
  (let [entity (resolve-entity entity)]
    (vec (for [object objects]
           (models/do-post-select entity object)))))

(defn simple-select
  "Select objects from the database. Like `select`, but doesn't offer as many conveniences, so you should use that instead.
   This calls `post-select` on the results.

     (db/simple-select 'User {:where [:= :id 1]})"
  {:style/indent 1}
  [entity honeysql-form]
  (let [entity (resolve-entity entity)]
    (do-post-select entity (query (merge {:select (or (models/default-fields entity)
                                                      [:*])
                                          :from   [entity]}
                                         honeysql-form)))))

(defn simple-select-one
  "Select a single object from the database. Like `select-one`, but doesn't offer as many conveniences, so prefer that instead.

     (db/simple-select-one 'User (h/where [:= :first-name \"Cam\"]))"
  ([entity]
   (simple-select-one entity {}))
  ([entity honeysql-form]
   (first (simple-select entity (h/limit honeysql-form 1)))))

(defn execute!
  "Compile HONEYSQL-FORM and call `jdbc/execute!` against the Metabase DB.
   OPTIONS are passed directly to `jdbc/execute!` and can be things like `:multi?` (default `false`) or `:transaction?` (default `true`)."
  [honeysql-form & {:as options}]
  (jdbc/execute! (db-connection) (honeysql->sql honeysql-form) options))

(defn- where
  "Generate a HoneySQL `where` form using key-value args.
     (where {} :a :b)      -> (h/where {} [:= :a :b])
     (where {} :a [:!= b]) -> (h/where {} [:!= :a :b])"
  {:style/indent 1}

  ([honeysql-form]
   honeysql-form) ; no-op

  ([honeysql-form m]
   (m/mapply where honeysql-form m))

  ([honeysql-form k v]
   (h/merge-where honeysql-form (if (vector? v)
                                  (let [[f v] v] ; e.g. :id [:!= 1] -> [:!= :id 1]
                                    (assert (keyword? f))
                                    [f k v])
                                  [:= k v])))

  ([honeysql-form k v & more]
   (apply where (where honeysql-form k v) more)))

(defn- where+
  "Generate a HoneySQL form, converting pairs of arguments with keywords into a `where` clause, and merging other HoneySQL clauses in as-is.
   Meant for internal use by functions like `select`. (So called because it handles `where` *plus* other clauses).

     (where+ {} [:id 1 {:limit 10}]) -> {:where [:= :id 1], :limit 10}"
  [honeysql-form options]
  (loop [honeysql-form honeysql-form, [first-option & [second-option & more, :as butfirst]] options]
    (cond
      (keyword? first-option) (recur (where honeysql-form first-option second-option) more)
      first-option            (recur (merge honeysql-form first-option)               butfirst)
      :else                   honeysql-form)))


;;; ## UPDATE!

(defn update!
  "Update a single row in the database. Returns `true` if a row was affected, `false` otherwise.
   Accepts either a single map of updates to make or kwargs. ENTITY is automatically resolved,
   and `pre-update` is called on KVS before the object is inserted into the database.

     (db/update! 'Label 11 :name \"ToucanFriendly\")
     (db/update! 'Label 11 {:name \"ToucanFriendly\"})"
  {:style/indent 2}

  (^Boolean [entity honeysql-form]
   (let [entity (resolve-entity entity)]
     (not= [0] (execute! (merge (h/update entity)
                                honeysql-form)))))

  (^Boolean [entity id kvs]
   {:pre [(integer? id) (map? kvs) (every? keyword? (keys kvs))]}
   (let [entity (resolve-entity entity)
         kvs    (-> (models/do-pre-update entity (assoc kvs :id id))
                    (dissoc :id))]
     (update! entity (-> (h/sset {} kvs)
                         (where :id id)))))

  (^Boolean [entity id k v & more]
   (update! entity id (apply array-map k v more))))

(defn update-where!
  "Convenience for updating several objects matching CONDITIONS-MAP. Returns `true` if any objects were affected.
   For updating a single object, prefer using `update!`, which calls ENTITY's `pre-update` method first.

     (db/update-where! Table {:name  table-name
                              :db_id (:id database)}
       :active false)"
  {:style/indent 2}
  ^Boolean [entity conditions-map & {:as values}]
  {:pre [(map? conditions-map) (every? keyword? (keys values))]}
  (update! entity (where {:set values} conditions-map)))


(defn update-non-nil-keys!
  "Like `update!`, but filters out KVS with `nil` values."
  {:style/indent 2}
  ([entity id kvs]
   (update! entity id (m/filter-vals (complement nil?) kvs)))
  ([entity id k v & more]
   (update-non-nil-keys! entity id (apply array-map k v more))))


;;; ## DELETE!

(defn delete!
  "Delete an object or objects from the Metabase DB matching certain constraints. Returns `true` if something was deleted, `false` otherwise.

     (db/delete! 'Label)                ; delete all Labels
     (db/delete! Label :name \"Cam\")   ; delete labels where :name == \"Cam\"
     (db/delete! Label {:name \"Cam\"}) ; for flexibility either a single map or kwargs are accepted

   Most the time, you should use `cascade-delete!` instead, handles deletion of dependent objects via the entity's implementation of `pre-cascade-delete`."
  {:style/indent 1}
  ([entity]
   (delete! entity {}))
  ([entity conditions]
   {:pre [(map? conditions) (every? keyword? (keys conditions))]}
   (let [entity (resolve-entity entity)]
     (not= [0] (execute! (-> (h/delete-from entity)
                             (where conditions))))))
  ([entity k v & more]
   (delete! entity (apply array-map k v more))))


;;; ## INSERT!

(defn- insert-id-key
  "The keyword name of the ID column of a newly inserted row returned by `jdbc/insert!`."
  ^clojure.lang.Keyword []
  (case (db-type)
    :postgres :id
    :mysql    :generated_key
    :h2       (keyword "scope_identity()")))

(defn- simple-insert-many!
  "Do a simple JDBC `insert!` of multiple objects into the database.
   Normally you should use `insert-many!` instead, which calls the entity's `pre-insert` method on the ROW-MAPS;
   `simple-insert-many!` is offered for cases where you'd like to specifically avoid this behavior.
   Returns a sequences of IDs of newly inserted objects.

     (db/simple-insert-many! 'Label [{:name \"Toucan Friendly\"}
                                     {:name \"Bird Approved\"}]) -> [38 39]"
  {:style/indent 1}
  [entity row-maps]
  {:pre [(sequential? row-maps) (every? map? row-maps)]}
  (when (seq row-maps)
    (let [entity (resolve-entity entity)]
      (map (insert-id-key) (jdbc/insert-multi! (db-connection) (keyword (:table entity)) row-maps {:entities (quote-fn)})))))

(defn insert-many!
  "Insert several new rows into the Database. Resolves ENTITY, and calls `pre-insert` on each of the ROW-MAPS.
   Returns a sequence of the IDs of the newly created objects.
   Note: this *does not* call `post-insert` on newly created objects. If you need `post-insert` behavior, use `insert!` instead.

     (db/insert-many! 'Label [{:name \"Toucan Friendly\"}
                              {:name \"Bird Approved\"}]) -> [38 39]"
  {:style/indent 1}
  [entity row-maps]
  (let [entity (resolve-entity entity)]
    (simple-insert-many! entity (for [row-map row-maps]
                                  (models/do-pre-insert entity row-map)))))

(defn- simple-insert!
  "Do a simple JDBC `insert` of a single object.
   This is similar to `insert!` but returns the ID of the newly created object rather than the object itself, and does not call `post-insert`.

     (db/simple-insert! 'Label :name \"Toucan Friendly\") -> 1

   Like `insert!`, `simple-insert!` can be called with either a single ROW-MAP or kv-style arguments."
  {:style/indent 1}
  ([entity row-map]
   {:pre [(map? row-map) (every? keyword? (keys row-map))]}
   (first (simple-insert-many! entity [row-map])))
  ([entity k v & more]
   (simple-insert! entity (apply array-map k v more))))

(defn insert!
  "Insert a new object into the Database. Resolves ENTITY, calls its `pre-insert` method on ROW-MAP to prepare it before insertion;
   after insert, it fetches and the newly created object, passes it to `post-insert`, and returns the results.
   For flexibility, `insert!` can handle either a single map or individual kwargs:

     (db/insert! Label {:name \"Toucan Unfriendly\"})
     (db/insert! 'Label :name \"Toucan Friendly\")"
  {:style/indent 1}
  ([entity row-map]
   {:pre [(map? row-map) (every? keyword? (keys row-map))]}
   (let [entity (resolve-entity entity)]
     (when-let [id (simple-insert! entity (models/do-pre-insert entity row-map))]
       (models/post-insert (entity id)))))
  ([entity k v & more]
   (insert! entity (apply array-map k v more))))


;;; ## SELECT

;; All of the following functions are based off of the old `sel` macro and can do things like select certain fields by wrapping ENTITY in a vector
;; and automatically convert kv-args to a `where` clause

(defn select-one
  "Select a single object from the database.

     (select-one ['Database :name] :id 1) -> {:name \"Sample Dataset\"}"
  {:style/indent 1}
  [entity & options]
  (let [fields (entity->fields entity)]
    (simple-select-one entity (where+ {:select (or fields [:*])} options))))

(defn select-one-field
  "Select a single FIELD of a single object from the database.

     (select-one-field :name 'Database :id 1) -> \"Sample Dataset\""
  {:style/indent 2}
  [field entity & options]
  {:pre [(keyword? field)]}
  (field (apply select-one [entity field] options)))

(defn select-one-id
  "Select the `:id` of a single object from the database.

     (select-one-id 'Database :name \"Sample Dataset\") -> 1"
  {:style/indent 1}
  [entity & options]
  (let [entity (resolve-entity entity)]
    (apply select-one-field :id entity options)))

;; TODO - maybe rename this `count`? e.g. `db/count` instead of `db/select-one-count`
(defn select-one-count
  "Select the count of objects matching some condition.

     ;; Get all Databases whose name is non-nil
     (select-one-count 'Database :name [:not= nil]) -> 12"
  {:style/indent 1}
  [entity & options]
  (:count (apply select-one [entity [:%count.* :count]] options)))

(defn select
  "Select objects from the database.

     (select 'Database :name [:not= nil] {:limit 2}) -> [...]"
  {:style/indent 1}
  [entity & options]
  (simple-select entity (where+ {:select (or (entity->fields entity)
                                             [:*])}
                                options)))

(defn select-field
  "Select values of a single field for multiple objects. These are returned as a set if any matching fields were returned, otherwise `nil`.

     (select-field :name 'Database) -> #{\"Sample Dataset\", \"test-data\"}"
  {:style/indent 2}
  [field entity & options]
  {:pre [(keyword? field)]}
  (when-let [results (seq (map field (apply select [entity field] options)))]
    (set results)))

(defn select-ids
  "Select IDs for multiple objects. These are returned as a set if any matching IDs were returned, otherwise `nil`.

     (select-ids 'Table :db_id 1) -> #{1 2 3 4}"
  {:style/indent 1}
  [entity & options]
  (apply select-field :id entity options))

(defn select-field->field
  "Select fields K and V from objects in the database, and return them as a map from K to V.

     (select-field->field :id :name 'Database) -> {1 \"Sample Dataset\", 2 \"test-data\"}"
  {:style/indent 3}
  [k v entity & options]
  {:pre [(keyword? k) (keyword? v)]}
  (into {} (for [result (apply select [entity k v] options)]
             {(k result) (v result)})))

(defn select-field->id
  "Select FIELD and `:id` from objects in the database, and return them as a map from FIELD to `:id`.

     (select-field->id :name 'Database) -> {\"Sample Dataset\" 1, \"test-data\" 2}"
  {:style/indent 2}
  [field entity & options]
  (apply select-field->field field :id entity options))

(defn select-id->field
  "Select FIELD and `:id` from objects in the database, and return them as a map from `:id` to FIELD.

     (select-id->field :name 'Database) -> {1 \"Sample Dataset\", 2 \"test-data\"}"
  {:style/indent 2}
  [field entity & options]
  (apply select-field->field :id field entity options))


;;; ## EXISTS?

(defn exists?
  "Easy way to see if something exists in the DB.
    (db/exists? User :id 100)
   NOTE: This only works for objects that have an `:id` field."
  {:style/indent 1}
  ^Boolean [entity & kvs]
  (boolean (select-one entity (apply where (h/select {} :id) kvs))))


;;; ## CASADE-DELETE

(defn cascade-delete!
  "Do a cascading delete of object(s). For each matching object, the `pre-cascade-delete` multimethod is called,
   which should delete any objects related the object about to be deleted.
   Returns a 204/nil reponse so it can be used directly in an API endpoint.

     (cascade-delete! Database :id 1)

   TODO - this depends on objects having an `:id` column; consider a way to fix this for models like `Setting` that do not have one."
  {:style/indent 1}
  [entity & conditions]
  (let [entity (resolve-entity entity)]
    (doseq [object (apply select entity conditions)]
      (models/pre-cascade-delete object)
      (delete! entity :id (:id object))))
  {:status 204, :body nil})


;;; Various convenience fns (experiMENTAL)

(defn join
  "Convenience for generating a HoneySQL `JOIN` clause.

     (db/select-ids Table
       (db/join [Table :raw_table_id] [RawTable :id])
       :active true)"
  [[source-entity fk] [dest-entity pk]]
  {:left-join [(resolve-entity dest-entity) [:= (qualify source-entity fk)
                                                (qualify dest-entity pk)]]})


(defn isa
  "Convenience for generating an HoneySQL `IN` clause for a keyword and all of its descendents.
   Intended for use with the type hierarchy in `metabase.types`.

     (db/select Field :special_type (db/isa :type/URL))
      ->
     (db/select Field :special_type [:in #{\"type/URL\" \"type/ImageURL\" \"type/AvatarURL\"}])

   Also accepts optional EXPR for use directly in a HoneySQL `where`:

     (db/select Field {:where (db/isa :special_type :type/URL)})
     ->
     (db/select Field {:where [:in :special_type #{\"type/URL\" \"type/ImageURL\" \"type/AvatarURL\"}]})"
  ([type-keyword]
   [:in (set (map u/keyword->qualified-name (cons type-keyword (descendants type-keyword))))])
  ([expr type-keyword]
   [:in expr (last (isa type-keyword))]))
