(ns ^:mb/driver-tests metabase-enterprise.workspaces.e2e-test
  "End-to-end workspace test against the real warehouse for each
   workspace-supported driver.

   Stands up the full pipeline the way `config.yml` does in production:
   provisions an isolation schema + workspace user via
   `workspaces.provisioning/*`, builds the canonical `config.yml` map via
   `workspaces.config/build-workspace-config`, round-trips it through YAML,
   binds it to `advanced-config.file/*config*`, and calls `initialize!` —
   which runs the same `:databases` and `:workspace` section loaders the
   child instance uses at boot. Then it runs a transform whose target gets
   rewritten to the isolation schema, and verifies that visibility from
   Metabase's perspective is confined to the input schema — neither the
   app-db `Table` rows nor `describe-database` should ever surface the
   isolation schema.

   BigQuery is excluded for now: its DDL setup goes through the BigQuery API,
   not JDBC, so the `jdbc/execute!`-based table seeding here doesn't apply to
   it. A BigQuery e2e variant is a separate follow-up."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.util :as sql.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.sql :as sql.tx]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- random-suffix
  "Eight hex chars from a random UUID — uniquifies the per-run schema/table/user
   identifiers so we don't collide with leftover state in the shared test DB."
  []
  (subs (str (random-uuid)) 0 8))

(def workspaces-supported-dwh-drivers
  "Drivers whose workspace setup goes through the JDBC + SQL DDL path. BigQuery is
   omitted because its setup uses the BigQuery API, not JDBC DDL; a BigQuery e2e
   variant is filed separately."
  #{:postgres :sqlserver :clickhouse :mysql :redshift :snowflake})

(defn- three-slot-driver?
  "True when the driver emits `db.schema.table` (Snowflake / SQL Server / BigQuery).
   Drives whether the workspace input/output namespace map populates `:db`."
  [driver]
  (boolean (some #{:db} (driver/qualified-name-components driver))))

(defn- workspace-input-namespace
  "Build a `::table-namespace` map for `add-database!` that matches what each
   driver's `qualified-name-components` says about how the canonical input
   namespace is addressed.

   - 3-slot drivers (Snowflake, SQL Server) populate both `:db` and `:schema`.
   - 2-slot schema-having drivers (Postgres, Redshift, ClickHouse) populate
     `:schema` only.
   - MySQL has `qualified-name-components` `[]`; the canonical schema string
     IS the database name and lands in `:db`."
  [driver admin-details main-schema]
  (cond-> {}
    (three-slot-driver? driver) (assoc :db (:db admin-details))
    (= :mysql driver)           (assoc :db main-schema)
    (not= :mysql driver)        (assoc :schema main-schema)))

(defn- qualified-table-sql
  "Return the dialect-correct schema-qualified table reference for a native SQL
   string, e.g. `\"PUBLIC\".\"VENUES\"` on Postgres, `[dbo].[venues]` on SQL Server.

   For 3-slot drivers (Snowflake, SQL Server) the connection's bound database
   already serves as the outer qualifier, so a `schema.table` reference resolves
   correctly without needing to inject a third part here."
  [driver schema table]
  (sql.u/quote-name driver :table schema table))

(defn- create-source-table!
  "Driver-aware CREATE TABLE + INSERT for the e2e source table. Uses
   `sql.tx/field-base-type->sql-type` for column types so we don't hand-write
   per-driver type names."
  [driver admin-spec schema table]
  (let [int-type  (sql.tx/field-base-type->sql-type driver :type/Integer)
        text-type (sql.tx/field-base-type->sql-type driver :type/Text)
        qual      (qualified-table-sql driver schema table)]
    (jdbc/execute! admin-spec [(format "CREATE TABLE %s (id %s, v %s)" qual int-type text-type)])
    (jdbc/execute! admin-spec [(format "INSERT INTO %s (id, v) VALUES (1, 'a'), (2, 'b'), (3, 'c')" qual)])))

(defn- create-output-table!
  "Pre-create the canonical *output* target with `rows` (each `[id v]`). Same
   driver-aware DDL as `create-source-table!`. Used by the canonical-table-protection
   test to seed `main_schema.tgt-name` with distinct rows before the workspace
   transform writes to that same name (which gets redirected to iso.<derived>)."
  [driver admin-spec schema table rows]
  (let [int-type  (sql.tx/field-base-type->sql-type driver :type/Integer)
        text-type (sql.tx/field-base-type->sql-type driver :type/Text)
        qual      (qualified-table-sql driver schema table)
        values    (str/join ", " (map (fn [[id v]] (format "(%d, '%s')" id v)) rows))]
    (jdbc/execute! admin-spec [(format "CREATE TABLE %s (id %s, v %s)" qual int-type text-type)])
    (jdbc/execute! admin-spec [(format "INSERT INTO %s (id, v) VALUES %s" qual values)])))

(defn- canonical-schema-name
  "Pick the warehouse \"schema\" (in this test's vocabulary) the canonical input
   tables will live in for this driver.

   Schema-having drivers (Postgres / Redshift / SQL Server / Snowflake / ClickHouse)
   get a freshly-created per-run schema so concurrent runs don't collide on
   table names.

   MySQL has no notion of schema-within-database — its \"schemas\" are databases,
   and the connection is bound to one of them. The workspace YAML contract
   already encodes this: `input: [{schema: <bound-db-name>}]`. So on MySQL we
   reuse the connection's bound database (`(:db admin-details)`) as the
   canonical input \"schema\". Concurrency-isolation falls to the per-run
   table-name suffix instead."
  [driver run-id admin-details]
  (case driver
    :mysql (:db admin-details)
    (str "canonical_schema_" run-id)))

(defn- table-row-schema-value
  "Translate the warehouse \"schema\" name to the value Metabase stores in
   `:model/Table.schema` for this driver. MySQL reports no schema at all
   (`(database-supports? :mysql :schemas)` is `false`), so synced Table
   rows have `:schema nil` regardless of what database they live in. Other
   drivers store the schema name verbatim."
  [driver schema]
  (if (= :mysql driver) nil schema))

(defn- create-canonical-schema!
  "Create the canonical schema, except on MySQL where `canonical-schema-name`
   returns the connection's already-existing bound database — there's nothing
   to create, and `CREATE DATABASE` would either be redundant or steal a name
   shared with other tests."
  [driver admin-spec schema]
  (when-not (= :mysql driver)
    (jdbc/execute! admin-spec [(format "CREATE SCHEMA %s"
                                       (sql.u/quote-name driver :schema schema))])))

(defn- drop-canonical-schema!
  "Driver-aware schema teardown for the e2e test's `finally` cleanup.

   Postgres / Redshift / SQL Server / Snowflake / ClickHouse: drop the per-run
   schema. `CASCADE` is load-bearing for Postgres-family because the test has
   created tables inside.

   MySQL: don't drop the bound database (it's the shared test-data DB used by
   other tests). Drop only the two per-run tables we created."
  [driver admin-spec schema src-name tgt-name]
  (case driver
    :mysql (doseq [t [src-name tgt-name]]
             (try (jdbc/execute! admin-spec
                                 [(format "DROP TABLE IF EXISTS %s"
                                          (qualified-table-sql driver schema t))])
                  (catch Throwable _ nil)))
    :clickhouse (jdbc/execute! admin-spec
                               [(format "DROP DATABASE IF EXISTS %s"
                                        (sql.u/quote-name driver :schema schema))])
    (jdbc/execute! admin-spec
                   [(format "DROP SCHEMA IF EXISTS %s CASCADE"
                            (sql.u/quote-name driver :schema schema))])))

;; `^:synchronized` because `ws/workspace-instance-config` is a process-wide atom;
;; running concurrently with other workspace-mode tests would cross-pollute.
#_{:clj-kondo/ignore [:metabase/i-like-making-cams-eyes-bleed-with-horrifically-long-tests]}
(defn- with-redshift-describe-filter-disabled
  "Redshift test infra normally filters describe-database to only return tables
   prefixed by dataset name (`<dataset>_<name>`). Workspace e2e creates tables
   with non-conforming names (`x_input_table_<run-id>`), so disable the filter
   for the duration of `thunk`. No-op for non-Redshift drivers."
  [thunk]
  (if (= :redshift driver/*driver*)
    (with-bindings* {(requiring-resolve 'metabase.test.data.redshift/*override-describe-database-to-filter-by-db-name?*)
                     false}
      thunk)
    (thunk)))

(deftest ^:synchronized workspace-full-e2e-test
  (mt/test-drivers workspaces-supported-dwh-drivers
    (mt/with-premium-features #{:workspaces}
      ;; todo: apply this just for redshift
      (with-redshift-describe-filter-disabled
        (fn []
          (testing "transform run on a workspaced DB → app db + describe-database stay in the input schema"
            (let [admin-driver driver/*driver*
                  admin-db (mt/db)
                  admin-details (:details admin-db)
                  admin-spec (sql-jdbc.conn/connection-details->spec admin-driver admin-details)
                  run-id (random-suffix)
              ;; All identifiers carry `run-id` — we share a single test DB across
              ;; runs, so any leftover state from a failed run has to be
              ;; distinguishable from this one.
                  main-schema (canonical-schema-name admin-driver run-id admin-details)
              ;; Value Metabase stores in `:model/Table.schema` for synced tables.
              ;; Equals `main-schema` for schema-having drivers; nil for MySQL.
                  tbl-schema  (table-row-schema-value admin-driver main-schema)
                  src-name (str "x_input_table_" run-id)
                  output-table-name (str "x_output_table_" run-id)]
              (try
            ;; --- Setup: DWH main schema + source table ---------------------------
            ;; Schema-creation: most workspace-supported drivers accept `CREATE SCHEMA "<name>"`,
            ;; but MySQL "schemas" are databases — see `canonical-schema-name` for why we
            ;; reuse the bound database there instead of creating a fresh one.
                (create-canonical-schema! admin-driver admin-spec main-schema)
                (create-source-table! admin-driver admin-spec main-schema src-name)
            ;; Diagnostic: confirm the source table exists in the warehouse before we
            ;; lean on Metabase sync to surface it. If this fails, the problem is in
            ;; the test-side DDL, not workspace code.
                (let [warehouse-tables (jdbc/query admin-spec
                                                   [(format "SELECT 1 FROM %s LIMIT 1"
                                                            (qualified-table-sql admin-driver main-schema src-name))])]
                  (is (= 1 (count warehouse-tables))
                      (str "warehouse source table " main-schema "." src-name " is not queryable")))
            ;; --- Setup: pre-existing canonical OUTPUT table with distinct rows ---------
            ;; The workspace transform writes to canonical {schema main-schema, name output-table-name}.
            ;; We seed that table with rows BEFORE the workspace is provisioned so we can
            ;; later verify (a) the workspace's view of the canonical name returns the
            ;; transform's output (via remap), and (b) the canonical warehouse table itself
            ;; was never mutated by the transform - the workspace transform only wrote to
            ;; iso.<derived>, leaving the canonical contents intact.
                (create-output-table! admin-driver admin-spec main-schema output-table-name
                                      [[99 "pre-existing"] [98 "still-pre-existing"]])
            ;; --- Setup: a Metabase Database row attached to the warehouse with admin
            ;; creds. The config-loader path (below) will rewrite its `:details` with
            ;; workspace user creds + schema-filters when `initialize!` runs the
            ;; `:databases` section, mirroring what a child instance does at boot.
                (mt/with-temp [:model/Database ws-db {:engine  admin-driver
                                                      :details admin-details
                                                      :name    (str "ws-e2e-" run-id)}]
                  (let [{ws-id :id} (ws/create-workspace! {:name       (str "ws-e2e-" run-id)
                                                           :creator_id (mt/user->id :crowberto)})]
                    (try
                  ;; --- Stage 1: provision via the workspace provisioning entrypoint.
                  ;; Drives the same `init-workspace-isolation!` + `grant-workspace-read-access!`
                  ;; multimethods, but through `provisioning/provision-single!`, which writes
                  ;; the resulting `:database_details` and `:output_schema` back to the
                  ;; `WorkspaceDatabase` row — the inputs `build-workspace-config` reads.
                      (ws/add-database! ws-id (:id ws-db)
                                        [(workspace-input-namespace admin-driver admin-details main-schema)])
                  ;; Diagnostic: provisioning must have populated :output_schema and flipped
                  ;; status to :provisioned. If empty, the workspace driver impl is broken.
                      (let [wsd (-> (ws/get-workspace ws-id) :databases first)]
                        (is (= :provisioned (:status wsd))
                            "WorkspaceDatabase provisioning did not reach :provisioned status")
                        (is (and (string? (:output_schema wsd))
                                 (seq (:output_schema wsd)))
                            (str "provisioning did not write a non-empty :output_schema (got "
                                 (pr-str (:output_schema wsd)) ")")))
                  ;; --- Stage 2: build the canonical config.yml-shaped map and round-trip
                  ;; through YAML, the same way a child instance receives the file from disk.
                  ;; The round-trip is load-bearing: `build-workspace-config` returns
                  ;; `:engine :postgres` (keyword), but the `:databases` section spec requires
                  ;; a string. `yaml/parse-string` of `yaml/generate-string` collapses keyword
                  ;; values to strings, matching the on-disk wire format.
                      (let [cfg-map  (ws.config/build-workspace-config ws-id)
                            yaml-str (ws.config/config->yaml cfg-map)
                            reparsed (yaml/parse-string yaml-str)
                        ;; Read the provisioned isolation schema name back from the WSD row;
                        ;; `provision-single!` derives it from the WSD id, not the workspace id.
                            wsd      (-> (ws/get-workspace ws-id) :databases first)
                            isolation-schema (:output_schema wsd)]
                    ;; --- Stage 3: bind `*config*` and run the file loader. This invokes
                    ;; `init-from-config-file!` for the `:databases` section (updates the
                    ;; existing Database row with merged workspace creds + schema-filters)
                    ;; and `apply-workspace-section!` for the `:workspace` section (resolves
                    ;; db names → ids and populates `ws/workspace-instance-config`).
                        (binding [advanced-config.file/*config* reparsed]
                          (advanced-config.file/initialize!))
                    ;; Diagnostic: the loader should have populated the in-process workspace
                    ;; atom and rewritten the Database row's :details to workspace-user creds.
                        (is (ws/workspace-mode?)
                            "loader did not put the instance into workspace-mode (atom not populated)")
                    ;; The Database row's `:details` was just rewritten by the loader. Re-read
                    ;; it so `mt/with-db` and the connection pool see the workspace-user creds.
                        (let [ws-db (t2/select-one :model/Database :id (:id ws-db))
                              input-ns-db (when (three-slot-driver? admin-driver) (:db admin-details))]
                          (is (not= (:details admin-db) (:details ws-db))
                              "loader did not rewrite Database :details with workspace-user creds")
                      ;; Regression guard: a colleague caught a pre-fix bug visually by spotting
                      ;; the iso DB name in the YAML's :db slot. Pin it down with an assertion so
                      ;; any future driver that puts :db into :database_details fails here loudly,
                      ;; not 100 lines downstream as "sync produced no rows".
                          (is (= (:db admin-details) (:db (:details ws-db)))
                              (str "loader must preserve canonical :db on the workspace Database. "
                                   "If you see the isolation DB here, a driver's "
                                   "init-workspace-isolation! is putting :db into :database_details, "
                                   "which the workspace config-loader merges over canonical :details "
                                   "and breaks the connection's bound database for sync."))
                          (mt/with-db ws-db
                            (sync/sync-database! ws-db {:scan :schema})
                        ;; Diagnostic: enumerate what sync produced so a missing src-table
                        ;; gives us a useful error instead of `(some? nil)`.
                            (let [synced (->> (t2/select :model/Table :db_id (:id ws-db) :active true)
                                              (map #(select-keys % [:schema :name])))]
                              (is (seq synced)
                                  "sync produced no Table rows at all — connection or schema-filter is wrong")
                              (is (some #(= [tbl-schema src-name] [(:schema %) (:name %)]) synced)
                                  (str "sync did not surface " main-schema "." src-name
                                       " (Table.schema expected " (pr-str tbl-schema) ")"
                                       ". Synced tables: " (pr-str synced))))

                      ;; --- Action: define + run a transform ------------------
                            (let [src-table (t2/select-one :model/Table
                                                           :db_id (:id ws-db)
                                                           :schema tbl-schema
                                                           :name src-name)
                                  _ (is (some? src-table)
                                        "input-schema source table is synced before the transform runs")
                                  mp (mt/metadata-provider)
                                  query (lib/query mp (lib.metadata/table mp (:id src-table)))]
                              (mt/with-temp [:model/Transform transform
                                             {:name   (str "transform-" run-id)
                                              :source {:type :query :query query}
                                        ;; Canonical target — the workspace
                                        ;; transform-hook rewrites `:schema` to
                                        ;; `isolation-schema` before dispatch.
                                              :target {:type   :table
                                                       :schema main-schema
                                                       :name   output-table-name}}]
                                (transforms.execute/execute! transform {:run-method :manual})
                          ;; --- Assertion: app db tables stay in main schema ----
                                (testing "app db Table rows are confined to the input schema"
                                  (let [tables (t2/select :model/Table :db_id (:id ws-db) :active true)
                                        iso-tbl-schema (table-row-schema-value admin-driver isolation-schema)]
                                    (is (some #(and (= tbl-schema (:schema %))
                                                    (= src-name (:name %)))
                                              tables)
                                        "the input-schema source table appears in the app db")
                                    (is (some #(and (= tbl-schema (:schema %))
                                                    (= output-table-name (:name %)))
                                              tables)
                                        "the input-schema output table appears in the app db")
                                    (if (= :mysql admin-driver)
                                  ;; MySQL stores `:schema nil` for every Table row regardless of
                                  ;; which database it lives in, so we can't distinguish input-DB
                                  ;; from isolation-DB rows via `:schema`. Instead probe the
                                  ;; warehouse directly: any tables actually in the isolation DB
                                  ;; should not show up as app-db Table rows under this Database.
                                      (let [iso-warehouse-tables (->> (jdbc/query admin-spec
                                                                                  ["SELECT table_name FROM information_schema.tables WHERE table_schema = ?"
                                                                                   isolation-schema])
                                                                      (map :table_name)
                                                                      set)
                                            leaked (filter #(contains? iso-warehouse-tables (:name %)) tables)]
                                        (is (= [] leaked)
                                            (str "no app-db Table row should point at a table living in the isolation DB " isolation-schema
                                                 " (leaked: " (pr-str (map :name leaked)) ")")))
                                      (is (= [] (filter #(= iso-tbl-schema (:schema %)) (map #(select-keys % [:schema :name]) tables)))
                                          "no app-db Table row points at the isolation schema"))))
                                (testing "A table remapping record exists"
                            ;; `:from_db` is the empty-string sentinel for 2-slot drivers (Postgres,
                            ;; Redshift, ClickHouse) and the connection's bound DB for drivers whose
                            ;; `qualified-name-components` populates `:db` (Snowflake, SQL Server,
                            ;; BigQuery, MySQL).
                            ;;
                            ;; `:to_db` equals `:from_db` for drivers whose iso namespace lives in
                            ;; the SAME DB as canonical (Postgres-family schema-based, Snowflake/SQL
                            ;; Server schema-based). On MySQL the iso namespace is a different
                            ;; DATABASE, so `:to_db` is the iso DB name (= isolation-schema).
                            ;;
                            ;; `:from_schema` is the canonical schema name on schema-having drivers,
                            ;; and the empty-string sentinel on MySQL (no schema layer).
                                  (let [from-schema-stored (if (= :mysql admin-driver) "" main-schema)
                                        to-db-stored      (if (= :mysql admin-driver)
                                                            isolation-schema
                                                            (or input-ns-db ""))
                                        to-schema-stored  (if (= :mysql admin-driver) "" isolation-schema)]
                                    (is (= [{:to_schema       to-schema-stored
                                             :from_schema     from-schema-stored
                                             :from_table_name output-table-name
                                             :from_db         (or input-ns-db "")
                                             :to_db           to-db-stored
                                             :database_id     (:id ws-db)}]
                                           (for [r (t2/select :model/TableRemapping)]
                                             (select-keys r [:to_schema :from_schema :from_table_name :from_db :to_db :database_id]))))))
                          ;; --- Assertion: describe-database stays in main ------
                          ;; describe-database reads JDBC's TABLE_SCHEM into `:schema`. For MySQL
                          ;; that's always null, same as `:model/Table.schema`. Use `tbl-schema`
                          ;; (the per-driver translation we already do for synced rows).
                                (testing "describe-database returns only input-schema tables"
                                  (let [{described :tables} (driver/describe-database admin-driver ws-db)
                                        iso-tbl-schema (table-row-schema-value admin-driver isolation-schema)]
                                    (is (some #(and (= tbl-schema (:schema %))
                                                    (= src-name (:name %)))
                                              described)
                                        "the input-schema source table is described")
                                    (if (= :mysql admin-driver)
                                  ;; On MySQL describe-database only enumerates the connection's
                                  ;; bound DB (`test-data`), so iso-DB tables can't appear here
                                  ;; at all. The assertion is trivially true; we still want SOMETHING
                                  ;; to confirm describe-database isn't returning iso-DB rows
                                  ;; (e.g., via a cross-DB enumeration bug).
                                      (let [iso-warehouse-tables (->> (jdbc/query admin-spec
                                                                                  ["SELECT table_name FROM information_schema.tables WHERE table_schema = ?"
                                                                                   isolation-schema])
                                                                      (map :table_name)
                                                                      set)]
                                        (is (not-any? #(contains? iso-warehouse-tables (:name %)) described)
                                            "no described table should physically live in the isolation DB"))
                                      (is (not-any? #(= iso-tbl-schema (:schema %)) described)
                                          "no isolation-schema table is described"))))
                          ;; --- Assertion: a Card querying the canonical output table ----
                          ;; reads the remapped (isolation-schema) data, not the canonical
                          ;; main-schema table.
                                (let [out-table (t2/select-one :model/Table
                                                               :db_id  (:id ws-db)
                                                               :schema tbl-schema
                                                               :name   output-table-name)
                                      {:keys [to_table_name]} (t2/select-one :model/TableRemapping)]
                                  (is (some? out-table)
                                      "canonical-named output table exists to represent the table that will exist as a result of the new transform running in production")
                              ;; Diagnostic: the Card MBQL query downstream needs Fields on
                              ;; out-table. If sync-table! after the transform run didn't
                              ;; populate them, the QP throws "Table X has no Fields"
                              ;; 100 lines into preprocess. Flag it here instead.
                                  (let [field-count (t2/count :model/Field :table_id (:id out-table) :active true)]
                                    (is (pos? field-count)
                                        (str "out-table Table id=" (:id out-table)
                                             " (schema=" (pr-str (:schema out-table)) " name=" (pr-str (:name out-table)) ")"
                                             " has no Field rows; transform-time sync did not populate columns")))
                                  (mt/with-temp [:model/Card card
                                                 {:name          (str "ws-e2e-card-" run-id)
                                                  :database_id   (:id ws-db)
                                                  :dataset_query {:database (:id ws-db)
                                                                  :type     :query
                                                                  :query    {:source-table (:id out-table)}}}]
                                    (let [rows (set (mt/rows (mt/process-query (:dataset_query card))))]
                                      (testing "card query returns the transform output"
                                        (is (= #{[1 "a"] [2 "b"] [3 "c"]} rows)
                                            "card returns the rows the transform wrote to the isolation schema"))))
                                  (mt/with-temp [:model/Card card
                                                 {:name          (str "ws-e2e-card-native-" run-id)
                                                  :database_id   (:id ws-db)
                                                  :dataset_query {:database (:id ws-db)
                                                                  :type     :native
                                                                  :native   {:query (format "SELECT * FROM %s"
                                                                                            (qualified-table-sql admin-driver
                                                                                                                 isolation-schema
                                                                                                                 to_table_name))}}}]
                                    (let [rows (set (mt/rows (mt/process-query (:dataset_query card))))]
                                      (testing "querying the isolation table directly works like querying any other table"
                                        (is (= #{[1 "a"] [2 "b"] [3 "c"]} rows)))))
                              ;; FIXME: native sql w/ default from-schema fails for now (Bug 2).
                              ;; More info: https://gist.github.com/escherize/721764240c300e995c54add2d71ff356
                                  #_(mt/with-temp [:model/Card card
                                                   {:name          (str "ws-e2e-card-native-" run-id)
                                                    :database_id   (:id ws-db)
                                                    :dataset_query {:database (:id ws-db)
                                                                    :type     :native
                                                                    :native   {:query (format "SELECT * FROM %s"
                                                                                              (sql.u/quote-name admin-driver :table output-table-name))}}}]
                                      (let [rows (try (set (mt/rows (mt/process-query (:dataset_query card))))
                                                      (catch Exception e [::exception-thrown e]))]
                                        (testing "native card query returns the transform output"
                                          (is (= #{[1 "a"] [2 "b"] [3 "c"]} rows)
                                              "native card returns the rows the transform wrote to the isolation schema"))))
                                  (mt/with-temp [:model/Card card
                                                 {:name          (str "ws-e2e-card-native-" run-id)
                                                  :database_id   (:id ws-db)
                                                  :dataset_query {:database (:id ws-db)
                                                                  :type     :native
                                                                  :native   {:query (format "SELECT * FROM %s"
                                                                                            (qualified-table-sql admin-driver
                                                                                                                 main-schema
                                                                                                                 output-table-name))}}}]
                                    (let [rows (set (mt/rows (mt/process-query (:dataset_query card))))]
                                      (testing "native card query returns the transform output"
                                        (is (= #{[1 "a"] [2 "b"] [3 "c"]} rows)
                                            "native card returns the rows the transform wrote to the isolation schema")))))
                            ;; --- Assertion: canonical-table-protection invariant (GHY-3513 item 4) ----
                            ;; Pre-seeded canonical `main_schema.output-table-name` with rows A *before* workspace
                            ;; provisioning (see `create-output-table!` call at the top of the test). The
                            ;; transform writes its output (rows B = src's [1,a],[2,b],[3,c]) to the
                            ;; canonical target name, which the transform-hook redirects to iso.<derived>.
                            ;; The card reads above already verified workspace queries see rows B (remap
                            ;; engaged). What's load-bearing for *this* assertion: the workspace transform
                            ;; must NOT have mutated the canonical warehouse table. Probe it directly via
                            ;; `admin-spec` (bypasses the QP and workspace mode entirely).
                                (testing "the workspace transform does not mutate the canonical warehouse table"
                              ;; jdbc/query returns column names as keywords with case that varies by
                              ;; driver (Postgres lowercases, Snowflake uppercases, etc). Pull values
                              ;; by `vals` after asserting two columns -- avoids fragile per-driver
                              ;; key-case handling.
                                  (let [canonical-rows (->> (jdbc/query admin-spec
                                                                        [(format "SELECT id, v FROM %s ORDER BY id"
                                                                                 (qualified-table-sql admin-driver main-schema output-table-name))])
                                                            (map (fn [row]
                                                                   (let [vs (vals row)]
                                                                     (assert (= 2 (count vs))
                                                                             "expected 2 columns from canonical select")
                                                                     (vec vs))))
                                                            set)]
                                    (is (= #{[99 "pre-existing"] [98 "still-pre-existing"]}
                                           canonical-rows)
                                        "canonical main_schema.output-table-name still has its pre-seeded rows; transform output went to iso.<derived> instead")))
                                (testing "app db Table rows stay confined to the input schema after card run"
                                  (let [tables (t2/select :model/Table :db_id (:id ws-db) :active true)
                                        iso-tbl-schema (table-row-schema-value admin-driver isolation-schema)]
                                    (is (some #(and (= tbl-schema (:schema %))
                                                    (= src-name (:name %)))
                                              tables)
                                        "the input-schema source table appears in the app db")
                                    (if (= :mysql admin-driver)
                                      (let [iso-warehouse-tables (->> (jdbc/query admin-spec
                                                                                  ["SELECT table_name FROM information_schema.tables WHERE table_schema = ?"
                                                                                   isolation-schema])
                                                                      (map :table_name)
                                                                      set)
                                            leaked (filter #(contains? iso-warehouse-tables (:name %)) tables)]
                                        (is (empty? leaked)
                                            (str "no app-db Table row should point at a table in the isolation DB " isolation-schema
                                                 " (leaked: " (pr-str (map :name leaked)) ")")))
                                      (is (= [] (filter #(= iso-tbl-schema (:schema %)) (map #(select-keys % [:schema :name]) tables)))
                                          "no app-db Table row points at the isolation schema")))))))))
                      (finally
                    ;; Clear the in-process workspace atom (populated by `apply-workspace-section!`
                    ;; via `initialize!` above) and tear down the WorkspaceDatabase. The
                    ;; `:databases` initializer rewrote the `Database.details` to the workspace
                    ;; user's creds — but `destroy-workspace-isolation!` needs admin privileges
                    ;; (DROP DATABASE / DROP USER on MySQL, etc), so restore admin details first.
                    ;; `delete-workspace!` then deprovisions any `:provisioned` databases (calls
                    ;; `destroy-workspace-isolation!`) before deleting the row, safe whether
                    ;; provision succeeded fully or partially.
                        (ws/clear-instance-workspace!)
                        (t2/update! :model/Database (:id ws-db) {:details admin-details})
                        ;; Cleanup tries `ws/delete-workspace!` first. If it throws (e.g. on
                        ;; Redshift, `destroy-workspace-isolation!` rolls WSD status back to
                        ;; `:provisioned` if any cleanup statement fails, and `delete-workspace!`
                        ;; refuses with 409), fall back to force-clearing the WSD status so
                        ;; `mt/with-temp Database` cleanup can complete. Real fix for the
                        ;; Redshift destroy fragility is tracked separately.
                        (let [delete-result (try (ws/delete-workspace! ws-id) ::deleted-ok
                                                 (catch Throwable t
                                                   (log/warn t "delete-workspace! failed; force-clearing WSD")
                                                   ::delete-failed))]
                          (when (= ::delete-failed delete-result)
                            (doseq [wsd (t2/select :model/WorkspaceDatabase :workspace_id ws-id)]
                              (t2/update! :model/WorkspaceDatabase :id (:id wsd) {:status :unprovisioned}))
                            (t2/delete! :model/Workspace :id ws-id)))))))
                (finally
                  (try (drop-canonical-schema! admin-driver admin-spec main-schema src-name output-table-name)
                       (catch Throwable _ nil)))))))))))

;; -----------------------------------------------------------------------------
;; Native transform that references a prior MBQL transform's canonical output table.
;;
;; Repro for the user-reported bug: on a workspace-mode child instance, given a
;; Transform A whose target is a canonical `(main_schema, t_a)` (which the
;; transform-hook redirects to iso.<derived>), a *native* Transform B whose SQL
;; references `main_schema.t_a` historically failed at the warehouse with
;; `relation does not exist`. Native transforms bypass the QP middleware
;; pipeline, so Phase 2's `apply-workspace-sql-remapping` never saw their SQL,
;; and the canonical name -- which exists only virtually, backed by the iso
;; copy -- reached the warehouse unrewritten.
;;
;; The fix wires `transforms-base.workspace-hooks/rewrite-native-sql-for-workspace`
;; into `transforms-base.query/run-query-transform!` so native transforms get
;; the same SQL rewrite the QP middleware applies to cards. This test asserts
;; that Transform B succeeds and reads the rows Transform A wrote to the iso
;; copy.
(deftest ^:synchronized native-transform-references-prior-canonical-output-test
  ;; Redshift omitted: `workspace-full-e2e-test` already fails on Redshift because
  ;; `describe-database` returns `{:tables #{}}` for the workspace user even though
  ;; the user has USAGE on the schema and SELECT on the tables (verified directly via
  ;; the same connection pool). The native-transform repro depends on sync seeing the
  ;; source table, so it inherits that failure mode. Investigation pending; unrelated
  ;; to the native-SQL-rewrite hook this test was written to cover.
  (mt/test-drivers #{:postgres :mysql}
    (mt/with-premium-features #{:workspaces}
      (testing "a native transform whose SQL references a prior MBQL transform's canonical target succeeds via the workspace SQL rewriter"
        (let [admin-driver  driver/*driver*
              admin-db      (mt/db)
              admin-details (:details admin-db)
              admin-spec    (sql-jdbc.conn/connection-details->spec admin-driver admin-details)
              run-id        (random-suffix)
              main-schema   (canonical-schema-name admin-driver run-id admin-details)
              tbl-schema    (table-row-schema-value admin-driver main-schema)
              src-name      (str "x_input_" run-id)
              tgt-a-name    (str "t_a_" run-id)
              tgt-b-name    (str "t_b_" run-id)]
          (try
            (create-canonical-schema! admin-driver admin-spec main-schema)
            (create-source-table! admin-driver admin-spec main-schema src-name)
            (mt/with-temp [:model/Database ws-db {:engine  admin-driver
                                                  :details admin-details
                                                  :name    (str "ws-native-repro-" run-id)}]
              (let [{ws-id :id} (ws/create-workspace! {:name       (str "ws-native-repro-" run-id)
                                                       :creator_id (mt/user->id :crowberto)})]
                (try
                  (ws/add-database! ws-id (:id ws-db)
                                    [(workspace-input-namespace admin-driver admin-details main-schema)])
                  (let [cfg-map  (ws.config/build-workspace-config ws-id)
                        yaml-str (ws.config/config->yaml cfg-map)
                        reparsed (yaml/parse-string yaml-str)]
                    (binding [advanced-config.file/*config* reparsed]
                      (advanced-config.file/initialize!))
                    (let [ws-db (t2/select-one :model/Database :id (:id ws-db))]
                      (mt/with-db ws-db
                        (sync/sync-database! ws-db {:scan :schema})
                        (let [src-table (t2/select-one :model/Table
                                                       :db_id  (:id ws-db)
                                                       :schema tbl-schema
                                                       :name   src-name)
                              _         (is (some? src-table) "input source table is synced")
                              mp        (mt/metadata-provider)
                              mbql-q    (lib/query mp (lib.metadata/table mp (:id src-table)))]
                          ;; Transform A: MBQL -> writes to canonical (main_schema, t_a).
                          ;; Hook redirects target to iso.<derived> and records a TableRemapping
                          ;; for the canonical (main_schema, t_a) pair.
                          (mt/with-temp [:model/Transform transform-a
                                         {:name   (str "transform-a-" run-id)
                                          :source {:type :query :query mbql-q}
                                          :target {:type   :table
                                                   :schema main-schema
                                                   :name   tgt-a-name}}]
                            (transforms.execute/execute! transform-a {:run-method :manual})
                            (testing "transform A produced a remap row for its canonical target"
                              (let [{from-db :db from-schema :schema from-table :table}
                                    (ws.table-remapping/spec-for-table
                                     ws-db {:name tgt-a-name :schema main-schema})]
                                (is (some? (t2/select-one :model/TableRemapping
                                                          :database_id     (:id ws-db)
                                                          :from_db         from-db
                                                          :from_schema     from-schema
                                                          :from_table_name from-table))
                                    "MBQL transform A's canonical target became a remap row")))
                            ;; Transform B: native SQL referencing the canonical name of A's
                            ;; output. Pre-fix, this would fail at the warehouse with
                            ;; `relation does not exist`. Post-fix, `rewrite-native-sql-for-workspace`
                            ;; substitutes the iso table name before driver/run-transform!.
                            (let [native-sql (format "SELECT count(*) AS n FROM %s"
                                                     (qualified-table-sql admin-driver main-schema tgt-a-name))]
                              (mt/with-temp [:model/Transform transform-b
                                             {:name   (str "transform-b-" run-id)
                                              :source {:type :query
                                                       :query {:database (:id ws-db)
                                                               :type     :native
                                                               :native   {:query native-sql}}}
                                              :target {:type   :table
                                                       :schema main-schema
                                                       :name   tgt-b-name}}]
                                (testing "native transform B referencing A's canonical output runs without warehouse error"
                                  (let [outcome (try (transforms.execute/execute! transform-b {:run-method :manual})
                                                     :ok
                                                     (catch Throwable t
                                                       [::failed (ex-message t)]))]
                                    (is (= :ok outcome)
                                        (str "native transform B failed; outcome=" (pr-str outcome)))))
                                (testing "B's iso output table contains the count of A's source rows"
                                  ;; Iso namespace lives at `:to_schema` (schema-having drivers) or
                                  ;; `:to_db` (MySQL); pruning empty-string sentinels picks the right one.
                                  (let [{from-db :db from-schema :schema from-table :table}
                                        (ws.table-remapping/spec-for-table
                                         ws-db {:name tgt-b-name :schema main-schema})
                                        b-row (t2/select-one :model/TableRemapping
                                                             :database_id     (:id ws-db)
                                                             :from_db         from-db
                                                             :from_schema     from-schema
                                                             :from_table_name from-table)
                                        b-to-table  (:to_table_name b-row)
                                        b-iso-spec  (ws.table-remapping/prune-no-level
                                                     {:db     (:to_db b-row)
                                                      :schema (:to_schema b-row)})
                                        iso-namespace (or (:schema b-iso-spec) (:db b-iso-spec))
                                        rows (jdbc/query admin-spec
                                                         [(format "SELECT n FROM %s"
                                                                  (qualified-table-sql admin-driver iso-namespace b-to-table))])]
                                    (is (= [{:n 3}] (vec rows))
                                        "B's iso output reflects rewriter routing B's SELECT to A's iso table"))))))))))
                  (finally
                    (ws/clear-instance-workspace!)
                    (t2/update! :model/Database (:id ws-db) {:details admin-details})
                    (try (ws/delete-workspace! ws-id)
                         (catch Throwable t
                           (log/warn t "delete-workspace! failed during native-transform repro cleanup")))))))
            (finally
              (try (drop-canonical-schema! admin-driver admin-spec main-schema src-name tgt-a-name)
                   (catch Throwable _ nil))
              (try (jdbc/execute! admin-spec
                                  [(format "DROP TABLE IF EXISTS %s"
                                           (qualified-table-sql admin-driver main-schema tgt-b-name))])
                   (catch Throwable _ nil)))))))))

(comment
  (workspace-full-e2e-test))
