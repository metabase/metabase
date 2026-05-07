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
   [clojure.walk :as walk]
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase-enterprise.workspaces.core :as ws]
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

(defn- ordered->plain
  "snakeyaml's parsed maps are ordered/lazy; re-walk into plain Clojure maps so
   `(is (= …))` failure output prints readably."
  [x]
  (walk/postwalk (fn [form] (if (map? form) (into {} form) form)) x))

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

;; `^:synchronized` because `ws/workspace-instance-config` is a process-wide atom;
;; running concurrently with other workspace-mode tests would cross-pollute.
(deftest ^:synchronized workspace-full-e2e-test
  (mt/test-drivers workspaces-supported-dwh-drivers
    (mt/with-premium-features #{:workspaces}
      (testing "transform run on a workspaced DB → app db + describe-database stay in the input schema"
        (let [admin-driver driver/*driver*
              admin-db (mt/db)
              admin-details (:details admin-db)
              admin-spec (sql-jdbc.conn/connection-details->spec admin-driver admin-details)
              run-id (random-suffix)
              ;; All identifiers carry `run-id` — we share a single test DB across
              ;; runs, so any leftover state from a failed run has to be
              ;; distinguishable from this one.
              main-schema (str "canonical_schema_" run-id)
              src-name (str "x_input_table_" run-id)
              tgt-name (str "x_output_table_" run-id)]
          (try
            ;; --- Setup: DWH main schema + source table ---------------------------
            ;; Schema-creation: most workspace-supported drivers accept `CREATE SCHEMA "<name>"`,
            ;; but MySQL/ClickHouse "schemas" are databases (different DDL) and SQL Server
            ;; uses brackets. Quote via `sql.u/quote-name` for dialect-correct identifiers;
            ;; leave the verb alone since `CREATE SCHEMA` is portable enough across the
            ;; in-scope drivers. (BigQuery is excluded entirely - see workspaces-supported-dwh-drivers.)
            (jdbc/execute! admin-spec [(format "CREATE SCHEMA %s"
                                               (sql.u/quote-name admin-driver :schema main-schema))])
            (create-source-table! admin-driver admin-spec main-schema src-name)
            ;; --- Setup: pre-existing canonical OUTPUT table with distinct rows ---------
            ;; The workspace transform writes to canonical {schema main-schema, name tgt-name}.
            ;; We seed that table with rows BEFORE the workspace is provisioned so we can
            ;; later verify (a) the workspace's view of the canonical name returns the
            ;; transform's output (via remap), and (b) the canonical warehouse table itself
            ;; was never mutated by the transform - the workspace transform only wrote to
            ;; iso.<derived>, leaving the canonical contents intact.
            (create-output-table! admin-driver admin-spec main-schema tgt-name
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
                  (ws/add-database! ws-id (:id ws-db) [main-schema])
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
                    (is (= :fail (ordered->plain reparsed)))
                    (binding [advanced-config.file/*config* reparsed]
                      (advanced-config.file/initialize!))
                    ;; The Database row's `:details` was just rewritten by the loader. Re-read
                    ;; it so `mt/with-db` and the connection pool see the workspace-user creds.
                    (let [ws-db (t2/select-one :model/Database :id (:id ws-db))
                          input-ns-db (when (three-slot-driver? admin-driver) (:db admin-details))]
                      (mt/with-db ws-db
                        (sync/sync-database! ws-db {:scan :schema})

                      ;; --- Action: define + run a transform ------------------
                        (is (= :fail [main-schema src-name (:id ws-db) ws-db]))
                        (is (= :fail (t2/select :model/Table :db_id (:id ws-db))))
                        (let [src-table (t2/select-one :model/Table
                                                       :db_id (:id ws-db)
                                                       :schema main-schema
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
                                                   :name   tgt-name}}]
                            (transforms.execute/execute! transform {:run-method :manual})
                          ;; --- Assertion: app db tables stay in main schema ----
                            (testing "app db Table rows are confined to the input schema"
                              (let [tables (t2/select :model/Table :db_id (:id ws-db) :active true)]
                                (is (some #(and (= main-schema (:schema %))
                                                (= src-name (:name %)))
                                          tables)
                                    "the input-schema source table appears in the app db")
                                (is (some #(and (= main-schema (:schema %))
                                                (= tgt-name (:name %)))
                                          tables)
                                    "the input-schema output table appears in the app db")
                                (is (= [] (filter #(= isolation-schema (:schema %)) (map #(select-keys % [:schema :name]) tables)))
                                    "no app-db Table row points at the isolation schema")))
                            (testing "A table remapping record exists"
                            ;; `:from_db` is the empty-string sentinel for 2-slot drivers (Postgres,
                            ;; MySQL, Redshift, ClickHouse) and the connection's db for 3-slot
                            ;; drivers (Snowflake, SQL Server). `:to_db` mirrors `:from_db` here
                            ;; because the workspace's isolation schema lives in the same db.
                              (is (= [{:to_schema       isolation-schema
                                       :from_schema     main-schema
                                       :from_table_name tgt-name
                                       :from_db         (or input-ns-db "")
                                       :to_db           (or input-ns-db "")
                                       :database_id     (:id ws-db)}]
                                     (for [r (t2/select :model/TableRemapping)]
                                       (select-keys r [:to_schema :from_schema :from_table_name :from_db :to_db :database_id])))))
                          ;; --- Assertion: describe-database stays in main ------
                            (testing "describe-database returns only input-schema tables"
                              (let [{described :tables} (driver/describe-database admin-driver ws-db)]
                                (is (some #(and (= main-schema (:schema %))
                                                (= src-name (:name %)))
                                          described)
                                    "the input-schema source table is described")
                                (is (not-any? #(= isolation-schema (:schema %)) described)
                                    "no isolation-schema table is described")))
                          ;; --- Assertion: a Card querying the canonical output table ----
                          ;; reads the remapped (isolation-schema) data, not the canonical
                          ;; main-schema table.
                            (let [out-table (t2/select-one :model/Table
                                                           :db_id  (:id ws-db)
                                                           :schema main-schema
                                                           :name   tgt-name)
                                  {:keys [to_table_name]} (t2/select-one :model/TableRemapping)]
                              (is (some? out-table)
                                  "canonical-named output table exists to represent the table that will exist as a result of the new transform running in production")
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
                                                                                          (sql.u/quote-name admin-driver :table tgt-name))}}}]
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
                                                                                                             tgt-name))}}}]
                                (let [rows (set (mt/rows (mt/process-query (:dataset_query card))))]
                                  (testing "native card query returns the transform output"
                                    (is (= #{[1 "a"] [2 "b"] [3 "c"]} rows)
                                        "native card returns the rows the transform wrote to the isolation schema")))))
                            ;; --- Assertion: canonical-table-protection invariant (GHY-3513 item 4) ----
                            ;; Pre-seeded canonical `main_schema.tgt-name` with rows A *before* workspace
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
                                                                             (qualified-table-sql admin-driver main-schema tgt-name))])
                                                        (map (fn [row]
                                                               (let [vs (vals row)]
                                                                 (assert (= 2 (count vs))
                                                                         "expected 2 columns from canonical select")
                                                                 (vec vs))))
                                                        set)]
                                (is (= #{[99 "pre-existing"] [98 "still-pre-existing"]}
                                       canonical-rows)
                                    "canonical main_schema.tgt-name still has its pre-seeded rows; transform output went to iso.<derived> instead")))
                            (testing "app db Table rows stay confined to the input schema after card run"
                              (let [tables (t2/select :model/Table :db_id (:id ws-db) :active true)]
                                (is (some #(and (= main-schema (:schema %))
                                                (= src-name (:name %)))
                                          tables)
                                    "the input-schema source table appears in the app db")
                                (is (= [] (filter #(= isolation-schema (:schema %)) (map #(select-keys % [:schema :name]) tables)))
                                    "no app-db Table row points at the isolation schema"))))))))
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
                    (try (ws/delete-workspace! ws-id)
                         (catch Throwable t
                           (log/warn t "delete-workspace! failed during e2e cleanup")))))))
            (finally
              (try (jdbc/execute! admin-spec [(format "DROP SCHEMA IF EXISTS %s CASCADE"
                                                      (sql.u/quote-name admin-driver :schema main-schema))])
                   (catch Throwable _ nil)))))))))

(comment
  (workspace-full-e2e-test))

; Start of dev workflow
; Case 1:
; In canonical schema, No transforms exist, no transform output tables exist
; Start dev workflow, create transform, create transform output table in isolation schema, finish development, push to production
; Case 2:
; In canonical schema, transform exists, transform output table exists
; Start dev workflow, modify transform, create tranform output table in isolation schema, finish dev, push to prod
; Case 3:
; In canonical schema, no transforms exist, no output tables exist
; Start dev workflow, create transform, create transform output table. Asshole coworker starts dev concurrently, uses your same output table name, creates that table in canonical schema.
; Case 4:
; In canonical schema, transform exists, output table exists
; Start dev workflow, modify transform, create tx output table in iso schema. Tranform output table gets deleted in canonical schema.
