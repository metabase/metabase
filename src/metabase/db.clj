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
            [toucan.db :as db]
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

(defn- migration-entries
  "Return a set of migration files (without path or prefix) that have already been run.
   This is fetched from the `databasechangelog` table.
     (migration-entires) -> #{\"001_initial_schema\", \"002_add_session_table\", ...}"
  []
  ;; an Exception will get thrown if there is no databasechangelog table yet; just return nil in that case because nil will never equal any set
  (u/ignore-exceptions
    (set (for [{filename :filename} (jdbc/query (jdbc-details) [(format "SELECT %s AS filename FROM %s;" ((db/quote-fn) "filename") ((db/quote-fn) "databasechangelog"))])]
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

(defn- create-connection-pool! [spec]
  (db/set-default-quoting-style! (case (db-type)
                                   :postgres :ansi
                                   :h2       :h2
                                   :mysql    :mysql))
  (db/set-default-db-connection! (connection-pool spec)))


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


;;; Various convenience fns (experiMENTAL)

(defn join
  "Convenience for generating a HoneySQL `JOIN` clause.

     (db/select-ids Table
       (mdb/join [Table :raw_table_id] [RawTable :id])
       :active true)"
  [[source-entity fk] [dest-entity pk]]
  {:left-join [(db/resolve-model dest-entity) [:= (db/qualify source-entity fk)
                                                  (db/qualify dest-entity pk)]]})


(defn isa
  "Convenience for generating an HoneySQL `IN` clause for a keyword and all of its descendents.
   Intended for use with the type hierarchy in `metabase.types`.

     (db/select Field :special_type (mdb/isa :type/URL))
      ->
     (db/select Field :special_type [:in #{\"type/URL\" \"type/ImageURL\" \"type/AvatarURL\"}])

   Also accepts optional EXPR for use directly in a HoneySQL `where`:

     (db/select Field {:where (mdb/isa :special_type :type/URL)})
     ->
     (db/select Field {:where [:in :special_type #{\"type/URL\" \"type/ImageURL\" \"type/AvatarURL\"}]})"
  ([type-keyword]
   [:in (set (map u/keyword->qualified-name (cons type-keyword (descendants type-keyword))))])
  ([expr type-keyword]
   [:in expr (last (isa type-keyword))]))
