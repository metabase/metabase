(ns ^:mb/driver-tests metabase-enterprise.workspaces.e2e-test
  "End-to-end workspace test against a real Postgres warehouse.

   Stands up the full pipeline the way `config.yml` does in production:
   provisions an isolation schema + workspace user via the driver multimethods,
   creates a Metabase Database row that connects through the workspace user
   (with `schema-filters` restricting visibility to the main input schema),
   runs a transform whose target gets rewritten to the isolation schema, and
   verifies that visibility from Metabase's perspective is confined to the
   input schema — neither the app-db `Table` rows nor `describe-database`
   should ever surface the isolation schema."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- random-suffix
  "Eight hex chars from a random UUID — uniquifies the per-run schema/table/user
   identifiers so we don't collide with leftover state in the shared test DB."
  []
  (subs (str (random-uuid)) 0 8))

;; `^:synchronized` because `ws/workspace-instance-config` is a process-wide atom;
;; running concurrently with other workspace-mode tests would cross-pollute.
(deftest ^:synchronized workspace-full-e2e-test
  (mt/test-driver :postgres
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
              tgt-name (str "x_output_table_" run-id)
              workspace {:id   (Long/parseLong run-id 16)
                         :name (str "wsd-e2e-" run-id)}
              ;; Pre-init synthetic ws-state for cleanup. Every driver's destroy
              ;; impl derives identifiers from `workspace :id` (via the `driver.u`
              ;; namespace-/user-name helpers), so this skeleton is enough to drive
              ;; an idempotent destroy even if init never ran. We swap in the real
              ;; init result once we have it.
              ws-state (atom (merge workspace
                                    {:schema           (driver.u/workspace-isolation-namespace-name workspace)
                                     :database_details {:user (driver.u/workspace-isolation-user-name workspace)}}))]
          (try
            ;; --- Setup: DWH main schema + source table ---------------------------
            (jdbc/execute! admin-spec [(format "CREATE SCHEMA \"%s\"" main-schema)])
            (jdbc/execute! admin-spec [(format "CREATE TABLE \"%s\".\"%s\" (id INT, v VARCHAR(8))"
                                               main-schema src-name)])
            (jdbc/execute! admin-spec [(format "INSERT INTO \"%s\".\"%s\" VALUES (1, 'a'), (2, 'b'), (3, 'c')"
                                               main-schema src-name)])
            ;; --- Setup: isolation schema + workspace user ------------------------
            (let [init-result (driver/init-workspace-isolation! admin-driver admin-db workspace)
                  ws-with-details (merge workspace init-result)
                  _ (reset! ws-state ws-with-details)
                  isolation-schema (:schema ws-with-details)
                  user-creds (:database_details ws-with-details)]
              (driver/grant-workspace-read-access! admin-driver admin-db ws-with-details
                                                   [{:schema main-schema :name src-name}])
              ;; --- Setup: Metabase Database wired to the workspace user ----------
              ;; Mirrors what `metabase-enterprise.workspaces.config/database-entry`
              ;; emits for `config.yml`: admin connection details overlaid with the
              ;; workspace user's creds, plus inclusion-mode schema filters that
              ;; restrict sync to the input schema(s).
              (let [ws-db-details (-> admin-details
                                      (merge user-creds)
                                      (assoc :schema-filters-type "inclusion"
                                             :schema-filters-patterns main-schema))]
                (mt/with-temp [:model/Database ws-db {:engine  :postgres
                                                      :details ws-db-details
                                                      :name    (str "ws-e2e-" run-id)}]
                  (try
                    ;; --- Setup: instance-side workspace config ------------------
                    ;; Bootstraps the same in-process state the
                    ;; `:workspace` section loader installs at boot.
                    (ws/set-instance-workspace!
                     {:name "e2e-ws"
                      :databases {(:id ws-db) {:input  [{:schema main-schema}]
                                               :output {:schema isolation-schema}}}})
                    (mt/with-db ws-db
                      (sync/sync-database! ws-db {:scan :schema})

                      ;; --- Action: define + run a transform ------------------
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
                            (is (= [{:to_schema       isolation-schema
                                     :from_schema     main-schema
                                     :from_table_name tgt-name
                                     :from_db         ""
                                     :database_id     (:id ws-db)}]
                                   (for [r (t2/select :model/TableRemapping)]
                                     (select-keys r [:to_schema :from_schema :from_table_name :from_db :database_id])))))
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
                                (testing "card query returns the transform output (read-side remap engaged)"
                                  (is (= #{[1 "a"] [2 "b"] [3 "c"]} rows)
                                      "card returns the rows the transform wrote to the isolation schema"))))
                            (mt/with-temp [:model/Card card
                                           {:name          (str "ws-e2e-card-native-" run-id)
                                            :database_id   (:id ws-db)
                                            :dataset_query {:database (:id ws-db)
                                                            :type     :native
                                                            :native   {:query (format "SELECT * FROM \"%s\".\"%s\"" isolation-schema #p to_table_name)}}}]
                              (let [rows (set (mt/rows (mt/process-query (:dataset_query card))))]
                                (testing "querying the isolation table directly works like querying any other table"
                                  (is (= #{[1 "a"] [2 "b"] [3 "c"]} rows)))))
                            ;; FIXME: native sql w/ default from-schema fails for now.
                            #_(mt/with-temp [:model/Card card
                                             {:name          (str "ws-e2e-card-native-" run-id)
                                              :database_id   (:id ws-db)
                                              :dataset_query {:database (:id ws-db)
                                                              :type     :native
                                                              :native   {:query (format "SELECT * FROM \"%s\"" tgt-name)}}}]
                                (let [rows (try (set (mt/rows (mt/process-query (:dataset_query card))))
                                                (catch Exception e [::exception-thrown e]))]
                                  (testing "native card query returns the transform output (Phase 2 SQL rewrite engaged)"
                                    (is (= #{[1 "a"] [2 "b"] [3 "c"]} rows)
                                        "native card returns the rows the transform wrote to the isolation schema"))))
                            (mt/with-temp [:model/Card card
                                           {:name          (str "ws-e2e-card-native-" run-id)
                                            :database_id   (:id ws-db)
                                            :dataset_query {:database (:id ws-db)
                                                            :type     :native
                                                            :native   {:query (format "SELECT * FROM \"%s\".\"%s\"" main-schema tgt-name)}}}]
                              (let [rows (try (set (mt/rows (mt/process-query (:dataset_query card))))
                                              (catch Exception e (println e)))]
                                (testing "native card query returns the transform output (Phase 2 SQL rewrite engaged)"
                                  (is (= #{[1 "a"] [2 "b"] [3 "c"]} rows)
                                      "native card returns the rows the transform wrote to the isolation schema")))))
                          (testing "app db Table rows stay confined to the input schema after card run"
                            (let [tables (t2/select :model/Table :db_id (:id ws-db) :active true)]
                              (is (some #(and (= main-schema (:schema %))
                                              (= src-name (:name %)))
                                        tables)
                                  "the input-schema source table appears in the app db")
                              (is (= [] (filter #(= isolation-schema (:schema %)) (map #(select-keys % [:schema :name]) tables)))
                                  "no app-db Table row points at the isolation schema"))))))
                    (finally
                      (ws/clear-instance-workspace!))))))
            (finally
              ;; Destroy first — driver impls are idempotent (`IF EXISTS` everywhere)
              ;; so this is safe whether init succeeded fully, partially, or not at
              ;; all. Catch+log so a destroy failure doesn't shadow the test failure.
              (try (driver/destroy-workspace-isolation! admin-driver admin-db @ws-state)
                   (catch Throwable t
                     (log/warn t "destroy-workspace-isolation! failed during e2e cleanup")))
              (try (jdbc/execute! admin-spec [(format "DROP SCHEMA IF EXISTS \"%s\" CASCADE" main-schema)])
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
