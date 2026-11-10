(ns metabase-enterprise.advanced-config.file.workspace-test
  (:require
   [clojure.java.io :as io]
   [clojure.spec.alpha :as s]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase-enterprise.advanced-config.file.workspace :as advanced-config.file.workspace]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.test-util :as workspaces.tu]
   [metabase.driver.settings :as driver.settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(use-fixtures :once (fixtures/initialize :db))

(use-fixtures :each
  (fn [thunk]
    ;; Several tests drive a `:workspace` section through `initialize!`, which
    ;; requires the `:workspaces` feature; default it on here. Tests that assert
    ;; the feature's *absence* override with their own `mt/with-premium-features`.
    (mt/with-premium-features #{:workspaces}
      (binding [advanced-config.file/*supported-versions* {:min 1, :max 1}]
        (try
          (thunk)
          (finally
            (ws/clear-instance-workspace!)))))))

(defn- load-fixture-by-driver [driver]
  (-> (str "metabase_enterprise/workspaces/resources/workspace_config_" (name driver) ".yml")
      io/resource slurp yaml/parse-string))

(defn- load-fixture
  "Postgres-shaped fixture used by `fixture-parses-test` and the loader
   round-trip tests. Sibling fixtures for other drivers live in the same
   resources dir (see `per-driver-fixtures-test` below)."
  []
  (load-fixture-by-driver :postgres))

(defn- workspace-section
  "Pull just the `:workspace` section out of the fixture, with the database name
   rewritten to point at the supplied `db-name` (so tests can use whatever DB
   `mt/with-temp` creates rather than depending on the fixture's literal name)."
  [db-name]
  (let [section (-> (load-fixture) :config :workspace)]
    (-> section
        (assoc :databases
               (into {} (map (fn [[_db-name-kw wsd-config]]
                               [(keyword db-name) wsd-config])
                             (:databases section)))))))

(deftest fixture-parses-test
  (testing "the checked-in fixture parses and has the expected top-level shape"
    (let [parsed (load-fixture)]
      (is (= 1 (:version parsed)))
      (is (map? (:config parsed)))
      (is (= "New workspace" (get-in parsed [:config :workspace :name])))
      (testing "workspace.databases is keyed by database name"
        (let [dbs (get-in parsed [:config :workspace :databases])]
          (is (= 1 (count dbs)))
          (let [[_db-name wsd] (first dbs)]
            (is (= ["public"] (:input_schemas wsd)))
            (is (= {:schema "mb__isolation_44490_1933"} (:output wsd)))))))))

(deftest non-blank-string-spec-test
  (testing "::non-blank-string rejects nil, non-strings, and whitespace-only strings,
            and accepts any string with at least one non-whitespace character."
    (let [spec :metabase-enterprise.advanced-config.file.workspace/non-blank-string]
      (doseq [v ["" " " "  " "\t" "\n" "\t \n" nil 42 :foo]]
        (is (not (s/valid? spec v))
            (str "must reject " (pr-str v))))
      (doseq [v ["a" "abc" " a" "a " " a " "non-blank with spaces"]]
        (is (s/valid? spec v)
            (str "must accept " (pr-str v)))))))

(deftest apply-workspace-section-populates-atom-test
  (testing "applying the :workspace section turns workspaces-enabled on and sets the database's database-workspace-schema"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/Database {db-id :id} {:name "ws-test-db" :engine :postgres}]
        (let [section (workspace-section "ws-test-db")
              {:keys [workspace-name database-count]} (advanced-config.file.workspace/apply-workspace-section! section)]
          (is (= "New workspace" workspace-name))
          (is (= 1 database-count))
          (testing "the settings hold the translated config; :name and :input_schemas are dropped"
            (is (= {:workspace-id nil
                    :parent-url   nil
                    :databases    {db-id "mb__isolation_44490_1933"}}
                   (ws/instance-workspace)))))))))

(deftest apply-workspace-section-sets-parent-identity-test
  (testing "the section's :id and :parent_url become the parent identity, and a later boot without them clears it"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/Database {db-id :id} {:name "ws-test-db" :engine :postgres}]
        (let [section (workspace-section "ws-test-db")]
          (is (s/valid? ::advanced-config.file.workspace/config-file-spec
                        (assoc section :id 42 :parent_url "https://parent.example.com")))
          (advanced-config.file.workspace/apply-workspace-section!
           (assoc section :id 42 :parent_url "https://parent.example.com"))
          (is (= {:workspace-id 42
                  :parent-url   "https://parent.example.com"
                  :databases    {db-id "mb__isolation_44490_1933"}}
                 (ws/instance-workspace)))
          (advanced-config.file.workspace/apply-workspace-section! section)
          (is (= {:workspace-id nil
                  :parent-url   nil
                  :databases    {db-id "mb__isolation_44490_1933"}}
                 (ws/instance-workspace))))))))

(deftest re-apply-replaces-atom-test
  (testing "re-applying with a different config replaces the setting — no mismatch detection, file is the truth"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/Database _               {:name "ws-test-db" :engine :postgres}
                     :model/Database {db-2-id :id}  {:name "ws-test-db-2" :engine :postgres}]
        (let [section-1 (workspace-section "ws-test-db")
              section-2 (assoc section-1
                               :name "Renamed Workspace"
                               :databases {:ws-test-db-2 {:input_schemas ["public"]
                                                          :output        {:schema "different_schema"}}})]
          (advanced-config.file.workspace/apply-workspace-section! section-1)
          (advanced-config.file.workspace/apply-workspace-section! section-2)
          (is (= {:workspace-id nil
                  :parent-url   nil
                  :databases    {db-2-id "different_schema"}}
                 (ws/instance-workspace))
              "settings reflect the new config, and the first database's schema is cleared"))))))

(deftest unknown-database-name-throws-test
  (testing "referencing a database that doesn't exist in app-db throws ex-info"
    (mt/with-empty-h2-app-db!
      (is (thrown-with-msg?
           ExceptionInfo
           #"Workspace config references unknown database"
           (advanced-config.file.workspace/apply-workspace-section!
            (workspace-section "nonexistent-db")))))))

(deftest db-workspace-namespace-resolves-after-loading-test
  (testing "after loading, db-workspace-namespace returns the configured output namespace"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/Database {db-id :id} {:name "ws-test-db" :engine :postgres}]
        (advanced-config.file.workspace/apply-workspace-section!
         (workspace-section "ws-test-db"))
        (is (= {:schema "mb__isolation_44490_1933"} (ws/db-workspace-namespace db-id)))))))

(deftest db-workspace-namespace-returns-nil-when-no-load-test
  (testing "without a config.yml load, db-workspace-namespace returns nil — manager-side rows are not consulted"
    ;; The setting is cleared in the use-fixtures :each tear-down, so this confirms
    ;; the read truly comes from the setting and not from any leftover rows.
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/Database {db-id :id} {:name "ws-test-db" :engine :postgres}]
        (is (nil? (ws/db-workspace-namespace db-id)))))))

(deftest oss-rejects-workspace-section-without-premium-token-test
  (testing "OSS instances need the :config-text-file token to load a :workspace section (no special bring-up carve-out)"
    (mt/with-empty-h2-app-db!
      (mt/with-premium-features #{}
        (mt/with-temp [:model/Database _ {:name "ws-test-db" :engine :postgres}]
          (is (thrown-with-msg?
               ExceptionInfo
               #"Premium token with the :config-text-file feature"
               (advanced-config.file/initialize!
                {:version 1
                 :config {:workspace (workspace-section "ws-test-db")}}))))))))

(deftest oss-rejects-non-settings-sections-without-premium-token-test
  (testing "OSS instances always need the :config-text-file token for non-:settings sections"
    (mt/with-empty-h2-app-db!
      (mt/with-premium-features #{}
        (is (thrown-with-msg?
             ExceptionInfo
             #"Premium token with the :config-text-file feature"
             (advanced-config.file/initialize!
              {:version 1
               :config {:users [{:first_name "X" :last_name "Y"
                                 :email "x@example.com" :password "pw"}]}})))))))

(deftest workspace-section-requires-workspaces-feature-test
  (testing ":workspace section needs the :workspaces feature in addition to :config-text-file"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/Database _ {:name "ws-test-db" :engine :postgres}]
        (mt/with-premium-features #{:config-text-file}
          (is (thrown-with-msg?
               ExceptionInfo
               #"Workspaces is a paid feature"
               (advanced-config.file/initialize!
                {:version 1
                 :config {:workspace (workspace-section "ws-test-db")}}))))))))

(deftest workspace-section-loads-with-workspaces-feature-test
  (testing ":workspace section loads cleanly when both :config-text-file and :workspaces are present"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/Database {db-id :id} {:name "ws-test-db" :engine :postgres}]
        (mt/with-premium-features #{:config-text-file :workspaces}
          (advanced-config.file/initialize!
           {:version 1
            :config {:workspace (workspace-section "ws-test-db")}})
          (is (true? (ws/workspace-mode?))
              "the workspace section should have been applied")
          (is (= {:schema "mb__isolation_44490_1933"}
                 (ws/db-workspace-namespace db-id))))))))

(deftest workspaces-gate-is-scoped-to-workspace-section-test
  (testing "without :workspaces, other non-:workspace sections still load (gate is :workspace-scoped)"
    (mt/with-empty-h2-app-db!
      (mt/with-premium-features #{:config-text-file}
        (advanced-config.file/initialize!
         {:version 1
          :config {:users [{:first_name "X" :last_name "Y"
                            :email "x@example.com" :password "pw"}]}})
        (is (nil? (ws/instance-workspace))
            "no workspace section means no workspace state was set")))))

;;; ----------------------------------------- per-driver shapes -----------------------------------------
;;;
;;; Drivers with different cardinalities should round-trip through the wire format
;;; without modification.

(deftest mysql-cardinality-upgrade-section-test
  (testing "MySQL workspace: only `:db` slot is populated in the setting (no schema layer)"
    (testing "loader stores MySQL output namespace in the :db slot"
      (mt/with-empty-h2-app-db!
        (mt/with-temp [:model/Database {db-id :id} {:name "mysql-prod" :engine :mysql :details {:db "prod_db"}}]
          (advanced-config.file.workspace/apply-workspace-section!
           {:name "ws"
            :databases {:mysql-prod {:input_schemas ["prod_db"]
                                     :output        {:db "ws_alice"}}}})
          (is (= {:db "ws_alice"} (ws/db-workspace-namespace db-id))))))))

(deftest bigquery-3-slot-section-test
  (testing "BigQuery workspace: project + dataset in the :output map"
    ;; db-workspace-namespace expands the stored schema through the driver, so it needs
    ;; the driver on the classpath.
    (when (workspaces.tu/driver-loadable? :bigquery-cloud-sdk)
      (mt/with-empty-h2-app-db!
        (mt/with-temp [:model/Database {db-id :id} {:name "bq-prod" :engine :bigquery-cloud-sdk :details {:project-id "metabase-prod"}}]
          (advanced-config.file.workspace/apply-workspace-section!
           {:name "ws"
            :databases {:bq-prod {:input_schemas ["core"]
                                  :output        {:db "metabase-prod" :schema "ws_alice"}}}})
          (is (= {:db "metabase-prod" :schema "ws_alice"} (ws/db-workspace-namespace db-id))))))))

;;; ----------------------------------------- per-driver YAML fixtures -----------------------------------------
;;;
;;; The `resources/workspace_config_<driver>.yml` files are reference fixtures
;;; - one per driver shape. They double as documentation (each is a complete
;;; valid `config.yml` showing the per-driver wire format) and as test data.
;;; This test parametrizes over all of them, asserting:
;;;
;;;   - the YAML parses
;;;   - the `:workspace` section validates against the spec
;;;   - the loader round-trips it into the setting with the per-driver expected
;;;     output namespace
;;;
;;; If a driver's wire format drifts, the corresponding fixture and this test
;;; both have to be updated together - keeps doc and code aligned.

(def ^:private per-driver-fixture-expectations
  "Per-driver fixture metadata: db-name + engine + connection details from the fixture,
   the wire-shape `:input_schemas`, and the `:output` map (already expanded in the
   YAML since `workspaces.config/build-workspace-config` emits the runtime shape
   directly)."
  {:postgres   {:db-name        "test-data (postgres)"
                :engine         :postgres
                :details        {}
                :input_schemas  ["public"]
                :output         {:schema "mb__isolation_44490_1933"}}
   :redshift   {:db-name        "test-data (redshift)"
                :engine         :redshift
                :details        {}
                :input_schemas  ["public"]
                :output         {:schema "mb__isolation_44490_1933"}}
   :mysql      {:db-name        "test-data (mysql)"
                :engine         :mysql
                :details        {:db "prod_db"}
                :input_schemas  ["prod_db"]
                :output         {:db "ws_alice"}}
   :clickhouse {:db-name        "test-data (clickhouse)"
                :engine         :clickhouse
                :details        {}
                :input_schemas  ["prod_events"]
                :output         {:schema "ws_alice"}}
   :sqlserver  {:db-name        "test-data (sqlserver)"
                :engine         :sqlserver
                :details        {:db "AnalyticsDB"}
                :input_schemas  ["dbo"]
                :output         {:db "AnalyticsDB" :schema "ws_alice"}}
   :bigquery   {:db-name        "test-data (bigquery)"
                :engine         :bigquery-cloud-sdk
                :details        {:project-id "metabase-prod"}
                :input_schemas  ["core"]
                :output         {:db "metabase-prod" :schema "ws_alice"}}})

(deftest per-driver-fixtures-parse-and-validate-test
  (testing "Each per-driver fixture YAML parses, has the expected workspace section, and round-trips through the loader"
    (doseq [[driver expectations] per-driver-fixture-expectations]
      (testing (str driver " fixture")
        (let [parsed  (load-fixture-by-driver driver)
              section (get-in parsed [:config :workspace])
              wsd     (-> section :databases vals first)]
          (testing "parses to the expected wire shape"
            (is (= 1 (:version parsed)))
            (is (= "New workspace" (:name section)))
            (is (= (:input_schemas expectations) (:input_schemas wsd))
                (str driver " input_schemas matches expectation"))
            (is (= (:output expectations) (:output wsd))
                (str driver " :output matches expectation")))
          (testing "validates against the workspace section spec"
            (is (true? (s/valid? :metabase-enterprise.advanced-config.file.workspace/config-file-spec section))
                (str driver " fixture must satisfy the section spec")))
          ;; db-workspace-namespace expands the stored schema through the driver, so this
          ;; part needs the driver on the classpath.
          (when (workspaces.tu/driver-loadable? (:engine expectations))
            (testing "round-trips through apply-workspace-section! into the settings"
              (mt/with-empty-h2-app-db!
                (mt/with-temp [:model/Database {db-id :id} {:name    (:db-name expectations)
                                                            :engine  (:engine expectations)
                                                            :details (:details expectations)}]
                  (advanced-config.file.workspace/apply-workspace-section! section)
                  (is (= (:output expectations) (ws/db-workspace-namespace db-id))
                      (str driver " setting output matches fixture")))))))))))

;;; ----------------------------------------- settings form ----------------------------------------
;;;
;;; The same state as the `:workspace` section, as ordinary settings: `workspaces-enabled`
;;; in the `:settings` section and `database-workspace-schema` in a database's `:settings`.

(deftest settings-form-makes-instance-a-workspace-test
  (testing "settings.workspaces-enabled plus databases[].settings.database-workspace-schema, with no :workspace section"
    (mt/with-empty-h2-app-db!
      (mt/with-premium-features #{:config-text-file :workspaces}
        (advanced-config.file/initialize!
         {:version 1
          :config  {:settings  {:workspaces-enabled true}
                    :databases [{:name     "ws-settings-db"
                                 :engine   "postgres"
                                 :details  {}
                                 :is_stub  true
                                 :settings {:database-workspace-schema "ws_alice"}}]}})
        (let [db-id (t2/select-one-pk :model/Database :name "ws-settings-db")]
          (is (true? (ws/workspace-mode?)))
          (is (= {:schema "ws_alice"} (ws/db-workspace-namespace db-id))))))))

(deftest databases-section-schema-change-deletes-remappings-test
  (testing "databases[].settings changing database-workspace-schema of an existing database deletes its remap rows"
    (binding [driver.settings/*allow-testing-h2-connections* true]
      (mt/with-premium-features #{:config-text-file :workspaces}
        (mt/with-temporary-setting-values [config-from-file-sync-databases false]
          (mt/with-temp [:model/Database {db-id :id db-name :name} {:engine :h2 :details (:details (mt/db))}]
            (workspaces.tu/with-workspace-db! db-id "ws_old"
              (fn []
                (t2/insert! :model/TableRemapping {:database_id db-id :from_db "" :from_schema "PUBLIC" :from_table_name "VENUES"
                                                   :to_db "" :to_schema "ws_old" :to_table_name "PUBLIC__VENUES"})
                (let [initialize! (fn [schema]
                                    (advanced-config.file/initialize!
                                     {:version 1
                                      :config  {:databases [{:name     db-name
                                                             :engine   "h2"
                                                             :details  (:details (mt/db))
                                                             :settings {:database-workspace-schema schema}}]}}))]
                  (testing "unchanged schema keeps the rows"
                    (initialize! "ws_old")
                    (is (= 1 (t2/count :model/TableRemapping :database_id db-id))))
                  (testing "changed schema deletes them"
                    (initialize! "ws_new")
                    (is (zero? (t2/count :model/TableRemapping :database_id db-id)))))))))))))
