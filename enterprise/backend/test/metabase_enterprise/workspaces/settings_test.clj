(ns metabase-enterprise.workspaces.settings-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.settings :as ws.settings]
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
