(ns metabase-enterprise.workspaces.settings-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase-enterprise.workspaces.test-util :as workspaces.tu]
   [metabase.app-db.setting :as mdb.setting]
   [metabase.permissions.core :as perms]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.interface :as transforms.i]
   [metabase.util.encryption :as encryption]
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
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"manages workspaces"
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
  (testing "MB_WORKSPACES_ENABLED turns workspace mode on, and clear-instance-workspace! throws while it is set"
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
              (is (= 1 (t2/count :model/TableRemapping :database_id db-id)))
              (testing "and transforms write to the trimmed schema, the one the rows point at"
                (is (= {:schema "ws_old"} (ws/db-workspace-namespace db-id)))))
            (testing "changed schema deletes them"
              (mt/user-http-request :crowberto :put 200 (str "database/" db-id)
                                    {:settings {:database-workspace-schema "ws_new"}})
              (is (zero? (t2/count :model/TableRemapping :database_id db-id))))))))))

(deftest put-database-refuses-non-string-workspace-schema-test
  (testing "PUT /api/database/:id refuses a non-string database-workspace-schema"
    (mt/with-premium-features #{:workspaces}
      (mt/with-temp [:model/Database {db-id :id} {:engine :h2 :details (:details (mt/db))}]
        (doseq [bad [5 true ["ws"] {:schema "ws"}]]
          (testing (pr-str bad)
            (is (= "Setting database-workspace-schema must be a string."
                   (mt/user-http-request :crowberto :put 400 (str "database/" db-id)
                                         {:settings {:database-workspace-schema bad}})))
            (is (nil? (get-in (t2/select-one :model/Database :id db-id) [:settings :database-workspace-schema])))))))))

(deftest put-setting-workspaces-enabled-refused-under-env-var-test
  (testing "with MB_WORKSPACES_ENABLED set, PUT /api/setting/workspaces-enabled refuses a different value, like
            /current"
    (ws.settings/workspaces-enabled! true)
    (t2/insert! :model/TableRemapping {:database_id (mt/id) :from_db "" :from_schema "PUBLIC" :from_table_name "VENUES"
                                       :to_db "" :to_schema "ws" :to_table_name "PUBLIC__VENUES"})
    (mt/with-temp-env-var-value! [mb-workspaces-enabled "true"]
      (doseq [value [false "FALSE"]]
        (testing (pr-str value)
          (is (= (str "workspaces-enabled is set to true by the MB_WORKSPACES_ENABLED env var and can't be changed at"
                      " runtime.")
                 (mt/user-http-request :crowberto :put 400 "setting/workspaces-enabled" {:value value})))
          (testing "and the remap rows survive"
            (is (= 1 (t2/count :model/TableRemapping))))))
      (testing "writing the env var's own value is allowed, in any case"
        (mt/user-http-request :crowberto :put 204 "setting/workspaces-enabled" {:value true})
        (mt/user-http-request :crowberto :put 204 "setting/workspaces-enabled" {:value "TRUE"}))
      (testing "resetting the stored value (nil) changes nothing the env var doesn't hide, so it's allowed"
        (mt/user-http-request :crowberto :put 204 "setting/workspaces-enabled" {:value nil})
        (is (true? (ws/workspace-mode?)))
        (testing "and the remap rows survive"
          (is (= 1 (t2/count :model/TableRemapping))))))))

(deftest config-file-conflicting-with-workspaces-enabled-env-var-stops-boot-test
  (testing "a config.yml settings value that conflicts with MB_WORKSPACES_ENABLED throws, so boot stops on purpose"
    (mt/with-temp-env-var-value! [mb-workspaces-enabled "true"]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"set to true by the MB_WORKSPACES_ENABLED env var"
                            (advanced-config.file/initialize! {:version 1
                                                               :config  {:settings {:workspaces-enabled false}}})))
      (is (true? (ws/workspace-mode?)))
      (testing "control: a config.yml value that matches the env var loads"
        (is (= :ok (advanced-config.file/initialize! {:version 1
                                                      :config  {:settings {:workspaces-enabled true}}})))))))

(deftest put-database-workspace-schema-superuser-only-test
  (testing "a non-superuser with manage-database permission can't set or clear database-workspace-schema"
    (mt/with-premium-features #{:workspaces :advanced-permissions}
      (mt/with-temp [:model/Database {db-id :id} {:engine   :h2
                                                  :details  (:details (mt/db))
                                                  :settings {:database-workspace-schema "ws"}}]
        (mt/with-no-data-perms-for-all-users!
          (perms/set-database-permission! (perms/all-users-group) db-id :perms/manage-database :yes)
          (testing "the manager can still edit the database"
            (mt/user-http-request :rasta :put 200 (str "database/" db-id) {:description "edited"}))
          (doseq [value ["elsewhere" nil]]
            (testing (pr-str value)
              (is (= "You don't have permissions to do that."
                     (mt/user-http-request :rasta :put 403 (str "database/" db-id)
                                           {:settings {:database-workspace-schema value}})))
              (is (= "ws" (get-in (t2/select-one :model/Database :id db-id) [:settings :database-workspace-schema])))))
          (testing "sending the current value is refused too, so the status doesn't confirm a guess"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :put 403 (str "database/" db-id)
                                         {:settings {:database-workspace-schema "ws"}}))))
          (testing "a snake_case key is the same setting, so it's refused too and stores nothing"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :put 403 (str "database/" db-id)
                                         {:settings {:database_workspace_schema "evil"}})))
            (is (= {:database-workspace-schema "ws"} (t2/select-one-fn :settings :model/Database :id db-id))))
          (testing "another database-local setting is still the manager's to change"
            (mt/user-http-request :rasta :put 200 (str "database/" db-id)
                                  {:settings {:database-enable-actions true}})
            (is (true? (get-in (t2/select-one :model/Database :id db-id) [:settings :database-enable-actions]))))
          (testing "a superuser can"
            (mt/user-http-request :crowberto :put 200 (str "database/" db-id)
                                  {:settings {:database-workspace-schema "elsewhere"}})
            (is (= "elsewhere"
                   (get-in (t2/select-one :model/Database :id db-id) [:settings :database-workspace-schema])))
            (testing "and a snake_case key is stored as the setting, after the type check"
              (is (= "Setting database-workspace-schema must be a string."
                     (mt/user-http-request :crowberto :put 400 (str "database/" db-id)
                                           {:settings {:database_workspace_schema 5}})))
              (mt/user-http-request :crowberto :put 200 (str "database/" db-id)
                                    {:settings {:database_workspace_schema "snake"}})
              (is (= "snake" (get-in (t2/select-one :model/Database :id db-id) [:settings :database-workspace-schema])))
              (is (not (contains? (t2/select-one-fn :settings :model/Database :id db-id)
                                  :database_workspace_schema))))))))))

(defn- transform-write-target!
  "Run a Python transform on `PUBLIC.MODE_EXIT_T` of the test database through `transforms.execute/execute!`, with
  the executor stubbed. Returns the `[schema name]` the executor would write, or `:refused`."
  []
  (let [captured (atom nil)]
    (with-redefs [transforms.i/execute! (fn [transform _opts]
                                          (reset! captured (:target transform))
                                          {:status :succeeded})]
      (try
        (transforms.execute/execute! {:id     990
                                      :source {:type :python :body "" :source-tables []}
                                      :target {:database (mt/id) :schema "PUBLIC" :name "MODE_EXIT_T" :type "table"}})
        ((juxt :schema :name) @captured)
        (catch clojure.lang.ExceptionInfo _
          :refused)))))

(defn- insert-mode-exit-remap-row! [schema]
  (t2/insert! :model/TableRemapping {:database_id (mt/id) :from_db "" :from_schema "PUBLIC"
                                     :from_table_name "MODE_EXIT_T"
                                     :to_db "" :to_schema schema :to_table_name "PUBLIC__MODE_EXIT_T"}))

(defn- pre-settings-instance-workspace-json
  "The `instance-workspace` JSON that `POST /api/ee/workspace-instance/current` stored before workspace mode became
  the `workspaces-enabled` setting."
  [schema]
  (str "{\"name\":\"old\",\"databases\":{\"" (mt/id)
       "\":{\"input_schemas\":[\"PUBLIC\"],\"output\":{\"schema\":\"" schema "\"}}}}"))

(deftest upgrade-from-instance-workspace-keeps-transforms-off-the-canonical-table-test
  (testing "a sidecar upgraded from the instance-workspace setting stays a workspace, and does not write the canonical
            table"
    (mt/with-premium-features #{:workspaces :transforms :transforms-python}
      (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings nil}
        (testing "control: in workspace mode the transform writes the copy"
          (workspaces.tu/with-workspace-db! (mt/id) "ws_old"
            (fn []
              (is (= ["ws_old" "PUBLIC__MODE_EXIT_T"] (transform-write-target!))))))
        (testing "instance-workspace stored in the app DB, workspaces-enabled unset"
          (let [json (pre-settings-instance-workspace-json "ws_old")]
            (try
              (t2/delete! :setting :key "workspaces-enabled")
              (t2/insert! :setting {:key            "instance-workspace"
                                    :value          json
                                    :value_with_aad (encryption/maybe-encrypt
                                                     json {:aad (mdb.setting/setting-aad "instance-workspace")})})
              (setting/restore-cache!)
              (insert-mode-exit-remap-row! "ws_old")
              (ws/translate-instance-workspace-setting!)
              (is (true? (ws/workspace-mode?)))
              (is (= ["ws_old" "PUBLIC__MODE_EXIT_T"] (transform-write-target!)))
              (testing "and the old setting is deleted, so no build reads it again"
                (is (not (t2/exists? :setting :key "instance-workspace"))))
              (finally
                (t2/delete! :setting :key "instance-workspace")
                (setting/restore-cache!)
                (ws/clear-instance-workspace!)))))
        (testing "MB_INSTANCE_WORKSPACE set, nothing stored"
          (try
            (t2/delete! :setting :key "workspaces-enabled")
            (setting/restore-cache!)
            (insert-mode-exit-remap-row! "ws_old")
            (mt/with-temp-env-var-value! [mb-instance-workspace (pre-settings-instance-workspace-json "ws_old")]
              (ws/translate-instance-workspace-setting!)
              (is (= ["ws_old" "PUBLIC__MODE_EXIT_T"] (transform-write-target!))))
            (finally
              (ws/clear-instance-workspace!))))
        (testing "control: a stored workspaces-enabled wins over the old setting"
          (try
            (ws.settings/workspaces-enabled! false)
            (mt/with-temp-env-var-value! [mb-instance-workspace (pre-settings-instance-workspace-json "ws_old")]
              (ws/translate-instance-workspace-setting!)
              (is (false? (ws/workspace-mode?))))
            (finally
              (ws/clear-instance-workspace!))))))))
