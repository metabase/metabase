(ns metabase.db
  "Application database definition, and setup logic, and helper functions for interacting with it."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [metabase.db
             [config :as db.config]
             [connection-pool :as connection-pool]
             [data-migrations :as data-migrations]
             [schema-migrations :as schema-migrations]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [schema.core :as s]
            [toucan.db :as db]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      CONNECTION POOLS & TRANSACTION STUFF                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private application-db-connection-pool-properties
  "c3p0 connection pool properties for the application DB. See
  https://www.mchange.com/projects/c3p0/#configuration_properties for descriptions of properties."
  {"minPoolSize"     1
   "initialPoolSize" 1
   "maxPoolSize"     15})

(s/defn ^:private connection-pool :- db.config/JDBCSpec
  "Create a C3P0 connection pool for the given jdbc `spec`."
  [jdbc-spec :- db.config/JDBCSpec]
  (connection-pool/connection-pool-spec jdbc-spec application-db-connection-pool-properties))

(s/defn ^:private create-connection-pool!
  ([]
   (create-connection-pool! (db.config/db-type) (db.config/jdbc-spec)))

  ([db-type :- db.config/DBType, jdbc-spec :- db.config/JDBCSpec]
   (db/set-default-quoting-style! (case db-type
                                    :postgres :ansi
                                    :h2       :h2
                                    :mysql    :mysql))
   (db/set-default-db-connection! (connection-pool jdbc-spec))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    DB SETUP                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private setup-db-has-been-called?
  (atom false))

(defn db-is-setup?
  "True if the Metabase DB is setup and ready."
  ^Boolean []
  @setup-db-has-been-called?)

(def ^:private connection-timeout-ms
  "Maximum number of seconds to wait to connect to application database before assuming connection is unsuccessful."
  (* 15 1000))

(s/defn ^:private test-connection [jdbc-spec :- db.config/JDBCSpec]
  (let [[first-row] (try
                      (jdbc/query jdbc-spec "SELECT 1;")
                      (catch Throwable e
                        (log/fatal e "Connection to Metabase application database failed")
                        (throw e)))]
    (when-not (= (vals first-row) [1])
      (throw (Exception. (str (trs "Database connection failed: test query returned invalid results.")))))))

(s/defn ^:private verify-db-connection
  "Test connection to database with `jdbc-spec` and throw an exception if we have any troubles connecting."
  ([]
   (verify-db-connection (db.config/db-type) (db.config/jdbc-spec)))

  ([db-type :- db.config/DBType, jdbc-spec :- db.config/JDBCSpec]
   (log/info (u/format-color 'cyan (trs "Verifying {0} database connection ..." (name db-type))))
   (u/with-timeout connection-timeout-ms
     (test-connection jdbc-spec))
   (log/info (trs "Verify database connection ...") (u/emoji "✅"))))


(def ^:dynamic ^Boolean *disable-data-migrations*
  "Should we skip running data migrations when setting up the DB? (Default is `false`).
  There are certain places where we don't want to do this; for example, none of the migrations should be ran when
  Metabase is launched via `load-from-h2`.  That's because they will end up doing things like creating duplicate
  entries for the \"magic\" groups and permissions entries. "
  false)

(def ^:private MigrationDirection
  (apply s/enum (keys (methods schema-migrations/migrate!))))

(s/defn migrate!
  "Migrate the database. Direction is a keyword such as `:up` or `:force`. See `metabase.db.schema-migrations/migrate!`
  for more details."
  ([direction :- MigrationDirection]
   (migrate! (db.config/db-type) (db.config/jdbc-spec) direction))

  ([db-type :- db.config/DBType, jdbc-spec :- db.config/JDBCSpec, direction :- MigrationDirection]
   (schema-migrations/migrate! db-type jdbc-spec direction)))

(s/defn ^:private print-migrations-and-quit!
  "If we are not doing auto migrations then print out migration SQL for user to run manually.
   Then throw an exception to short circuit the setup process and make it clear we can't proceed."
  ([]
   (print-migrations-and-quit! (db.config/db-type) (db.config/jdbc-spec)))

  ([db-type :- db.config/DBType, jdbc-spec :- db.config/JDBCSpec]
   (let [sql (migrate! db-type jdbc-spec :print)]
     (log/info (str "Database Upgrade Required\n\n"
                    "NOTICE: Your database requires updates to work with this version of Metabase.  "
                    "Please execute the following sql commands on your database before proceeding.\n\n"
                    sql
                    "\n\n"
                    "Once your database is updated try running the application again.\n"))
     (throw (Exception. "Database requires manual upgrade.")))))

(s/defn ^:private run-schema-migrations!
  "Run through our DB migration process and make sure DB is fully prepared"
  ([auto-migrate?]
   (run-schema-migrations! (db.config/db-type) (db.config/jdbc-spec) auto-migrate?))

  ([db-type :- db.config/DBType, jdbc-spec :- db.config/JDBCSpec, auto-migrate?]
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
       (migrate! db-type jdbc-spec :up))
     ;; if `MB_DB_AUTOMIGRATE` is false, and we have migrations that need to be ran, print and quit. Otherwise continue
     ;; to start normally
     (when (schema-migrations/has-unrun-migrations? (schema-migrations/jdbc-spec->liquibase jdbc-spec))
       (print-migrations-and-quit! db-type jdbc-spec)))
   (log/info (trs "Database Migrations Current ... ") (u/emoji "✅"))))

(defn- run-data-migrations!
  "Do any custom code-based migrations now that the db structure is up to date."
  []
  (when-not *disable-data-migrations*
    (data-migrations/run-all!)))

(def ^:private setup-db-lock (Object.))

(defn setup-db!
  "Do general preparation of database by validating that we can connect. Caller can specify if we should run any pending
  database migrations."
  [& {:keys [auto-migrate?], :or {auto-migrate? true}}]
  (locking setup-db-lock
    (u/with-us-locale
      (verify-db-connection)
      (run-schema-migrations! auto-migrate?)
      (create-connection-pool!)
      (run-data-migrations!)
      (reset! setup-db-has-been-called? true))))

(defn setup-db-if-needed!
  "Call `setup-db!` if DB is not already setup; otherwise this does nothing."
  [& args]
  (when-not @setup-db-has-been-called?
    (apply setup-db! args)))
