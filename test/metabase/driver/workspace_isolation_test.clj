(ns ^:mb/driver-tests metabase.driver.workspace-isolation-test
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
   schema. Rationale: cloud DWs (Redshift, Snowflake) don't support drop+create
   of databases at will, but creating a per-run table inside a shared DB works
   the same way everywhere.

   Cross-driver counterpart to the postgres-only
   `workspace-user-cannot-write-to-input-schema-test`."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- find-sql-exception
  "Walk the cause chain until we find a `java.sql.SQLException`, or nil."
  [^Throwable t]
  (loop [t t]
    (cond
      (nil? t)                            nil
      (instance? java.sql.SQLException t) t
      :else                               (recur (.getCause t)))))

(defn- create-input-namespace-sql
  "DDL to create a fresh per-run input namespace (a schema for schema'd drivers,
   a database for schema-less ones like MySQL/ClickHouse). We always use a
   freshly-created namespace rather than the driver's default (`public`/`dbo`)
   because Redshift's `public` has `CREATE` granted to `PUBLIC` by default —
   any USAGE-granted user can create tables there, breaking the input-deny
   contract regardless of how we revoke from the workspace user. A fresh
   namespace has no implicit PUBLIC grants."
  [driver namespace-name]
  (case driver
    (:postgres :redshift :snowflake) (str "CREATE SCHEMA \"" namespace-name "\"")
    :sqlserver                       (str "CREATE SCHEMA [" namespace-name "]")
    (:mysql :clickhouse)             (str "CREATE DATABASE `" namespace-name "`")))

(defn- drop-input-namespace-sqls
  "DDL to drop the per-run input namespace and any tables left in it. Schema'd
   drivers with CASCADE (postgres/redshift/snowflake) and database-as-namespace
   drivers (mysql/clickhouse) take a single statement; SQL Server has no DROP
   SCHEMA CASCADE so the source table has to be dropped explicitly first."
  [driver namespace-name table-name]
  (case driver
    (:postgres :redshift :snowflake) [(str "DROP SCHEMA \"" namespace-name "\" CASCADE")]
    :sqlserver                       [(str "DROP TABLE [" namespace-name "].[" table-name "]")
                                      (str "DROP SCHEMA [" namespace-name "]")]
    (:mysql :clickhouse)             [(str "DROP DATABASE `" namespace-name "`")]))

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

(defn- expect-write-denied!
  [user-spec sql label]
  (testing (format "%s on input schema is denied" label)
    (try
      (jdbc/execute! user-spec [sql])
      (is false (format "%s unexpectedly succeeded" label))
      (catch Throwable t
        (let [sqle (find-sql-exception t)]
          (is (some? sqle)
              (format "expected SQLException for %s; got %s" label (class t))))))))

(defn- random-suffix
  "Eight hex chars from a random UUID. Per-run unique enough to avoid collisions
   from leftover state in the shared test DB."
  []
  (subs (str (random-uuid)) 0 8))

(deftest ^:synchronized workspace-isolation-perms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :workspace)
    (testing "workspace user gets read-only access to input schema, full access to output schema"
      (let [driver       driver/*driver*
            database     (mt/db)
            details      (:details database)
            admin-spec   (sql-jdbc.conn/connection-details->spec driver details)
            ;; Per-run identifiers — the test runs against a shared warehouse DB
            ;; (`(mt/db)`), so anything we create has to be uniquely named or
            ;; it'll collide with leftover state from a prior failed run.
            run-id       (random-suffix)
            in-schema    (str "mb_iso_in_" run-id)
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
          (jdbc/execute! admin-spec [(create-input-namespace-sql driver in-schema)])
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
                                                 [{:schema in-schema :name src-name}])
            (testing "workspace user can SELECT from a granted input table"
              (is (= [{:id 1 :v "a"}]
                     (jdbc/query user-spec [(str "SELECT id, v FROM " src " ORDER BY id")]))))
            (testing "workspace user cannot write to or DDL against the input schema"
              (let [base-ops [[:insert       (str "INSERT INTO " src " VALUES (2, 'b')")]
                              [:create-table (str "CREATE TABLE "
                                                  (qualify driver in-schema sneaky-name)
                                                  " (id INT)" (create-table-tail driver))]
                              [:drop-table   (str "DROP TABLE " src)]]
                    ops      (cond-> base-ops
                               (supports-update-delete-as-perm-test? driver)
                               (into [[:update (str "UPDATE " src " SET v = 'x'")]
                                      [:delete (str "DELETE FROM " src)]]))]
                (doseq [[label sql] ops]
                  (expect-write-denied! user-spec sql label))))
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
              (jdbc/execute! user-spec [(str "DROP TABLE " out)])))
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
            (doseq [sql (drop-input-namespace-sqls driver in-schema src-name)]
              (try (jdbc/execute! admin-spec [sql]) (catch Throwable _ nil)))))))))
