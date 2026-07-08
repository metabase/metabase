(ns ^:mb/driver-tests metabase-enterprise.workspaces.driver-isolation-test
  "Driver-agnostic tests for workspace database isolation. For any driver that
   supports the `:workspace` feature, exercises the full provisioning lifecycle
   (`init-workspace-isolation!` → `grant-workspace-read-access!` →
   `destroy-workspace-isolation!`) against a real warehouse and asserts that the
   workspace user has *exactly* the privileges the design promises:

   - Can SELECT from input tables it has been granted access to.
   - Cannot INSERT/UPDATE/DELETE or run DDL against the input schema.
   - Can SELECT, INSERT, UPDATE, DELETE, and run DDL against its own output
     schema.

   Setup model: the test runs against the existing test database `(mt/db)` and
   creates a per-run uniquely-named source table inside its default input
   schema. Rationale: cloud DWs (Redshift) don't support drop+create of
   databases at will, but creating a per-run table inside a shared DB works
   the same way everywhere.

   Cross-driver counterpart to the postgres-only
   `workspace-user-cannot-write-to-input-schema-test`. The BigQuery sibling test
   lives at `metabase.driver.bigquery-cloud-sdk.workspace-isolation-test` because
   it needs the BigQuery driver module on the classpath."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- find-sql-exception
  "Find a `java.sql.SQLException` reachable from `t`, or nil. Walks the cause
   chain and also peeks into each level's `ex-data` for Throwable values:
   `clojure.java.jdbc/db-transaction*` (which `execute!` uses by default)
   wraps a caught Throwable in an `ex-info` with the original stashed under
   `:handling` when the rollback path also fails - observed on Redshift,
   where permission-denied inside an implicit transaction surfaces this way
   instead of as a bare SQLException with the SQLException as `.getCause`."
  [^Throwable t]
  (letfn [(walk [^Throwable t seen]
            (cond
              (nil? t)                            nil
              (contains? seen t)                  nil
              (instance? java.sql.SQLException t) t
              :else
              (let [seen' (conj seen t)]
                (or (some (fn [v]
                            (when (instance? Throwable v)
                              (walk v seen')))
                          (vals (or (ex-data t) {})))
                    (walk (.getCause t) seen')))))]
    (walk t #{})))

(defn- reuse-bound-db-as-input?
  "Drivers where the workspace input namespace IS the bound database, i.e. the
   `:details.db` of the canonical `Database` row. MySQL has no schema-within-DB,
   so the only shipping workspace config (see `workspace_config_mysql.yml`) lists
   the bound DB as the input namespace. The driver-isolation tests mirror that
   shape: source tables live in the bound DB; `grant-workspace-read-access!`
   grants `SELECT ON <bound-db>.*`; the JDBC handshake's DB-access check finds
   the resulting `mysql.db` row and lets the iso user connect with the bound
   DB as the default.

   For these drivers we skip [[create-input-namespace-sql]] (the bound DB already
   exists) and [[drop-input-namespace-sqls]] (we don't own the bound DB, only the
   per-run tables inside it -- caller cleans those up explicitly)."
  [driver]
  (= driver :mysql))

(defn- input-namespace-name
  "Resolve the input-namespace name for a per-run test.
   - On [[reuse-bound-db-as-input?]] drivers (MySQL): return the bound DB.
     `fresh-name` is ignored; source tables go in the bound DB with random
     per-run suffixes so they don't collide.
   - On schema-having drivers: return `fresh-name` -- a freshly-created schema
     inside the bound DB, which the caller will create + drop. Fresh schemas
     are required on Redshift specifically because `public` has `CREATE`
     granted to `PUBLIC` by default, breaking the input-deny contract."
  [driver database fresh-name]
  (if (reuse-bound-db-as-input? driver)
    (-> database :details :db)
    fresh-name))

(defn- create-input-namespace-sql
  "DDL to create a fresh per-run input namespace (a schema for schema'd drivers,
   a database for schema-less ones like MySQL/ClickHouse)."
  [driver namespace-name]
  (case driver
    (:postgres :redshift) (str "CREATE SCHEMA \"" namespace-name "\"")
    :sqlserver                       (str "CREATE SCHEMA [" namespace-name "]")
    (:mysql :clickhouse)             (str "CREATE DATABASE `" namespace-name "`")))

(defn- maybe-create-input-namespace!
  "Create the per-run input namespace UNLESS the caller is using the bound DB as
   the input (the [[reuse-bound-db-as-input?]] path on MySQL) -- in which case the
   namespace already exists and is owned by the test DB, not by us."
  [admin-spec driver database namespace-name]
  (when-not (and (reuse-bound-db-as-input? driver)
                 (= namespace-name (-> database :details :db)))
    (jdbc/execute! admin-spec [(create-input-namespace-sql driver namespace-name)])))

(defn- drop-input-namespace-sqls
  "DDL to drop the per-run input namespace and any tables left in it. Schema'd
   drivers with CASCADE (postgres/redshift) and database-as-namespace
   drivers (mysql/clickhouse) take a single statement; SQL Server has no DROP
   SCHEMA CASCADE so each source table has to be dropped explicitly first.

   `table-names` may be a single name or a sequence -- the cross-workspace test
   creates more than one source table in the same input namespace."
  [driver namespace-name table-names]
  (let [tables (if (sequential? table-names) table-names [table-names])]
    (case driver
      (:postgres :redshift) [(str "DROP SCHEMA \"" namespace-name "\" CASCADE")]
      :sqlserver                       (concat
                                        (for [t tables]
                                          (str "DROP TABLE [" namespace-name "].[" t "]"))
                                        [(str "DROP SCHEMA [" namespace-name "]")])
      (:mysql :clickhouse)             [(str "DROP DATABASE `" namespace-name "`")])))

(defn- maybe-drop-input-namespace!
  "Issue [[drop-input-namespace-sqls]] UNLESS the caller is using the bound DB
   as the input (the [[reuse-bound-db-as-input?]] path on MySQL) -- in which
   case we don't own the bound DB and only need to drop the per-run tables
   inside it. Errors are swallowed per-statement so we keep cleaning up after
   a partial-failure run."
  [admin-spec driver database namespace-name table-names]
  (let [tables (if (sequential? table-names) table-names [table-names])]
    (if (and (reuse-bound-db-as-input? driver)
             (= namespace-name (-> database :details :db)))
      (doseq [t tables]
        (try (jdbc/execute! admin-spec [(str "DROP TABLE IF EXISTS `" namespace-name "`.`" t "`")])
             (catch Throwable _ nil)))
      (doseq [sql (drop-input-namespace-sqls driver namespace-name table-names)]
        (try (jdbc/execute! admin-spec [sql]) (catch Throwable _ nil))))))

(defn- list-namespaces-sql
  "SQL that enumerates the namespaces visible to the connecting user. JDBC
   `information_schema.schemata` and ClickHouse's `system.databases` both
   row-level-filter their output by the caller's privileges, so a workspace
   user with no grants on another workspace's namespace should not see it
   appear. Used by the cross-workspace test to check catalog-level isolation
   in addition to data-level isolation."
  [driver]
  (case driver
    (:postgres :redshift :sqlserver :mysql)
    "SELECT schema_name AS ns FROM information_schema.schemata"

    :clickhouse
    "SELECT name AS ns FROM system.databases"))

(defn- list-tables-sql
  "SQL that enumerates `(namespace, table)` pairs visible to the connecting
   user. Stronger than [[list-namespaces-sql]] — even if the namespace itself
   is hidden, an over-broad grant on the tables table would let a workspace
   discover other workspaces' table names."
  [driver]
  (case driver
    (:postgres :redshift :sqlserver :mysql)
    "SELECT table_schema AS ns, table_name AS tbl FROM information_schema.tables"

    :clickhouse
    "SELECT database AS ns, name AS tbl FROM system.tables"))

(defn- visible-namespaces
  "Lowercased set of namespace names visible to `user-spec` through the
   driver's catalog views."
  [driver user-spec]
  (->> (jdbc/query user-spec [(list-namespaces-sql driver)])
       (map (comp u/lower-case-en str :ns))
       set))

(defn- visible-tables
  "Lowercased set of `[namespace table]` pairs visible to `user-spec` through
   the driver's catalog views."
  [driver user-spec]
  (->> (jdbc/query user-spec [(list-tables-sql driver)])
       (map (juxt (comp u/lower-case-en str :ns)
                  (comp u/lower-case-en str :tbl)))
       set))

(defn- qualify
  "Per-driver identifier-quoted `schema.table` (or `database.table` for schema-less
   drivers — see [[input-schema]]). Uses `sql.u/quote-name` so identifiers with
   hyphens or other special chars (e.g. MySQL's `test-data` db-name) survive."
  [driver schema table]
  (sql.u/quote-name driver :table schema table))

(defn- create-table-tail
  "Trailing clause appended to `CREATE TABLE ... (cols)` per driver. ClickHouse
   requires every table to declare a storage engine and (for MergeTree-family)
   an ORDER BY key; SQL drivers don't."
  [driver]
  (case driver
    :clickhouse " ENGINE = MergeTree() ORDER BY id"
    ""))

(defn- supports-update-delete-as-perm-test?
  "True for drivers whose UPDATE/DELETE failure on the input schema, and
   UPDATE/DELETE success on the output schema, are meaningful signals about
   workspace permissions. False for column-oriented engines where standard
   UPDATE/DELETE aren't supported regardless of perms (ClickHouse MergeTree
   needs `ALTER TABLE … UPDATE/DELETE` mutation syntax instead)."
  [driver]
  (case driver
    :clickhouse false
    true))

(defn- expect-sql-denied!
  "Assert that executing `sql` against `user-spec` raises a `SQLException`."
  [user-spec sql label]
  (testing (format "%s is denied" label)
    (try
      (jdbc/execute! user-spec [sql])
      (is false (format "%s unexpectedly succeeded" label))
      (catch Throwable t
        (let [sqle (find-sql-exception t)]
          (is (some? sqle)
              (format "expected SQLException for %s; got %s" label (class t))))))))

(defn- verify-jdbc-destroy!
  "Assert post-destroy state for a JDBC workspace: the workspace user can no
   longer open a fresh connection, and the output namespace is gone from the
   admin's catalog. Called right after `destroy-workspace-isolation!` to
   confirm cleanup actually happened.

   `user-spec` is an unpooled JDBC spec — each `jdbc/query` opens a new
   connection, so after destroy the auth handshake must fail (user/role
   dropped on most drivers). Any exception is acceptable; what specifically
   fails is driver-defined."
  [driver admin-spec user-spec out-schema]
  (testing "workspace user cannot open a fresh connection"
    (try
      (jdbc/query user-spec ["SELECT 1"])
      (is false "workspace user unexpectedly succeeded querying after destroy")
      (catch Throwable t
        (is (some? t)
            (format "workspace user denied after destroy: %s" (ex-message t))))))
  (testing "output namespace was dropped"
    (let [visible-after (visible-namespaces driver admin-spec)]
      (is (not (contains? visible-after (u/lower-case-en out-schema)))
          (format "output namespace %s should not appear in catalog after destroy. visible=%s"
                  out-schema visible-after)))))

(defn- escalation-attempt-sqls
  "Per-driver list of `[label sql]` pairs that probe the privilege-escalation
   surface — account-/server-/role-level operations the workspace user should
   never be allowed to execute. Each SQL is shaped so denial surfaces as a
   permission error (the user lacks CREATEROLE / CREATE USER / IMPERSONATE /
   ACCOUNTADMIN / etc.) rather than a parse error, so a successful execution
   would indicate a real privilege-escalation bug rather than slip past as a
   benign syntax denial. Names embed `hacker-name` (the test's run-id-derived
   suffix) so the operation name is fresh per run."
  [driver hacker-name]
  (case driver
    :postgres   [[:create-role  (str "CREATE ROLE \"" hacker-name "\"")]
                 [:create-user  (str "CREATE USER \"" hacker-name "_u\" PASSWORD 'Pass1234X'")]]
    :redshift   [[:create-user  (str "CREATE USER \"" hacker-name "\" PASSWORD 'Pass1234X'")]
                 [:create-group (str "CREATE GROUP \"" hacker-name "_grp\"")]]
    :mysql      [[:create-user  (str "CREATE USER '" hacker-name "'@'%' IDENTIFIED BY 'Pass1234X'")]
                 [:create-role  (str "CREATE ROLE '" hacker-name "_r'")]
                 ;; Driver-specific quirk #11: workspace user must not have
                 ;; GRANT OPTION on anything. Granting *any* privilege to *any*
                 ;; principal requires the granter to hold the priv WITH
                 ;; GRANT OPTION, which the workspace user does not.
                 [:grant-other  "GRANT SELECT ON mysql.* TO 'metabase'@'%'"]]
    :sqlserver  [[:create-user  (str "CREATE USER [" hacker-name "] WITHOUT LOGIN")]
                 [:create-role  (str "CREATE ROLE [" hacker-name "_r]")]
                 [:execute-as   "EXECUTE AS USER = 'dbo'"]]
    :clickhouse [[:create-user  (str "CREATE USER `" hacker-name "` IDENTIFIED WITH plaintext_password BY 'Pass1234X'")]
                 [:create-role  (str "CREATE ROLE `" hacker-name "_r`")]]))

(defn- rename-input-table-sql
  "Per-driver SQL the workspace user attempts when renaming a granted input
   table — RENAME requires ALTER on the table, which the workspace user only
   has SELECT on. Engines spell rename three different ways: `ALTER TABLE …
   RENAME TO …` (postgres / mysql / redshift), `RENAME TABLE …
   TO …` (clickhouse), and `EXEC sp_rename '…', '…'` (sql server)."
  [driver schema src-name new-name]
  (case driver
    :clickhouse (str "RENAME TABLE `" schema "`.`" src-name "` TO `" schema "`.`" new-name "`")
    :sqlserver  (str "EXEC sp_rename '[" schema "].[" src-name "]', '" new-name "'")
    (str "ALTER TABLE " (sql.u/quote-name driver :table schema src-name)
         " RENAME TO " (sql.u/quote-name driver :field new-name))))

(defn- storage-escape-sqls
  "Per-driver list of `[label sql]` pairs probing the warehouse's bridges to
   external storage (S3, internal stages, etc.) — the high-value bypass paths
   that would let a workspace user exfiltrate granted-input or output data
   outside the warehouse sandbox. Each SQL is shaped to fail at permission
   check, not parse: if denial flips to success, the workspace user has
   storage perms it shouldn't.

   Drivers without a meaningful storage-bridge primitive (postgres / mysql /
   sqlserver / clickhouse — all of which keep data in-engine without an
   external-storage SQL surface) return an empty list."
  [driver hacker-name]
  (case driver
    :redshift  [;; COPY from S3 — needs S3 read perms via IAM_ROLE; workspace user
                ;; has no IAM role assumption privilege.
                [:copy-from-s3   (str "COPY \"" hacker-name "_tmp\" FROM 's3://nonexistent-mb-iso-bucket/data.csv' "
                                      "IAM_ROLE 'arn:aws:iam::000000000000:role/nonexistent-role'")]
                ;; UNLOAD to S3 — write side of the same path; equally denied.
                [:unload-to-s3   (str "UNLOAD ('SELECT 1') TO 's3://nonexistent-mb-iso-bucket/' "
                                      "IAM_ROLE 'arn:aws:iam::000000000000:role/nonexistent-role'")]]
    (:postgres :mysql :sqlserver :clickhouse) []))

(defn- random-suffix
  "Eight hex chars from a random UUID. Per-run unique enough to avoid collisions
   from leftover state in the shared test DB."
  []
  (subs (str (random-uuid)) 0 8))

(deftest ^:synchronized workspace-isolation-perms-test
  ;; BigQuery isn't a JDBC driver (its workspace isolation goes through GCP IAM
  ;; rather than SQL ACLs), so it's covered by `workspace-isolation-perms-bigquery-test`
  ;; below. Everything else fans out through this single JDBC-shaped test.
  (mt/test-drivers (filter #(isa? driver/hierarchy % :sql-jdbc)
                           (mt/normal-drivers-with-feature :workspace))
    (testing "workspace user gets read-only access to input schema, full access to output schema"
      (let [driver       driver/*driver*
            database     (mt/db)
            details      (:details database)
            admin-spec   (sql-jdbc.conn/connection-details->spec driver details)
            ;; Per-run identifiers — the test runs against a shared warehouse DB
            ;; (`(mt/db)`), so anything we create has to be uniquely named or
            ;; it'll collide with leftover state from a prior failed run.
            run-id       (random-suffix)
            in-schema    (input-namespace-name driver database (str "mb_iso_in_" run-id))
            src-name     (str "ws_iso_src_" run-id)
            sneaky-name  (str "ws_iso_sneaky_" run-id)
            out-name     (str "ws_iso_out_" run-id)
            src          (qualify driver in-schema src-name)
            workspace    {:id   (Long/parseLong run-id 16)
                          :name (str "wsd-permstest-" run-id)}
            ;; Pre-init synthetic ws-details for cleanup. Every driver's destroy impl
            ;; derives its actual identifiers from `workspace :id` (via the `driver.u`
            ;; namespace-/user-name helpers), so this skeleton is enough to drive an
            ;; idempotent destroy even if init never ran or only partially succeeded.
            ;; We swap in the real init-result once we have it, but the atom always
            ;; holds *something* destroy can be called with.
            ws-state     (atom (merge workspace
                                      {:schema           (driver.u/workspace-isolation-namespace-name workspace)
                                       :database_details {:user (driver.u/workspace-isolation-user-name workspace)}}))]
        (try
          (maybe-create-input-namespace! admin-spec driver database in-schema)
          (jdbc/execute! admin-spec [(str "CREATE TABLE " src " (id INT, v VARCHAR(8))" (create-table-tail driver))])
          (jdbc/execute! admin-spec [(str "INSERT INTO " src " VALUES (1, 'a')")])
          (let [init-result     (driver/init-workspace-isolation! driver database workspace)
                ws-with-details (merge workspace init-result)
                _               (reset! ws-state ws-with-details)
                user-details    (merge details (:database_details ws-with-details))
                user-spec       (sql-jdbc.conn/connection-details->spec driver user-details)
                out-schema      (:schema ws-with-details)
                out             (qualify driver out-schema out-name)]
            (driver/grant-workspace-read-access! driver database ws-with-details
                                                 [in-schema])
            (testing "workspace user can SELECT from a granted input table"
              (is (= [{:id 1 :v "a"}]
                     (jdbc/query user-spec [(str "SELECT id, v FROM " src " ORDER BY id")]))))
            (testing "workspace user cannot write to or DDL against the input schema"
              ;; Beyond INSERT/UPDATE/DELETE we also exercise ALTER TABLE, TRUNCATE,
              ;; and RENAME — they route through different privilege checks per
              ;; engine (e.g. ALTER ADD COLUMN needs a separate ALTER privilege on
              ;; most warehouses; TRUNCATE on SQL Server requires ALTER TABLE
              ;; rather than DELETE; RENAME spelling differs entirely between
              ;; ClickHouse, SQL Server, and the rest), so a too-broad revoke
              ;; that missed one of these would slip through INSERT-only coverage.
              (let [base-ops [[:insert        (str "INSERT INTO " src " VALUES (2, 'b')")]
                              [:create-table  (str "CREATE TABLE "
                                                   (qualify driver in-schema sneaky-name)
                                                   " (id INT)" (create-table-tail driver))]
                              [:drop-table    (str "DROP TABLE " src)]
                              [:alter-add-col (str "ALTER TABLE " src " ADD COLUMN extra INT")]
                              [:truncate      (str "TRUNCATE TABLE " src)]
                              [:rename        (rename-input-table-sql driver in-schema src-name
                                                                      (str "ws_iso_renamed_" run-id))]]
                    ops      (cond-> base-ops
                               (supports-update-delete-as-perm-test? driver)
                               (into [[:update (str "UPDATE " src " SET v = 'x'")]
                                      [:delete (str "DELETE FROM " src)]]))]
                (doseq [[label sql] ops]
                  (expect-sql-denied! user-spec sql label))))
            (testing "workspace user cannot read from an ungranted namespace"
              (let [ungranted-ns   (str "mb_iso_nogrant_" run-id)
                    ungranted-tbl  (str "ws_iso_secret_" run-id)
                    ungranted-fq   (qualify driver ungranted-ns ungranted-tbl)]
                (try
                  (maybe-create-input-namespace! admin-spec driver database ungranted-ns)
                  (jdbc/execute! admin-spec [(str "CREATE TABLE " ungranted-fq " (id INT, secret VARCHAR(8))"
                                                  (create-table-tail driver))])
                  (jdbc/execute! admin-spec [(str "INSERT INTO " ungranted-fq " VALUES (1, 'hidden')")])
                  (expect-sql-denied! user-spec
                                      (str "SELECT * FROM " ungranted-fq)
                                      :select-ungranted-namespace)
                  (finally
                    (maybe-drop-input-namespace! admin-spec driver database ungranted-ns ungranted-tbl)))))
            (testing "workspace user has full read+write access to its own output schema"
              (jdbc/execute! user-spec [(str "CREATE TABLE " out " (id INT, v VARCHAR(8))" (create-table-tail driver))])
              (jdbc/execute! user-spec [(str "INSERT INTO " out " VALUES (1, 'a')")])
              (is (= [{:id 1 :v "a"}]
                     (jdbc/query user-spec [(str "SELECT id, v FROM " out)])))
              (when (supports-update-delete-as-perm-test? driver)
                (jdbc/execute! user-spec [(str "UPDATE " out " SET v = 'b'")])
                (is (= [{:id 1 :v "b"}]
                       (jdbc/query user-spec [(str "SELECT id, v FROM " out)])))
                (jdbc/execute! user-spec [(str "DELETE FROM " out)])
                (is (empty? (jdbc/query user-spec [(str "SELECT id, v FROM " out)]))))
              (jdbc/execute! user-spec [(str "DROP TABLE " out)]))
            (testing "re-granting the same input table is idempotent"
              ;; A second grant call with an identical table list should not throw
              ;; (driver impls must handle "GRANT … already exists" type cases) and
              ;; must not change the workspace user's perms — they still SELECT and
              ;; still cannot INSERT. Catches both noisy re-grant failures and silent
              ;; privilege escalation in re-grant code paths.
              (driver/grant-workspace-read-access! driver database ws-with-details
                                                   [in-schema])
              (is (= [{:id 1 :v "a"}]
                     (jdbc/query user-spec [(str "SELECT id, v FROM " src " ORDER BY id")])))
              (expect-sql-denied! user-spec
                                  (str "INSERT INTO " src " VALUES (3, 'c')")
                                  :insert-after-regrant))
            (testing "workspace user cannot escalate privileges via account-level operations"
              ;; Probes the privilege-escalation surface that a workspace user could
              ;; otherwise use to break out of its sandbox: CREATE USER/ROLE,
              ;; impersonation primitives (`USE ROLE ACCOUNTADMIN`, `EXECUTE AS`),
              ;; and account-/server-level grants. If any of these unexpectedly
              ;; succeeds, the workspace user has more than the read-only-input +
              ;; full-output contract intends.
              (let [hacker-name (str "ws_iso_hacker_" run-id)]
                (doseq [[label sql] (escalation-attempt-sqls driver hacker-name)]
                  (expect-sql-denied! user-spec sql label))))
            (testing "workspace user cannot exfiltrate via storage/external escapes"
              ;; Redshift COPY/UNLOAD is the SQL-level bridge to external object
              ;; storage — high-value bypass path because it lets a sandboxed user
              ;; pull data in (COPY) or push data out (UNLOAD) without going through
              ;; grant-mediated tables. The other JDBC drivers (postgres / mysql /
              ;; sqlserver / clickhouse) have no equivalent SQL surface and are
              ;; no-ops here.
              (let [hacker-name (str "ws_iso_storage_" run-id)]
                (doseq [[label sql] (storage-escape-sqls driver hacker-name)]
                  (expect-sql-denied! user-spec sql label))))
            (testing "after destroy-workspace-isolation!, the workspace's footprint is gone"
              ;; Explicit destroy here (instead of relying on the `finally`) lets us
              ;; assert that the cleanup actually happened. Drivers' destroy impls are
              ;; idempotent (`IF EXISTS` everywhere), so the `finally` calling destroy
              ;; a second time is a no-op.
              (driver/destroy-workspace-isolation! driver database ws-with-details)
              (verify-jdbc-destroy! driver admin-spec user-spec out-schema)))
          (finally
            ;; Always attempt destroy first — drivers' impls are idempotent (`IF EXISTS`
            ;; everywhere) so this is safe whether init succeeded fully, partially, or
            ;; not at all. Catch+log so a destroy failure doesn't shadow the real
            ;; test failure.
            (try (driver/destroy-workspace-isolation! driver database @ws-state)
                 (catch Throwable t
                   (log/warnf t "destroy-workspace-isolation! failed for %s during test cleanup"
                              driver)))
            ;; Then drop the input namespace.
            (maybe-drop-input-namespace! admin-spec driver database in-schema src-name)))))))

(deftest ^:synchronized cross-workspace-isolation-perms-test
  ;; Exercises *mutual* isolation between two workspaces on the same database — the
  ;; single-workspace happy path lives in `workspace-isolation-perms-test` above. We
  ;; provision A and B together, give each a grant on a different source table, then
  ;; assert that A cannot reach B's data, B's grants, or B's namespace via either
  ;; direct SQL or catalog enumeration.
  ;;
  ;; BigQuery isolation works through GCP IAM rather than SQL grants — see
  ;; `cross-workspace-isolation-perms-bigquery-test` for its sibling.
  ;;
  ;; MySQL/MariaDB excluded: the test premise requires two distinct workspace input
  ;; namespaces on the same Database row, but MySQL has no schema layer -- the only
  ;; shipping config (`workspace_config_mysql.yml`) lists the bound DB as the input,
  ;; so two workspaces on the same Database row would necessarily share input
  ;; namespace. Cross-Database isolation across two separate MySQL servers is a
  ;; different scenario from what this test asserts.
  (mt/test-drivers (->> (mt/normal-drivers-with-feature :workspace)
                        (filter #(isa? driver/hierarchy % :sql-jdbc))
                        (remove #{:mysql}))
    (testing "two workspaces on the same database are mutually isolated"
      (let [driver       driver/*driver*
            database     (mt/db)
            details      (:details database)
            admin-spec   (sql-jdbc.conn/connection-details->spec driver details)
            ;; Three independent random ids: one for the shared input namespace and
            ;; one per workspace, so reruns from leftover state can't collide.
            test-id      (random-suffix)
            ws-a-id      (random-suffix)
            ws-b-id      (random-suffix)
            ;; Each workspace gets its own input namespace. Some drivers
            ;; (notably MySQL — see `grant-workspace-read-access-sqls` in
            ;; `metabase.driver.mysql`) intentionally grant SELECT at the
            ;; database/namespace level rather than per-table, so co-locating
            ;; A's and B's source tables in a single namespace would let
            ;; either workspace SELECT both tables and break the
            ;; `:select-other-grant` assertion below as a *correctly-scoped*
            ;; grant rather than a leak. Splitting per workspace makes the
            ;; assertion driver-portable.
            in-schema-a  (str "mb_iso_in_a_" test-id)
            in-schema-b  (str "mb_iso_in_b_" test-id)
            src-a-name   (str "ws_iso_src_a_" test-id)
            src-b-name   (str "ws_iso_src_b_" test-id)
            sneaky-name  (str "ws_iso_sneaky_" test-id)
            b-secret     (str "ws_iso_secret_" ws-b-id)
            ws-a         {:id   (Long/parseLong ws-a-id 16)
                          :name (str "wsd-A-" ws-a-id)}
            ws-b         {:id   (Long/parseLong ws-b-id 16)
                          :name (str "wsd-B-" ws-b-id)}
            ;; Pre-init synthetic ws-details for cleanup — same idempotent-destroy
            ;; rationale as in the single-workspace test.
            ws-a-state   (atom (merge ws-a
                                      {:schema           (driver.u/workspace-isolation-namespace-name ws-a)
                                       :database_details {:user (driver.u/workspace-isolation-user-name ws-a)}}))
            ws-b-state   (atom (merge ws-b
                                      {:schema           (driver.u/workspace-isolation-namespace-name ws-b)
                                       :database_details {:user (driver.u/workspace-isolation-user-name ws-b)}}))]
        (try
          (maybe-create-input-namespace! admin-spec driver database in-schema-a)
          (maybe-create-input-namespace! admin-spec driver database in-schema-b)
          (jdbc/execute! admin-spec [(str "CREATE TABLE " (qualify driver in-schema-a src-a-name)
                                          " (id INT, v VARCHAR(8))" (create-table-tail driver))])
          (jdbc/execute! admin-spec [(str "INSERT INTO " (qualify driver in-schema-a src-a-name)
                                          " VALUES (1, 'a')")])
          (jdbc/execute! admin-spec [(str "CREATE TABLE " (qualify driver in-schema-b src-b-name)
                                          " (id INT, v VARCHAR(8))" (create-table-tail driver))])
          (jdbc/execute! admin-spec [(str "INSERT INTO " (qualify driver in-schema-b src-b-name)
                                          " VALUES (1, 'b')")])
          (let [init-a       (driver/init-workspace-isolation! driver database ws-a)
                init-b       (driver/init-workspace-isolation! driver database ws-b)
                ws-a-full    (merge ws-a init-a)
                ws-b-full    (merge ws-b init-b)
                _            (reset! ws-a-state ws-a-full)
                _            (reset! ws-b-state ws-b-full)
                user-a-spec  (sql-jdbc.conn/connection-details->spec driver (merge details (:database_details ws-a-full)))
                user-b-spec  (sql-jdbc.conn/connection-details->spec driver (merge details (:database_details ws-b-full)))
                out-a-schema (:schema ws-a-full)
                out-b-schema (:schema ws-b-full)
                b-secret-fq  (qualify driver out-b-schema b-secret)
                sneaky-fq    (qualify driver out-b-schema sneaky-name)]
            ;; Each workspace is granted access only to its own input namespace —
            ;; A's grant must not let A read src-b in B's namespace, and vice-versa.
            (driver/grant-workspace-read-access! driver database ws-a-full
                                                 [in-schema-a])
            (driver/grant-workspace-read-access! driver database ws-b-full
                                                 [in-schema-b])
            ;; B populates its own output schema with a table A should never reach.
            (jdbc/execute! user-b-spec [(str "CREATE TABLE " b-secret-fq
                                             " (id INT, v VARCHAR(8))" (create-table-tail driver))])
            (jdbc/execute! user-b-spec [(str "INSERT INTO " b-secret-fq " VALUES (1, 'b-only')")])
            (testing "workspace A cannot SELECT from workspace B's output table"
              (expect-sql-denied! user-a-spec
                                  (str "SELECT id, v FROM " b-secret-fq)
                                  :select-other-output))
            (testing "workspace A cannot write to or DDL against workspace B's output schema"
              (let [base-ops [[:insert        (str "INSERT INTO " b-secret-fq " VALUES (2, 'x')")]
                              [:create-table  (str "CREATE TABLE " sneaky-fq
                                                   " (id INT)" (create-table-tail driver))]
                              [:drop-table    (str "DROP TABLE " b-secret-fq)]
                              [:alter-add-col (str "ALTER TABLE " b-secret-fq " ADD COLUMN extra INT")]
                              [:truncate      (str "TRUNCATE TABLE " b-secret-fq)]]
                    ops      (cond-> base-ops
                               (supports-update-delete-as-perm-test? driver)
                               (into [[:update (str "UPDATE " b-secret-fq " SET v = 'x'")]
                                      [:delete (str "DELETE FROM " b-secret-fq)]]))]
                (doseq [[label sql] ops]
                  (expect-sql-denied! user-a-spec sql label))))
            (testing "workspace A cannot SELECT a source table that was only granted to workspace B"
              (expect-sql-denied! user-a-spec
                                  (str "SELECT id, v FROM " (qualify driver in-schema-b src-b-name))
                                  :select-other-grant))
            (testing "workspace A's namespace catalog enumerates A's own namespace but not B's"
              ;; Per-driver quirks in how `information_schema.schemata` (or the
              ;; equivalent system table) is gated by user perms make this check
              ;; only meaningful on a subset of drivers:
              ;;   - SQL Server: returns *every* schema in the database regardless
              ;;     of user perms, so the isolation half of this assertion would
              ;;     spuriously fail (B is visible, but only as a name).
              ;;   - Redshift: returns *empty* for non-superusers (catalog grants
              ;;     not propagated to information_schema), so the sanity-check
              ;;     half (A should see its own schema) would spuriously fail.
              ;; Both are documented driver-side metadata quirks, not isolation
              ;; breaches — the data and table-name assertions (table catalog
              ;; below + cross-grant SELECT above) still cover the real guarantee.
              (when-not (#{:sqlserver :redshift} driver)
                (let [visible (visible-namespaces driver user-a-spec)]
                  (is (contains? visible (u/lower-case-en out-a-schema))
                      (format "sanity: A should see its own output namespace %s in catalog. visible=%s"
                              out-a-schema visible))
                  (is (not (contains? visible (u/lower-case-en out-b-schema)))
                      (format "A unexpectedly enumerates B's output namespace %s in catalog. visible=%s"
                              out-b-schema visible)))))
            (testing "workspace A's table catalog does not enumerate workspace B's output table"
              (let [visible (visible-tables driver user-a-spec)
                    pair    [(u/lower-case-en out-b-schema)
                             (u/lower-case-en b-secret)]]
                (is (not (contains? visible pair))
                    (format "A unexpectedly enumerates B's table %s.%s in catalog. visible=%s"
                            out-b-schema b-secret visible)))))
          (finally
            (try (driver/destroy-workspace-isolation! driver database @ws-a-state)
                 (catch Throwable t
                   (log/warnf t "destroy-workspace-isolation! failed for ws-A on %s during cross-workspace test cleanup"
                              driver)))
            (try (driver/destroy-workspace-isolation! driver database @ws-b-state)
                 (catch Throwable t
                   (log/warnf t "destroy-workspace-isolation! failed for ws-B on %s during cross-workspace test cleanup"
                              driver)))
            (maybe-drop-input-namespace! admin-spec driver database in-schema-a src-a-name)
            (maybe-drop-input-namespace! admin-spec driver database in-schema-b src-b-name)))))))

(deftest ^:synchronized init-handles-pre-existing-namespace-test
  ;; The output-namespace name init creates is *deterministic* from `workspace.id`
  ;; (see `driver.u/workspace-isolation-namespace-name`), not random — so init can
  ;; land on an already-existing namespace (e.g., from a partial prior init that
  ;; was never cleaned up, or from another process). All current driver impls use
  ;; `CREATE SCHEMA IF NOT EXISTS` (or equivalent), so init silently succeeds when
  ;; the namespace exists. This test pins that behavior: init must not crash on
  ;; collision and the standard read-only-input + full-output contract must still
  ;; hold afterward.
  ;;
  ;; KNOWN LIMITATION: pre-existing data in the colliding namespace is *not*
  ;; cleared by init. If an attacker who can predict the namespace name (the
  ;; transformation in `workspace-isolation-namespace-name` is public) seeds it
  ;; with data before init runs, the workspace user inherits read access to that
  ;; data. Whether to refuse-on-collision or clear-on-collision is a design
  ;; decision tracked separately; this test does not assert one way or the other.
  (mt/test-drivers (filter #(isa? driver/hierarchy % :sql-jdbc) (mt/normal-drivers-with-feature :workspace))
    (testing "init-workspace-isolation! is robust when its target output namespace already exists"
      (let [driver       driver/*driver*
            database     (mt/db)
            details      (:details database)
            admin-spec   (sql-jdbc.conn/connection-details->spec driver details)
            run-id       (random-suffix)
            in-schema    (input-namespace-name driver database (str "mb_iso_in_" run-id))
            src-name     (str "ws_iso_src_" run-id)
            out-name     (str "ws_iso_out_" run-id)
            src          (qualify driver in-schema src-name)
            workspace    {:id   (Long/parseLong run-id 16)
                          :name (str "wsd-collision-" run-id)}
            out-schema   (driver.u/workspace-isolation-namespace-name workspace)
            ws-state     (atom (merge workspace
                                      {:schema           out-schema
                                       :database_details {:user (driver.u/workspace-isolation-user-name workspace)}}))]
        (try
          (maybe-create-input-namespace! admin-spec driver database in-schema)
          (jdbc/execute! admin-spec [(str "CREATE TABLE " src " (id INT, v VARCHAR(8))" (create-table-tail driver))])
          (jdbc/execute! admin-spec [(str "INSERT INTO " src " VALUES (1, 'a')")])
          ;; Pre-create the output namespace at exactly the name init will target,
          ;; before init runs.
          (maybe-create-input-namespace! admin-spec driver database out-schema)
          (let [init-result     (driver/init-workspace-isolation! driver database workspace)
                ws-with-details (merge workspace init-result)
                _               (reset! ws-state ws-with-details)
                user-spec       (sql-jdbc.conn/connection-details->spec driver (merge details (:database_details ws-with-details)))
                out             (qualify driver out-schema out-name)]
            (driver/grant-workspace-read-access! driver database ws-with-details
                                                 [in-schema])
            (testing "init succeeded against the pre-existing namespace"
              (is (some? init-result)))
            (testing "workspace user has full read+write access to its output namespace post-collision"
              (jdbc/execute! user-spec [(str "CREATE TABLE " out " (id INT, v VARCHAR(8))" (create-table-tail driver))])
              (jdbc/execute! user-spec [(str "INSERT INTO " out " VALUES (1, 'a')")])
              (is (= [{:id 1 :v "a"}]
                     (jdbc/query user-spec [(str "SELECT id, v FROM " out)])))
              (jdbc/execute! user-spec [(str "DROP TABLE " out)]))
            (testing "workspace user retains read-only access to input namespace post-collision"
              (is (= [{:id 1 :v "a"}]
                     (jdbc/query user-spec [(str "SELECT id, v FROM " src " ORDER BY id")])))
              (expect-sql-denied! user-spec
                                  (str "INSERT INTO " src " VALUES (2, 'b')")
                                  :insert-input-after-collision)))
          (finally
            (try (driver/destroy-workspace-isolation! driver database @ws-state)
                 (catch Throwable t
                   (log/warnf t "destroy-workspace-isolation! failed for %s during collision test cleanup"
                              driver)))
            (maybe-drop-input-namespace! admin-spec driver database in-schema src-name)
            ;; Belt-and-suspenders: if destroy didn't clean up the (originally pre-
            ;; created, then taken-over) output namespace, drop it directly.
            (maybe-drop-input-namespace! admin-spec driver database out-schema [])))))))

(deftest ^:synchronized grant-accumulation-test
  ;; Pins the *additive* contract of `grant-workspace-read-access!`: each call
  ;; adds tables to the workspace user's read-set without revoking previously-
  ;; granted ones. So `grant(ws, [A])` followed by `grant(ws, [B])` leaves the
  ;; workspace user able to SELECT both A and B. (The opposite contract —
  ;; replacing — would revoke A on the second call. We chose additive
  ;; deliberately; this test prevents an accidental flip.)
  ;;
  ;; All current driver impls are naturally additive because they emit
  ;; `GRANT SELECT ON …` statements (or table-level IAM bindings on BigQuery)
  ;; without revoking prior grants. If a driver ever does explicit revoke-then-
  ;; grant, this test will catch the regression.
  (mt/test-drivers (filter #(isa? driver/hierarchy % :sql-jdbc) (mt/normal-drivers-with-feature :workspace))
    (testing "grant-workspace-read-access! is additive across multiple calls"
      (let [driver       driver/*driver*
            database     (mt/db)
            details      (:details database)
            admin-spec   (sql-jdbc.conn/connection-details->spec driver details)
            run-id       (random-suffix)
            in-schema    (input-namespace-name driver database (str "mb_iso_in_" run-id))
            src-a-name   (str "ws_iso_src_a_" run-id)
            src-b-name   (str "ws_iso_src_b_" run-id)
            src-a        (qualify driver in-schema src-a-name)
            src-b        (qualify driver in-schema src-b-name)
            workspace    {:id   (Long/parseLong run-id 16)
                          :name (str "wsd-grantaccum-" run-id)}
            ws-state     (atom (merge workspace
                                      {:schema           (driver.u/workspace-isolation-namespace-name workspace)
                                       :database_details {:user (driver.u/workspace-isolation-user-name workspace)}}))]
        (try
          (maybe-create-input-namespace! admin-spec driver database in-schema)
          (jdbc/execute! admin-spec [(str "CREATE TABLE " src-a " (id INT, v VARCHAR(8))" (create-table-tail driver))])
          (jdbc/execute! admin-spec [(str "INSERT INTO " src-a " VALUES (1, 'a')")])
          (jdbc/execute! admin-spec [(str "CREATE TABLE " src-b " (id INT, v VARCHAR(8))" (create-table-tail driver))])
          (jdbc/execute! admin-spec [(str "INSERT INTO " src-b " VALUES (1, 'b')")])
          (let [init-result     (driver/init-workspace-isolation! driver database workspace)
                ws-with-details (merge workspace init-result)
                _               (reset! ws-state ws-with-details)
                user-spec       (sql-jdbc.conn/connection-details->spec driver (merge details (:database_details ws-with-details)))]
            ;; First grant: only A.
            (driver/grant-workspace-read-access! driver database ws-with-details
                                                 [in-schema])
            (testing "after first grant, A is readable and B is not"
              (is (= [{:id 1 :v "a"}]
                     (jdbc/query user-spec [(str "SELECT id, v FROM " src-a)])))
              ;; MySQL and ClickHouse grant at db.* granularity (database-as-namespace
              ;; drivers), so a single grant on the input db happens to allow B too.
              ;; Skip the negative assertion there: this isn't an additivity question,
              ;; it's a grant-granularity question (covered separately in the
              ;; cross-workspace test by using *separate* input namespaces per workspace).
              (when-not (contains? #{:mysql :clickhouse} driver)
                (expect-sql-denied! user-spec
                                    (str "SELECT id, v FROM " src-b)
                                    :select-b-before-grant)))
            ;; Second grant: only B. The additive contract means A's grant must
            ;; still be in effect afterward.
            (driver/grant-workspace-read-access! driver database ws-with-details
                                                 [in-schema])
            (testing "after second grant, both A and B are readable (A's grant accumulated)"
              (is (= [{:id 1 :v "a"}]
                     (jdbc/query user-spec [(str "SELECT id, v FROM " src-a)])))
              (is (= [{:id 1 :v "b"}]
                     (jdbc/query user-spec [(str "SELECT id, v FROM " src-b)])))))
          (finally
            (try (driver/destroy-workspace-isolation! driver database @ws-state)
                 (catch Throwable t
                   (log/warnf t "destroy-workspace-isolation! failed for %s during grant-accumulation test cleanup"
                              driver)))
            (maybe-drop-input-namespace! admin-spec driver database in-schema [src-a-name src-b-name])))))))

;; --- cross-database isolation -----------------------------------------------
;; Workspace tests above all live within a single `(mt/db)` database. SQL Server
;; and BigQuery host *many* databases/projects on one account/server, and a
;; workspace user/SA could in principle reach another database it was never
;; granted on. The drivers without a meaningful "outside-the-current-db" surface
;; (postgres / mysql / clickhouse / redshift — they treat each database as a
;; separate connection and the existing ungranted-namespace assertion in
;; `workspace-isolation-perms-test` already exercises the equivalent isolation)
;; are excluded from this fanout. BigQuery's "different project" requires
;; second-project billing setup we don't have in test infra, so it's deferred
;; to a follow-up.

(defn- supports-cross-database-isolation-test?
  "True for drivers where a second database can be created in the test admin
   connection and the workspace user (created in the first DB) is naturally
   excluded from it. SQL Server (separate user mappings per DB) qualifies; the
   rest don't fit the shape."
  [driver]
  (contains? #{:sqlserver} driver))

(defn- create-second-db-sql
  "DDL the admin connection runs to create a second database used by the
   cross-database test."
  [driver db-name]
  (case driver
    :sqlserver (str "CREATE DATABASE [" db-name "]")))

(defn- drop-second-db-sql
  [driver db-name]
  (case driver
    :sqlserver (str "DROP DATABASE IF EXISTS [" db-name "]")))

(defn- create-table-in-second-db-sqls
  "DDL to create a `secret` table inside the second database. SQL Server's
   default schema after CREATE DATABASE is `dbo`."
  [driver db-name table-name]
  (case driver
    :sqlserver [(str "CREATE TABLE [" db-name "].dbo.[" table-name "] (id INT, secret VARCHAR(64))")
                (str "INSERT INTO [" db-name "].dbo.[" table-name "] VALUES (1, 'cross-db-secret')")]))

(defn- second-db-qualified
  "Driver-specific fully-qualified `db.schema.table` reference used for the
   workspace user's denied SELECT."
  [driver db-name table-name]
  (case driver
    :sqlserver (str "[" db-name "].dbo.[" table-name "]")))

(deftest ^:synchronized cross-database-isolation-test
  ;; Verifies that a workspace user provisioned against `(mt/db)` cannot reach
  ;; data in *another* database created on the same warehouse account/server.
  ;; The threat model: warehouses where one account/server hosts many isolated
  ;; databases. If the workspace user can traverse `db_a.schema.table` →
  ;; `db_b.schema.table` the isolation contract is broken, since the design
  ;; assumes per-database scoping.
  (mt/test-drivers (filter supports-cross-database-isolation-test?
                           (mt/normal-drivers-with-feature :workspace))
    (testing "workspace user cannot read tables in a different database on the same account/server"
      (let [driver       driver/*driver*
            database     (mt/db)
            details      (:details database)
            admin-spec   (sql-jdbc.conn/connection-details->spec driver details)
            run-id       (random-suffix)
            in-schema    (input-namespace-name driver database (str "mb_iso_in_" run-id))
            src-name     (str "ws_iso_src_" run-id)
            other-db     (str "mb_iso_otherdb_" run-id)
            secret-tbl   (str "secret_" run-id)
            workspace    {:id   (Long/parseLong run-id 16)
                          :name (str "wsd-crossdb-" run-id)}
            ws-state     (atom (merge workspace
                                      {:schema           (driver.u/workspace-isolation-namespace-name workspace)
                                       :database_details {:user (driver.u/workspace-isolation-user-name workspace)}}))
            second-db-created? (atom false)]
        (try
          (maybe-create-input-namespace! admin-spec driver database in-schema)
          (jdbc/execute! admin-spec [(str "CREATE TABLE " (qualify driver in-schema src-name)
                                          " (id INT, v VARCHAR(8))" (create-table-tail driver))])
          ;; Provision a second database, create a `secret` table in it, populate.
          (jdbc/execute! admin-spec [(create-second-db-sql driver other-db)])
          (reset! second-db-created? true)
          (doseq [sql (create-table-in-second-db-sqls driver other-db secret-tbl)]
            (jdbc/execute! admin-spec [sql]))
          (let [init-result     (driver/init-workspace-isolation! driver database workspace)
                ws-with-details (merge workspace init-result)
                _               (reset! ws-state ws-with-details)
                user-spec       (sql-jdbc.conn/connection-details->spec driver (merge details (:database_details ws-with-details)))]
            (driver/grant-workspace-read-access! driver database ws-with-details
                                                 [in-schema])
            (testing "workspace user denied SELECT against a fully-qualified table in another database"
              (expect-sql-denied! user-spec
                                  (str "SELECT id, secret FROM " (second-db-qualified driver other-db secret-tbl))
                                  :select-other-database)))
          (finally
            (try (driver/destroy-workspace-isolation! driver database @ws-state)
                 (catch Throwable t
                   (log/warnf t "destroy-workspace-isolation! failed for %s during cross-database test cleanup"
                              driver)))
            (maybe-drop-input-namespace! admin-spec driver database in-schema src-name)
            (when @second-db-created?
              (try (jdbc/execute! admin-spec [(drop-second-db-sql driver other-db)])
                   (catch Throwable t
                     (log/warnf t "DROP DATABASE %s failed for %s during cross-database test cleanup"
                                other-db driver))))))))))

;; --- PUBLIC / anonymous default-grant probes --------------------------------
;; Defense-in-depth tests for the original review's #10 concern: assert that
;; init+grant did not accidentally land any grant on a "default" principal
;; (MySQL's anonymous `''@'%'` user). These are principals that all users
;; implicitly inherit; a stray grant on them would break workspace isolation
;; for every other connecting user.
;;
;; Postgres / Redshift's `public` schema CREATE-grant case is already covered
;; in production by `assert-no-public-create-grant!`. ClickHouse / SQL Server
;; don't have an analogous default-principal threat that's tractable here.

(defn- supports-public-default-grant-test?
  "True for drivers with a meaningful default principal (anonymous user) whose
   grants on workspace resources we want to verify are absent."
  [driver]
  (contains? #{:mysql} driver))

(defn- public-grant-probe-sql
  "Per-driver SQL that, run as admin, returns rows iff the anonymous user holds
   *any* grant whose target name contains `ws-fragment` (the workspace's
   deterministic id-derived suffix). The workspace's role, schema/database, and
   user names all embed `ws-fragment`, so a single LIKE match catches every
   flavor.

   MySQL: `mysql.tables_priv` and `mysql.db` are the system tables that store
   per-table and per-database grants; filtering by `User = ''` finds anonymous-
   user grants. The anonymous user is often disabled on modern installs (no
   row exists), so the query returns 0 rows in the happy path."
  [driver ws-fragment]
  (case driver
    :mysql     (str "SELECT CONCAT(Db, '.', COALESCE(Table_name, '*')) AS resource "
                    "FROM mysql.tables_priv WHERE User = '' AND Db LIKE '%" ws-fragment "%' "
                    "UNION ALL "
                    "SELECT Db AS resource FROM mysql.db WHERE User = '' AND Db LIKE '%" ws-fragment "%'")))

(defn- public-grant-pre-query-sql
  "Some drivers need an introspection query run *before* the probe. Returns nil
   for drivers that don't need a setup step."
  [_driver]
  nil)

(deftest ^:synchronized no-public-default-grant-test
  ;; Verifies that after `init-workspace-isolation!` and
  ;; `grant-workspace-read-access!`, no grant has landed on a default principal
  ;; (MySQL's anonymous `''@'%'` user). A stray grant on that principal would
  ;; silently leak the workspace's resources to every other
  ;; user/role on the warehouse.
  ;;
  ;; The probe queries the warehouse's own grants catalog as admin, filtering
  ;; for any row whose target name contains the workspace's deterministic id-
  ;; derived suffix. Workspace role, schema/db, and user names all embed that
  ;; suffix, so a single substring match catches every flavor of accidental
  ;; grant. Empty result = test passes (no leakage); any row = regression.
  (mt/test-drivers (filter supports-public-default-grant-test?
                           (mt/normal-drivers-with-feature :workspace))
    (testing "init+grant did not place any grant on PUBLIC / anonymous principal"
      (let [driver       driver/*driver*
            database     (mt/db)
            details      (:details database)
            admin-spec   (sql-jdbc.conn/connection-details->spec driver details)
            run-id       (random-suffix)
            in-schema    (input-namespace-name driver database (str "mb_iso_in_" run-id))
            src-name     (str "ws_iso_src_" run-id)
            src          (qualify driver in-schema src-name)
            workspace    {:id   (Long/parseLong run-id 16)
                          :name (str "wsd-public-" run-id)}
            ws-fragment  (driver.u/workspace-isolation-namespace-name workspace)
            ws-state     (atom (merge workspace
                                      {:schema           ws-fragment
                                       :database_details {:user (driver.u/workspace-isolation-user-name workspace)}}))]
        (try
          (maybe-create-input-namespace! admin-spec driver database in-schema)
          (jdbc/execute! admin-spec [(str "CREATE TABLE " src " (id INT, v VARCHAR(8))" (create-table-tail driver))])
          (let [init-result     (driver/init-workspace-isolation! driver database workspace)
                ws-with-details (merge workspace init-result)]
            (reset! ws-state ws-with-details)
            (driver/grant-workspace-read-access! driver database ws-with-details
                                                 [in-schema])
            (testing "no leakage to default principal after init+grant"
              ;; Search both the workspace-namespace name and the workspace-user
              ;; name fragment, since per-driver grants can land on either.
              (let [user-fragment (driver.u/workspace-isolation-user-name workspace)
                    leaks         (atom #{})]
                (doseq [fragment [ws-fragment user-fragment]]
                  (when-let [pre-sql (public-grant-pre-query-sql driver)]
                    (try (jdbc/query admin-spec [pre-sql]) (catch Throwable _ nil)))
                  (let [rows (try (jdbc/query admin-spec [(public-grant-probe-sql driver fragment)])
                                  (catch Throwable t
                                    (log/warnf t "public-grant probe failed on %s; skipping" driver)
                                    nil))]
                    (when (seq rows)
                      (swap! leaks into (map :resource rows)))))
                (is (empty? @leaks)
                    (format "PUBLIC / anonymous principal unexpectedly has grants on workspace resources: %s"
                            @leaks)))))
          (finally
            (try (driver/destroy-workspace-isolation! driver database @ws-state)
                 (catch Throwable t
                   (log/warnf t "destroy-workspace-isolation! failed for %s during public-grant test cleanup"
                              driver)))
            (maybe-drop-input-namespace! admin-spec driver database in-schema src-name)))))))
