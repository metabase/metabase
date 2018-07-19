(ns metabase.db
  "Application database definition, and setup logic, and helper functions for interacting with it."
  (:require [clojure
             [string :as s]
             [walk :as walk]]
            [clojure.java
             [io :as io]
             [jdbc :as jdbc]]
            [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [util :as u]]
            [metabase.db.spec :as dbspec]
            [puppetlabs.i18n.core :refer [trs]]
            [ring.util.codec :as codec]
            [toucan.db :as db])
  (:import com.mchange.v2.c3p0.ComboPooledDataSource
           java.io.StringWriter
           java.util.Properties
           [liquibase.database Database DatabaseFactory]
           liquibase.database.jvm.JdbcConnection
           liquibase.Liquibase
           liquibase.resource.ClassLoaderResourceAccessor))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          DB FILE & CONNECTION DETAILS                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(def db-file
  "Path to our H2 DB file from env var or app config."
  ;; see http://h2database.com/html/features.html for explanation of options
  (delay (if (config/config-bool :mb-db-in-memory)
           ;; In-memory (i.e. test) DB
           "mem:metabase;DB_CLOSE_DELAY=-1"
           ;; File-based DB
           (let [db-file-name (config/config-str :mb-db-file)
                 db-file      (io/file db-file-name)
                 ;; we need to enable MVCC for Quartz JDBC backend to work! Quartz depends on row-level locking, which
                 ;; means without MVCC we "will experience dead-locks". MVCC is the default for everyone using the
                 ;; MVStore engine anyway so this only affects people still with legacy PageStore databases
                 options      ";DB_CLOSE_DELAY=-1;MVCC=TRUE;"]
             (apply str "file:" (if (.isAbsolute db-file)
                                  ;; when an absolute path is given for the db file then don't mess with it
                                  [db-file-name options]
                                  ;; if we don't have an absolute path then make sure we start from "user.dir"
                                  [(System/getProperty "user.dir") "/" db-file-name options]))))))

(defn- parse-connection-string
  "Parse a DB connection URI like
  `postgres://cam@localhost.com:5432/cams_cool_db?ssl=true&sslfactory=org.postgresql.ssl.NonValidatingFactory` and
  return a broken-out map."
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
  "Connection details that can be used when pretending the Metabase DB is itself a `Database` (e.g., to use the Generic
  SQL driver functions on the Metabase DB itself)."
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


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    MIGRATE!                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private ^:const ^String changelog-file "liquibase.yaml")

(defn- migrations-sql
  "Return a string of SQL containing the DDL statements needed to perform unrun `liquibase` migrations."
  ^String [^Liquibase liquibase]
  (let [writer (StringWriter.)]
    (.update liquibase "" writer)
    (.toString writer)))

(defn- migrations-lines
  "Return a sequnce of DDL statements that should be used to perform migrations for `liquibase`.

  MySQL gets snippy if we try to run the entire DB migration as one single string; it seems to only like it if we run
  one statement at a time; Liquibase puts each DDL statement on its own line automatically so just split by lines and
  filter out blank / comment lines. Even though this is not neccesary for H2 or Postgres go ahead and do it anyway
  because it keeps the code simple and doesn't make a significant performance difference."
  [^Liquibase liquibase]
  (for [line  (s/split-lines (migrations-sql liquibase))
        :when (not (or (s/blank? line)
                       (re-find #"^--" line)))]
    line))

(defn- has-unrun-migrations?
  "Does `liquibase` have migration change sets that haven't been run yet?

  It's a good idea to Check to make sure there's actually something to do before running `(migrate :up)` because
  `migrations-sql` will always contain SQL to create and release migration locks, which is both slightly dangerous and
  a waste of time when we won't be using them."
  ^Boolean [^Liquibase liquibase]
  (boolean (seq (.listUnrunChangeSets liquibase nil))))

(defn- migration-lock-exists?
  "Is a migration lock in place for LIQUIBASE?"
  ^Boolean [^Liquibase liquibase]
  (boolean (seq (.listLocks liquibase))))

(defn- wait-for-migration-lock-to-be-cleared
  "Check and make sure the database isn't locked. If it is, sleep for 2 seconds and then retry several times. There's a
  chance the lock will end up clearing up so we can run migrations normally."
  [^Liquibase liquibase]
  (u/auto-retry 5
    (when (migration-lock-exists? liquibase)
      (Thread/sleep 2000)
      (throw
       (Exception.
        (str
         (trs "Database has migration lock; cannot run migrations.")
         " "
         (trs "You can force-release these locks by running `java -jar metabase.jar migrate release-locks`.")))))))

(defn- migrate-up-if-needed!
  "Run any unrun `liquibase` migrations, if needed.

  This creates SQL for the migrations to be performed, then executes each DDL statement. Running `.update` directly
  doesn't seem to work as we'd expect; it ends up commiting the changes made and they can't be rolled back at the end
  of the transaction block. Converting the migration to SQL string and running that via `jdbc/execute!` seems to do
  the trick."
  [conn, ^Liquibase liquibase]
  (log/info (trs "Checking if Database has unrun migrations..."))
  (when (has-unrun-migrations? liquibase)
    (log/info (trs "Database has unrun migrations. Waiting for migration lock to be cleared..."))
    (wait-for-migration-lock-to-be-cleared liquibase)
    ;; while we were waiting for the lock, it was possible that another instance finished the migration(s), so make
    ;; sure something still needs to be done...
    (if (has-unrun-migrations? liquibase)
      (do
        (log/info (trs "Migration lock is cleared. Running migrations..."))
        (doseq [line (migrations-lines liquibase)]
          (jdbc/execute! conn [line])))
      (log/info
       (trs "Migration lock cleared, but nothing to do here! Migrations were finished by another instance.")))))

(defn- force-migrate-up-if-needed!
  "Force migrating up. This does two things differently from `migrate-up-if-needed!`:

  1.  This doesn't check to make sure the DB locks are cleared
  2.  Any DDL statements that fail are ignored

  It can be used to fix situations where the database got into a weird state, as was common before the fixes made in
  #3295.

  Each DDL statement is ran inside a nested transaction; that way if the nested transaction fails we can roll it back
  without rolling back the entirety of changes that were made. (If a single statement in a transaction fails you can't
  do anything futher until you clear the error state by doing something like calling `.rollback`.)"
  [conn, ^Liquibase liquibase]
  (.clearCheckSums liquibase)
  (when (has-unrun-migrations? liquibase)
    (doseq [line (migrations-lines liquibase)]
      (log/info line)
      (jdbc/with-db-transaction [nested-transaction-connection conn]
        (try (jdbc/execute! nested-transaction-connection [line])
             (log/info (u/format-color 'green "[SUCCESS]"))
             (catch Throwable e
               (.rollback (jdbc/get-connection nested-transaction-connection))
               (log/error (u/format-color 'red "[ERROR] %s" (.getMessage e)))))))))

(def ^{:arglists '([])} ^DatabaseFactory database-factory
  "Return an instance of the Liquibase `DatabaseFactory`. This is done on a background thread at launch because
  otherwise it adds 2 seconds to startup time."
  (partial deref (future (DatabaseFactory/getInstance))))

(defn- conn->liquibase
  "Get a `Liquibase` object from JDBC CONN."
  (^Liquibase []
   (conn->liquibase (jdbc-details)))
  (^Liquibase [conn]
   (let [^JdbcConnection liquibase-conn (JdbcConnection. (jdbc/get-connection conn))
         ^Database       database       (.findCorrectDatabaseImplementation (database-factory) liquibase-conn)]
     (Liquibase. changelog-file (ClassLoaderResourceAccessor.) database))))

(defn consolidate-liquibase-changesets
  "Consolidate all previous DB migrations so they come from single file.

  Previously migrations where stored in many small files which added seconds per file to the startup time because
  liquibase was checking the jar signature for each file. This function is required to correct the liquibase tables to
  reflect that these migrations where moved to a single file.

  see https://github.com/metabase/metabase/issues/3715"
  [conn]
  (let [liquibases-table-name (if (#{:h2 :mysql} (db-type))
                                "DATABASECHANGELOG"
                                "databasechangelog")
        fresh-install? (jdbc/with-db-metadata [meta (jdbc-details)] ;; don't migrate on fresh install
                         (empty? (jdbc/metadata-query
                                  (.getTables meta nil nil liquibases-table-name (into-array String ["TABLE"])))))
        query (format "UPDATE %s SET FILENAME = ?" liquibases-table-name)]
    (when-not fresh-install?
      (jdbc/execute! conn [query "migrations/000_migrations.yaml"]))))

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
   (migrate! @db-connection-details direction))
  ([db-details direction]
   (jdbc/with-db-transaction [conn (jdbc-details db-details)]
     ;; Tell transaction to automatically `.rollback` instead of `.commit` when the transaction finishes
     (jdbc/db-set-rollback-only! conn)
     ;; Disable auto-commit. This should already be off but set it just to be safe
     (.setAutoCommit (jdbc/get-connection conn) false)
     ;; Set up liquibase and let it do its thing
     (log/info (trs "Setting up Liquibase..."))
     (try
       (let [liquibase (conn->liquibase conn)]
         (consolidate-liquibase-changesets conn)
         (log/info (trs "Liquibase is ready."))
         (case direction
           :up            (migrate-up-if-needed! conn liquibase)
           :force         (force-migrate-up-if-needed! conn liquibase)
           :down-one      (.rollback liquibase 1 "")
           :print         (println (migrations-sql liquibase))
           :release-locks (.forceReleaseLocks liquibase)))
       ;; Migrations were successful; disable rollback-only so `.commit` will be called instead of `.rollback`
       (jdbc/db-unset-rollback-only! conn)
       :done
       ;; If for any reason any part of the migrations fail then rollback all changes
       (catch Throwable e
         ;; This should already be happening as a result of `db-set-rollback-only!` but running it twice won't hurt so
         ;; better safe than sorry
         (.rollback (jdbc/get-connection conn))
         (throw e))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      CONNECTION POOLS & TRANSACTION STUFF                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn connection-pool
  "Create a C3P0 connection pool for the given database `spec`."
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
                 (.setProperties                   (u/prog1 (Properties.)
                                                     (doseq [[k v] (dissoc spec :classname :subprotocol :subname
                                                                                :naming :delimiters :alias-delimiter
                                                                                :excess-timeout :minimum-pool-size
                                                                                :idle-connection-test-period)]
                                                       (.setProperty <> (name k) (str v))))))})

(defn- create-connection-pool! [spec]
  (db/set-default-quoting-style! (case (db-type)
                                   :postgres :ansi
                                   :h2       :h2
                                   :mysql    :mysql))
  (db/set-default-db-connection! (connection-pool spec)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    DB SETUP                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private setup-db-has-been-called?
  (atom false))

(defn db-is-setup?
  "True if the Metabase DB is setup and ready."
  ^Boolean []
  @setup-db-has-been-called?)

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

(defn- verify-db-connection
  "Test connection to database with DETAILS and throw an exception if we have any troubles connecting."
  ([db-details]
   (verify-db-connection (:type db-details) db-details))
  ([engine details]
   {:pre [(keyword? engine) (map? details)]}
   (log/info (u/format-color 'cyan (trs "Verifying {0} Database Connection ..." (name engine))))
   (assert (binding [*allow-potentailly-unsafe-connections* true]
             (require 'metabase.driver)
             ((resolve 'metabase.driver/can-connect-with-details?) engine details))
     (format "Unable to connect to Metabase %s DB." (name engine)))
   (log/info (trs "Verify Database Connection ... ") (u/emoji "✅"))))


(def ^:dynamic ^Boolean *disable-data-migrations*
  "Should we skip running data migrations when setting up the DB? (Default is `false`).
  There are certain places where we don't want to do this; for example, none of the migrations should be ran when
  Metabase is launched via `load-from-h2`.  That's because they will end up doing things like creating duplicate
  entries for the \"magic\" groups and permissions entries. "
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
  "Run through our DB migration process and make sure DB is fully prepared"
  [auto-migrate? db-details]
  (log/info (trs "Running Database Migrations..."))
  (if auto-migrate?
    ;; There is a weird situation where running the migrations can cause a race condition: if two (or more) instances
    ;; in a horizontal cluster are started at the exact same time, they can all start running migrations (and all
    ;; acquire a lock) at the exact same moment. Since they all acquire a lock at the same time, none of them would
    ;; have been blocked from starting by the lock being in place. (Yes, this not working sort of defeats the whole
    ;; purpose of the lock in the first place, but this *is* Liquibase.)
    ;;
    ;; So what happens is one instance will ultimately end up commiting the transaction first (and succeed), while the
    ;; others will fail due to duplicate tables or the like and have their transactions rolled back.
    ;;
    ;; However, we don't want to have that instance killed because its migrations failed for that reason, so retry a
    ;; second time; this time, it will either run into the lock, or see that there are no migrations to run in the
    ;; first place, and launch normally.
    (u/auto-retry 1
      (migrate! db-details :up))
    (print-migrations-and-quit! db-details))
  (log/info (trs "Database Migrations Current ... ") (u/emoji "✅")))

(defn- run-data-migrations!
  "Do any custom code-based migrations now that the db structure is up to date."
  []
  (when-not *disable-data-migrations*
    (require 'metabase.db.migrations)
    ((resolve 'metabase.db.migrations/run-all!))))

(defn setup-db!
  "Do general preparation of database by validating that we can connect.
   Caller can specify if we should run any pending database migrations."
  [& {:keys [db-details auto-migrate]
      :or   {db-details   @db-connection-details
             auto-migrate true}}]
  (verify-db-connection db-details)
  (run-schema-migrations! auto-migrate db-details)
  (create-connection-pool! (jdbc-details db-details))
  (run-data-migrations!)
  (reset! setup-db-has-been-called? true))

(defn setup-db-if-needed!
  "Call `setup-db!` if DB is not already setup; otherwise this does nothing."
  [& args]
  (when-not @setup-db-has-been-called?
    (apply setup-db! args)))


;;; Various convenience fns (experiMENTAL)

(defn join
  "Convenience for generating a HoneySQL `JOIN` clause.

     (db/select-ids FieldValues
       (mdb/join [FieldValues :field_id] [Field :id])
       :active true)"
  [[source-entity fk] [dest-entity pk]]
  {:left-join [(db/resolve-model dest-entity) [:= (db/qualify source-entity fk)
                                                  (db/qualify dest-entity pk)]]})


(defn- type-keyword->descendants
  "Return a set of descendents of Metabase `type-keyword`. This includes `type-keyword` itself, so the set will always
  have at least one element.

     (type-keyword->descendants :type/Coordinate) ; -> #{\"type/Latitude\" \"type/Longitude\" \"type/Coordinate\"}"
  [type-keyword]
  ;; make sure `type-keyword` is a valid MB type. There may be some cases where we want to use these functions for
  ;; types outside of the `:type/` hierarchy. If and when that happens, we can reconsider this check. But since no
  ;; such cases currently exist, adding this check to catch typos makes sense.
  {:pre [(isa? type-keyword :type/*)]}
  (set (map u/keyword->qualified-name (cons type-keyword (descendants type-keyword)))))

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
   [:in (type-keyword->descendants type-keyword)])
  ;; when using this with an `expr` (e.g. `(isa :special_type :type/URL)`) just go ahead and take the results of the
  ;; one-arity impl above and splice expr in as the second element (`[:in #{"type/URL" "type/ImageURL"}]` becomes
  ;; `[:in :special_type #{"type/URL" "type/ImageURL"}]`)
  ([expr type-keyword]
   [:in expr (type-keyword->descendants type-keyword)]))
