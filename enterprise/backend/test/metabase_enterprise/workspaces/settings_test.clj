(ns metabase-enterprise.workspaces.settings-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase-enterprise.workspaces.test-util :as workspaces.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(use-fixtures :each (fn [thunk]
                      (try
                        (thunk)
                        (finally
                          (ws/clear-instance-workspace!)))))

(deftest workspace-mode?-false-when-setting-empty-test
  (testing "workspace-mode? is false when no :workspace section has been loaded"
    (ws/clear-instance-workspace!)
    (is (false? (ws/workspace-mode?)))))

(deftest workspace-mode?-true-when-setting-populated-test
  (testing "workspace-mode? flips to true once workspaces-enabled is on"
    (ws/clear-instance-workspace!)
    (is (false? (ws/workspace-mode?)))
    (ws/set-instance-workspace! {})
    (is (true? (ws/workspace-mode?)))))

(deftest workspace-mode?-flips-back-to-false-on-clear-test
  (testing "workspace-mode? returns to false after clear-instance-workspace!"
    (ws/set-instance-workspace! {})
    (is (true? (ws/workspace-mode?)))
    (ws/clear-instance-workspace!)
    (is (false? (ws/workspace-mode?)))))

(deftest workspaces-enabled-refused-on-a-parent-test
  (testing "an instance with workspaces of its own can't turn workspaces-enabled on"
    (mt/with-temp [:model/Workspace _ {:name "parent-ws"}]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"workspaces of its own"
                            (ws.settings/workspaces-enabled! true)))
      (is (false? (ws/workspace-mode?))))))

(deftest turning-workspaces-enabled-off-deletes-remappings-test
  (testing "turning workspaces-enabled off through the setting, not only DELETE /current, deletes every remap row"
    (ws.settings/workspaces-enabled! true)
    (t2/insert! :model/TableRemapping {:database_id (mt/id) :from_db "" :from_schema "PUBLIC" :from_table_name "VENUES"
                                       :to_db "" :to_schema "ws" :to_table_name "PUBLIC__VENUES"})
    (ws.settings/workspaces-enabled! false)
    (is (zero? (t2/count :model/TableRemapping)))))

(deftest db-workspace-namespace-reads-database-local-setting-test
  (testing "db-workspace-namespace expands the database's database-workspace-schema, only while workspaces-enabled is on"
    (mt/with-temp [:model/Database {db-id :id} {:engine :postgres :settings {:database-workspace-schema "ws_scratch"}}
                   :model/Database {other-id :id} {:engine :postgres}]
      (is (nil? (ws/db-workspace-namespace db-id)))
      (ws.settings/workspaces-enabled! true)
      (is (= {:schema "ws_scratch"} (ws/db-workspace-namespace db-id)))
      (is (nil? (ws/db-workspace-namespace other-id))))))

(deftest workspaces-enabled-env-var-test
  (testing "MB_WORKSPACES_ENABLED turns workspace mode on, and clear-instance-workspace! refuses to fight it"
    (mt/with-temp-env-var-value! [mb-workspaces-enabled "true"]
      (is (true? (ws/workspace-mode?)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"MB_WORKSPACES_ENABLED"
                            (ws/clear-instance-workspace!))))))

(deftest workspaces-enabled-env-var-false-refuses-set-test
  (testing "with MB_WORKSPACES_ENABLED=false, set-instance-workspace! refuses instead of reporting success"
    (mt/with-temp-env-var-value! [mb-workspaces-enabled "false"]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"MB_WORKSPACES_ENABLED"
                            (ws/set-instance-workspace! {})))
      (testing "and clearing, which matches the env var, is allowed"
        (is (nil? (ws/clear-instance-workspace!)))))))

(deftest parent-guard-ignores-false-test
  (testing "on a parent, writing false (boolean or string) is not refused"
    (mt/with-temp [:model/Workspace _ {:name "parent-ws"}]
      (ws.settings/workspaces-enabled! false)
      (ws.settings/workspaces-enabled! "false")
      (is (false? (ws/workspace-mode?))))))

(deftest set-instance-workspace-is-atomic-test
  (testing "when turning the flag on fails (a parent), no database's schema is written"
    (mt/with-temp [:model/Workspace _ {:name "parent-ws"}
                   :model/Database {db-id :id} {:engine :postgres}]
      (is (thrown? clojure.lang.ExceptionInfo (ws/set-instance-workspace! {db-id "ws_x"})))
      (is (nil? (get-in (t2/select-one :model/Database :id db-id) [:settings :database-workspace-schema]))))))

(deftest clearing-a-database-schema-deletes-its-remappings-test
  (testing "a database dropped from the workspace loses its remap rows, so its reads stop going to the old schema"
    (mt/with-temp [:model/Database {db-a :id} {:engine :postgres}
                   :model/Database {db-b :id} {:engine :postgres}]
      (ws/set-instance-workspace! {db-a "ws_a" db-b "ws_b"})
      (doseq [db-id [db-a db-b]]
        (t2/insert! :model/TableRemapping {:database_id db-id :from_db "" :from_schema "public" :from_table_name "t"
                                           :to_db "" :to_schema "ws" :to_table_name "public__t"}))
      (ws/set-instance-workspace! {db-b "ws_b"})
      (is (= [db-b] (t2/select-fn-vec :database_id :model/TableRemapping))))))

(deftest put-database-schema-change-deletes-remappings-test
  (testing "PUT /api/database/:id changing database-workspace-schema deletes that database's remap rows"
    (mt/with-premium-features #{:workspaces}
      (mt/with-temp [:model/Database {db-id :id} {:engine :h2 :details (:details (mt/db))}]
        (workspaces.tu/with-workspace-db! db-id "ws_old"
          (fn []
            (t2/insert! :model/TableRemapping {:database_id db-id :from_db "" :from_schema "PUBLIC" :from_table_name "VENUES"
                                               :to_db "" :to_schema "ws_old" :to_table_name "PUBLIC__VENUES"})
            (testing "unchanged schema, after trimming, keeps the rows"
              (mt/user-http-request :crowberto :put 200 (str "database/" db-id)
                                    {:settings {:database-workspace-schema " ws_old "}})
              (is (= 1 (t2/count :model/TableRemapping :database_id db-id))))
            (testing "changed schema deletes them"
              (mt/user-http-request :crowberto :put 200 (str "database/" db-id)
                                    {:settings {:database-workspace-schema "ws_new"}})
              (is (zero? (t2/count :model/TableRemapping :database_id db-id))))))))))
