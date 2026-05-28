(ns metabase-enterprise.advanced-config.file.workspace-test
  "Tests that exercise loading the `instance-workspace` setting via the
   advanced-config-file `:settings` section. The workspace value used to be its
   own `:workspace` section with its own loader; both have been retired in favor
   of going through the standard settings pipeline."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.yaml :as yaml])
  (:import
   (clojure.lang ExceptionInfo)))

(use-fixtures :once (fixtures/initialize :db))

(use-fixtures :each
  (fn [thunk]
    (binding [advanced-config.file/*supported-versions* {:min 1, :max 1}]
      (mt/with-premium-features #{:workspaces}
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

(defn- workspace-setting-value
  "Pull just the `instance-workspace` setting value out of the fixture, with the
   database name rewritten to point at the supplied `db-name`."
  [db-name]
  (let [ws-value (-> (load-fixture) :config :settings :instance-workspace)]
    (assoc ws-value :databases
           (into {} (map (fn [[_db-name-kw wsd-config]]
                           [(keyword db-name) wsd-config])
                         (:databases ws-value))))))

(deftest fixture-parses-test
  (testing "the checked-in fixture parses and has the expected top-level shape"
    (let [parsed (load-fixture)]
      (is (= 1 (:version parsed)))
      (is (map? (:config parsed)))
      (let [ws-value (get-in parsed [:config :settings :instance-workspace])]
        (is (= "New workspace" (:name ws-value)))
        (testing "instance-workspace setting value is keyed by database name"
          (let [dbs (:databases ws-value)]
            (is (= 1 (count dbs)))
            (let [[_db-name wsd] (first dbs)]
              (is (= ["public"] (:input_schemas wsd)))
              (is (= {:schema "mb__isolation_44490_1933"} (:output wsd))))))))))

(deftest applying-settings-section-populates-setting-test
  (testing "applying the :settings section stores the instance-workspace value in the setting (raw, name-keyed)"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/Database _ {:name "ws-test-db" :engine :postgres}]
        (advanced-config.file/initialize!
         {:version 1
          :config {:settings {:instance-workspace (workspace-setting-value "ws-test-db")}}})
        (let [stored (ws/instance-workspace)]
          (is (= "New workspace" (:name stored)))
          (testing "raw setting is keyed by db NAME (matches YAML)"
            (is (= ["public"]
                   (get-in stored [:databases "ws-test-db" :input_schemas])))
            (is (= {:schema "mb__isolation_44490_1933"}
                   (get-in stored [:databases "ws-test-db" :output])))))))))

(deftest re-apply-replaces-setting-test
  (testing "re-applying replaces the prior setting value — config file is the truth"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/Database _ {:name "ws-test-db" :engine :postgres}
                     :model/Database _ {:name "ws-test-db-2" :engine :postgres}]
        (let [section-1 (workspace-setting-value "ws-test-db")
              section-2 {:name      "Renamed Workspace"
                         :databases {:ws-test-db-2 {:input_schemas ["public"]
                                                    :output        {:schema "different_schema"}}}}]
          (advanced-config.file/initialize! {:version 1 :config {:settings {:instance-workspace section-1}}})
          (is (= "New workspace" (:name (ws/instance-workspace))))
          (advanced-config.file/initialize! {:version 1 :config {:settings {:instance-workspace section-2}}})
          (is (= "Renamed Workspace" (:name (ws/instance-workspace))))
          (is (= 1 (count (:databases (ws/instance-workspace)))))
          (is (= {:schema "different_schema"}
                 (->> (ws/instance-workspace) :databases vals first :output))
              "setting reflects the new config, not the old one"))))))

(deftest invalid-shape-throws-test
  (testing "the setter validates the incoming value against the schema"
    (mt/with-empty-h2-app-db!
      (is (thrown-with-msg?
           ExceptionInfo
           #"Value does not match schema"
           (advanced-config.file/initialize!
            {:version 1
             :config {:settings {:instance-workspace {:name "missing-databases"}}}}))))))

(deftest db-workspace-namespace-resolves-after-loading-test
  (testing "after loading, db-workspace-namespace returns the configured output namespace"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/Database {db-id :id} {:name "ws-test-db" :engine :postgres}]
        (advanced-config.file/initialize!
         {:version 1
          :config {:settings {:instance-workspace (workspace-setting-value "ws-test-db")}}})
        (is (= {:schema "mb__isolation_44490_1933"} (ws/db-workspace-namespace db-id)))))))

(deftest db-workspace-namespace-returns-nil-when-no-load-test
  (testing "without a config.yml load, db-workspace-namespace returns nil — manager-side rows are not consulted"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/Database {db-id :id} {:name "ws-test-db" :engine :postgres}]
        (is (nil? (ws/db-workspace-namespace db-id)))))))

;;; ----------------------------------------- per-driver shapes -----------------------------------------
;;;
;;; Drivers with different cardinalities should round-trip through the wire format
;;; without modification.

(deftest mysql-cardinality-upgrade-section-test
  (testing "MySQL workspace: only `:db` slot is populated in the setting (no schema layer)"
    (testing "loader stores MySQL output namespace in the :db slot"
      (mt/with-empty-h2-app-db!
        (mt/with-temp [:model/Database {db-id :id} {:name "mysql-prod" :engine :mysql :details {:db "prod_db"}}]
          (ws/set-instance-workspace!
           {:name "ws"
            :databases {"mysql-prod" {:input_schemas ["prod_db"]
                                      :output        {:db "ws_alice"}}}})
          (is (= {:db "ws_alice"} (ws/db-workspace-namespace db-id))))))))

(deftest bigquery-3-slot-section-test
  (testing "BigQuery workspace: project + dataset in the :output map"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/Database {db-id :id} {:name "bq-prod" :engine :bigquery-cloud-sdk :details {:project-id "metabase-prod"}}]
        (ws/set-instance-workspace!
         {:name "ws"
          :databases {"bq-prod" {:input_schemas ["core"]
                                 :output        {:db "metabase-prod" :schema "ws_alice"}}}})
        (is (= {:db "metabase-prod" :schema "ws_alice"} (ws/db-workspace-namespace db-id)))))))

;;; ----------------------------------------- per-driver YAML fixtures -----------------------------------------
;;;
;;; The `resources/workspace_config_<driver>.yml` files are reference fixtures
;;; - one per driver shape. They double as documentation (each is a complete
;;; valid `config.yml` showing the per-driver wire format) and as test data.
;;; This test parametrizes over all of them, asserting:
;;;
;;;   - the YAML parses
;;;   - the `:settings :instance-workspace` value round-trips into the setting
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
  (testing "Each per-driver fixture YAML parses, has the expected instance-workspace setting value, and round-trips through the loader"
    (doseq [[driver expectations] per-driver-fixture-expectations]
      (testing (str driver " fixture")
        (let [parsed   (load-fixture-by-driver driver)
              ws-value (get-in parsed [:config :settings :instance-workspace])
              wsd      (-> ws-value :databases vals first)]
          (testing "parses to the expected wire shape"
            (is (= 1 (:version parsed)))
            (is (= "New workspace" (:name ws-value)))
            (is (= (:input_schemas expectations) (:input_schemas wsd))
                (str driver " input_schemas matches expectation"))
            (is (= (:output expectations) (:output wsd))
                (str driver " :output matches expectation")))
          (testing "round-trips through the :settings section into the setting"
            (mt/with-empty-h2-app-db!
              (mt/with-temp [:model/Database {db-id :id} {:name    (:db-name expectations)
                                                          :engine  (:engine expectations)
                                                          :details (:details expectations)}]
                (advanced-config.file/initialize!
                 {:version 1 :config {:settings {:instance-workspace ws-value}}})
                (is (= (:output expectations) (ws/db-workspace-namespace db-id))
                    (str driver " setting output matches fixture"))))))))))
