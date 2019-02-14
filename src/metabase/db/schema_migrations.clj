(ns metabase.db.schema-migrations
  "Logic for running schema migrations, using Liquibase to do most of the heavy lifting."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [schema.core :as s]
            [metabase.db.config :as db.config]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]])
  (:import java.io.StringWriter
           [liquibase Contexts Liquibase]
           [liquibase.database Database DatabaseFactory]
           liquibase.database.jvm.JdbcConnection
           liquibase.exception.LockException
           liquibase.resource.ClassLoaderResourceAccessor))

(def ^:private ^String changelog-file "liquibase.yaml")

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

(defn- migrate-up-if-needed!
  "Run any unrun `liquibase` migrations, if needed."
  [^Liquibase liquibase]
  (log/info (trs "Checking if Database has unrun migrations..."))
  (when (has-unrun-migrations? liquibase)
    (log/info (trs "Database has unrun migrations. Waiting for migration lock to be cleared..."))
    (wait-for-migration-lock-to-be-cleared liquibase)
    ;; while we were waiting for the lock, it was possible that another instance finished the migration(s), so make
    ;; sure something still needs to be done...
    (if (has-unrun-migrations? liquibase)
      (do
        (log/info (trs "Migration lock is cleared. Running migrations..."))
        (let [^Contexts contexts nil]
          (.update liquibase contexts)))
      (log/info
       (trs "Migration lock cleared, but nothing to do here! Migrations were finished by another instance.")))))

(s/defn ^:private force-migrate-up-if-needed!
  "Force migrating up. This does two things differently from `migrate-up-if-needed!`:

  1.  This doesn't check to make sure the DB locks are cleared
  2.  This generates a sequence of individual DDL statements with `migrations-lines` and runs them each in turn
  3.  Any DDL statements that fail are ignored

  It can be used to fix situations where the database got into a weird state, as was common before the fixes made in
  #3295.

  Each DDL statement is ran inside a nested transaction; that way if the nested transaction fails we can roll it back
  without rolling back the entirety of changes that were made. (If a single statement in a transaction fails you can't
  do anything futher until you clear the error state by doing something like calling `.rollback`.)"
  [conn :- db.config/JDBCSpec, liquibase :- Liquibase]
  (.clearCheckSums liquibase)
  (when (has-unrun-migrations? liquibase)
    (doseq [line (migrations-lines liquibase)]
      (log/info line)
      ;; run each DDL statement in a transaction. That way if it fails we can roll it back and proceed so the entire
      ;; connection doesn't get put in a bad state. `clojure.java.jdbc/with-db-transaction` does not nest DB
      ;; transactions, so it's important that `conn` above isn't already a transaction connection
      (jdbc/with-db-transaction [t-conn conn]
        (try
          (jdbc/execute! t-conn [line])
          (log/info (u/format-color 'green "[SUCCESS]"))
          (catch Throwable e
            (.rollback (jdbc/get-connection t-conn))
            (log/error (u/format-color 'red "[ERROR] %s" (.getMessage e)))))))))

(s/defn jdbc-spec->liquibase :- Liquibase
  "Get a `Liquibase` object from JDBC connection spec or connection."
  [jdbc-spec :- db.config/JDBCSpec]
  (let [^JdbcConnection liquibase-conn (JdbcConnection. (jdbc/get-connection jdbc-spec))
        ^Database       database       (.findCorrectDatabaseImplementation (DatabaseFactory/getInstance) liquibase-conn)]
    (Liquibase. changelog-file (ClassLoaderResourceAccessor.) database)))

(s/defn ^:private consolidate-liquibase-changesets
  "Consolidate all previous DB migrations so they come from single file.

  Previously migrations where stored in many small files which added seconds per file to the startup time because
  liquibase was checking the jar signature for each file. This function is required to correct the liquibase tables to
  reflect that these migrations where moved to a single file.

  see https://github.com/metabase/metabase/issues/3715"
  [db-type :- db.config/DBType, jdbc-spec :- db.config/JDBCSpec]
  (let [changelog-table-name (if (#{:h2 :mysql} db-type)
                               "DATABASECHANGELOG"
                               "databasechangelog")
        fresh-install?       (jdbc/with-db-metadata [meta jdbc-spec] ;; don't migrate on fresh install
                               (empty? (jdbc/metadata-query
                                        (.getTables meta nil nil changelog-table-name (into-array String ["TABLE"])))))
        query                (format "UPDATE %s SET FILENAME = ?" changelog-table-name)]
    (when-not fresh-install?
      (jdbc/execute! jdbc-spec [query "migrations/000_migrations.yaml"]))))

(defn- release-lock-if-needed!
  "Attempts to release the liquibase lock if present. Logs but does not bubble up the exception if one occurs as it's
  intended to be used when a failure has occurred and bubbling up this exception would hide the real exception."
  [^Liquibase liquibase]
  (when (migration-lock-exists? liquibase)
    (try
      (.forceReleaseLocks liquibase)
      (catch Exception e
        (log/error e (trs "Unable to release the Liquibase lock after a migration failure"))))))

(defn- do-with-liquibase [db-type jdbc-spec f]
  (log/info (trs "Setting up Liquibase..."))
  (let [liquibase (jdbc-spec->liquibase jdbc-spec)]
    (consolidate-liquibase-changesets db-type jdbc-spec)
    (log/info (trs "Liquibase is ready."))
    (try
      (f liquibase)
      (catch Throwable e
        ;; With some failures, it's possible that the lock won't be released. To make this worse, if we retry the
        ;; operation without releasing the lock first, the real error will get hidden behind a lock error
        (release-lock-if-needed! liquibase)
        (throw e)))))

(defmacro ^:private with-liquibase {:style/indent 1} [[liquibase-binding db-type jdbc-spec] & body]
  `(do-with-liquibase
    ~db-type
    ~jdbc-spec
    (fn [~(vary-meta liquibase-binding assoc :tag `Liquibase)]
      ~@body)))

(defmulti migrate!
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
  `metabase.db.data-migrations/run-all!`. (`metabase.db/setup-db!` calls both this function and `run-all!`)."
  {:arglists '([db-type jdbc-spec direction])}
  (fn [_ _ direction] direction))

(defmethod migrate! :up [db-type jdbc-spec _]
  (jdbc/with-db-transaction [t-conn jdbc-spec]
    (with-liquibase [liquibase db-type t-conn]
      (migrate-up-if-needed! liquibase))))

(defmethod migrate! :force [db-type jdbc-spec _]
  (jdbc/with-db-connection [conn jdbc-spec]
    ;; Tell transaction to automatically `.rollback` instead of `.commit` when the transaction finishes until it hears
    ;; otherwise
    (jdbc/db-set-rollback-only! conn)
    (with-liquibase [liquibase db-type jdbc-spec]
      (force-migrate-up-if-needed! conn liquibase))))

(defmethod migrate! :down-one [db-type jdbc-spec _]
  (with-liquibase [liquibase db-type jdbc-spec]
    (.rollback liquibase 1 "")))

(defmethod migrate! :print [db-type jdbc-spec _]
  (with-liquibase [liquibase db-type jdbc-spec]
    (println (migrations-sql liquibase))))

(defmethod migrate! :release-locks [db-type jdbc-spec _]
  (with-liquibase [liquibase db-type jdbc-spec]
    (.forceReleaseLocks liquibase)))
