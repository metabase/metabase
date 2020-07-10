(ns metabase.db
  "Application database definition, and setup logic, and helper functions for interacting with it."
  (:require [clojure.java
             [io :as io]
             [jdbc :as jdbc]]
            [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            [metabase
             [config :as config]
             [connection-pool :as connection-pool]
             [util :as u]]
            [metabase.db
             [jdbc-protocols :as db.jdbc-protocols]
             [liquibase :as liquibase]
             [spec :as db.spec]]
            [metabase.plugins.classloader :as classloader]
            [metabase.util
             [i18n :refer [trs]]
             [schema :as su]]
            [ring.util.codec :as codec]
            [schema.core :as s]
            [toucan.db :as db])
  (:import com.mchange.v2.c3p0.PoolBackedDataSource
           liquibase.exception.LockException))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          DB FILE & CONNECTION DETAILS                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn get-db-file
  "Takes a filename and converts it to H2-compatible filename."
  [db-file-name]
  (let [
        ;; we need to enable MVCC for Quartz JDBC backend to work! Quartz depends on row-level locking, which
        ;; means without MVCC we "will experience dead-locks". MVCC is the default for everyone using the
        ;; MVStore engine anyway so this only affects people still with legacy PageStore databases
        ;;
        ;; Tell H2 to defrag when Metabase is shut down -- can reduce DB size by multiple GIGABYTES -- see #6510
        options ";DB_CLOSE_DELAY=-1;MVCC=TRUE;DEFRAG_ALWAYS=TRUE"]
    ;; H2 wants file path to always be absolute
    (str "file:"
         (.getAbsolutePath (io/file db-file-name))
         options)))

(def db-file
  "Path to our H2 DB file from env var or app config."
  ;; see https://h2database.com/html/features.html for explanation of options
  (delay
   (if (config/config-bool :mb-db-in-memory)
     ;; In-memory (i.e. test) DB
     ;; DB_CLOSE_DELAY=-1 = don't close the Database until the JVM shuts down
     "mem:metabase;DB_CLOSE_DELAY=-1"
     ;; File-based DB
     (let [db-file-name (config/config-str :mb-db-file)]
       (get-db-file db-file-name)))))

(def ^:private jdbc-connection-regex
  #"^(jdbc:)?([^:/@]+)://(?:([^:/@]+)(?::([^:@]+))?@)?([^:@]+)(?::(\d+))?/([^/?]+)(?:\?(.*))?$")

;;TODO don't make this public
(defn parse-connection-string
  "Parse a DB connection URI like
  `postgres://cam@localhost.com:5432/cams_cool_db?ssl=true&sslfactory=org.postgresql.ssl.NonValidatingFactory` and
  return a broken-out map."
  [uri]
  (when-let [[_ _ protocol user pass host port db query] (re-matches jdbc-connection-regex uri)]
    (u/prog1 (merge {:type     (case (keyword protocol)
                                 :postgres   :postgres
                                 :postgresql :postgres
                                 :mysql      :mysql
                                 :h2         :h2)}

                    (case (keyword protocol)
                      :h2 {:db db}
                      {:user     user
                       :password pass
                       :host     host
                       :port     port
                       :dbname   db})
                    (some-> query
                            codec/form-decode
                            walk/keywordize-keys))
      ;; If someone is using Postgres and specifies `ssl=true` they might need to specify `sslmode=require`. Let's let
      ;; them know about that to make their lives a little easier. See https://github.com/metabase/metabase/issues/8908
      ;; for more details.
      (when (and (= (:type <>) :postgres)
                 (= (:ssl <>) "true")
                 (not (:sslmode <>)))
        (log/warn (trs "Warning: Postgres connection string with `ssl=true` detected.")
                  (trs "You may need to add `?sslmode=require` to your application DB connection string.")
                  (trs "If Metabase fails to launch, please add it and try again.")
                  (trs "See https://github.com/metabase/metabase/issues/8908 for more details."))))))

(def ^:private connection-string-details
  (delay (when-let [uri (config/config-str :mb-db-connection-uri)]
           (parse-connection-string uri))))

(defn db-type
  "The type of backing DB used to run Metabase. `:h2`, `:mysql`, or `:postgres`."
  ^clojure.lang.Keyword []
  (or (:type @connection-string-details)
      (config/config-kw :mb-db-type)))

(def ^:private db-connection-details
  "Connection details that can be used when pretending the Metabase DB is itself a `Database` (e.g., to use the Generic
  SQL driver functions on the Metabase DB itself)."
  (delay
   (when (= (db-type) :h2)
     (log/warn
      (u/format-color 'red
          (str
           (trs "WARNING: Using Metabase with an H2 application database is not recommended for production deployments.")
           " "
           (trs "For production deployments, we highly recommend using Postgres, MySQL, or MariaDB instead.")
           " "
           (trs "If you decide to continue to use H2, please be sure to back up the database file regularly.")
           " "
           (trs "For more information, see")
           " https://metabase.com/docs/latest/operations-guide/migrating-from-h2.html"))))
   (or @connection-string-details
       (case (db-type)
         ;; TODO - we probably don't need to specifc `:type` here since we can just call (db-type)
         :h2       {:type :h2
                    :db   @db-file}
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

(defn jdbc-spec
  "Takes our own MB details map and formats them properly for connection details for JDBC."
  ([]
   (jdbc-spec @db-connection-details))

  ([db-details]
   {:pre [(map? db-details)]}
   ;; TODO: it's probably a good idea to put some more validation here and be really strict about what's in `db-details`
   (case (:type db-details)
     :h2       (db.spec/h2       db-details)
     :mysql    (db.spec/mysql    (assoc db-details :db (:dbname db-details)))
     :postgres (db.spec/postgres (assoc db-details :db (:dbname db-details))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    MIGRATE!                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- print-migrations-and-quit-if-needed!
  "If we are not doing auto migrations then print out migration SQL for user to run manually.
   Then throw an exception to short circuit the setup process and make it clear we can't proceed."
  [liquibase]
  (when (liquibase/has-unrun-migrations? liquibase)
    (log/info (str (trs "Database Upgrade Required")
                   "\n\n"
                   (trs "NOTICE: Your database requires updates to work with this version of Metabase.")
                   "\n"
                   (trs "Please execute the following sql commands on your database before proceeding.")
                   "\n\n"
                   (liquibase/migrations-sql liquibase)
                   "\n\n"
                   (trs "Once your database is updated try running the application again.")
                   "\n"))
    (throw (Exception. (trs "Database requires manual upgrade.")))))

(defn migrate!
  "Migrate the database (this can also be ran via command line like `java -jar metabase.jar migrate up` or `lein run
  migrate up`):

  *  `:up`            - Migrate up
  *  `:force`         - Force migrate up, ignoring locks and any DDL statements that fail.
  *  `:down-one`      - Rollback a single migration
  *  `:print`         - Just print the SQL for running the migrations, don't actually run them.
  *  `:release-locks` - Manually release migration locks left by an earlier failed migration.
                        (This shouldn't be necessary now that we run migrations inside a transaction, but is
                        available just in case).

  Note that this only performs *schema migrations*, not data migrations. Data migrations are handled separately by
  `metabase.db.migrations/run-all!`. (`setup-db!`, below, calls both this function and `run-all!`)."
  ([]
   (migrate! :up))

  ([direction]
   (migrate! (jdbc-spec) direction))

  ([jdbc-spec direction]
   (jdbc/with-db-transaction [conn jdbc-spec]
     ;; Tell transaction to automatically `.rollback` instead of `.commit` when the transaction finishes
     (log/debug (trs "Set transaction to automatically roll back..."))
     (jdbc/db-set-rollback-only! conn)
     ;; Disable auto-commit. This should already be off but set it just to be safe
     (log/debug (trs "Disable auto-commit..."))
     (.setAutoCommit (jdbc/get-connection conn) false)
     ;; Set up liquibase and let it do its thing
     (log/info (trs "Setting up Liquibase..."))
     (liquibase/with-liquibase [liquibase conn]
       (try
         (liquibase/consolidate-liquibase-changesets! conn)
         (log/info (trs "Liquibase is ready."))
         (case direction
           :up            (liquibase/migrate-up-if-needed! conn liquibase)
           :force         (liquibase/force-migrate-up-if-needed! conn liquibase)
           :down-one      (liquibase/rollback-one liquibase)
           :print         (print-migrations-and-quit-if-needed! liquibase)
           :release-locks (liquibase/force-release-locks! liquibase))
         ;; Migrations were successful; disable rollback-only so `.commit` will be called instead of `.rollback`
         (jdbc/db-unset-rollback-only! conn)
         :done
         ;; In the Throwable block, we're releasing the lock assuming we have the lock and we failed while in the
         ;; middle of a migration. It's possible that we failed because we couldn't get the lock. We don't want to
         ;; clear the lock in that case, so handle that case separately
         (catch LockException e
           ;; This should already be happening as a result of `db-set-rollback-only!` but running it twice won't hurt so
           ;; better safe than sorry
           (.rollback (jdbc/get-connection conn))
           (throw e))
         ;; If for any reason any part of the migrations fail then rollback all changes
         (catch Throwable e
           ;; This should already be happening as a result of `db-set-rollback-only!` but running it twice won't hurt so
           ;; better safe than sorry
           (.rollback (jdbc/get-connection conn))
           ;; With some failures, it's possible that the lock won't be released. To make this worse, if we retry the
           ;; operation without releasing the lock first, the real error will get hidden behind a lock error
           (liquibase/release-lock-if-needed! liquibase)
           (throw e)))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      CONNECTION POOLS & TRANSACTION STUFF                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private application-db-connection-pool-props
  "Options for c3p0 connection pool for the application DB. These are set in code instead of a properties file because
  we use separate options for data warehouse DBs. See
  https://www.mchange.com/projects/c3p0/#configuring_connection_testing for an overview of the options used
  below (jump to the 'Simple advice on Connection testing' section.)"
  (merge
   {"idleConnectionTestPeriod" 60}
   ;; only merge in `max-pool-size` if it's actually set, this way it doesn't override any things that may have been
   ;; set in `c3p0.properties`
   (when-let [max-pool-size (config/config-int :mb-application-db-max-connection-pool-size)]
     {"maxPoolSize" max-pool-size})))

(defn- create-connection-pool!
  "Create a connection pool for the application DB and set it as the default Toucan connection. This is normally called
  once during start up; calling it a second time (e.g. from the REPL) will "
  [jdbc-spec]
  (db/set-default-quoting-style! (case (db-type)
                                   :postgres :ansi
                                   :h2       :h2
                                   :mysql    :mysql))
  ;; REPL usage only: kill the old pool if one exists
  (u/ignore-exceptions
    (when-let [^PoolBackedDataSource pool (:datasource (db/connection))]
      (log/trace "Closing old application DB connection pool")
      (.close pool)))
  (log/debug (trs "Set default db connection with connection pool..."))
  (db/set-default-db-connection! (connection-pool/connection-pool-spec jdbc-spec application-db-connection-pool-props))
  (db/set-default-jdbc-options! {:read-columns db.jdbc-protocols/read-columns})
  nil)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    DB SETUP                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defonce ^:private db-setup-finished?
  (atom false))

(defn db-is-setup?
  "True if the Metabase DB is setup and ready."
  ^Boolean []
  @db-setup-finished?)

(def ^:dynamic *allow-potentailly-unsafe-connections*
  "We want to make *every* database connection made by the drivers safe -- read-only, only connect if DB file exists,
  etc.  At the same time, we'd like to be able to use driver functionality like `can-connect-with-details?` to check
  whether we can connect to the Metabase database, in which case we'd like to allow connections to databases that
  don't exist.

  So we need some way to distinguish the Metabase database from other databases. We could add a key to the details
  map specifying that it's the Metabase DB, but what if some shady user added that key to another database?

  We could check if a database details map matched `db-connection-details` above, but what if a shady user went
  Meta-Metabase and added the Metabase DB to Metabase itself? Then when they used it they'd have potentially unsafe
  access.

  So this is where dynamic variables come to the rescue. We'll make this one `true` when we use `can-connect?` for the
  Metabase DB, in which case we'll allow connection to non-existent H2 (etc.) files, and leave it `false` happily and
  forever after, making all other connnections \"safe\"."
  false)

(s/defn ^:private verify-db-connection
  "Test connection to database with `details` and throw an exception if we have any troubles connecting."
  ([db-details]
   (verify-db-connection (:type db-details) db-details))

  ([driver :- s/Keyword, details :- su/Map]
   (log/info (u/format-color 'cyan (trs "Verifying {0} Database Connection ..." (name driver))))
   (classloader/require 'metabase.driver.util)
   (assert (binding [*allow-potentailly-unsafe-connections* true]
             ((resolve 'metabase.driver.util/can-connect-with-details?) driver details :throw-exceptions))
     (trs "Unable to connect to Metabase {0} DB." (name driver)))
   (jdbc/with-db-metadata [metadata (jdbc-spec details)]
     (log/info (trs "Successfully verified {0} {1} application database connection."
                    (.getDatabaseProductName metadata) (.getDatabaseProductVersion metadata))
               (u/emoji "✅")))))

(def ^:dynamic ^Boolean *disable-data-migrations*
  "Should we skip running data migrations when setting up the DB? (Default is `false`).
  There are certain places where we don't want to do this; for example, none of the migrations should be ran when
  Metabase is launched via `load-from-h2`.  That's because they will end up doing things like creating duplicate
  entries for the \"magic\" groups and permissions entries. "
  false)

(defn- run-schema-migrations!
  "Run through our DB migration process and make sure DB is fully prepared"
  [auto-migrate? db-details]
  (log/info (trs "Running Database Migrations..."))
  ;; if `MB_DB_AUTOMIGRATE` is false, and we have migrations that need to be ran, print and quit. Otherwise continue
  ;; to start normally
  (migrate! (jdbc-spec db-details) (if auto-migrate? :up :print))
  (log/info (trs "Database Migrations Current ... ") (u/emoji "✅")))

(defn- run-data-migrations!
  "Do any custom code-based migrations now that the db structure is up to date."
  []
  (when-not *disable-data-migrations*
    (classloader/require 'metabase.db.migrations)
    ((resolve 'metabase.db.migrations/run-all!))))

(defn setup-db!*
  "Connects to db and runs migrations. Don't use this directly, unless you know what you're doing; use `setup-db!`
  instead, which can be called more than once without issue and is thread-safe."
  [db-details auto-migrate]
  (u/profile (trs "Database setup")
    (u/with-us-locale
      (verify-db-connection db-details)
      (run-schema-migrations! auto-migrate db-details)
      (create-connection-pool! (jdbc-spec db-details))
      (run-data-migrations!)))
  nil)

(defn- setup-db-from-env!
  "Set up the application DB using environment variables (`@db-connection-details`) for connection info. This is the
  default way the application database is set up -- the only situations where it is not set up this way is when
  running special commands such as `load-from-h2` or `dump-to-h2`."
  []
  (let [db-details   @db-connection-details
        auto-migrate (config/config-bool :mb-db-automigrate)]
    (setup-db!* db-details auto-migrate))
  nil)

(defn setup-db!
  "Do general preparation of database by validating that we can connect. Caller can specify if we should run any pending
  database migrations. If DB is already set up, this function will no-op. Thread-safe."
  []
  (when-not @db-setup-finished?
    (locking db-setup-finished?
      (when-not @db-setup-finished?
        (setup-db-from-env!)
        (reset! db-setup-finished? true))))
  :done)

;;; Various convenience fns

(defn join
  "Convenience for generating a HoneySQL `JOIN` clause.

     (db/select-ids FieldValues
       (mdb/join [FieldValues :field_id] [Field :id])
       :active true)"
  [[source-entity fk] [dest-entity pk]]
  {:left-join [(db/resolve-model dest-entity) [:= (db/qualify source-entity fk) (db/qualify dest-entity pk)]]})


(s/defn ^:private type-keyword->descendants :- (su/non-empty #{su/FieldTypeKeywordOrString})
  "Return a set of descendents of Metabase `type-keyword`. This includes `type-keyword` itself, so the set will always
  have at least one element.

     (type-keyword->descendants :type/Coordinate) ; -> #{\"type/Latitude\" \"type/Longitude\" \"type/Coordinate\"}"
  [type-keyword :- su/FieldType]
  (set (map u/qualified-name (cons type-keyword (descendants type-keyword)))))

(defn isa
  "Convenience for generating an HoneySQL `IN` clause for a keyword and all of its descendents.
   Intended for use with the type hierarchy in `metabase.types`.

     (db/select Field :special_type (mdb/isa :type/URL))
      ->
     (db/select Field :special_type [:in #{\"type/URL\" \"type/ImageURL\" \"type/AvatarURL\"}])

   Also accepts optional `expr` for use directly in a HoneySQL `where`:

     (db/select Field {:where (mdb/isa :special_type :type/URL)})
     ->
     (db/select Field {:where [:in :special_type #{\"type/URL\" \"type/ImageURL\" \"type/AvatarURL\"}]})"
  ([type-keyword]
   [:in (type-keyword->descendants type-keyword)])
  ;; when using this with an `expr` (e.g. `(isa :special_type :type/URL)`) just go ahead and take the results of the
  ;; one-arity impl above and splice expr in as the second element (`[:in #{"type/URL" "type/ImageURL"}]` becomes
  ;; `[:in :special_type #{"type/URL" "type/ImageURL"}]`)
  ([expr type-keyword]
   [:in expr (type-keyword->descendants type-keyword)]))
