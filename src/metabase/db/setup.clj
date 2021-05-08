(ns metabase.db.setup
  "Code for setting up the application DB -- verifying that we can connect and for running migrations. Unlike code in
  `metabase.db`, code here takes a `clojure.java.jdbc` spec as a parameter; the higher-level code in `metabase.db`
  presents a similar set of functions but passes in the default (i.e., env var) application DB connection details
  automatically.

  Because functions here don't know where the JDBC spec came from, you can use them to perform the usual application
  DB setup steps on arbitrary databases -- useful for functionality like the `load-from-h2` or `dump-to-h2` commands."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [metabase.db.connection :as mdb.connection]
            [metabase.db.liquibase :as liquibase]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.models.setting :as setting]
            [metabase.plugins.classloader :as classloader]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db])
  (:import liquibase.exception.LockException))

(defn- print-migrations-and-quit-if-needed!
  "If we are not doing auto migrations then print out migration SQL for user to run manually. Then throw an exception to
  short circuit the setup process and make it clear we can't proceed."
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
  "Migrate the application database specified by `jdbc-spec`.

  *  `:up`            - Migrate up
  *  `:force`         - Force migrate up, ignoring locks and any DDL statements that fail.
  *  `:down-one`      - Rollback a single migration
  *  `:print`         - Just print the SQL for running the migrations, don't actually run them.
  *  `:release-locks` - Manually release migration locks left by an earlier failed migration.
                        (This shouldn't be necessary now that we run migrations inside a transaction, but is
                        available just in case).

  Note that this only performs *schema migrations*, not data migrations. Data migrations are handled separately by
  `metabase.db.data-migrations/run-all!`. (`setup-db!`, below, calls both this function and `run-all!`)."
  [jdbc-spec direction]
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
          (throw e))))))

(s/defn ^:private verify-db-connection
  "Test connection to application database with `jdbc-spec` and throw an exception if we have any troubles connecting."
  [db-type :- s/Keyword jdbc-spec :- (s/cond-pre s/Str su/Map)]
  (log/info (u/format-color 'cyan (trs "Verifying {0} Database Connection ..." (name db-type))))
  (classloader/require 'metabase.driver.util)
  (let [error-msg (trs "Unable to connect to Metabase {0} DB." (name db-type))]
    (try (assert (sql-jdbc.conn/can-connect-with-spec? jdbc-spec) error-msg)
         (catch Throwable e
           (throw (ex-info error-msg {} e)))))
  (jdbc/with-db-metadata [metadata jdbc-spec]
    (log/info (trs "Successfully verified {0} {1} application database connection."
                   (.getDatabaseProductName metadata) (.getDatabaseProductVersion metadata))
              (u/emoji "✅"))))

(def ^:dynamic ^Boolean *disable-data-migrations*
  "Should we skip running data migrations when setting up the DB? (Default is `false`).
  There are certain places where we don't want to do this; for example, none of the migrations should be ran when
  Metabase is launched via `load-from-h2`.  That's because they will end up doing things like creating duplicate
  entries for the \"magic\" groups and permissions entries. "
  false)

(defn- run-schema-migrations!
  "Run through our DB migration process and make sure DB is fully prepared"
  [jdbc-spec auto-migrate?]
  (log/info (trs "Running Database Migrations..."))
  (migrate! jdbc-spec (if auto-migrate? :up :print))
  (log/info (trs "Database Migrations Current ... ") (u/emoji "✅")))

(defn- run-data-migrations!
  "Do any custom code-based migrations now that the db structure is up to date."
  [db-type jdbc-spec]
  ;; TODO -- check whether we can remove the circular ref busting here.
  (when-not *disable-data-migrations*
    (classloader/require 'metabase.db.data-migrations)
    (binding [mdb.connection/*db-type*   db-type
              mdb.connection/*jdbc-spec* jdbc-spec
              db/*db-connection*         jdbc-spec
              db/*quoting-style*         (mdb.connection/quoting-style db-type)
              setting/*disable-cache*    true]
      ((resolve 'metabase.db.data-migrations/run-all!)))))

;; TODO -- consider renaming to something like `verify-connection-and-migrate!`
(defn setup-db!
  "Connects to db and runs migrations. Don't use this directly, unless you know what you're doing; use `setup-db!`
  instead, which can be called more than once without issue and is thread-safe."
  [db-type jdbc-spec auto-migrate?]
  (u/profile (trs "Database setup")
    (u/with-us-locale
      (verify-db-connection db-type jdbc-spec)
      (run-schema-migrations! jdbc-spec auto-migrate?)
      (run-data-migrations! db-type jdbc-spec)))
  :done)
