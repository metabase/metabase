(ns metabase.db.liquibase
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]])
  (:import java.io.StringWriter
           [liquibase Contexts Liquibase]
           [liquibase.database Database DatabaseFactory]
           liquibase.database.jvm.JdbcConnection
           liquibase.exception.LockException
           liquibase.resource.ClassLoaderResourceAccessor
           liquibase.sqlgenerator.SqlGeneratorFactory
           metabase.db.liquibase.MetabaseMySqlCreateTableSqlGenerator))

(.register (SqlGeneratorFactory/getInstance) (MetabaseMySqlCreateTableSqlGenerator.))

(def ^:private ^String changelog-file "liquibase.yaml")

(defn- liquibase-connection ^JdbcConnection [^java.sql.Connection jdbc-connection]
  (JdbcConnection. jdbc-connection))

(defn- database ^Database [^JdbcConnection liquibase-conn]
  (.findCorrectDatabaseImplementation (DatabaseFactory/getInstance) liquibase-conn))

(defn- liquibase ^Liquibase [^Database database]
  (Liquibase. changelog-file (ClassLoaderResourceAccessor.) database))

(defn do-with-liquibase
  "Impl for `with-liquibase-macro`."
  [jdbc-spec-or-conn f]
  ;; closing the `LiquibaseConnection`/`Database` closes the parent JDBC `Connection`, so only use it in combination
  ;; with `with-open` *if* we are opening a new JDBC `Connection` from a JDBC spec. If we're passed in a `Connection`,
  ;; it's safe to assume the caller is managing its lifecycle.
  (letfn []
    (cond
      (instance? java.sql.Connection jdbc-spec-or-conn)
      (f (-> jdbc-spec-or-conn liquibase-connection database liquibase))

      (:connection jdbc-spec-or-conn)
      (recur (:connection jdbc-spec-or-conn) f)

      :else
      (with-open [jdbc-conn      (jdbc/get-connection jdbc-spec-or-conn)
                  liquibase-conn (liquibase-connection jdbc-conn)
                  database       (database liquibase-conn)]
        (f (liquibase database))))))

(defmacro with-liquibase
  "Execute body with an instance of a `Liquibase` bound to `liquibase-binding`.

    (liquibase/with-liquibase [liquibase {:subname :postgres, ...}]
      (liquibase/migrate-up-if-needed! liquibase))"
  {:style/indent 1}
  [[liquibase-binding jdbc-spec-or-conn] & body]
  `(do-with-liquibase
    ~jdbc-spec-or-conn
    (fn [~(vary-meta liquibase-binding assoc :tag (symbol (.getCanonicalName Liquibase)))]
      ~@body)))

(defn migrations-sql
  "Return a string of SQL containing the DDL statements needed to perform unrun `liquibase` migrations."
  ^String [^Liquibase liquibase]
  (let [writer (StringWriter.)]
    (.update liquibase "" writer)
    (.toString writer)))

(defn migrations-lines
  "Return a sequnce of DDL statements that should be used to perform migrations for `liquibase`.

  MySQL gets snippy if we try to run the entire DB migration as one single string; it seems to only like it if we run
  one statement at a time; Liquibase puts each DDL statement on its own line automatically so just split by lines and
  filter out blank / comment lines. Even though this is not necessary for H2 or Postgres go ahead and do it anyway
  because it keeps the code simple and doesn't make a significant performance difference.

  As of 0.31.1 this is only used for printing the migrations without running or using force migrating."
  [^Liquibase liquibase]
  (for [line  (str/split-lines (migrations-sql liquibase))
        :when (not (or (str/blank? line)
                       (re-find #"^--" line)))]
    line))

(defn has-unrun-migrations?
  "Does `liquibase` have migration change sets that haven't been run yet?

  It's a good idea to check to make sure there's actually something to do before running `(migrate :up)` so we can
  skip creating and releasing migration locks, which is both slightly dangerous and a waste of time when we won't be
  using them.

  (I'm not 100% sure whether `Liquibase.update()` still acquires locks if the database is already up-to-date, but
  `migrations-lines` certainly does; duplicating the skipping logic doesn't hurt anything.)"
  ^Boolean [^Liquibase liquibase]
  (boolean (seq (.listUnrunChangeSets liquibase nil))))

(defn- migration-lock-exists?
  "Is a migration lock in place for `liquibase`?"
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
       (LockException.
        (str
         (trs "Database has migration lock; cannot run migrations.")
         " "
         (trs "You can force-release these locks by running `java -jar metabase.jar migrate release-locks`.")))))))

(defn migrate-up-if-needed!
  "Run any unrun `liquibase` migrations, if needed."
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
        (u/auto-retry 3 (let [^Contexts contexts nil] (.update liquibase contexts))))
      (log/info
        (trs "Migration lock cleared, but nothing to do here! Migrations were finished by another instance.")))))

(defn force-migrate-up-if-needed!
  "Force migrating up. This does two things differently from `migrate-up-if-needed!`:

  1.  This doesn't check to make sure the DB locks are cleared
  2.  This generates a sequence of individual DDL statements with `migrations-lines` and runs them each in turn
  3.  Any DDL statements that fail are ignored

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

(defn consolidate-liquibase-changesets!
  "Consolidate all previous DB migrations so they come from single file.

  Previously migrations where stored in many small files which added seconds per file to the startup time because
  liquibase was checking the jar signature for each file. This function is required to correct the liquibase tables to
  reflect that these migrations where moved to a single file.

  see https://github.com/metabase/metabase/issues/3715"
  [jdbc-spec]
  (let [liquibase-table-name (if (#{:h2 :mysql} (:type jdbc-spec))
                               "DATABASECHANGELOG"
                               "databasechangelog")
        fresh-install?       (jdbc/with-db-metadata [meta jdbc-spec] ;; don't migrate on fresh install
                               (empty? (jdbc/metadata-query
                                        (.getTables meta nil nil liquibase-table-name (u/varargs String ["TABLE"])))))
        statement            (format "UPDATE %s SET FILENAME = ?" liquibase-table-name)]
    (when-not fresh-install?
      (jdbc/execute! jdbc-spec [statement "migrations/000_migrations.yaml"]))))

(defn rollback-one
  "Roll back the last migration."
  [^Liquibase liquibase]
  (.rollback liquibase 1 ""))

(defn force-release-locks!
  "(Attempt to) force release Liquibase migration locks."
  [^Liquibase liquibase]
  (.forceReleaseLocks liquibase))

(defn release-lock-if-needed!
  "Attempts to release the liquibase lock if present. Logs but does not bubble up the exception if one occurs as it's
  intended to be used when a failure has occurred and bubbling up this exception would hide the real exception."
  [^Liquibase liquibase]
  (when (migration-lock-exists? liquibase)
    (try
      (force-release-locks! liquibase)
      (catch Exception e
        (log/error e (trs "Unable to release the Liquibase lock after a migration failure"))))))
