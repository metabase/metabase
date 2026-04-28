(ns ^:mb/driver-tests metabase-enterprise.workspaces.query-processor.cross-driver-test
  "End-to-end read-path coverage for workspace table remapping against real
   warehouses.

   Each test creates a fresh workspace schema in the warehouse, populates it with
   a table whose rows differ from the canonical-side table, registers a
   `:model/TableRemapping` pointing canonical -> workspace, and runs an MBQL
   query against the canonical table id. Phase 1 mutates table metadata so the
   compiled SQL targets the workspace schema; the warehouse executes; the
   assertion compares row content (workspace-side, not canonical-side).

   The H2-only string-SQL tests in `middleware_test.clj` prove the rewriter
   emits the right strings. The SQLGlot corpus runner proves the grammar layer
   across 7 dialects. This namespace fills the third layer — does the warehouse
   actually accept and execute the rewritten SQL, AND do we get the right rows?

   Runs locally against H2 because we provision the workspace schema with raw
   DDL (no dependency on `:workspace` driver feature). CI fans out across every
   driver in the case statements below."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer [deftest is testing]]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.util :as sql.u]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ----------------------------- Per-driver DDL ---------------------------------

(defn- quoted-namespace
  "Driver-correct quoted reference to a schema (or database, for schema-less
   drivers like MySQL). Used in CREATE/DROP statements where the helper builds
   the SQL by string concatenation."
  [driver namespace-name]
  (case driver
    (:postgres :redshift :snowflake :h2) (str \" namespace-name \")
    :sqlserver                            (str \[ namespace-name \])
    (:mysql :clickhouse)                  (str \` namespace-name \`)))

(defn- create-namespace-sql
  "DDL to create a fresh per-run schema (or database, for schema-less drivers
   like MySQL/ClickHouse)."
  [driver namespace-name]
  (case driver
    (:postgres :redshift :snowflake :h2) (str "CREATE SCHEMA " (quoted-namespace driver namespace-name))
    :sqlserver                            (str "CREATE SCHEMA " (quoted-namespace driver namespace-name))
    (:mysql :clickhouse)                  (str "CREATE DATABASE " (quoted-namespace driver namespace-name))))

(defn- drop-namespace-sqls
  "DDL to drop the per-run namespace and any tables left in it. Schema'd
   drivers with CASCADE (postgres/redshift/snowflake/h2) and database-as-namespace
   drivers (mysql/clickhouse) take a single statement; SQL Server has no DROP
   SCHEMA CASCADE so the source table has to be dropped explicitly first."
  [driver namespace-name table-name]
  (case driver
    (:postgres :redshift :snowflake :h2) [(str "DROP SCHEMA " (quoted-namespace driver namespace-name) " CASCADE")]
    :sqlserver                            [(str "DROP TABLE " (quoted-namespace driver namespace-name) "." (quoted-namespace driver table-name))
                                           (str "DROP SCHEMA " (quoted-namespace driver namespace-name))]
    (:mysql :clickhouse)                  [(str "DROP DATABASE " (quoted-namespace driver namespace-name))]))

(defn- qualify
  "Per-driver quoted `schema.table` (or `database.table` for schema-less drivers)."
  [driver schema table]
  (sql.u/quote-name driver :table schema table))

(defn- create-table-tail
  "Trailing clause appended to `CREATE TABLE ... (cols)` per driver. ClickHouse
   requires every table to declare a storage engine and an ORDER BY key; SQL
   drivers don't."
  [driver]
  (case driver
    :clickhouse " ENGINE = MergeTree() ORDER BY id"
    ""))

(defn- random-suffix []
  (subs (str (random-uuid)) 0 8))

;;; ----------------------------- Helpers --------------------------------------

(defn- canonical-schema
  "Schema of the orders table on the current driver."
  []
  (t2/select-one-fn :schema :model/Table :id (mt/id :orders)))

(defn- canonical-table-name
  "The :name of the orders :model/Table, as the driver stores it (e.g. \"ORDERS\"
   on H2, \"orders\" on Postgres). Phase 1's metadata override matches by name,
   so the remapping's from-name has to be exactly this string."
  []
  (t2/select-one-fn :name :model/Table :id (mt/id :orders)))

(defn- admin-spec
  "JDBC connection-spec usable for raw DDL and inserts against the current
   driver's test database."
  [driver]
  (sql-jdbc.conn/connection-details->spec driver (:details (mt/db))))

(defn- with-workspace-table!
  "Provision a workspace schema and an `orders`-named table whose case matches
   the canonical table (so the remap's `to-name` matches exactly what the
   rewriter emits). Inserts `workspace-rows` (a seq of `[id v]` pairs). Runs
   `body-fn` with the created schema name; tears everything down afterward.

   Schema name is `mb_xdr_<random>`. The table column shape (`id INT, v
   VARCHAR(32)`) is intentionally minimal — the read-side test uses
   `[:count]` aggregation, which doesn't reference any specific field, so
   schema-mismatch with canonical doesn't matter."
  [workspace-rows body-fn]
  (let [driver    driver/*driver*
        suffix    (random-suffix)
        ws-schema (str "mb_xdr_" suffix)
        spec      (admin-spec driver)
        ws-table  (canonical-table-name)]
    (try
      (jdbc/execute! spec [(create-namespace-sql driver ws-schema)])
      (jdbc/execute! spec [(str "CREATE TABLE " (qualify driver ws-schema ws-table)
                                " (id INT, v VARCHAR(32))"
                                (create-table-tail driver))])
      (doseq [[id v] workspace-rows]
        (jdbc/execute! spec [(str "INSERT INTO " (qualify driver ws-schema ws-table)
                                  " VALUES (" id ", '" v "')")]))
      (body-fn ws-schema)
      (finally
        (doseq [sql (drop-namespace-sqls driver ws-schema ws-table)]
          (try (jdbc/execute! spec [sql])
               (catch Throwable _)))))))

(defn- with-remapping!
  "Insert a TableRemapping row pointing canonical -> workspace, run `body-fn`,
   delete the row on the way out."
  [from-schema from-name to-schema to-name body-fn]
  (let [{remap-id :id} (t2/insert-returning-instance!
                        :model/TableRemapping
                        {:database_id     (mt/id)
                         :from_schema     from-schema
                         :from_table_name from-name
                         :to_schema       to-schema
                         :to_table_name   to-name})]
    (try
      (body-fn)
      (finally
        (t2/delete! :model/TableRemapping :id remap-id)))))

(defn- canonical-row-count
  "Row count of the canonical orders table — used as the disambiguator. The
   workspace table we create has a tiny number of rows so the read-side
   assertion can compare counts and tell whether we read from the workspace
   schema or the canonical one."
  []
  (-> (mt/process-query
       {:database (mt/id)
        :type     :query
        :query    {:source-table (mt/id :orders)
                   :aggregation  [[:count]]}})
      mt/rows
      ffirst))

(defn- count-via-qp
  "Run `SELECT COUNT(*) FROM orders` through the QP via the canonical orders
   table id. If a TableRemapping is in effect, the rewriter should redirect
   this to the workspace schema."
  []
  (-> (mt/process-query
       {:database (mt/id)
        :type     :query
        :query    {:source-table (mt/id :orders)
                   :aggregation  [[:count]]}})
      mt/rows
      ffirst))

;;; --------------------------------- Tests -------------------------------------

(deftest single-remapped-table-cross-driver-test
  (testing "QP read against canonical name resolves to the workspace copy on the warehouse"
    (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
      (mt/with-premium-features #{:workspaces}
        ;; Workspace table has 2 rows; canonical orders has many thousands.
        ;; Asserting the count comes back as 2 proves the read hit the workspace
        ;; copy, not canonical.
        (let [workspace-rows [[1 "ws-foo"] [2 "ws-bar"]]
              canonical-count (canonical-row-count)]
          (assert (> canonical-count 2)
                  "test assumes canonical orders has >2 rows so count alone disambiguates")
          (with-workspace-table! workspace-rows
            (fn [ws-schema]
              (with-remapping! (canonical-schema) (canonical-table-name)
                ws-schema (canonical-table-name)
                (fn []
                  (is (= 2 (count-via-qp))
                      (str "count came from workspace (2 rows), not canonical (" canonical-count " rows)")))))))))))
