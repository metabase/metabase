(ns metabase-enterprise.workspaces.workspace-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.status :as ws.status]
   [metabase-enterprise.workspaces.workspace :as ws.workspace]
   [metabase.test :as mt]
   [metabase.util.encryption-test :as encryption-test]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- raw-column
  "The stored text of `column` in the row of `table` where `key-column` is `id`, read through the table rather than
  the model, so it is not decrypted."
  [table column key-column id]
  (t2/select-one-fn column table key-column id))

(deftest encrypted-details-round-trip-test
  (mt/with-temp [:model/Workspace {ws-id :id} {:name "encrypted"}
                 :model/User      {user-id :id} {}]
    (encryption-test/with-secret-key "workspace-test-secret-key"
      (try
        (ws.db/save-provisioning-connection! (mt/id) {:user "provisioner", :password "ProvPassw0rd"} user-id)
        (testing "workspace_provisioning_connection.details"
          (is (not (str/includes? (raw-column :workspace_provisioning_connection :details :database_id (mt/id))
                                  "ProvPassw0rd")))
          (is (=? {:database_id (mt/id)
                   :details     {:user "provisioner", :password "ProvPassw0rd"}
                   :updated_by  user-id}
                  (ws.db/provisioning-connection (mt/id)))))
        (let [wsd (ws.db/insert-workspace-database! {:workspace_id     ws-id
                                                     :database_id      (mt/id)
                                                     :isolation_id     "encrypte"
                                                     :database_details {:user "mb__isolation_encrypte", :password "WsdPassw0rd"}
                                                     :status           :provisioning
                                                     :lock_token       (ws.status/new-lock-token)})]
          (testing "workspace_database.database_details"
            (is (not (str/includes? (raw-column :workspace_database :database_details :id (:id wsd)) "WsdPassw0rd")))
            (is (= {:user "mb__isolation_encrypte", :password "WsdPassw0rd"}
                   (:database_details (ws.db/workspace-database (:id wsd))))))
          (t2/delete! :model/WorkspaceDatabase :id (:id wsd)))
        (finally
          (ws.db/delete-provisioning-connection! (mt/id)))))))

(deftest insert-workspace-schema-test
  (testing "the scratch namespace is computed from the inserted row, whose id it names, and stored with it"
    (mt/with-temp [:model/WorkspaceProvisioningConnection _ {:database_id (mt/id), :details {}}
                   :model/Workspace                       {ws-id :id}  {:name "schemas"}
                   :model/WorkspaceDatabase               {wsd-id :id} {:workspace_id     ws-id
                                                                        :database_id      (mt/id)
                                                                        :isolation_id     "schemast"
                                                                        :database_details {}
                                                                        :status           :provisioning
                                                                        :lock_token       (ws.status/new-lock-token)}]
      (let [schema (ws.workspace/insert-workspace-schema! wsd-id "sales" :adding
                                                          #(str "mb__isolation_schemast_s" (:id %) "_" (:main_schema %)))]
        (is (= (str "mb__isolation_schemast_s" (:id schema) "_sales") (:scratch_namespace schema)))
        (testing "the inserting request holds the schema's lock"
          (is (string? (ws.status/change-status! :schema (:id schema) (:lock_token schema) #{:adding} :active))))
        (is (= {:main_schema "sales", :scratch_namespace (:scratch_namespace schema), :status :active, :error nil}
               (t2/select-one [:model/WorkspaceSchema :main_schema :scratch_namespace :status :error] :id (:id schema)))))
      (testing "a failure computing the name leaves no row"
        (is (thrown-with-msg? Exception #"boom"
                              (ws.workspace/insert-workspace-schema! wsd-id "finance" :adding
                                                                     (fn [_] (throw (ex-info "boom" {}))))))
        (is (= ["sales"] (t2/select-fn-vec :main_schema :model/WorkspaceSchema :workspace_database_id wsd-id)))))))

(deftest workspaces-page-test
  (mt/with-temp [:model/WorkspaceProvisioningConnection _ {:database_id (mt/id), :details {}}]
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws-ids (vec (for [i (range 3)]
                          (ws.db/insert-workspace! (str "page " i) nil)))
            wsd    (ws.db/insert-workspace-database! {:workspace_id     (second ws-ids)
                                                      :database_id      (mt/id)
                                                      :isolation_id     "pagetest"
                                                      :database_details {:user "u", :password "SecretPassw0rd"}
                                                      :status           :provisioned
                                                      :lock_token       (ws.status/new-lock-token)})
            schema (ws.workspace/insert-workspace-schema! (:id wsd) "sales" :active (constantly "mb__isolation_pagetest_s1_sales"))
            total  (t2/count :model/Workspace)
            page   (fn [limit offset] (ws.workspace/workspaces-page {:limit limit, :offset offset}))
            ids    (fn [{:keys [data]}] (filterv (set ws-ids) (map :id data)))]
        (testing "{:data, :total}, in id order"
          (is (= total (:total (page 1000 0))))
          (is (= ws-ids (ids (page 1000 0)))))
        (testing "limit and offset"
          (let [offset (- total 3)]
            (is (= (subvec ws-ids 0 2) (ids (page 2 offset))))
            (is (= [(last ws-ids)] (ids (page 2 (+ offset 2)))))
            (is (= [] (:data (page 2 total))))))
        (testing "each workspace carries its databases and schemas, never a database password"
          (let [ws (some #(when (= (second ws-ids) (:id %)) %) (:data (page 1000 0)))]
            (is (=? {:databases [{:id      (:id wsd)
                                  :status  :provisioned
                                  :schemas [{:id (:id schema), :main_schema "sales", :status :active}]}]}
                    ws))
            (is (not (contains? (first (:databases ws)) :database_details)))
            (is (not (contains? (first (:databases ws)) :lock_token)))
            (is (not (str/includes? (pr-str (page 1000 0)) "SecretPassw0rd")))))
        (t2/delete! :model/Workspace :id [:in ws-ids])))))

(deftest delete-database-with-workspaces-test
  (testing "a Database with workspaces on it, failed ones included, cannot be deleted: 409 naming them"
    (mt/with-temp [:model/Database  {db-id :id} {:engine :postgres, :details {}}
                   :model/Workspace {ws-id :id} {:name "keeps the database"}]
      (ws.db/save-provisioning-connection! db-id {} nil)
      (ws.db/insert-workspace-database! {:workspace_id     ws-id
                                         :database_id      db-id
                                         :isolation_id     "deletedb"
                                         :database_details {}
                                         :status           :failed
                                         :lock_token       (ws.status/new-lock-token)})
      (is (= {:message    "Delete the workspaces on this database before the database."
              :error-code "workspaces_exist"
              :workspaces [{:id ws-id, :name "keeps the database"}]}
             (mt/user-http-request :crowberto :delete 409 (str "database/" db-id))))
      (is (t2/exists? :model/Database :id db-id))
      (testing "once they are gone it can"
        (t2/delete! :model/Workspace :id ws-id)
        (mt/user-http-request :crowberto :delete 204 (str "database/" db-id))
        (is (not (t2/exists? :model/Database :id db-id)))))))
