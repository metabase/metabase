(ns metabase-enterprise.advanced-config.file.workspace-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase-enterprise.advanced-config.file.workspace :as advanced-config.file.workspace]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.test :as mt]
   [metabase.util.yaml :as yaml])
  (:import
   (clojure.lang ExceptionInfo)))

(use-fixtures :each (fn [thunk]
                      (binding [advanced-config.file/*supported-versions* {:min 1, :max 1}]
                        (try
                          (thunk)
                          (finally
                            (ws/clear-instance-workspace!))))))

(def ^:private fixture-path
  "metabase_enterprise/workspaces/resources/workspace_config_example.yml")

(defn- load-fixture []
  (-> fixture-path io/resource slurp yaml/parse-string))

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
            (is (= "mb__isolation_44490_1933" (:output_schema wsd)))))))))

(deftest apply-workspace-section-populates-atom-test
  (testing "applying the :workspace section stores parsed config in the in-process atom keyed by db-id"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/Database {db-id :id} {:name "ws-test-db"}]
        (let [section (workspace-section "ws-test-db")
              {:keys [workspace-name database-count]} (advanced-config.file.workspace/apply-workspace-section! section)]
          (is (= "New workspace" workspace-name))
          (is (= 1 database-count))
          (testing "atom holds the parsed config"
            (let [stored (ws/instance-workspace)]
              (is (= "New workspace" (:name stored)))
              (is (= ["public"] (get-in stored [:databases db-id :input_schemas])))
              (is (= "mb__isolation_44490_1933"
                     (get-in stored [:databases db-id :output_schema]))))))))))

(deftest re-apply-replaces-atom-test
  (testing "re-applying with a different config replaces the atom — no mismatch detection, file is the truth"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/Database _    {:name "ws-test-db"}
                     :model/Database _    {:name "ws-test-db-2"}]
        (let [section-1 (workspace-section "ws-test-db")
              section-2 (assoc section-1
                               :name "Renamed Workspace"
                               :databases {:ws-test-db-2 {:input_schemas ["public"]
                                                          :output_schema "different_schema"}})]
          (advanced-config.file.workspace/apply-workspace-section! section-1)
          (is (= "New workspace" (:name (ws/instance-workspace))))
          (advanced-config.file.workspace/apply-workspace-section! section-2)
          (is (= "Renamed Workspace" (:name (ws/instance-workspace))))
          (is (= 1 (count (:databases (ws/instance-workspace)))))
          (is (= "different_schema"
                 (->> (ws/instance-workspace) :databases vals first :output_schema))
              "atom reflects the new config, not the old one"))))))

(deftest unknown-database-name-throws-test
  (testing "referencing a database that doesn't exist in app-db throws ex-info"
    (mt/with-empty-h2-app-db!
      (is (thrown-with-msg?
           ExceptionInfo
           #"Workspace config references unknown database"
           (advanced-config.file.workspace/apply-workspace-section!
            (workspace-section "nonexistent-db")))))))

(deftest db-workspace-schema-resolves-after-loading-test
  (testing "after loading, db-workspace-schema returns the configured output schema"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/Database {db-id :id} {:name "ws-test-db"}]
        (advanced-config.file.workspace/apply-workspace-section!
         (workspace-section "ws-test-db"))
        (is (= "mb__isolation_44490_1933" (ws/db-workspace-schema db-id)))))))

(deftest db-workspace-schema-returns-nil-when-no-load-test
  (testing "without a config.yml load, db-workspace-schema returns nil — manager-side rows are not consulted"
    ;; The atom is cleared in the use-fixtures :each tear-down, so this confirms
    ;; the read truly comes from the atom and not from any leftover rows.
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/Database {db-id :id} {:name "ws-test-db"}]
        (is (nil? (ws/db-workspace-schema db-id)))))))

(deftest oss-readable-no-premium-token-test
  (testing "the :workspace section loads on instances without the :config-text-file premium feature"
    (mt/with-empty-h2-app-db!
      (mt/with-premium-features #{}
        (mt/with-temp [:model/Database {db-id :id} {:name "ws-test-db"}]
          (binding [advanced-config.file/*config*
                    {:version 1
                     :config {:workspace (workspace-section "ws-test-db")}}]
            (is (= :ok (advanced-config.file/initialize!)))
            (is (some? (ws/instance-workspace))
                "atom is populated even without :config-text-file token")
            (is (= "mb__isolation_44490_1933" (ws/db-workspace-schema db-id)))))))))

(deftest oss-rejects-config-without-workspace-section-test
  (testing "OSS instance still gets the premium-token error when :workspace is absent"
    (mt/with-empty-h2-app-db!
      (mt/with-premium-features #{}
        (binding [advanced-config.file/*config*
                  {:version 1
                   :config {:users [{:first_name "X" :last_name "Y"
                                     :email "x@example.com" :password "pw"}]}}]
          (is (thrown-with-msg?
               ExceptionInfo
               #"Premium token with the :config-text-file feature"
               (advanced-config.file/initialize!))
              "without :workspace, OSS still requires the premium token"))))))

(deftest workspace-bring-up-opens-gate-for-other-sections-test
  (testing "presence of :workspace lets sibling sections (:databases, :users, :api-keys) load on OSS"
    (mt/with-empty-h2-app-db!
      (mt/with-premium-features #{}
        (mt/with-temp [:model/Database _ {:name "sibling-db"}]
          (binding [advanced-config.file/*config*
                    {:version 1
                     :config {:users [{:first_name "Bring"
                                       :last_name  "Up"
                                       :email      "bringup@example.com"
                                       :password   "password1"}]
                              :workspace (workspace-section "sibling-db")}}]
            (is (= :ok (advanced-config.file/initialize!)))
            (is (some? (ws/instance-workspace))
                ":workspace section ran")))))))

(defn- ran-without-error?
  "Run `initialize!` and report whether it returned `:ok` cleanly. Catches every
  Throwable so the OSS-bypass attack tests below can ask 'did anything block
  this?' without caring which layer (spec validation or the premium-token gate)
  did the blocking — both count as defense."
  []
  (try
    (= :ok (advanced-config.file/initialize!))
    (catch Throwable _
      false)))

(deftest invalid-workspace-section-does-not-open-gate-test
  (testing "an empty or malformed :workspace section does NOT let the rest of the file load on OSS"
    (mt/with-empty-h2-app-db!
      (mt/with-premium-features #{}
        (testing "empty workspace map"
          (binding [advanced-config.file/*config*
                    {:version 1
                     :config {:users [{:first_name "X" :last_name "Y"
                                       :email "x@example.com" :password "pw"}]
                              :workspace {}}}]
            (is (false? (ran-without-error?))
                "empty :workspace doesn't unlock the gate")))
        (testing "workspace missing :databases"
          (binding [advanced-config.file/*config*
                    {:version 1
                     :config {:users [{:first_name "X" :last_name "Y"
                                       :email "x@example.com" :password "pw"}]
                              :workspace {:name "Just a name"}}}]
            (is (false? (ran-without-error?)))))
        (testing "workspace with empty :databases map"
          (binding [advanced-config.file/*config*
                    {:version 1
                     :config {:users [{:first_name "X" :last_name "Y"
                                       :email "x@example.com" :password "pw"}]
                              :workspace {:name "n" :databases {}}}}]
            (is (false? (ran-without-error?)))))))))

(deftest valid-workspace-section?-test
  (testing "valid-workspace-section? matches the spec used by the gate"
    (is (true? (advanced-config.file.workspace/valid-workspace-section?
                {:name "ws" :databases {:db1 {:input_schemas ["s1"]
                                              :output_schema "out"}}})))
    (is (false? (advanced-config.file.workspace/valid-workspace-section? {}))
        "empty map is invalid")
    (is (false? (advanced-config.file.workspace/valid-workspace-section? {:name "ws"}))
        ":databases is required")
    (is (false? (advanced-config.file.workspace/valid-workspace-section?
                 {:name "ws" :databases {}}))
        "empty :databases map is invalid")
    (is (false? (advanced-config.file.workspace/valid-workspace-section?
                 {:name "ws"
                  :databases {:db1 {:input_schemas []
                                    :output_schema "out"}}}))
        "empty :input_schemas is invalid")
    (is (false? (advanced-config.file.workspace/valid-workspace-section?
                 {:name "ws"
                  :databases {:db1 {:input_schemas ["s1"]
                                    :output_schema ""}}}))
        "blank :output_schema is invalid")))
