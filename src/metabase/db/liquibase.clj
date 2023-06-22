(ns metabase.db.liquibase
  "High-level Clojure wrapper around relevant parts of the Liquibase API."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.config :as config]
   [metabase.db.liquibase.h2 :as liquibase.h2]
   [metabase.db.liquibase.mysql :as liquibase.mysql]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [schema.core :as s])
  (:import
   (java.io StringWriter)
   (liquibase Contexts LabelExpression Liquibase)
   (liquibase.database Database DatabaseFactory)
   (liquibase.database.jvm JdbcConnection)
   (liquibase.exception LockException)
   (liquibase.resource ClassLoaderResourceAccessor)))

(set! *warn-on-reflection* true)

;; register our custom MySQL SQL generators
(liquibase.mysql/register-mysql-generators!)

;; Liquibase uses java.util.logging (JUL) for logging, so we need to install the JUL -> Log4j2 bridge which replaces the
;; default JUL handler with one that "writes" log messages to Log4j2. (Not sure this is the best place in the world to
;; do this, but Liquibase is the only thing using JUL directly.)
;;
;; See https://logging.apache.org/log4j/2.x/log4j-jul/index.html for more information.
(org.apache.logging.log4j.jul.Log4jBridgeHandler/install true nil true)

;; Liquibase logs a message for every ChangeSet directly to standard out -- see
;; https://github.com/liquibase/liquibase/issues/2396 -- but we can disable this by setting the ConsoleUIService's
;; output stream to the null output stream
(doto ^liquibase.ui.ConsoleUIService (.getUI (liquibase.Scope/getCurrentScope))
  ;; we can't use `java.io.OutputStream/nullOutputStream` here because it's not available on Java 8
  (.setOutputStream (java.io.PrintStream. (org.apache.commons.io.output.NullOutputStream.))))

(def ^:private ^String changelog-file "liquibase.yaml")

(defn- liquibase-connection ^JdbcConnection [^java.sql.Connection jdbc-connection]
  (JdbcConnection. jdbc-connection))

(defn- h2? [^JdbcConnection liquibase-conn]
  (str/starts-with? (.getURL liquibase-conn) "jdbc:h2"))

(defn- database ^Database [^JdbcConnection liquibase-conn]
  (if (h2? liquibase-conn)
    (liquibase.h2/h2-database liquibase-conn)
    (.findCorrectDatabaseImplementation (DatabaseFactory/getInstance) liquibase-conn)))

(defn- liquibase ^Liquibase [^Database database]
  (Liquibase. changelog-file (ClassLoaderResourceAccessor.) database))

(s/defn do-with-liquibase
  "Impl for [[with-liquibase-macro]]."
  [conn-or-data-source :- (s/cond-pre java.sql.Connection javax.sql.DataSource)
   f]
  ;; closing the `LiquibaseConnection`/`Database` closes the parent JDBC `Connection`, so only use it in combination
  ;; with `with-open` *if* we are opening a new JDBC `Connection` from a JDBC spec. If we're passed in a `Connection`,
  ;; it's safe to assume the caller is managing its lifecycle.
  (if (instance? java.sql.Connection conn-or-data-source)
    (f (-> conn-or-data-source liquibase-connection database liquibase))
    (with-open [conn           (.getConnection ^javax.sql.DataSource conn-or-data-source)
                liquibase-conn (liquibase-connection conn)
                database       (database liquibase-conn)]
      (f (liquibase database)))))

(defmacro with-liquibase
  "Execute body with an instance of a `Liquibase` bound to `liquibase-binding`.

    (liquibase/with-liquibase [liquibase {:subname :postgres, ...}]
      (liquibase/migrate-up-if-needed! liquibase))"
  {:style/indent 1}
  [[liquibase-binding conn-or-data-source] & body]
  `(do-with-liquibase
    ~conn-or-data-source
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

  As of 0.31.1 this is only used for printing the migrations without running or when force migrating."
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
  (boolean (seq (.listUnrunChangeSets liquibase nil (LabelExpression.)))))

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
        (let [^Contexts contexts nil] (.update liquibase contexts)))
      (log/info
        (trs "Migration lock cleared, but nothing to do here! Migrations were finished by another instance.")))))

(s/defn force-migrate-up-if-needed!
  "Force migrating up. This does three things differently from [[migrate-up-if-needed!]]:

  1.  This doesn't check to make sure the DB locks are cleared
  2.  This generates a sequence of individual DDL statements with [[migrations-lines]] and runs them each in turn
  3.  Any DDL statements that fail are ignored

  It can be used to fix situations where the database got into a weird state, as was common before the fixes made in
  #3295.

  Each DDL statement is ran inside a nested transaction; that way if the nested transaction fails we can roll it back
  without rolling back the entirety of changes that were made. (If a single statement in a transaction fails you can't
  do anything futher until you clear the error state by doing something like calling `.rollback`.)"
  [conn      :- java.sql.Connection
   liquibase :- Liquibase]
  (.clearCheckSums liquibase)
  (when (has-unrun-migrations? liquibase)
    (doseq [line (migrations-lines liquibase)]
      (log/info line)
      ;; try executing `line` in a nested transaction
      (let [save-point (.setSavepoint conn)]
        (try
          (jdbc/execute! {:connection conn} [line])
          (log/info (u/format-color 'green "[SUCCESS]"))
          (catch Throwable e
            (.rollback conn save-point)
            (log/error (u/format-color 'red "[ERROR] %s" (.getMessage e)))))))))

(defn- changelog-table-name
  "Returns case-sensitive database-specific name for Liquibase changelog table for db-type"
  [db-type]
  (if (#{:h2 :mysql} db-type)
    "DATABASECHANGELOG"
    "databasechangelog"))

(s/defn consolidate-liquibase-changesets!
  "Consolidate all previous DB migrations so they come from single file.

  Previously migrations where stored in many small files which added seconds per file to the startup time because
  liquibase was checking the jar signature for each file. This function is required to correct the liquibase tables to
  reflect that these migrations where moved to a single file.

  see https://github.com/metabase/metabase/issues/3715"
  [db-type :- s/Keyword
   conn    :- java.sql.Connection]
  (let [liquibase-table-name (changelog-table-name db-type)
        fresh-install?       (let [meta (.getMetaData conn)] ; don't migrate on fresh install
                               (empty? (jdbc/metadata-query
                                        (.getTables meta nil nil liquibase-table-name (u/varargs String ["TABLE"])))))
        statement            (format "UPDATE %s SET FILENAME = ?" liquibase-table-name)]
    (when-not fresh-install?
      (jdbc/execute! {:connection conn} [statement "migrations/000_migrations.yaml"]))))

(defn- extract-numbers
  "Returns contiguous integers parsed from string s"
  [s]
  (map #(Integer/parseInt %) (re-seq #"\d+" s)))

(defn- current-major-version
  "Returns the major version of the running Metabase JAR"
  []
  (second (extract-numbers (:tag config/mb-version-info))))

(defn rollback-major-version
  "Roll back migrations later than given Metabase major version"
  ;; default rollback to previous version
  ([db-type conn liquibase]
   ;; get current major version of Metabase we are running
   (rollback-major-version db-type conn liquibase (dec (current-major-version))))

  ;; with explicit target version
  ([db-type conn ^Liquibase liquibase target-version]
   (when (or (not (integer? target-version)) (< target-version 44))
     (throw (IllegalArgumentException.
             (format "target version must be a number between 44 and the previous major version (%d), inclusive"
                     (current-major-version)))))
   ;; count and rollback only the applied change set ids which come after the target version (only the "v..." IDs need to be considered)
   (let [changeset-query (format "SELECT id FROM %s WHERE id LIKE 'v%%' ORDER BY ORDEREXECUTED ASC"
                                 (changelog-table-name db-type))
         changeset-ids   (map :id (jdbc/query {:connection conn} [changeset-query]))
         ;; IDs in changesets do not include the leading 0/1 digit, so the major version is the first number
         ids-to-drop     (drop-while #(not= (inc target-version) (first (extract-numbers %))) changeset-ids)]
     (log/infof "Rolling back app database schema to version %d" target-version)
     (.rollback liquibase (count ids-to-drop) ""))))

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
