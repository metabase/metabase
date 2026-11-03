(ns metabase.app-db.snapshot-test-util
  "Checked-in dumps of an empty application DB that Liquibase has already migrated through a fixed changeset.

  Loading a snapshot into a fresh DB leaves it in the state a full migration run through [[through-changeset-id]]
  would have: the schema, the rows migrations seed, and the DATABASECHANGELOG/DATABASECHANGELOGLOCK rows.
  A Liquibase run against the loaded DB then applies only what the snapshot does not record, which is what makes it a
  starting point instead of replaying every changeset from `v00.00-000`.

  Two things differ from a fresh install, on purpose.
  Every changelog row carries the same [[deployment-id]] and [[executed-at]], so that regenerating an unchanged
  snapshot writes an unchanged file.
  And there is no `databasechangelog_version`: whatever loads the snapshot backfills its version from the `vNN.`
  changeset ids, the way it would for an install from before version tracking.
  That backfill only works while every changeset up to the boundary has a `vNN.` id, so a boundary past the first
  version-less changeset needs the snapshot to carry its version rows instead.

  Layout, on the test classpath:

    app_db_snapshots/<version>/meta.edn      {:through-changeset-id \"...\", :executed-at \"...\"}
    app_db_snapshots/<version>/h2.sql
    app_db_snapshots/<version>/postgres.sql
    app_db_snapshots/<version>/mysql.sql
    app_db_snapshots/<version>/mariadb.sql
    app_db_snapshots/<version>/mariadb_legacy_timestamp.sql

  There is one file per [[flavor]], which is a dialect rather than a driver: MariaDB has two because the schema its
  migrations produce depends on a server setting.

  Each `.sql` file is a list of statements separated by lines containing exactly [[statement-separator]].
  Nothing else about the file is parsed, so [[load-snapshot!]] cannot be broken by semicolons inside string literals.
  The files are written by [[metabase.app-db.snapshot-test-util.generate/generate!]].

  Changesets keep arriving before the boundary after a snapshot is cut: backports to older majors, per-feature files
  dated before it, and ids that move.
  A loaded snapshot does not record them, so Liquibase runs them after the snapshot's own, as it would on an install
  upgrading to a patch release.
  Tests stay correct, but each one is time the snapshot no longer saves until it is regenerated.
  Editing a changeset the snapshot records changes its checksum, and Liquibase then rejects the loaded snapshot.
  Editing a custom migration's code does not, and the drift test in [[metabase.app-db.snapshot-test]] is what notices
  that."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.app-db.snapshot-test-util.dump-util :as dump-util]
   [metabase.util.encryption :as encryption]
   [metabase.util.log :as log])
  (:import
   (liquibase.changelog ChangeSet)))

(set! *warn-on-reflection* true)

(def statement-separator
  "The line that separates two statements in a snapshot `.sql` file.
  It is a SQL comment, so the file still reads as SQL."
  "--;;")

(def snapshot-version
  "Snapshot directory tests boot from."
  "v63")

;; MariaDB is not a MySQL alias: MySQL 8 dumps declare functional indexes (`KEY x ((case when ...)))`) that MariaDB
;; cannot parse. It also needs two snapshots of its own, because `explicit_defaults_for_timestamp` changes the schema
;; the very same migrations produce (see [[flavor]]).
(def flavors
  "The dialects a snapshot is dumped for, one file each."
  #{:h2
    :mariadb
    :mariadb-legacy-timestamp
    :mysql
    :postgres})

(defn resource-path
  "Classpath location of the snapshot file for `version` and `flavor`, relative to `test_resources`."
  [version flavor ext]
  ;; underscores, to match how every other resource in the tree is named
  (format "app_db_snapshots/%s/%s.%s" version (str/replace (name flavor) "-" "_") ext))

(defn- snapshot-resource [version flavor]
  (io/resource (resource-path version flavor "sql")))

(defn- snapshot-meta [version]
  (let [resource (io/resource (format "app_db_snapshots/%s/meta.edn" version))]
    (when-not resource
      (throw (ex-info "No app DB snapshot metadata on the classpath" {:version version})))
    (edn/read-string (slurp resource))))

(defn through-changeset-id
  "ID of the last changeset baked into the snapshot for `version`."
  ([]
   (through-changeset-id snapshot-version))
  ([version]
   (:through-changeset-id (snapshot-meta version))))

(defn executed-at
  "The `dateexecuted` every changelog row in the snapshot for `version` carries, read from its `meta.edn`.
  By convention it is the date of the boundary changeset, so the rows read as plausible."
  ^java.time.OffsetDateTime [version]
  (java.time.OffsetDateTime/parse (:executed-at (snapshot-meta version))))

(def deployment-id
  "The `deployment_id` every changelog row in a snapshot carries, in place of the random one Liquibase gives each run.
  It fits the column's 10 characters."
  "snapshot")

(defn- legacy-timestamp-handling?
  "Whether this server gives a `TIMESTAMP NOT NULL` column an implicit `DEFAULT CURRENT_TIMESTAMP`.
  That is what `explicit_defaults_for_timestamp = 0` does."
  [^java.sql.Connection conn]
  ;; the same migrations then leave behind a different schema. MariaDB 10.6 ships the setting off; 11.x and later ship
  ;; it on, as MySQL 8 already did.
  (with-open [stmt (.createStatement conn)
              rs   (.executeQuery stmt "SELECT @@explicit_defaults_for_timestamp")]
    (and (.next rs)
         (zero? (.getInt rs 1)))))

(defn flavor
  "Which snapshot dialect `conn` needs, one of [[flavors]].
  It is `db-type`, except that a MariaDB server is `:mariadb`, or `:mariadb-legacy-timestamp` when
  [[legacy-timestamp-handling?]] holds."
  [^java.sql.Connection conn db-type]
  ;; Read from the server, because Metabase runs MariaDB as `:mysql`: the JDBC driver and MB_DB_TYPE both say MySQL,
  ;; and only the product name tells the two apart. Keyed on the timestamp setting rather than on a version number, so
  ;; a new MariaDB release lands on the right snapshot without anyone editing a table of versions.
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
   (boolean (some->> (flavor conn db-type) flavors (snapshot-resource version) some?))))

(defn statements
  "Split the contents of a snapshot `.sql` file into individual statements."
  [sql]
  (into []
        (comp (map str/trim)
              (remove str/blank?))
        (str/split sql
                   (re-pattern (str "(?m)^" (java.util.regex.Pattern/quote statement-separator) "$")))))

(defn user-tables
  "The non-system tables visible to `conn`. Empty exactly when the app DB has not been migrated yet."
  [^java.sql.Connection conn db-type]
  (let [schema (when (= db-type :h2) "PUBLIC")]
    (with-open [rs (.getTables (.getMetaData conn) nil schema "%" (into-array String ["TABLE"]))]
      (vec (jdbc/result-set-seq rs)))))

(def ^:private drop-changelog-tables
  "Statements dropping the changelog tables, unquoted and upper-case so that every DB resolves them."
  ;; Anything that opens Liquibase against a connection, [[changesets]] included, creates the changelog tables as a
  ;; side effect, before a single changeset has run. The snapshot carries its own copies, complete with the rows saying
  ;; what has already been applied, so the empty ones have to go first. H2, MySQL and MariaDB store the names
  ;; upper-case, and Postgres folds the unquoted names down to the lower-case ones it stores.
  ["DROP TABLE IF EXISTS DATABASECHANGELOG"
   "DROP TABLE IF EXISTS DATABASECHANGELOGLOCK"])

(def ^:private mysql-family
  "Flavors reached through the MySQL driver, and the only ones [[session-guards]] relaxes anything for."
  #{:mysql :mariadb :mariadb-legacy-timestamp})

(defn- session-guards
  "The statements to run before and after a snapshot load of `flavor`, as `[before after]`.
  Every flavor clears the changelog tables first.
  The MySQL family also turns off foreign key checks and strict mode for the duration, and puts both back after."
  [flavor]
  ;; Foreign keys, because mysqldump writes tables in alphabetical rather than dependency order, so a constraint can
  ;; name a table that does not exist yet. Strict mode, because mariadb-dump lists generated columns
  ;; (`metabase_field.unique_field_helper`) in its INSERT column lists, and assigning to one is an error under strict
  ;; mode rather than the warning it is otherwise. The previous sql_mode is stashed in a user variable, which outlives
  ;; the individual statements. pg_dump and H2 emit an order that loads cleanly.
  (if (mysql-family flavor)
    [(into ["SET FOREIGN_KEY_CHECKS = 0"
            "SET @mb_snapshot_sql_mode = @@SESSION.sql_mode"
            "SET SESSION sql_mode = ''"]
           drop-changelog-tables)
     ["SET FOREIGN_KEY_CHECKS = 1"
      "SET SESSION sql_mode = IFNULL(@mb_snapshot_sql_mode, @@SESSION.sql_mode)"]]
    [drop-changelog-tables []]))

(defn- load-order
  "The snapshot's statements split as `[guarded unguarded]`: those that run under [[session-guards]], and those that
  run once the guards are back off.
  Only the MySQL family defers anything, its views, and relative order is kept within each group."
  [flavor stmts]
  ;; MySQL fixes a view's column nullability when the view is created, and the sql_mode in force is part of what it
  ;; reads: with strict mode off `concat(...)` is recorded NOT NULL, where the very same statement under the session's
  ;; own mode records it nullable. Migrations run under that mode, so the relaxation has to be off again before the
  ;; dump recreates the views. A view can only read tables and views defined before it, so deferring them cannot break
  ;; a load.
  (if (mysql-family flavor)
    [(remove dump-util/creates-view? stmts) (filter dump-util/creates-view? stmts)]
    [stmts []]))

(defn load-snapshot!
  "Load the checked-in snapshot into the empty DB behind `conn`, picking the dialect from [[flavor]], and commit.
  Throws when no snapshot is checked in for that dialect, or when a statement fails, rolling back what it can."
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
         ;; The whole load goes in one transaction. A snapshot is thousands of statements, and left in autocommit each
         ;; one is a transaction of its own: on Postgres that made loading the snapshot cost more than replaying the
         ;; changelog it stands in for. Statements the MySQL family commits implicitly are unaffected either way.
         (let [autocommit? (.getAutoCommit conn)]
           (when autocommit?
             (.setAutoCommit conn false))
           (try
             (try
               ;; inside the `try`, so that a failing guard still restores the ones before it and a pooled connection
               ;; never goes back with foreign key checks or strict mode off
               (doseq [sql before]
                 (.execute stmt sql))
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

(defn changesets
  "The `[id author filename]` of every changeset in the current changelog, in the order Liquibase will run them."
  [^java.sql.Connection conn]
  (liquibase/with-liquibase [lb conn]
    (mapv (fn [^ChangeSet cs] [(.getId cs) (.getAuthor cs) (.getFilePath cs)])
          (.getChangeSets (.getDatabaseChangeLog lb)))))

(defn matches-environment?
  "Whether this JVM sets up an app DB the way the snapshot was generated, which is without an encryption key."
  []
  ;; with a key, custom migrations up to the boundary would have encrypted values the snapshot holds in plain text
  (not (encryption/default-encryption-enabled?)))

(defn usable-for-start?
  "Whether the snapshot can stand in for replaying changesets up to (but not including) `start-id`.
  It cannot when `start-id` is at or before the snapshot boundary, since those changesets still need to run, or when
  [[matches-environment?]] does not hold."
  [^java.sql.Connection conn db-type start-id]
  (and (matches-environment?)
       (loadable? conn db-type)
       (let [idx (zipmap (map first (changesets conn)) (range))]
         (when-let [through (idx (through-changeset-id))]
           (boolean (some-> (idx start-id) (> through)))))))
