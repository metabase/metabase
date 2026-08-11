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
  [[generate!]] is what produces that shape; the two live together so the write and read formats stay in step.

  Because DATABASECHANGELOG carries the MD5 checksum of every changeset it records, editing a migration at or below
  the snapshot boundary makes Liquibase reject a loaded snapshot. That is intended: those changesets have shipped.
  Regenerate the snapshot with [[generate!]] when moving the boundary to a newer checkpoint."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.java.shell :as shell]
   [clojure.string :as str]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (liquibase.changelog ChangeSet)))

(set! *warn-on-reflection* true)

(def statement-separator
  "Line that separates two statements in a snapshot `.sql` file. A SQL comment, so the file still reads as SQL."
  "--;;")

(def snapshot-version
  "Snapshot directory tests boot from."
  "v57")

(def ^:private snapshot-flavors
  "Dialects a snapshot is dumped for.

  MariaDB is not a MySQL alias: MySQL 8 dumps declare functional indexes (`KEY x ((case when ...)))`) that MariaDB
  cannot parse. It also needs two snapshots of its own, because `explicit_defaults_for_timestamp` changes the schema
  the very same migrations produce — see [[flavor]]."
  #{:h2 :postgres :mysql :mariadb :mariadb-legacy-timestamp})

(defn- resource-path [version flavor ext]
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
  (if (#{:mysql :mariadb :mariadb-legacy-timestamp} flavor)
    [(into ["SET FOREIGN_KEY_CHECKS = 0"
            "SET @mb_snapshot_sql_mode = @@SESSION.sql_mode"
            "SET SESSION sql_mode = ''"]
           drop-changelog-tables)
     ["SET FOREIGN_KEY_CHECKS = 1"
      "SET SESSION sql_mode = IFNULL(@mb_snapshot_sql_mode, @@SESSION.sql_mode)"]]
    [drop-changelog-tables []]))

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
         [before after]   (session-guards flavor)]
     (log/debugf "Loading %s app db snapshot %s (%d statements)..." flavor version (count stmts))
     (with-open [stmt (.createStatement conn)]
       (doseq [sql before]
         (.execute stmt sql))
       (try
         (doseq [sql stmts]
           (try
             (.execute stmt sql)
             (catch Throwable e
               (throw (ex-info "Error loading app DB snapshot statement"
                               {:version version, :flavor flavor, :statement sql}
                               e)))))
         (finally
           (doseq [sql after]
             (.execute stmt sql)))))
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

;;; -------------------------------------------------- generation --------------------------------------------------
;;;
;;; Dev-time only: nothing below runs during a test. Fragile dump parsing happens here, once, so that the checked-in
;;; artifact is in the trivially-splittable shape [[statements]] expects.

(defn- literals-closed?
  "Whether `text` has no unterminated string literal. Quotes escaped either way a dump tool may write them — doubled
  (`''`, Postgres) or backslashed (`\\'`, MySQL) — are removed before counting, backslash pairs first so that a
  trailing literal backslash is not mistaken for an escape."
  [text]
  (-> text
      (str/replace "\\\\" "")
      (str/replace "\\'" "")
      (str/replace "''" "")
      (->> (re-seq #"'") count even?)))

(defn- dump-lines->statements
  "Fold the line-oriented output of a dump tool into whole statements. A statement ends on a line whose trimmed text
  ends in `;` and that closes every string literal it opened."
  [lines]
  (loop [[line & more] lines, current [], acc []]
    (cond
      (nil? line)
      (cond-> acc (seq current) (conj (str/join "\n" current)))

      ;; comments, client directives and session settings are dump-tool noise, not schema
      (and (empty? current)
           (or (str/blank? line)
               (re-matches #"^\s*(--|/\*!|\\).*" line)
               (re-matches #"(?i)^\s*SET\s+.*" line)
               (re-matches #"(?i)^\s*SELECT pg_catalog\.set_config.*" line)))
      (recur more current acc)

      :else
      (let [current (conj current line)
            text    (str/join "\n" current)]
        (if (and (literals-closed? text) (str/ends-with? (str/trimr line) ";"))
          (recur more [] (conj acc (str/replace text #";\s*$" "")))
          (recur more current acc))))))

(defn- sh! [& args]
  (let [{:keys [exit out err]} (apply shell/sh args)]
    (when-not (zero? exit)
      (throw (ex-info "Dump command failed" {:command args, :exit exit, :err err})))
    out))

(defmulti ^:private dump-statements
  "Return the statements needed to recreate the DB described by `details` (as returned
  by [[tx/dbdef->connection-details]]), including its DATABASECHANGELOG rows."
  {:arglists '([flavor details conn])}
  (fn [flavor _details _conn] flavor))

(defmethod dump-statements :h2
  [_flavor _details conn]
  ;; H2's SCRIPT command already returns one statement per row, so no parsing is needed. `MEMORY`/`CACHED` is dropped
  ;; so the loading DB picks its own default (in-memory DBs get MEMORY, file-backed ones CACHED); `SET`, `CREATE USER`
  ;; and the version banner describe the DB the dump came from, not the schema.
  (into []
        (comp (map :script)
              (map str/trim)
              (remove str/blank?)
              (remove #(re-matches #"(?is)^(CREATE USER|SET|--).*" %))
              (map #(str/replace % #"(?i)^CREATE (MEMORY|CACHED) TABLE " "CREATE TABLE "))
              (map #(str/replace % #";\s*$" "")))
        (jdbc/query {:connection conn} ["SCRIPT"])))

(defmethod dump-statements :postgres
  [_flavor {:keys [host port db user]} _conn]
  (dump-lines->statements
   (str/split-lines
    (sh! "pg_dump" "--no-owner" "--no-privileges" "--no-comments" "--inserts"
         "--host" (str host) "--port" (str port) "--username" (str user) (str db)))))

(defn- drop-version-gated-blocks
  "Remove mysqldump's `/*!NNNNN ... */;` blocks. They carry session character-set juggling, a placeholder
  `CREATE TABLE` standing in for each view, and the real view DDL — the last split across three blocks and stamped
  with a `DEFINER` naming the account that produced the dump. [[mysql-view-statements]] rebuilds the views instead."
  [lines]
  (loop [[line & more] lines, in-block? false, acc []]
    (cond
      (nil? line)              acc
      in-block?                (recur more (not (str/ends-with? (str/trimr line) "*/;")) acc)
      (str/starts-with? (str/triml line) "/*!")
      (recur more (not (str/ends-with? (str/trimr line) "*/;")) acc)
      :else                    (recur more false (conj acc line)))))

(defn- mysql-view-statements
  "`CREATE OR REPLACE VIEW` for every view in `db`, read back from `information_schema`.

  MySQL stores view definitions with every table qualified by the schema they were created in, so the name of the
  throwaway DB used for generation is stripped out — otherwise the snapshot would only load into a DB of that name."
  [^java.sql.Connection conn db]
  (let [qualifier (str "`" db "`.")]
    (for [{:keys [table_name view_definition]}
          (jdbc/query {:connection conn}
                      ["SELECT table_name, view_definition FROM information_schema.views WHERE table_schema = ?
                        ORDER BY table_name" db])]
      (format "CREATE OR REPLACE VIEW `%s` AS %s"
              table_name
              (str/replace view_definition qualifier "")))))

(defn- mysqldump-command
  "Binary used to dump MySQL-family DBs, overridable via `MB_SNAPSHOT_MYSQLDUMP`.

  Needed because the two servers want different clients: MySQL 9's `mysqldump` dropped `mysql_native_password` and so
  cannot authenticate against older MariaDB servers, while MariaDB's `mariadb-dump` is not always on PATH next to it."
  []
  (or (System/getenv "MB_SNAPSHOT_MYSQLDUMP") "mysqldump"))

(defn- mysqldump-statements!
  "Dump a MySQL-family DB. `--protocol=TCP` because the MySQL client silently ignores `--port` and uses a unix socket
  when the host is `localhost`, which is not necessarily the server the migration just ran against.
  `--set-gtid-purged` is MySQL-only, so it is passed only when dumping MySQL."
  [flavor {:keys [host port db user]} conn]
  (into (dump-lines->statements
         (drop-version-gated-blocks
          (str/split-lines
           (apply sh! (concat [(mysqldump-command) "--compact" "--skip-extended-insert" "--skip-add-locks"
                               "--skip-disable-keys" "--skip-set-charset" "--complete-insert" "--no-tablespaces"
                               "--protocol=TCP"]
                              (when (= flavor :mysql) ["--set-gtid-purged=OFF"])
                              [(str "--host=" host) (str "--port=" port) (str "--user=" user) (str db)])))))
        ;; views last: they read from the tables above, and none of them reads from another view
        (mysql-view-statements conn db)))

(defmethod dump-statements :mysql
  [flavor details conn]
  (mysqldump-statements! flavor details conn))

(defmethod dump-statements :mariadb
  [flavor details conn]
  (mysqldump-statements! flavor details conn))

(defmethod dump-statements :mariadb-legacy-timestamp
  [flavor details conn]
  (mysqldump-statements! flavor details conn))

(defn- custom-migration-bindings
  "Same bindings [[metabase.app-db.schema-migrations-test.impl/do-with-temp-empty-app-db]] installs: custom migrations
  read the app DB through the dynamic var, and must not hand work to Quartz against a DB that is about to vanish."
  [db-type data-source]
  {(requiring-resolve 'metabase.app-db.connection/*application-db*)
   ((requiring-resolve 'metabase.app-db.connection/application-db) db-type data-source)

   (requiring-resolve 'metabase.app-db.custom-migrations.util/*allow-temp-scheduling*)
   false})

(defn- write-snapshot! [version flavor statements]
  (let [file (io/file "test_resources" (resource-path version flavor "sql"))]
    (io/make-parents file)
    (spit file (str "-- Generated by metabase.app-db.snapshot-test-util/generate!. Do not edit by hand.\n"
                    (format "-- Empty %s application DB migrated through %s.\n" (name flavor)
                            (through-changeset-id version))
                    statement-separator "\n"
                    (str/join (str ";\n" statement-separator "\n") statements)
                    ";\n"))
    file))

(defn generate!
  "Regenerate the checked-in snapshot for `db-type`: create a temporary empty app DB, migrate it through
  [[through-changeset-id]], and dump the result. Needs `pg_dump` on PATH for `:postgres` and `mysqldump` for
  `:mysql`, plus the usual `MB_<DB>_TEST_*` env vars pointing at a server it may create databases on.

  Which file gets written follows [[flavor]], so regenerating the MariaDB snapshot means running this with `:mysql`
  while `MB_MYSQL_TEST_*` points at a MariaDB server.

  Deliberately creates its own DB rather than using [[metabase.app-db.schema-migrations-test.impl]]'s harness,
  because the dump tools need the raw connection details that harness hides."
  ([db-type]
   (generate! db-type snapshot-version))
  ([db-type version]
   (let [run-range!    (requiring-resolve 'metabase.app-db.schema-migrations-test.impl/run-migrations-in-range!)
         create-db!    (requiring-resolve 'metabase.test.data.interface/create-db!)
         destroy-db!   (requiring-resolve 'metabase.test.data.interface/destroy-db!)
         dbdef->conn   (requiring-resolve 'metabase.test.data.interface/dbdef->connection-details)
         details->spec (requiring-resolve 'metabase.driver.sql-jdbc.connection/connection-details->spec)
         ->data-source (requiring-resolve 'metabase.app-db.test-util/->ClojureJDBCSpecDataSource)
         h2?           (= db-type :h2)
         through       (through-changeset-id version)
         dbdef         {:database-name (format "app_db_snapshot_%05d" (rand-int 100000))
                        :table-definitions []}
         details       (delay (dbdef->conn db-type :db dbdef))]
     (try
       (when-not h2?
         (create-db! db-type dbdef))
       (let [data-source (->data-source
                          (if h2?
                            {:subprotocol "h2", :classname "org.h2.Driver"
                             :subname (format "mem:%s;DB_CLOSE_DELAY=-1" (:database-name dbdef))}
                            (details->spec db-type @details)))]
         (with-open [conn (.getConnection ^javax.sql.DataSource data-source)]
           ;; the server decides which dialect this is, not `db-type`: MariaDB is reached as `:mysql`
           (let [flavor (flavor conn db-type)]
             (log/info (u/format-color 'blue "Migrating empty %s app db through %s..." flavor through))
             (with-bindings* (custom-migration-bindings db-type data-source)
               (fn []
                 (run-range! conn ["v00.00-000" through])))
             (let [file (write-snapshot! version flavor
                                         (dump-statements flavor (when-not h2? @details) conn))]
               (log/info (u/format-color 'green "Wrote %s" (str file)))
               file))))
       (finally
         (when-not h2?
           (destroy-db! db-type dbdef)))))))
