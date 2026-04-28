(ns metabase-enterprise.advanced-config.file.workspace-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase-enterprise.advanced-config.file.workspace :as advanced-config.file.workspace]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.test :as mt]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(use-fixtures :each (fn [thunk]
                      (binding [advanced-config.file/*supported-versions* {:min 1, :max 1}]
                        (thunk))))

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

(defn- with-clean-workspace-rows
  "Run `body-fn`, then delete any WorkspaceDatabase / Workspace rows the loader
   created. `with-temp` cleanup of the underlying :model/Database can't run
   while a `:provisioned` workspace_database row references it (FK RESTRICT
   plus the reconcile hook only deletes :unprovisioned rows)."
  [body-fn]
  (try
    (body-fn)
    (finally
      (t2/delete! :model/WorkspaceDatabase)
      (t2/delete! :model/Workspace))))

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

(deftest apply-workspace-section-creates-rows-test
  (testing "applying the :workspace section creates :provisioned WorkspaceDatabase rows"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/User     {creator-id :id} {:email "workspace@workspace.local"
                                                       :is_superuser true}
                     :model/Database {db-id :id}      {:name "ws-test-db"}]
        (with-clean-workspace-rows
          (fn []
            (let [section (workspace-section "ws-test-db")
                  {:keys [workspace-id database-count]} (advanced-config.file.workspace/apply-workspace-section! section)]
              (is (some? workspace-id))
              (is (= 1 database-count))
              (testing "workspace row created with expected name + creator"
                (let [ws (t2/select-one :model/Workspace :id workspace-id)]
                  (is (= "New workspace" (:name ws)))
                  (is (= creator-id (:creator_id ws)))))
              (testing "workspace_database row created in :provisioned with output_schema from config"
                (let [wsd (t2/select-one :model/WorkspaceDatabase :workspace_id workspace-id :database_id db-id)]
                  (is (= :provisioned (:status wsd)))
                  (is (= "mb__isolation_44490_1933" (:output_schema wsd)))
                  (is (= ["public"] (:input_schemas wsd))))))))))))

(deftest re-apply-is-idempotent-test
  (testing "re-applying the same workspace section does not duplicate rows"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/User     _           {:email "workspace@workspace.local" :is_superuser true}
                     :model/Database {db-id :id} {:name "ws-test-db"}]
        (with-clean-workspace-rows
          (fn []
            (let [section (workspace-section "ws-test-db")]
              (advanced-config.file.workspace/apply-workspace-section! section)
              (advanced-config.file.workspace/apply-workspace-section! section)
              (is (= 1 (t2/count :model/Workspace :name "New workspace")))
              (is (= 1 (t2/count :model/WorkspaceDatabase :database_id db-id))))))))))

(deftest re-apply-with-different-workspace-name-throws-test
  (testing "re-applying with a renamed workspace throws — there is no rename in this workflow"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/User     _           {:email "workspace@workspace.local" :is_superuser true}
                     :model/Database _           {:name "ws-test-db"}]
        (with-clean-workspace-rows
          (fn []
            (let [section  (workspace-section "ws-test-db")
                  renamed  (assoc section :name "Some Other Name")]
              (advanced-config.file.workspace/apply-workspace-section! section)
              (is (thrown-with-msg?
                   ExceptionInfo
                   #"config\.yml does not match app-DB"
                   (advanced-config.file.workspace/apply-workspace-section! renamed))))))))))

(deftest re-apply-with-different-databases-throws-test
  (testing "re-applying with a different set of databases throws — no in-place workspace edit"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/User     _    {:email "workspace@workspace.local" :is_superuser true}
                     :model/Database _    {:name "ws-test-db"}
                     :model/Database _    {:name "ws-test-db-2"}]
        (with-clean-workspace-rows
          (fn []
            (let [section-1 (workspace-section "ws-test-db")
                  section-2 (assoc section-1
                                   :databases {:ws-test-db-2 {:input_schemas ["public"]
                                                              :output_schema "mb__isolation_44490_1933"}})]
              (advanced-config.file.workspace/apply-workspace-section! section-1)
              (is (thrown-with-msg?
                   ExceptionInfo
                   #"config\.yml does not match app-DB"
                   (advanced-config.file.workspace/apply-workspace-section! section-2))))))))))

(deftest first-load-allows-fresh-rows-test
  (testing "first load (no existing rows) inserts whatever the config declares"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/User     _           {:email "workspace@workspace.local" :is_superuser true}
                     :model/Database {db-id :id} {:name "ws-test-db"}]
        (with-clean-workspace-rows
          (fn []
            (advanced-config.file.workspace/apply-workspace-section!
             (workspace-section "ws-test-db"))
            (is (= 1 (t2/count :model/Workspace :name "New workspace")))
            (is (= 1 (t2/count :model/WorkspaceDatabase :database_id db-id)))))))))

(deftest unknown-database-name-throws-test
  (testing "referencing a database that doesn't exist in app-db throws ex-info"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/User _ {:email "workspace@workspace.local" :is_superuser true}]
        (is (thrown-with-msg?
             ExceptionInfo
             #"Workspace config references unknown database"
             (advanced-config.file.workspace/apply-workspace-section!
              (workspace-section "nonexistent-db"))))))))

(deftest no-superuser-throws-test
  (testing "loader refuses to bootstrap when no superuser exists to attribute the workspace to"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/Database _ {:name "ws-test-db"}]
        (is (thrown-with-msg?
             ExceptionInfo
             #"Cannot bootstrap workspace from config.yml: no superuser exists"
             (advanced-config.file.workspace/apply-workspace-section!
              (workspace-section "ws-test-db"))))))))

(deftest db-workspace-schema-resolves-after-loading-test
  (testing "after loading, the existing db-workspace-schema reader returns the configured output schema"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/User     _           {:email "workspace@workspace.local" :is_superuser true}
                     :model/Database {db-id :id} {:name "ws-test-db"}]
        (with-clean-workspace-rows
          (fn []
            (advanced-config.file.workspace/apply-workspace-section!
             (workspace-section "ws-test-db"))
            (is (= "mb__isolation_44490_1933" (ws/db-workspace-schema db-id)))))))))

(deftest oss-readable-no-premium-token-test
  (testing "the :workspace section loads on instances without the :config-text-file premium feature"
    (mt/with-empty-h2-app-db!
      (mt/with-premium-features #{}
        (mt/with-temp [:model/User     _           {:email "workspace@workspace.local" :is_superuser true}
                       :model/Database {db-id :id} {:name "ws-test-db"}]
          (with-clean-workspace-rows
            (fn []
              (binding [advanced-config.file/*config*
                        {:version 1
                         :config {:workspace (workspace-section "ws-test-db")}}]
                (is (= :ok (advanced-config.file/initialize!)))
                (is (some? (t2/select-one :model/Workspace :name "New workspace")))
                (is (= :provisioned
                       (:status (t2/select-one :model/WorkspaceDatabase :database_id db-id)))
                    ":workspace section processed without :config-text-file token")))))))))

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
        (mt/with-temp [:model/User     _           {:email "workspace@workspace.local" :is_superuser true}
                       :model/Database {_db-id :id} {:name "sibling-db"}]
          (with-clean-workspace-rows
            (fn []
              (binding [advanced-config.file/*config*
                        {:version 1
                         :config {:users [{:first_name "Bring"
                                           :last_name  "Up"
                                           :email      "bringup@example.com"
                                           :password   "password1"}]
                                  :workspace (workspace-section "sibling-db")}}]
                (is (= :ok (advanced-config.file/initialize!)))
                (is (some? (t2/select-one :model/User :email "bringup@example.com"))
                    ":users section ran on OSS because :workspace was also present")))))))))

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
    ;; Defense is layered: invalid workspace sections fail spec validation in
    ;; `file/config` before the premium gate even runs, so they never reach
    ;; `workspace-bring-up?`. The bypass attack only succeeds if the entire
    ;; pipeline returns :ok with sibling sections (here :users) having executed.
    (mt/with-empty-h2-app-db!
      (mt/with-premium-features #{}
        (testing "empty workspace map"
          (binding [advanced-config.file/*config*
                    {:version 1
                     :config {:users [{:first_name "X" :last_name "Y"
                                       :email "x@example.com" :password "pw"}]
                              :workspace {}}}]
            (is (false? (ran-without-error?))
                "empty :workspace doesn't unlock the gate")
            (is (nil? (t2/select-one :model/User :email "x@example.com"))
                ":users sibling section was NOT applied")))
        (testing "workspace missing :databases"
          (binding [advanced-config.file/*config*
                    {:version 1
                     :config {:users [{:first_name "X" :last_name "Y"
                                       :email "x@example.com" :password "pw"}]
                              :workspace {:name "Just a name"}}}]
            (is (false? (ran-without-error?)))
            (is (nil? (t2/select-one :model/User :email "x@example.com")))))
        (testing "workspace with empty :databases map"
          (binding [advanced-config.file/*config*
                    {:version 1
                     :config {:users [{:first_name "X" :last_name "Y"
                                       :email "x@example.com" :password "pw"}]
                              :workspace {:name "n" :databases {}}}}]
            (is (false? (ran-without-error?)))
            (is (nil? (t2/select-one :model/User :email "x@example.com")))))))))

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
