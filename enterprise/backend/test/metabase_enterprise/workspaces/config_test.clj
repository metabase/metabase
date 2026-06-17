(ns metabase-enterprise.workspaces.config-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.config :as config]
   [metabase-enterprise.workspaces.test-util :as workspaces.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest build-workspace-config-happy-path-test
  (testing "build-workspace-config returns a {:version 1 :config {...}} structure matching config.yml"
    (mt/with-temp [:model/Database {db-id :id}
                   {:name    "Analytics Data Warehouse"
                    :engine  :postgres
                    :details {:host   "mbdata.metabase.com"
                              :port   5432
                              :user   "admin"
                              :dbname "stitchdata_incoming"}}
                   :model/Workspace {ws-id :id} {:name       "github"
                                                 :creator_id (mt/user->id :crowberto)}
                   :model/WorkspaceDatabase _
                   {:workspace_id     ws-id
                    :database_id      db-id
                    :database_details {:user "mb_isolation_github" :password "secret"}
                    :output_namespace "mb_isolation_github"
                    :input_schemas    ["raw_github"]
                    :status           :provisioned}]
      (let [cfg (config/build-workspace-config ws-id)]
        (testing "outer shape matches config.yml (version + config block)"
          (is (= 1 (:version cfg)))
          (is (= #{:databases :workspace} (set (keys (:config cfg))))))
        (testing "databases entry"
          (let [own-dbs (remove (some-fn :is_stub :is_sample) (-> cfg :config :databases))
                db      (first own-dbs)]
            (is (= 1 (count own-dbs)))
            (is (= "Analytics Data Warehouse" (:name db)))
            (is (= :postgres (:engine db)))
            (testing "original details are preserved, workspace overrides win, schema-filters appended"
              (is (= {:host                        "mbdata.metabase.com"
                      :port                        5432
                      :user                        "mb_isolation_github"
                      :password                    "secret"
                      :dbname                      "stitchdata_incoming"
                      :schema-filters-type         "inclusion"
                      :schema-filters-patterns     "raw_github"
                      :let-user-control-scheduling false}
                     (:details db))))))
        (testing "workspace entry uses flat input_schemas + expanded :output map"
          (is (= "github" (-> cfg :config :workspace :name)))
          (is (= {"Analytics Data Warehouse"
                  {:input_schemas ["raw_github"]
                   :output        {:schema "mb_isolation_github"}}}
                 (-> cfg :config :workspace :databases))))))))

(deftest build-workspace-config-three-slot-engine-test
  (when (workspaces.tu/driver-loadable? :sqlserver)
    (testing "SQL Server (3-slot, qualified-name-components=[:db :schema]) gets the :db slot populated from connection details"
      (mt/with-temp [:model/Database {db-id :id}
                     {:name    "MSSQL DW"
                      :engine  :sqlserver
                      :details {:db "AnalyticsDB" :user "u" :password "p"}}
                     :model/Workspace {ws-id :id} {:name       "mssql"
                                                   :creator_id (mt/user->id :crowberto)}
                     :model/WorkspaceDatabase _
                     {:workspace_id     ws-id
                      :database_id      db-id
                      :database_details {}
                      :output_namespace "ws_alice"
                      :input_schemas    ["dbo"]
                      :status           :provisioned}]
        (let [cfg (config/build-workspace-config ws-id)]
          (is (= {"MSSQL DW"
                  {:input_schemas ["dbo"]
                   :output        {:db "AnalyticsDB" :schema "ws_alice"}}}
                 (-> cfg :config :workspace :databases))))))))

(deftest build-workspace-config-joins-multiple-input-schemas-test
  (testing "Multiple input schemas are comma-joined in schema-filters-patterns"
    (mt/with-temp [:model/Database {db-id :id}
                   {:name "DW" :engine :postgres :details {:host "h" :port 5432}}
                   :model/Workspace {ws-id :id} {:name       "multi"
                                                 :creator_id (mt/user->id :crowberto)}
                   :model/WorkspaceDatabase _
                   {:workspace_id     ws-id
                    :database_id      db-id
                    :database_details {:user "u" :password "p"}
                    :output_namespace "out"
                    :input_schemas    ["schema_a" "schema_b" "schema_c"]
                    :status           :provisioned}]
      (let [cfg (config/build-workspace-config ws-id)]
        (is (= "schema_a,schema_b,schema_c"
               (-> cfg :config :databases first :details :schema-filters-patterns)))))))

(deftest build-workspace-config-bigquery-emits-dataset-filters-test
  (when (workspaces.tu/driver-loadable? :bigquery-cloud-sdk)
    (testing "BigQuery emits :dataset-filters-* (not :schema-filters-*); BQ's list-datasets reads dataset-filters"
      ;; Stub `:service-account-json` so the resulting config :details has the same
      ;; required shape a production BQ Database row would carry. The BQ driver's
      ;; `database-details->client` (and therefore any downstream `can-connect?`)
      ;; reads `:service-account-json` to mint credentials -- omitting it here
      ;; would make this test pass while the generated config :details would fail
      ;; the real wire-format consumer.
      (mt/with-temp [:model/Database {db-id :id}
                     {:name "BQ" :engine :bigquery-cloud-sdk
                      :details {:project-id          "metabase-prod"
                                :service-account-json "{\"type\":\"service_account\",\"project_id\":\"metabase-prod\"}"}}
                     :model/Workspace {ws-id :id} {:name       "bq-ws"
                                                   :creator_id (mt/user->id :crowberto)}
                     :model/WorkspaceDatabase _
                     {:workspace_id     ws-id
                      :database_id      db-id
                      :database_details {}
                      :output_namespace "ws_alice"
                      :input_schemas    ["core" "warehouse"]
                      :status           :provisioned}]
        (let [details (-> (config/build-workspace-config ws-id) :config :databases first :details)]
          (is (= "inclusion" (:dataset-filters-type details)))
          (is (= "core,warehouse" (:dataset-filters-patterns details)))
          (is (some? (:service-account-json details))
              "BigQuery config :details must carry :service-account-json -- the BQ driver requires it to mint credentials")
          (is (nil? (:schema-filters-type details))
              "BigQuery must NOT emit :schema-filters-* — those wire into describe-database which BQ doesn't use")
          (is (nil? (:schema-filters-patterns details))))))))

(deftest build-workspace-config-rejects-non-provisioned-test
  (testing "Any non-:provisioned WorkspaceDatabase causes a 409"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name       "Mixed"
                                                 :creator_id (mt/user->id :crowberto)}
                   :model/WorkspaceDatabase _
                   {:workspace_id ws-id :database_id (mt/id)
                    :database_details {} :output_namespace "" :input_schemas ["public"]
                    :status :unprovisioned}]
      (is (thrown-with-msg?
           Exception
           #"not :provisioned"
           (config/build-workspace-config ws-id))))))

(deftest build-workspace-config-empty-workspace-test
  (testing "A workspace with no databases still produces the version+config outer shape"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name       "Empty"
                                                 :creator_id (mt/user->id :crowberto)}]
      (let [cfg (config/build-workspace-config ws-id)]
        (is (= 1 (:version cfg)))
        (is (= "Empty" (-> cfg :config :workspace :name)))
        (is (empty? (remove (some-fn :is_stub :is_sample) (-> cfg :config :databases)))
            "no non-stub, non-sample databases since the workspace has none of its own")
        (is (= {} (-> cfg :config :workspace :databases)))))))

(deftest build-workspace-config-injects-stubs-for-non-workspace-dbs-test
  (testing "Databases that exist in the instance but are not provisioned for the workspace appear
            in :config.databases as stub entries with :is_stub true and empty :details.
            Sample, audit, and routing-target DBs are excluded."
    (mt/with-temp [:model/Database router       {:name "stub-test-router" :engine :postgres :details {}}
                   :model/Database _other       {:name "stub-test-other"  :engine :postgres :details {:host "x"}}
                   :model/Database _sample      {:name "stub-test-sample" :engine :postgres :details {} :is_sample true}
                   :model/Database _audit       {:name "stub-test-audit"  :engine :postgres :details {} :is_audit  true}
                   :model/Database _target      {:name "stub-test-target" :engine :postgres :details {} :router_database_id (:id router)}
                   :model/Database ws-db        {:name "stub-test-ws-db"  :engine :postgres :details {:host "y"}}
                   :model/Workspace {ws-id :id} {:name       "stub-test-ws"
                                                 :creator_id (mt/user->id :crowberto)}
                   :model/WorkspaceDatabase _   {:workspace_id     ws-id
                                                 :database_id      (:id ws-db)
                                                 :database_details {}
                                                 :output_namespace ""
                                                 :input_schemas    ["public"]
                                                 :status           :provisioned}]
      (let [cfg-dbs (-> (config/build-workspace-config ws-id) :config :databases)
            by-name (into {} (map (juxt :name identity)) cfg-dbs)]
        (testing "workspace's own database is present and is NOT a stub"
          (is (contains? by-name "stub-test-ws-db"))
          (is (not (:is_stub (get by-name "stub-test-ws-db")))))
        (testing "non-workspace plain DB appears as a stub with empty :details"
          (is (= {:name    "stub-test-other"
                  :engine  :postgres
                  :details {}
                  :is_stub true}
                 (get by-name "stub-test-other"))))
        (testing "router DB (not a routing target) also appears as a stub"
          (is (= {:name    "stub-test-router"
                  :engine  :postgres
                  :details {}
                  :is_stub true}
                 (get by-name "stub-test-router"))))
        (testing "sample, audit, and routing-target DBs are excluded"
          (is (not (contains? by-name "stub-test-sample")))
          (is (not (contains? by-name "stub-test-audit")))
          (is (not (contains? by-name "stub-test-target"))))))))

(deftest build-workspace-config-missing-workspace-returns-nil-test
  (testing "A missing workspace returns nil"
    (mt/with-model-cleanup [:model/Workspace]
      (is (nil? (config/build-workspace-config Integer/MAX_VALUE))))))

(deftest build-workspace-config-forces-let-user-control-scheduling-false-test
  (testing "Non-stub database entries emit :let-user-control-scheduling false even if the source
            database had it true. The YAML carries :details only — not the schedule cron columns —
            so on import infer-db-schedules must take the auto-schedule branch instead of asserting
            on missing cache_field_values_schedule / metadata_sync_schedule."
    (mt/with-temp [:model/Database {db-id :id}
                   {:name    "User-Scheduled DW"
                    :engine  :postgres
                    :details {:host                        "h"
                              :port                        5432
                              :let-user-control-scheduling true}}
                   :model/Workspace {ws-id :id} {:name       "sched"
                                                 :creator_id (mt/user->id :crowberto)}
                   :model/WorkspaceDatabase _
                   {:workspace_id     ws-id
                    :database_id      db-id
                    :database_details {:user "u" :password "p"}
                    :output_namespace "ws_alice"
                    :input_schemas    ["public"]
                    :status           :provisioned}]
      (let [own-db (->> (config/build-workspace-config ws-id)
                        :config
                        :databases
                        (remove (some-fn :is_stub :is_sample))
                        first)]
        (is (false? (get-in own-db [:details :let-user-control-scheduling])))))))

(deftest build-workspace-config-emits-sample-database-test
  (testing "When a Sample Database exists in the instance, /config emits an entry with
            standardized name/engine, empty :details, and :is_sample true. The entry is
            distinct from stub entries and does not depend on the sample DB's actual
            stored name/engine."
    (mt/with-temp [:model/Database _sample      {:name      "Some Renamed Sample"
                                                 :engine    :h2
                                                 :details   {:db "real-sample-details"}
                                                 :is_sample true}
                   :model/Workspace {ws-id :id} {:name       "sample-emit-ws"
                                                 :creator_id (mt/user->id :crowberto)}]
      (let [cfg-dbs (-> (config/build-workspace-config ws-id) :config :databases)
            samples (filter :is_sample cfg-dbs)]
        (testing "exactly one sample entry is emitted"
          (is (= 1 (count samples))))
        (testing "sample entry uses standardized name/engine with empty :details"
          (is (= {:name      "Sample Database"
                  :engine    "h2"
                  :details   {}
                  :is_sample true}
                 (first samples))))
        (testing "sample entry is NOT also marked as a stub"
          (is (not (:is_stub (first samples)))))))))
