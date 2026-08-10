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

(def ^:private snapshot-db-types
  #{:h2 :postgres :mysql})

(defn- resource-path [version db-type ext]
  (format "app_db_snapshots/%s/%s.%s" version (name db-type) ext))

(defn- snapshot-resource [version db-type]
  (io/resource (resource-path version db-type "sql")))

(defn through-changeset-id
  "ID of the last changeset baked into the snapshot for `version`."
  ([]
   (through-changeset-id snapshot-version))
  ([version]
   (let [resource (io/resource (format "app_db_snapshots/%s/meta.edn" version))]
     (when-not resource
       (throw (ex-info "No app DB snapshot metadata on the classpath" {:version version})))
     (:through-changeset-id (edn/read-string (slurp resource))))))

(defn available?
  "Whether a snapshot for `db-type` is checked in."
  ([db-type]
   (available? snapshot-version db-type))
  ([version db-type]
   (boolean (some->> db-type snapshot-db-types (snapshot-resource version) some?))))

(defn- mariadb?
  "MariaDB identifies itself as MySQL through `MB_DB_TYPE` and the JDBC driver alike; the product name is what
  actually distinguishes it."
  [^java.sql.Connection conn]
  (= "MariaDB" (.getDatabaseProductName (.getMetaData conn))))

(defn loadable?
  "Whether the checked-in snapshot can actually be loaded over `conn`.

  MariaDB is excluded even though Metabase runs it as `db-type` `:mysql`: mysqldump writes MySQL 8 functional index
  definitions (`KEY x ((case when ...)))`) that MariaDB cannot parse. It replays the changelog from scratch instead."
  [^java.sql.Connection conn db-type]
  (and (available? db-type)
       (not (mariadb? conn))))

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

  Unquoted and upper-case so that all three DBs resolve it: H2 and MySQL store the name upper-case, and Postgres
  folds the unquoted name down to the lower-case name it stores."
  ["DROP TABLE IF EXISTS DATABASECHANGELOG"
   "DROP TABLE IF EXISTS DATABASECHANGELOGLOCK"])

(defn- session-guards
  "`[before after]` statements to run around a snapshot load.

  mysqldump writes tables in alphabetical rather than dependency order, so a foreign key can name a table that does
  not exist yet; the checks have to be off until the whole schema is in place. pg_dump and H2 both emit in an order
  that loads cleanly, so they need nothing extra."
  [db-type]
  (if (= db-type :mysql)
    [(into ["SET FOREIGN_KEY_CHECKS = 0"] drop-changelog-tables) ["SET FOREIGN_KEY_CHECKS = 1"]]
    [drop-changelog-tables []]))

(defn load-snapshot!
  "Load the checked-in snapshot for `db-type` into the empty DB behind `conn`."
  ([^java.sql.Connection conn db-type]
   (load-snapshot! conn db-type snapshot-version))
  ([^java.sql.Connection conn db-type version]
   (let [resource         (or (snapshot-resource version db-type)
                              (throw (ex-info "No app DB snapshot for this DB type"
                                              {:version version, :db-type db-type})))
         stmts            (statements (slurp resource))
         [before after]   (session-guards db-type)]
     (log/debugf "Loading %s app db snapshot %s (%d statements)..." db-type version (count stmts))
     (with-open [stmt (.createStatement conn)]
       (doseq [sql before]
         (.execute stmt sql))
       (try
         (doseq [sql stmts]
           (try
             (.execute stmt sql)
             (catch Throwable e
               (throw (ex-info "Error loading app DB snapshot statement"
                               {:version version, :db-type db-type, :statement sql}
                               e)))))
         (finally
           (doseq [sql after]
             (.execute stmt sql)))))
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
  {:arglists '([db-type details conn])}
  (fn [db-type _details _conn] db-type))

(defmethod dump-statements :h2
  [_db-type _details conn]
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
  [_db-type {:keys [host port db user]} _conn]
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

(defmethod dump-statements :mysql
  [_db-type {:keys [host port db user]} conn]
  (into (dump-lines->statements
         (drop-version-gated-blocks
          (str/split-lines
           ;; `--protocol=TCP` because the MySQL client silently ignores `--port` and uses a unix socket when the host
           ;; is `localhost`, which is not necessarily the server the migration just ran against.
           (sh! "mysqldump" "--compact" "--skip-extended-insert" "--skip-add-locks" "--skip-disable-keys"
                "--skip-set-charset" "--complete-insert" "--no-tablespaces" "--set-gtid-purged=OFF" "--protocol=TCP"
                (str "--host=" host) (str "--port=" port) (str "--user=" user) (str db)))))
        ;; views last: they read from the tables above, and none of them reads from another view
        (mysql-view-statements conn db)))

(defn- custom-migration-bindings
  "Same bindings [[metabase.app-db.schema-migrations-test.impl/do-with-temp-empty-app-db]] installs: custom migrations
  read the app DB through the dynamic var, and must not hand work to Quartz against a DB that is about to vanish."
  [db-type data-source]
  {(requiring-resolve 'metabase.app-db.connection/*application-db*)
   ((requiring-resolve 'metabase.app-db.connection/application-db) db-type data-source)

   (requiring-resolve 'metabase.app-db.custom-migrations.util/*allow-temp-scheduling*)
   false})

(defn- write-snapshot! [version db-type statements]
  (let [file (io/file "test_resources" (resource-path version db-type "sql"))]
    (io/make-parents file)
    (spit file (str "-- Generated by metabase.app-db.snapshot-test-util/generate!. Do not edit by hand.\n"
                    (format "-- Empty %s application DB migrated through %s.\n" (name db-type)
                            (through-changeset-id version))
                    statement-separator "\n"
                    (str/join (str ";\n" statement-separator "\n") statements)
                    ";\n"))
    file))

(defn generate!
  "Regenerate the checked-in snapshot for `db-type`: create a temporary empty app DB, migrate it through
  [[through-changeset-id]], and dump the result. Needs `pg_dump` on PATH for `:postgres` and `mysqldump` for
  `:mysql`, plus the usual `MB_<DB>_TEST_*` env vars pointing at a server it may create databases on.

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
           (log/info (u/format-color 'blue "Migrating empty %s app db through %s..." db-type through))
           (with-bindings* (custom-migration-bindings db-type data-source)
             (fn []
               (run-range! conn ["v00.00-000" through])))
           (let [file (write-snapshot! version db-type
                                       (dump-statements db-type (when-not h2? @details) conn))]
             (log/info (u/format-color 'green "Wrote %s" (str file)))
             file)))
       (finally
         (when-not h2?
           (destroy-db! db-type dbdef)))))))
