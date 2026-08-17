(ns metabase.app-db.snapshot-test-util
  "Checked-in dumps of an empty application DB that Liquibase has already migrated through a fixed changeset.

  Loading a snapshot into a fresh DB leaves it in exactly the state a full migration run would have: the schema, the
  rows migrations seed, and the DATABASECHANGELOG/DATABASECHANGELOGLOCK rows. A Liquibase run against the loaded DB
  therefore applies only the changesets *after* [[through-changeset-id]], which is what makes it usable as a starting
  point instead of replaying every changeset from `v00.00-000`.

  Layout, on the test classpath:

    app_db_snapshots/<version>/meta.edn      {:through-changeset-id \"...\"}
    app_db_snapshots/<version>/h2.sql
    app_db_snapshots/<version>/postgres.sql
    app_db_snapshots/<version>/mysql.sql
    app_db_snapshots/<version>/mariadb.sql
    app_db_snapshots/<version>/mariadb_legacy_timestamp.sql

  One file per [[flavor]], which is a dialect rather than a driver: MariaDB has two because the schema its
  migrations produce depends on a server setting.

  A `.sql` file is a list of statements separated by lines containing exactly [[statement-separator]]. Nothing else
  about the file is parsed, so [[load-snapshot!]] cannot be broken by semicolons inside string literals.
  [[metabase.app-db.snapshot-test-util.generate/generate!]] is what writes that shape.

  Because DATABASECHANGELOG carries the MD5 checksum of every changeset it records, editing a migration at or below
  the snapshot boundary makes Liquibase reject a loaded snapshot. That is intended: those changesets have shipped.
  Regenerate the snapshot when moving the boundary to a newer checkpoint."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.util.log :as log])
  (:import
   (liquibase.changelog ChangeSet)))

(set! *warn-on-reflection* true)

(def statement-separator
  "Line that separates two statements in a snapshot `.sql` file. A SQL comment, so the file still reads as SQL."
  "--;;")

(def snapshot-version
  "Snapshot directory tests boot from."
  "v63")

(def ^:private snapshot-flavors
  "Dialects a snapshot is dumped for.

  MariaDB is not a MySQL alias: MySQL 8 dumps declare functional indexes (`KEY x ((case when ...)))`) that MariaDB
  cannot parse. It also needs two snapshots of its own, because `explicit_defaults_for_timestamp` changes the schema
  the very same migrations produce — see [[flavor]]."
  #{:h2 :postgres :mysql :mariadb :mariadb-legacy-timestamp})

(defn resource-path
  "Classpath location of the snapshot file for `version` and `flavor`, relative to `test_resources`."
  [version flavor ext]
  ;; underscores, to match how every other resource in the tree is named
  (format "app_db_snapshots/%s/%s.%s" version (str/replace (name flavor) "-" "_") ext))

(defn- snapshot-resource [version flavor]
  (io/resource (resource-path version flavor "sql")))

(defn through-changeset-id
  "ID of the last changeset baked into the snapshot for `version`."
  ([]
   (through-changeset-id snapshot-version))
  ([version]
   (let [resource (io/resource (format "app_db_snapshots/%s/meta.edn" version))]
     (when-not resource
       (throw (ex-info "No app DB snapshot metadata on the classpath" {:version version})))
     (:through-changeset-id (edn/read-string (slurp resource))))))

(defn- legacy-timestamp-handling?
  "Whether this server gives a `TIMESTAMP NOT NULL` column an implicit `DEFAULT CURRENT_TIMESTAMP`.

  That is what `explicit_defaults_for_timestamp = 0` does, and it means the same migrations leave behind a different
  schema. MariaDB 10.6 ships it off; 11.x and later ship it on, as MySQL 8 already did."
  [^java.sql.Connection conn]
  (with-open [stmt (.createStatement conn)
              rs   (.executeQuery stmt "SELECT @@explicit_defaults_for_timestamp")]
    (and (.next rs)
         (zero? (.getInt rs 1)))))

(defn flavor
  "Which snapshot dialect `conn` needs.

  Read from the server rather than from `db-type`, for two reasons. Metabase runs MariaDB as `db-type` `:mysql`
  — the JDBC driver and `MB_DB_TYPE` both say MySQL, and only the product name tells the two apart. MariaDB then
  splits again on [[legacy-timestamp-handling?]]: a snapshot dumped from a server that adds implicit timestamp
  defaults is not the schema a newer server would have migrated to.

  Keyed on the setting rather than on a version number, so a new MariaDB release lands on the right snapshot without
  anyone editing a table of versions."
  [^java.sql.Connection conn db-type]
  (if (and (= db-type :mysql)
           (= "MariaDB" (.getDatabaseProductName (.getMetaData conn))))
    (if (legacy-timestamp-handling? conn)
      :mariadb-legacy-timestamp
      :mariadb)
    db-type))

(defn loadable?
  "Whether a snapshot this connection can use is checked in."
  ([^java.sql.Connection conn db-type]
   (loadable? conn db-type snapshot-version))
  ([^java.sql.Connection conn db-type version]
   (boolean (some->> (flavor conn db-type) snapshot-flavors (snapshot-resource version) some?))))

(defn statements
  "Split the contents of a snapshot `.sql` file into individual statements."
  [sql]
  (into []
        (comp (map str/trim)
              (remove str/blank?))
        (str/split sql (re-pattern (str "(?m)^" (java.util.regex.Pattern/quote statement-separator) "$")))))

(defn user-tables
  "The non-system tables visible to `conn`. Empty exactly when the app DB has not been migrated yet."
  [^java.sql.Connection conn db-type]
  (let [schema (when (= db-type :h2) "PUBLIC")]
    (with-open [rs (.getTables (.getMetaData conn) nil schema "%" (into-array String ["TABLE"]))]
      (vec (jdbc/result-set-seq rs)))))

(def ^:private drop-changelog-tables
  "Anything that opens Liquibase against a connection — [[changeset-ids]] included — creates the changelog tables as a
  side effect, before a single changeset has run. The snapshot carries its own copies, complete with the rows saying
  what has already been applied, so clear the empty ones out of the way first.

  Unquoted and upper-case so that every DB resolves it: H2, MySQL and MariaDB store the name upper-case, and Postgres
  folds the unquoted name down to the lower-case name it stores."
  ["DROP TABLE IF EXISTS DATABASECHANGELOG"
   "DROP TABLE IF EXISTS DATABASECHANGELOGLOCK"])

(def ^:private mysql-family
  "Flavors reached through the MySQL driver, and the only ones [[session-guards]] relaxes anything for."
  #{:mysql :mariadb :mariadb-legacy-timestamp})

(defn- session-guards
  "`[before after]` statements to run around a snapshot load.

  The MySQL family needs two things relaxed for the duration:

  - Foreign keys, because mysqldump writes tables in alphabetical rather than dependency order, so a constraint can
    name a table that does not exist yet.
  - Strict mode, because mariadb-dump lists generated columns (`metabase_field.unique_field_helper`) in its INSERT
    column lists, and assigning to one is an error under strict mode rather than the warning it is otherwise.

  The previous `sql_mode` is stashed in a user variable, which outlives the individual statements, and put back
  afterwards so the rest of the session is unaffected. pg_dump and H2 emit an order that loads cleanly and need
  nothing beyond clearing the changelog tables."
  [flavor]
  (if (mysql-family flavor)
    [(into ["SET FOREIGN_KEY_CHECKS = 0"
            "SET @mb_snapshot_sql_mode = @@SESSION.sql_mode"
            "SET SESSION sql_mode = ''"]
           drop-changelog-tables)
     ["SET FOREIGN_KEY_CHECKS = 1"
      "SET SESSION sql_mode = IFNULL(@mb_snapshot_sql_mode, @@SESSION.sql_mode)"]]
    [drop-changelog-tables []]))

(defn- creates-view? [sql]
  (boolean (re-find #"(?is)^\s*CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\b" sql)))

(defn- load-order
  "`[guarded unguarded]`: the snapshot's statements split into those that run under [[session-guards]] and those that
  run once the guards are back off.

  MySQL fixes a view's column nullability when the view is created, and the `sql_mode` in force is part of what it
  reads: with strict mode off `concat(...)` is recorded NOT NULL, where the very same statement under the session's
  own mode records it nullable. Migrations run under that mode, so the relaxation has to be off again before the
  dump recreates the views; nothing else in a dump is sensitive to it. Relative order is preserved, and a view can
  only read tables and views defined before it, so deferring them cannot break a load."
  [flavor stmts]
  (if (mysql-family flavor)
    [(remove creates-view? stmts) (filter creates-view? stmts)]
    [stmts []]))

(defn load-snapshot!
  "Load the checked-in snapshot into the empty DB behind `conn`, picking the dialect from [[flavor]]."
  ([^java.sql.Connection conn db-type]
   (load-snapshot! conn db-type snapshot-version))
  ([^java.sql.Connection conn db-type version]
   (let [flavor           (flavor conn db-type)
         resource         (or (snapshot-resource version flavor)
                              (throw (ex-info "No app DB snapshot for this dialect"
                                              {:version version, :db-type db-type, :flavor flavor})))
         stmts            (statements (slurp resource))
         [before after]   (session-guards flavor)
         [guarded views]  (load-order flavor stmts)]
     (log/debugf "Loading %s app db snapshot %s (%d statements)..." flavor version (count stmts))
     (with-open [stmt (.createStatement conn)]
       (letfn [(execute! [sqls]
                 (doseq [sql sqls]
                   (try
                     (.execute stmt sql)
                     (catch Throwable e
                       (throw (ex-info "Error loading app DB snapshot statement"
                                       {:version version, :flavor flavor, :statement sql}
                                       e))))))]
         (doseq [sql before]
           (.execute stmt sql))
         ;; The whole load goes in one transaction. A snapshot is thousands of statements, and left in autocommit each
         ;; one is a transaction of its own: on Postgres that made loading the snapshot cost more than replaying the
         ;; changelog it stands in for. Statements the MySQL family commits implicitly are unaffected either way.
         (let [autocommit? (.getAutoCommit conn)]
           (when autocommit?
             (.setAutoCommit conn false))
           (try
             (try
               (execute! guarded)
               (finally
                 (doseq [sql after]
                   (.execute stmt sql))))
             (execute! views)
             (.commit conn)
             (catch Throwable e
               ;; without this, restoring autocommit below would commit however much of the load got through
               (try (.rollback conn) (catch Throwable _))
               (throw e))
             (finally
               (when autocommit?
                 (.setAutoCommit conn true)))))))
     ;; Postgres runs DDL inside the transaction, and anything that has already opened Liquibase against this
     ;; connection has left autocommit off. Liquibase rolls back before taking its changelog lock, which would undo
     ;; the entire load, so make it durable here.
     (when-not (.getAutoCommit conn)
       (.commit conn))
     :done)))

(defn changeset-ids
  "Every changeset ID in the current changelog, in the order Liquibase will run them."
  [^java.sql.Connection conn]
  (liquibase/with-liquibase [lb conn]
    (mapv #(.getId ^ChangeSet %) (.getChangeSets (.getDatabaseChangeLog lb)))))

(defn usable-for-start?
  "Whether the snapshot can stand in for replaying changesets up to (but not including) `start-id`. False when
  `start-id` is at or before the snapshot boundary, since the caller still needs those changesets to run."
  [^java.sql.Connection conn changeset-ids db-type start-id]
  (and (loadable? conn db-type)
       (let [idx (zipmap changeset-ids (range))]
         (when-let [through (idx (through-changeset-id))]
           (boolean (some-> (idx start-id) (> through)))))))
