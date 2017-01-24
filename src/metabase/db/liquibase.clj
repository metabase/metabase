(ns metabase.db.liquibase
  "Internal wrapper around Liquibase migrations functionality. Used internally by `metabase.db`; don't use functions in this namespace directly."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as s]
            [clojure.tools.logging :as log]
            [metabase.util :as u])
  (:import java.io.StringWriter
           liquibase.Liquibase
           (liquibase.database DatabaseFactory Database)
           liquibase.database.jvm.JdbcConnection
           liquibase.resource.ClassLoaderResourceAccessor))

(def ^:private ^:const ^String changelog-file "liquibase.yaml")

(defn- migrations-sql
  "Return a string of SQL containing the DDL statements needed to perform unrun LIQUIBASE migrations."
  ^String [^Liquibase liquibase]
  (let [writer (StringWriter.)]
    (.update liquibase "" writer)
    (.toString writer)))

(defn- migrations-lines
  "Return a sequnce of DDL statements that should be used to perform migrations for LIQUIBASE.

   MySQL gets snippy if we try to run the entire DB migration as one single string; it seems to only like it if we run one statement at a time;
   Liquibase puts each DDL statement on its own line automatically so just split by lines and filter out blank / comment lines. Even though this
   is not neccesary for H2 or Postgres go ahead and do it anyway because it keeps the code simple and doesn't make a significant performance difference."
  [^Liquibase liquibase]
  (for [line  (s/split-lines (migrations-sql liquibase))
        :when (not (or (s/blank? line)
                       (re-find #"^--" line)))]
    line))

(defn- has-unrun-migrations?
  "Does LIQUIBASE have migration change sets that haven't been run yet?

   It's a good idea to Check to make sure there's actually something to do before running `(migrate :up)` because `migrations-sql` will
   always contain SQL to create and release migration locks, which is both slightly dangerous and a waste of time when we won't be using them."
  ^Boolean [^Liquibase liquibase]
  (boolean (seq (.listUnrunChangeSets liquibase nil))))

(defn- has-migration-lock?
  "Is a migration lock in place for LIQUIBASE?"
  ^Boolean [^Liquibase liquibase]
  (boolean (seq (.listLocks liquibase))))

(defn- wait-for-migration-lock-to-be-cleared
  "Check and make sure the database isn't locked. If it is, sleep for 2 seconds and then retry several times.
   There's a chance the lock will end up clearing up so we can run migrations normally."
  [^Liquibase liquibase]
  (u/auto-retry 5
    (when (has-migration-lock? liquibase)
      (Thread/sleep 2000)
      (throw (Exception. "Database has migration lock; cannot run migrations. You can force-release these locks by running `java -jar metabase.jar migrate release-locks`.")))))

(defn- migrate-up-if-needed!
  "Run any unrun LIQUIBASE migrations, if needed.

   This creates SQL for the migrations to be performed, then executes each DDL statement.
   Running `.update` directly doesn't seem to work as we'd expect; it ends up commiting the changes made and they can't be rolled back at
   the end of the transaction block. Converting the migration to SQL string and running that via `jdbc/execute!` seems to do the trick."
  [conn, ^Liquibase liquibase]
  (log/info "Checking if Database has unrun migrations...")
  (when (has-unrun-migrations? liquibase)
    (log/info "Database has unrun migrations. Waiting for migration lock to be cleared...")
    (wait-for-migration-lock-to-be-cleared liquibase)
    (log/info "Migration lock is cleared. Running migrations...")
    (doseq [line (migrations-lines liquibase)]
      (jdbc/execute! conn [line]))))

(defn- force-migrate-up-if-needed!
  "Force migrating up. This does two things differently from `migrate-up-if-needed!`:

   1.  This doesn't check to make sure the DB locks are cleared
   2.  Any DDL statements that fail are ignored

   It can be used to fix situations where the database got into a weird state, as was common before the fixes made in #3295.

   Each DDL statement is ran inside a nested transaction; that way if the nested transaction fails we can roll it back without rolling back the entirety of changes
   that were made. (If a single statement in a transaction fails you can't do anything futher until you clear the error state by doing something like calling `.rollback`.)"
  [conn, ^Liquibase liquibase]
  (when (has-unrun-migrations? liquibase)
    (doseq [line (migrations-lines liquibase)]
      (log/info line)
      (jdbc/with-db-transaction [nested-transaction-connection conn]
        (try (jdbc/execute! nested-transaction-connection [line])
             (log/info (u/format-color 'green "[SUCCESS]"))
             (catch Throwable e
               (.rollback (jdbc/get-connection nested-transaction-connection))
               (log/error (u/format-color 'red "[ERROR] %s" (.getMessage e)))))))))


(defn- conn->liquibase
  "Get a `Liquibase` object from JDBC CONN."
  ^Liquibase [conn]
  (let [^JdbcConnection liquibase-conn (JdbcConnection. (jdbc/get-connection conn))
        ^Database       database       (.findCorrectDatabaseImplementation (DatabaseFactory/getInstance) liquibase-conn)]
    (Liquibase. changelog-file (ClassLoaderResourceAccessor.) database)))


(defn migrate!
  "Migrate this database via Liquibase. This command is meant for internal use by `metabase.db/migrate!`, so see that command for documentation."
  [jdbc-details direction]
  (jdbc/with-db-transaction [conn jdbc-details]
    ;; Tell transaction to automatically `.rollback` instead of `.commit` when the transaction finishes
    (jdbc/db-set-rollback-only! conn)
    ;; Disable auto-commit. This should already be off but set it just to be safe
    (.setAutoCommit (jdbc/get-connection conn) false)
    ;; Set up liquibase and let it do its thing
    (log/info "Setting up Liquibase...")
    (try
      (let [liquibase (conn->liquibase conn)]
        (log/info "Liquibase is ready.")
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
        ;; This should already be happening as a result of `db-set-rollback-only!` but running it twice won't hurt so better safe than sorry
        (.rollback (jdbc/get-connection conn))
        (throw e)))))
