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
   [clojure.string :as str]
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
    (:postgres :redshift :h2) (str \" namespace-name \")
    :sqlserver                            (str \[ namespace-name \])
    (:mysql :clickhouse)                  (str \` namespace-name \`)))

(defn- create-namespace-sql
  "DDL to create a fresh per-run schema (or database, for schema-less drivers
   like MySQL/ClickHouse)."
  [driver namespace-name]
  (case driver
    (:postgres :redshift :h2) (str "CREATE SCHEMA " (quoted-namespace driver namespace-name))
    :sqlserver                            (str "CREATE SCHEMA " (quoted-namespace driver namespace-name))
    (:mysql :clickhouse)                  (str "CREATE DATABASE " (quoted-namespace driver namespace-name))))

(defn- drop-namespace-sqls
  "DDL to drop the per-run namespace and any tables left in it. Schema'd
   drivers with CASCADE (postgres/redshift/h2) and database-as-namespace
   drivers (mysql/clickhouse) take a single statement; SQL Server has no DROP
   SCHEMA CASCADE so the source table has to be dropped explicitly first."
  [driver namespace-name table-name]
  (case driver
    (:postgres :redshift :h2) [(str "DROP SCHEMA " (quoted-namespace driver namespace-name) " CASCADE")]
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

(def ^:private cross-driver-test-drivers
  "Drivers we exercise with these end-to-end remap tests. Restricted to a small
   set on purpose: the [[with-workspace-tables!]] fixture sends literal DDL
   (`INT`, `DOUBLE PRECISION`, etc.) to whatever driver runs, and the test queries assume
   case-insensitive identifier handling. That holds on H2 / Postgres but breaks
   on ClickHouse (case-sensitive, no `LEFT JOIN`) and SQL Server (different type names).
   Other drivers' workspace remap
   behavior is covered by [[metabase-enterprise.workspaces.table-remapping-test]]
   unit tests and the SQLGlot corpus tests in
   [[metabase-enterprise.workspaces.query-processor.driver-corpus-test]]."
  #{:h2 :postgres})

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

(defn- with-workspace-tables!
  "Provision a workspace schema and one or more tables, each shaped to match a
   canonical-table's MBQL field references for the test query.

   `tables` is a vector of `{:canonical-kw <kw>, :columns \"col1 type, col2 type\",
   :insert-rows [[id, val] ...]}` maps. Each table is created in the workspace
   schema with the given DDL, named the same as its canonical counterpart
   (case-matched), and seeded with the rows. Row values are interpolated raw
   into the INSERT — wrap strings in literal quotes (`\"'foo'\"`).

   Runs `body-fn` with the schema name; tears everything down afterward."
  [tables body-fn]
  (let [driver         driver/*driver*
        suffix         (random-suffix)
        ws-schema      (str "mb_xdr_" suffix)
        spec           (admin-spec driver)
        ws-table-names (mapv #(t2/select-one-fn :name :model/Table :id (mt/id (:canonical-kw %)))
                             tables)]
    (try
      (jdbc/execute! spec [(create-namespace-sql driver ws-schema)])
      (doseq [{:keys [canonical-kw columns insert-rows]} tables
              :let [ws-table (t2/select-one-fn :name :model/Table :id (mt/id canonical-kw))]]
        (jdbc/execute! spec [(str "CREATE TABLE " (qualify driver ws-schema ws-table)
                                  " (" columns ")"
                                  (create-table-tail driver))])
        (doseq [row insert-rows]
          (jdbc/execute! spec [(str "INSERT INTO " (qualify driver ws-schema ws-table)
                                    " VALUES (" (str/join ", " row) ")")])))
      (body-fn ws-schema)
      (finally
        (doseq [ws-table ws-table-names
                sql      (drop-namespace-sqls driver ws-schema ws-table)]
          (try (jdbc/execute! spec [sql])
               (catch Throwable _)))))))

(defn- with-workspace-table!
  "Single-table convenience wrapper. Creates a workspace `orders` table with
   `(id INT, v VARCHAR(32))` columns and the given `[[id v] ...]` rows."
  [orders-rows body-fn]
  (with-workspace-tables!
    [{:canonical-kw :orders
      :columns      "id INT, v VARCHAR(32)"
      :insert-rows  (mapv (fn [[id v]] [id (str \' v \')]) orders-rows)}]
    body-fn))

(defn- with-remapping!
  "Insert a TableRemapping row pointing canonical -> workspace, run `body-fn`,
   delete the row on the way out.

   Nil schema (MySQL/ClickHouse) is normalized to the empty-string sentinel so the
   row can be persisted regardless of warehouse. The QP rewriter prunes the sentinel
   before handing the key to SQLGlot."
  [from-schema from-name to-schema to-name body-fn]
  (let [{remap-id :id} (t2/insert-returning-instance!
                        :model/TableRemapping
                        {:database_id     (mt/id)
                         :from_schema     (or from-schema "")
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
    (mt/test-drivers (filter cross-driver-test-drivers
                             (mt/normal-drivers-with-feature :workspace))
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

(deftest non-remapped-passthrough-cross-driver-test
  (testing "0/1: a query against a non-remapped table still hits canonical even when an unrelated remap exists"
    (mt/test-drivers (filter cross-driver-test-drivers
                             (mt/normal-drivers-with-feature :workspace))
      (mt/with-premium-features #{:workspaces}
        ;; Setup: a workspace `orders` table with 2 rows + a remap orders -> workspace.
        ;; Query: `:people` (NOT remapped). Must return canonical people count.
        (let [workspace-rows  [[1 "ws-foo"] [2 "ws-bar"]]
              canonical-count (-> (mt/process-query
                                   {:database (mt/id)
                                    :type     :query
                                    :query    {:source-table (mt/id :people)
                                               :aggregation  [[:count]]}})
                                  mt/rows ffirst)]
          (with-workspace-table! workspace-rows
            (fn [ws-schema]
              (with-remapping! (canonical-schema) (canonical-table-name)
                ws-schema (canonical-table-name)
                (fn []
                  (let [people-count (-> (mt/process-query
                                          {:database (mt/id)
                                           :type     :query
                                           :query    {:source-table (mt/id :people)
                                                      :aggregation  [[:count]]}})
                                         mt/rows ffirst)]
                    (is (= canonical-count people-count)
                        "people read passes through canonical when only orders is remapped")))))))))))

(deftest join-one-side-remapped-cross-driver-test
  (testing "1/2: an MBQL join with only the orders side remapped reads workspace orders + canonical people"
    (mt/test-drivers (filter cross-driver-test-drivers
                             (mt/normal-drivers-with-feature :workspace))
      (mt/with-premium-features #{:workspaces}
        ;; Workspace orders has 2 rows; both have user_id values that exist in canonical people.
        ;; The join count should be 2 (one row per workspace order, joined to its canonical people row).
        ;; If the remap silently failed and the query hit canonical orders, the count would be ~thousands.
        (with-workspace-tables!
          [{:canonical-kw :orders
            :columns      "id INT, user_id INT"
            :insert-rows  [[1 1] [2 2]]}]
          (fn [ws-schema]
            (with-remapping! (canonical-schema) (canonical-table-name)
              ws-schema (canonical-table-name)
              (fn []
                (let [orders-id      (mt/id :orders)
                      orders-user-id (mt/id :orders :user_id)
                      people-id      (mt/id :people :id)
                      people-tbl-id  (mt/id :people)
                      result-count   (-> (mt/process-query
                                          {:database (mt/id)
                                           :type     :query
                                           :query    {:source-table orders-id
                                                      :joins        [{:source-table people-tbl-id
                                                                      :alias        "p"
                                                                      :fields       :none
                                                                      :condition    [:= [:field orders-user-id nil]
                                                                                     [:field people-id {:join-alias "p"}]]}]
                                                      :aggregation  [[:count]]}})
                                         mt/rows ffirst)]
                  (is (= 2 result-count)
                      "join count = workspace orders rows that match canonical people"))))))))))

(deftest join-both-sides-remapped-cross-driver-test
  (testing "2/2: an MBQL join with both sides remapped reads workspace orders + workspace people"
    (mt/test-drivers (filter cross-driver-test-drivers
                             (mt/normal-drivers-with-feature :workspace))
      (mt/with-premium-features #{:workspaces}
        ;; Workspace orders has user_id 999; workspace people has id 999.
        ;; Canonical people doesn't have id 999, so the 999/999 match exists
        ;; only when both sides are remapped. Workspace tables mirror
        ;; canonical column shape because the QP's implicit join compiles to
        ;; SELECT (every canonical field) — `:fields :none` doesn't suppress
        ;; this when the join target is itself remapped.
        (with-workspace-tables!
          [{:canonical-kw :orders
            :columns      (str/join " " ["ID BIGINT,"
                                         "USER_ID INT,"
                                         "PRODUCT_ID INT,"
                                         "SUBTOTAL DOUBLE PRECISION,"
                                         "TAX DOUBLE PRECISION,"
                                         "TOTAL DOUBLE PRECISION,"
                                         "DISCOUNT DOUBLE PRECISION,"
                                         "CREATED_AT TIMESTAMP,"
                                         "QUANTITY INT"])
            :insert-rows  [[1 999 "NULL" "NULL" "NULL" "NULL" "NULL" "NULL" "NULL"]]}
           {:canonical-kw :people
            :columns      (str/join " " ["ID BIGINT,"
                                         "ADDRESS VARCHAR(256),"
                                         "EMAIL VARCHAR(256),"
                                         "PASSWORD VARCHAR(256),"
                                         "NAME VARCHAR(256),"
                                         "CITY VARCHAR(256),"
                                         "LONGITUDE DOUBLE PRECISION,"
                                         "STATE VARCHAR(256),"
                                         "SOURCE VARCHAR(256),"
                                         "BIRTH_DATE DATE,"
                                         "ZIP VARCHAR(256),"
                                         "LATITUDE DOUBLE PRECISION,"
                                         "CREATED_AT TIMESTAMP"])
            :insert-rows  [[999 "NULL" "NULL" "NULL" "'ws-only-person'"
                            "NULL" "NULL" "NULL" "NULL" "NULL"
                            "NULL" "NULL" "NULL"]]}]
          (fn [ws-schema]
            (with-remapping! (canonical-schema) (t2/select-one-fn :name :model/Table :id (mt/id :orders))
              ws-schema (t2/select-one-fn :name :model/Table :id (mt/id :orders))
              (fn []
                (with-remapping! (canonical-schema) (t2/select-one-fn :name :model/Table :id (mt/id :people))
                  ws-schema (t2/select-one-fn :name :model/Table :id (mt/id :people))
                  (fn []
                    (let [orders-id      (mt/id :orders)
                          orders-user-id (mt/id :orders :user_id)
                          people-id      (mt/id :people :id)
                          people-tbl-id  (mt/id :people)
                          result-count   (-> (mt/process-query
                                              {:database (mt/id)
                                               :type     :query
                                               :query    {:source-table orders-id
                                                          :joins        [{:source-table people-tbl-id
                                                                          :alias        "p"
                                                                          :fields       :none
                                                                          :condition    [:= [:field orders-user-id nil]
                                                                                         [:field people-id {:join-alias "p"}]]}]
                                                          :aggregation  [[:count]]}})
                                             mt/rows ffirst)]
                      (is (= 1 result-count)
                          "join count = 1, the 999/999 match that only exists in the workspace tables"))))))))))))
