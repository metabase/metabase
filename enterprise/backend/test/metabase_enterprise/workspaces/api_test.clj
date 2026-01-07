(ns ^:mb/driver-tests metabase-enterprise.workspaces.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase-enterprise.transforms.api :as transforms.api]
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase-enterprise.transforms.test-util :as transforms.tu :refer [with-transform-cleanup!]]
   [metabase-enterprise.workspaces.dag :as ws.dag]
   [metabase-enterprise.workspaces.execute :as ws.execute]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase-enterprise.workspaces.test-util :as ws.tu]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.audit-app.core :as audit]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(ws.tu/ws-fixtures!)

(defn- append-part [url part]
  (case [(str/starts-with? part "/")
         (str/ends-with? url "/")]
    [false false] (str url \/ part)
    ([true false]
     [false true]) (str url part)
    (str url (subs part 1))))

(defn ws-url [id & path]
  (reduce append-part (str "ee/workspace/" id) (map str path)))

(deftest workspace-endpoints-require-superuser-test
  (ws.tu/with-workspaces! [workspace {:name "Private Workspace"}]
    (testing "GET /api/ee/workspace requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "ee/workspace"))))

    (testing "GET /api/ee/workspace/:id requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 (ws-url (:id workspace) "")))))

    (testing "POST /api/ee/workspace requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "ee/workspace"
                                   {:name "Unauthorized Workspace"}))))

    (testing "PUT /api/ee/workspace/:id requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 (ws-url (:id workspace) "")
                                   {:name "Updated"}))))

    (testing "DELETE /api/ee/workspace/:id requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :delete 403 (ws-url (:id workspace) "")))))

    (testing "POST /api/ee/workspace/:id/promote requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 (ws-url (:id workspace) "/merge")))))))

(deftest workspace-crud-flow-test
  (let [workspace-name (str "Workspace " (random-uuid))
        created        (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                             {:name        workspace-name
                                              :database_id (mt/id)})
        workspace-id   (:id created)
        collection-id  (:collection_id created)]
    (is (=? {:id            int?
             :collection_id int?
             :name          workspace-name}
            created))
    (testing "the collection exists, and we have a back reference"
      (is (t2/exists? :model/Workspace :id workspace-id :collection_id collection-id))
      (is (t2/exists? :model/Collection :id collection-id :workspace_id workspace-id)))

    (testing "workspace appears in list response"
      (let [{:keys [items]} (mt/user-http-request :crowberto :get 200 "ee/workspace")]
        (is (some #(= workspace-id (:id %)) items))))

    (testing "workspace can be fetched individually"
      (is (=? {:id workspace-id}
              (mt/user-http-request :crowberto :get 200 (ws-url workspace-id)))))

    (testing "workspace can be archived"
      (let [updated (mt/user-http-request :crowberto :post 200 (ws-url workspace-id "/archive"))]
        (is (= "archived" (:status updated)))))

    (testing "workspace can be unarchived"
      (let [updated (mt/user-http-request :crowberto :post 200 (ws-url workspace-id "/unarchive"))]
        (is (= "uninitialized" (:status updated)))))

    (testing "workspace cannot be deleted if it is not archived"
      (let [message (mt/user-http-request :crowberto :delete 400 (ws-url workspace-id))]
        (is (= "You cannot delete a workspace without first archiving it" message))))

    (testing "workspace can be deleted if it is archived"
      (let [updated (mt/user-http-request :crowberto :post 200 (ws-url workspace-id "/archive"))]
        (is (= "archived" (:status updated))))
      (let [response (mt/user-http-request :crowberto :delete 200 (ws-url workspace-id))]
        (is (= {:ok true} response))
        ;; todo: check the schema / tables and user are gone
        (is (false? (t2/exists? :model/Workspace workspace-id)))))))

;; TODO we need to first add a transform to trigger initialization, or else there is nothing to destroy
(deftest archive-workspace-calls-destroy-isolation-test
  (testing "POST /api/ee/workspace/:id/archive calls destroy-workspace-isolation!"
    (let [called?   (atom false)
          workspace (ws.tu/create-ready-ws! "Archive Isolation Test")]
      (mt/with-dynamic-fn-redefs [ws.isolation/destroy-workspace-isolation!
                                  (fn [_database _workspace]
                                    (reset! called? true))]
        (mt/user-http-request :crowberto :post 200 (ws-url (:id workspace) "/archive"))
        (is @called? "destroy-workspace-isolation! should be called when archiving")))))

(deftest archive-workspace-succeeds-when-cleanup-fails-test
  (testing "POST /api/ee/workspace/:id/archive succeeds even when destroy-workspace-isolation! fails"
    (ws.tu/with-workspaces! [workspace {:name "Archive Cleanup Fail Test"}]
      (mt/with-dynamic-fn-redefs [ws.isolation/destroy-workspace-isolation!
                                  (fn [_database _workspace]
                                    (throw (ex-info "Simulated cleanup failure" {:test true})))]
        (is (some? (mt/user-http-request :crowberto :post 200 (ws-url (:id workspace) "/archive"))))
        (is (= :archived (t2/select-one-fn :base_status :model/Workspace :id (:id workspace)))
            "Workspace should have status :archived despite cleanup failure")))))

(deftest ^:synchronized delete-workspace-calls-destroy-isolation-test
  (testing "DELETE /api/ee/workspace/:id calls destroy-workspace-isolation!"
    (let [called?   (atom false)
          workspace (ws.tu/create-ready-ws! "Delete Isolation Test")]
      (mt/with-dynamic-fn-redefs [ws.isolation/destroy-workspace-isolation!
                                  (fn [_database _workspace]
                                    (reset! called? true))]
        (mt/user-http-request :crowberto :post 200 (ws-url (:id workspace) "/archive"))
        (mt/user-http-request :crowberto :delete 200 (ws-url (:id workspace)))
        (is @called? "destroy-workspace-isolation! should be called when deleting")))))

;; TODO we need to first add a transform to trigger initialization, or else there is nothing to destroy
#_(deftest ^:synchronized merge-workspace-calls-destroy-isolation-test
    (testing "POST /api/ee/workspace/:id/merge calls destroy-workspace-isolation!"
      (let [called?   (atom false)
            workspace (ws.tu/create-ready-ws! "Merge Isolation Test")]
        (mt/with-dynamic-fn-redefs [ws.isolation/destroy-workspace-isolation!
                                    (fn [_database _workspace]
                                      (reset! called? true))]
          (mt/user-http-request :crowberto :post 200 (ws-url (:id workspace) "/merge"))
          (is @called? "destroy-workspace-isolation! should be called when merging")))))

;; TODO update this test to have a transform in the workspace. only non-empty workspaces will ensure isolation
#_(deftest unarchive-workspace-calls-ensure-isolation-test
    (testing "POST /api/ee/workspace/:id/unarchive calls ensure-database-isolation!"
      (let [called?   (atom false)
            workspace (ws.tu/create-ready-ws! "Unarchive Isolation Test")]
        (mt/user-http-request :crowberto :post 200 (ws-url (:id workspace) "/archive"))
        (testing "ensure-database-isolation! should be called when unarchiving"
          (mt/with-dynamic-fn-redefs [ws.isolation/ensure-database-isolation!
                                      (fn [_workspace _database]
                                        (reset! called? true)
                                        {:schema "test_schema" :database_details {}})]
            (mt/user-http-request :crowberto :post 200 (ws-url (:id workspace) "/unarchive"))
            (is @called?))))))

;; TODO update this test to have a transform in the workspace. only non-empty workspaces will grant accesses
#_(deftest unarchive-workspace-calls-sync-grant-accesses-test
    (testing "POST /api/ee/workspace/:id/unarchive calls sync-grant-accesses!"
      (let [called?   (atom false)
            workspace (ws.tu/create-ready-ws! "Unarchive Grant Test")]
        (mt/user-http-request :crowberto :post 200 (ws-url (:id workspace) "/archive"))
        (mt/with-dynamic-fn-redefs [ws.impl/sync-grant-accesses!
                                    (fn [_workspace]
                                      (reset! called? true)
                                      nil)]
          (mt/user-http-request :crowberto :post 200 (ws-url (:id workspace) "/unarchive"))
          (is @called? "sync-grant-accesses! should be called when unarchiving")))))

(deftest archive-unarchive-access-granted-test
  (testing "Archive/unarchive properly manages access_granted flags and grants"
    (let [workspace      (ws.tu/create-ready-ws! "Archive Grant Test")
          granted-tables (atom [])]
      ;; TODO this hack doesn't work anymore - need to put a real transform inside the workspace to generate the input
      (mt/with-temp [:model/WorkspaceInput input {:workspace_id   (:id workspace)
                                                  :db_id          (mt/id)
                                                  :schema         nil
                                                  :table          "test_table"
                                                  :access_granted true}]
        (testing "Archive resets access_granted to false"
          (mt/user-http-request :crowberto :post 200 (ws-url (:id workspace) "/archive"))
          (is (false? (t2/select-one-fn :access_granted :model/WorkspaceInput :id (:id input)))))

        (testing "Unarchive re-grants access and sets access_granted to true"
          (mt/with-dynamic-fn-redefs [ws.isolation/grant-read-access-to-tables!
                                      (fn [_database _workspace tables]
                                        (reset! granted-tables tables))]
            (mt/user-http-request :crowberto :post 200 (ws-url (:id workspace) "/unarchive"))
            #_(is (= [{:schema nil :name "test_table"}] @granted-tables)
                  "grant-read-access-to-tables! should be called with the input tables")
            #_(is (true? (t2/select-one-fn :access_granted :model/WorkspaceInput :id (:id input)))
                  "access_granted should be true after unarchive")))))))

(deftest merge-workspace-test
  (testing "POST /api/ee/workspace/:id/promote requires superuser"
    (ws.tu/with-workspaces! [workspace {:name "Promote Test"}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 (ws-url (:id workspace) "/merge"))))))

  (testing "Cannot merge an already archived workspace"
    (ws.tu/with-workspaces! [workspace {:name "Archived Workspace"}]
      (mt/user-http-request :crowberto :post 200 (ws-url (:id workspace) "/archive"))
      (is (= "Cannot merge an archived workspace"
             (mt/user-http-request :crowberto :post 400 (ws-url (:id workspace) "/merge")))))))

(deftest merge-workspace-with-transform-test
  (testing "POST /api/ee/workspace/:id/merge promotes transforms and archives workspace"
    (mt/with-temp [:model/Table                     _table {:schema "public" :name "merge_test_table"}
                   :model/Transform                 x1    {:name        "Upstream Transform"
                                                           :description "Original description"
                                                           :target      {:type     "table"
                                                                         :database (mt/id)
                                                                         :schema   "public"
                                                                         :name     "merge_test_table"}}]
      (let [{ws-id :id ws-name :name} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                            {:name        (mt/random-name)
                                                             :database_id (mt/id)})
            {ws-tx-ref-id :ref_id}    (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform")
                                                            (merge {:global_id (:id x1)}
                                                                   (select-keys x1 [:name :description :source :target])))
            commit-msg                "Test batch merge commit"]
        (testing "We've got our workspace with transform to merge"
          (is (int? ws-id))
          ;; (sanya) TODO: maybe switch to using transform APIs once we get our own
          (t2/update! :model/WorkspaceTransform :ref_id ws-tx-ref-id {:description "Modified in workspace"}))
        (testing "returns merged transforms"
          (is (=? {:merged    {:transforms [{:global_id (:id x1)}]}
                   :errors    []
                   :workspace {:id ws-id :name ws-name}}
                  (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/merge")
                                        {:commit-message commit-msg}))))
        (testing "workspace was deleted after successful merge"
          (is (not (t2/exists? :model/Workspace :id ws-id))))
        (testing "merge history was created"
          (is (=? {:commit_message commit-msg
                   :creator_id     (mt/user->id :crowberto)}
                  (t2/select-one :model/WorkspaceMerge :workspace_name ws-name)))
          (is (=? {:transform_id   (:id x1)
                   :commit_message commit-msg}
                  (t2/select-one :model/WorkspaceMergeTransform
                                 :transform_id (:id x1)))))))))

(deftest merge-sets-transform-creator-from-workspace-transform-test
  (testing "POST /api/ee/workspace/:id/merge sets transform creator_id from workspace_transform creator"
    (mt/with-temp [:model/User user-a {:first_name "UserA" :last_name "Test" :email "user-a@test.com" :is_superuser true}
                   :model/User user-b {:first_name "UserB" :last_name "Test" :email "user-b@test.com" :is_superuser true}
                   :model/User user-c {:first_name "UserC" :last_name "Test" :email "user-c@test.com" :is_superuser true}]
      ;; mt/with-temp with users will trigger their cleanup and those tables fail with their fks to core_user
      (mt/with-model-cleanup [:model/WorkspaceMerge :model/ApiKey]
        ;; User A creates the workspace
        (let [{ws-id :id ws-name :name} (mt/user-http-request user-a :post 200 "ee/workspace"
                                                              {:name        (mt/random-name)
                                                               :database_id (mt/id)})
              ;; User B creates a new workspace transform (not a checkout of existing)
              {ws-tx-ref-id :ref_id}    (mt/user-http-request user-b :post 200 (ws-url ws-id "/transform")
                                                              {:name   "Transform created by User B"
                                                               :source {:type     :query
                                                                        :database (mt/id)
                                                                        :query    (mt/native-query {:query "SELECT count(*) from orders"})}
                                                               :target {:type   "table"
                                                                        :schema "public"
                                                                        :name   "creator_test_table"}})]

          (testing "workspace transform has User B as creator"
            (is (= (:id user-b)
                   (t2/select-one-fn :creator_id :model/WorkspaceTransform :ref_id ws-tx-ref-id))))

          ;; NOTE: it's user-c merging the workspace
          (let [res              (mt/user-http-request user-c :post 200 (ws-url ws-id "/merge")
                                                       {:commit-message "Test creator attribution"})
                new-transform-id (-> res :merged :transforms first :global_id)]

            (testing "merge succeeded"
              (is (empty? (:errors res)))
              (is (some? new-transform-id)))

            (testing "newly created Transform has User B (ws transform creator) as creator, not User C (merger)"
              (is (= (:id user-b)
                     (t2/select-one-fn :creator_id :model/Transform :id new-transform-id))))

            (testing "merge history still records User C as the merging user"
              (is (=? {:creator_id (:id user-c)}
                      (t2/select-one :model/WorkspaceMerge :workspace_name ws-name))))))))))

(deftest merge-workspace-transaction-failure-test
  (testing "transactions"
    (mt/with-temp [:model/Table     _table {:schema "public" :name "merge_test_table"}
                   :model/Table     _table {:schema "public" :name "merge_test_table_2"}
                   :model/Transform x1 {:name        "Upstream Transform 1"
                                        :description "Original description 2"
                                        :target      {:type     "table"
                                                      :database (mt/id)
                                                      :schema   "public"
                                                      :name     "merge_test_table"}}
                   :model/Transform x2 {:name        "Upstream Transform 2"
                                        :description "Original description 2"
                                        :target      {:type     "table"
                                                      :database (mt/id)
                                                      :schema   "public"
                                                      :name     "merge_test_table_2"}}]
      (let [;; Create a workspace
            {ws-id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                              {:name        "Merge test"
                                               :database_id (mt/id)})
            ;; Add 2 transforms
            {ws-x-1-id :ref_id}
            (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform")
                                  (merge {:global_id (:id x1)}
                                         (select-keys x1 [:name :description :source :target])))
            {ws-x-2-id :ref_id}
            (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform")
                                  (merge {:global_id (:id x2)}
                                         (select-keys x2 [:name :description :source :target])))

            ;; Update transform names
            {ws-x-1-id :ref_id :as ws-x-1}
            (mt/user-http-request :crowberto :put 200
                                  (ws-url ws-id "/transform" ws-x-1-id)
                                  {:name "UPDATED 1"})
            {ws-x-2-id :ref_id :as ws-x-2}
            (mt/user-http-request :crowberto :put 200
                                  (ws-url ws-id "/transform" ws-x-2-id)
                                  {:name "UPDATED 2"})]

        (testing "Base: Workspace transforms are updated"
          (testing "X1"
            (is (= "UPDATED 1"
                   (t2/select-one-fn :name [:model/WorkspaceTransform :name] :workspace_id ws-id :ref_id ws-x-1-id))))
          (testing "X2"
            (is (= "UPDATED 2"
                   (t2/select-one-fn :name [:model/WorkspaceTransform :name] :workspace_id ws-id :ref_id ws-x-2-id)))))

        (testing "No updates are propagated back to core app on merge failure"
          (let [update-transform! transforms.api/update-transform!]
            (with-redefs [transforms.api/update-transform! (let [call-count (atom 0)]
                                                             (fn [& args]
                                                               (when (> @call-count 0)
                                                                 (throw (Exception. "boom")))
                                                               (swap! call-count inc)
                                                               (apply update-transform! args)))]
              (testing "API response: empty merged, single error"
                (let [resp (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/merge"))]
                  (is (empty? (get-in resp [:merged :transforms])))
                  (is (= 1 (count (:errors resp))))
                  (is (= {:op        "update"
                          :global_id (:id x2)
                          :ref_id    ws-x-2-id
                          :message   "boom"}
                         (first (:errors resp))))))
              (testing "Core transforms are left unchanged"
                (is (= (:name x1)
                       (t2/select-one-fn :name :model/Transform (:id x1))))
                (is (= (:name x2)
                       (t2/select-one-fn :name :model/Transform (:id x2)))))
              (testing "Workspace transforms are left unchanged"
                (is (=? (:name ws-x-1)
                        (:name (t2/select-one :model/WorkspaceTransform
                                              :workspace_id ws-id :ref_id (:ref_id ws-x-1)))))
                (is (=? (:name ws-x-2)
                        (:name (t2/select-one :model/WorkspaceTransform
                                              :workspace_id ws-id :ref_id (:ref_id ws-x-2)))))))))))))

(deftest merge-workspace-update-core-test
  (testing "transactions"
    (mt/with-temp [:model/Table     _table {:schema "public" :name "merge_test_table"}
                   :model/Table     _table {:schema "public" :name "merge_test_table_2"}
                   :model/Transform x1     {:name        "Upstream Transform 1"
                                            :description "Original description 2"
                                            :target      {:type     "table"
                                                          :database (mt/id)
                                                          :schema   "public"
                                                          :name     "merge_test_table"}}
                   :model/Transform x2     {:name        "Upstream Transform 2"
                                            :description "Original description 2"
                                            :target      {:type     "table"
                                                          :database (mt/id)
                                                          :schema   "public"
                                                          :name     "merge_test_table_2"}}]
      (let [;; Create a workspace
            {ws-id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                              {:name        "Merge test"
                                               :database_id (mt/id)})
            ;; Add 2 transforms
            {ws-x-1-id :ref_id}
            (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform")
                                  (merge {:global_id (:id x1)}
                                         (select-keys x1 [:name :description :source :target])))
            {ws-x-2-id :ref_id}
            (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform")
                                  (merge {:global_id (:id x2)}
                                         (select-keys x2 [:name :description :source :target])))

            ;; Update transform names
            {ws-x-1-id :ref_id :as ws-x-1}
            (mt/user-http-request :crowberto :put 200
                                  (ws-url ws-id "/transform" ws-x-1-id)
                                  {:name "UPDATED 1"})
            {ws-x-2-id :ref_id :as ws-x-2}
            (mt/user-http-request :crowberto :put 200
                                  (ws-url ws-id "/transform" ws-x-2-id)
                                  {:name "UPDATED 2"})]

        (testing "Base: Workspace transforms are updated"
          (testing "X1"
            (is (= "UPDATED 1"
                   (t2/select-one-fn :name [:model/WorkspaceTransform :name] :workspace_id ws-id :ref_id ws-x-1-id))))
          (testing "X2"
            (is (= "UPDATED 2"
                   (t2/select-one-fn :name [:model/WorkspaceTransform :name] :workspace_id ws-id :ref_id ws-x-2-id)))))

        (testing "Global transforms are updated"
          (testing "API response: empty errors, all updates present in merge"
            (let [resp (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/merge"))]
              (is (= 2 (count (get-in resp [:merged :transforms]))))
              (is (= 0 (count (:errors resp))))
              (is (some? (m/find-first #{{:op        "update"
                                          :global_id (:id x1)
                                          :ref_id    ws-x-1-id}}
                                       (get-in resp [:merged :transforms]))))
              (is (some? (m/find-first #{{:op        "update"
                                          :global_id (:id x2)
                                          :ref_id    ws-x-2-id}}
                                       (get-in resp [:merged :transforms]))))))
          (testing "Core transforms names are updated"
            (is (= (:name ws-x-1)
                   (t2/select-one-fn :name :model/Transform (:id x1))))
            (is (= (:name ws-x-2)
                   (t2/select-one-fn :name :model/Transform (:id x2)))))
          (testing "Workspace transforms are deleted"
            (is (not (t2/exists? :model/WorkspaceTransform
                                 :workspace_id ws-id :ref_id (:ref_id ws-x-1)))))
          (is (not (t2/exists? :model/WorkspaceTransform
                               :workspace_id ws-id :ref_id (:ref_id ws-x-2)))))
        ;; This should change going forward. Deletion of workspace is temporary.
        (testing "Workspace has been deleted"
          (is (not (t2/exists? :model/Workspace :id ws-id))))))))

(deftest merge-empty-workspace-test
  (let [{ws-id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                          {:name        "Merge test"
                                           :database_id (mt/id)})]

    (testing "API response: empty errors, empty updates"
      (let [resp (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/merge"))]
        (is (=? {:errors []
                 :merged {:transforms []}}
                resp))))
    ;; This should change going forward. Deletion of workspace is temporary.
    (testing "Workspace has been deleted"
      (is (not (t2/exists? :model/Workspace :id ws-id))))))

(deftest merge-transfom-test
  (mt/with-temp [:model/Table     _table {:schema "public" :name "merge_test_table"}
                 :model/Table     _table {:schema "public" :name "merge_test_table_2"}
                 :model/Transform x1 {:name        "Upstream Transform 1"
                                      :description "Original description 2"
                                      :target      {:type     "table"
                                                    :database (mt/id)
                                                    :schema   "public"
                                                    :name     "merge_test_table"}}
                 :model/Transform x2 {:name        "Upstream Transform 2"
                                      :description "Original description 2"
                                      :target      {:type     "table"
                                                    :database (mt/id)
                                                    :schema   "public"
                                                    :name     "merge_test_table_2"}}]
    (let [;; Create a workspace
          {ws-id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                            {:name        "Merge test"
                                             :database_id (mt/id)})
          ;; Add 2 transforms
          {ws-x-1-id :ref_id}
          (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform")
                                (merge {:global_id (:id x1)}
                                       (select-keys x1 [:name :description :source :target])))
          {ws-x-2-id :ref_id}
          (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform")
                                (merge {:global_id (:id x2)}
                                       (select-keys x2 [:name :description :source :target])))

          ;; Update transform names
          {ws-x-1-id :ref_id :as ws-x-1}
          (mt/user-http-request :crowberto :put 200
                                (ws-url ws-id "/transform" ws-x-1-id)
                                {:name "UPDATED 1"})
          {ws-x-2-id :ref_id :as ws-x-2}
          (mt/user-http-request :crowberto :put 200
                                (ws-url ws-id "/transform" ws-x-2-id)
                                {:name "UPDATED 2"})]
      (testing "Merging first of 2 workspace transfroms"
        (let [commit-msg "Single transform merge 1"
              resp (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform" ws-x-1-id "/merge")
                                         {:commit-message commit-msg})
              remaining (t2/select :model/WorkspaceTransform :workspace_id ws-id)]
          (testing "Response"
            (is (empty? (:errors resp)))
            (is (= {:op "update"
                    :global_id (:id x1)
                    :ref_id ws-x-1-id}
                   resp)))
          (testing "Remaining workspace transform is left untouched"
            (is (= 1 (count remaining)))
            (is (=? (:name ws-x-2)
                    (:name (first remaining)))))
          (testing "Propagation back to core"
            (is (= (:name ws-x-1)
                   (t2/select-one-fn :name :model/Transform :id (:global_id resp)))))
          (testing "merge history was created for single transform merge"
            (let [merge-transform (t2/select-one :model/WorkspaceMergeTransform
                                                 :transform_id (:id x1))]
              (is (=? {:workspace_merge_id pos-int?
                       :transform_id       (:id x1)
                       :commit_message     commit-msg}
                      merge-transform))
              (testing "workspace_merge record was also created"
                (is (=? {:commit_message commit-msg
                         :creator_id     (mt/user->id :crowberto)}
                        (t2/select-one :model/WorkspaceMerge
                                       :id (:workspace_merge_id merge-transform)))))))))
      (testing "Merging last workspace transfrom"
        (let [resp (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform" ws-x-2-id "/merge"))
              remaining (t2/select :model/WorkspaceTransform :workspace_id ws-id)]
          (testing "Response"
            (is (empty? (:errors resp)))
            (is (= {:op "update"
                    :global_id (:id x2)
                    :ref_id ws-x-2-id}
                   resp)))
          (testing "Remaining workspace transform was deleted"
            (is (= 0 (count remaining))))
          (testing "Propagation back to core"
            (is (= (:name ws-x-2)
                   (t2/select-one-fn :name :model/Transform :id (:global_id resp)))))
          (testing "Workspace is not archived nor deleted"
            (let [ws-after (t2/select-one :model/Workspace :id ws-id)]
              (is (some? ws-after))
              (is (not= :archived (:status ws-after))))))))))

(deftest merge-history-endpoint-test
  (testing "GET /api/ee/transform/:id/merge-history"
    (mt/with-temp [:model/Table     _table {:schema "public" :name "merge_history_test_table"}
                   :model/Transform x1     {:name        "Transform for history"
                                            :description "Test transform"
                                            :target      {:type     "table"
                                                          :database (mt/id)
                                                          :schema   "public"
                                                          :name     "merge_history_test_table"}}]
      (let [{ws-id :id ws-name :name} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                            {:name        (mt/random-name)
                                                             :database_id (mt/id)})
            {ws-tx-ref-id :ref_id}    (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform")
                                                            (merge {:global_id (:id x1)}
                                                                   (select-keys x1 [:name :description :source :target])))
            commit-msg                "Test merge for history endpoint"]
        ;; Modify and merge the transform
        (t2/update! :model/WorkspaceTransform :ref_id ws-tx-ref-id {:description "Modified for history test"})
        (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/merge")
                              {:commit-message commit-msg})

        (testing "returns merge history for a transform"
          ;; workspace_id is nil because workspace is deleted after merge (SET NULL FK)
          (is (=? [{:id                 pos-int?
                    :workspace_merge_id pos-int?
                    :commit_message     commit-msg
                    :workspace_id       nil
                    :workspace_name     ws-name
                    :merging_user_id    (mt/user->id :crowberto)
                    :created_at         some?}]
                  (mt/user-http-request :crowberto :get 200
                                        (str "ee/transform/" (:id x1) "/merge-history")))))

        (testing "returns 404 for non-existent transform"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :get 404
                                       "ee/transform/999999/merge-history"))))

        (testing "requires superuser"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403
                                       (str "ee/transform/" (:id x1) "/merge-history")))))))))

(deftest merge-single-transform-failure-test
  (mt/with-temp [:model/Table     _table {:schema "public" :name "merge_test_table"}
                 :model/Transform x1 {:name        "Upstream Transform 1"
                                      :description "Original description 2"
                                      :target      {:type     "table"
                                                    :database (mt/id)
                                                    :schema   "public"
                                                    :name     "merge_test_table"}}]
    (let [;; Create a workspace
          {ws-id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                            {:name        "Merge test"
                                             :database_id (mt/id)})
          ;; Add transform
          {ws-x-1-id :ref_id :as ws-x-1}
          (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform")
                                (merge {:global_id (:id x1)}
                                       (select-keys x1 [:name :description :source :target])))

          _ (mt/user-http-request :crowberto :post 204
                                  (ws-url ws-id "/transform" ws-x-1-id "/archive"))]
      (testing "Failure on merge"
        (with-redefs [transforms.api/delete-transform! (fn [& _args]
                                                         (throw (Exception. "boom")))]
          (let [resp (mt/user-http-request :crowberto :post 500
                                           (ws-url ws-id "/transform" ws-x-1-id "/merge"))]
            (testing "Response"
              (is (=? {:op "delete"
                       :global_id (:id x1)
                       :ref_id ws-x-1-id
                       :message "Failed to merge transform."}
                      resp)))
            (testing "no changes"
              (let [ws-xs (t2/select :model/WorkspaceTransform :workspace_id ws-id)]
                (is (= 1 (count ws-xs)))
                (is (= (:name ws-x-1)
                       (:name (first ws-xs))))))))))))

(deftest merging-multiple-transforms-incl-ws-only-test
  (let [mp (mt/metadata-provider)]
    (mt/with-temp [:model/Table     _table {:schema "public" :name "merge_test_table"}
                   :model/Table     _table {:schema "public" :name "merge_test_table_2"}
                   :model/Table     _table {:schema "public" :name "merge_test_table_3"}
                   :model/Transform x1 {:name        "Upstream Transform 1"
                                        :description "Original description 2"
                                        :target      {:type     "table"
                                                      :database (mt/id)
                                                      :schema   "public"
                                                      :name     "merge_test_table"}}
                   :model/Transform x2 {:name        "Upstream Transform 2"
                                        :description "Original description 2"
                                        :target      {:type     "table"
                                                      :database (mt/id)
                                                      :schema   "public"
                                                      :name     "merge_test_table_2"}}]
      (let [;; Create a workspace
            {ws-id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                              {:name        "Merge test"
                                               :database_id (mt/id)})
            ;; Add 2 transforms
            {ws-x-1-id :ref_id :as ws-x-1}
            (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform")
                                  (merge {:global_id (:id x1)}
                                         (select-keys x1 [:name :description :source :target])))
            {ws-x-2-id :ref_id}
            (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform")
                                  (merge {:global_id (:id x2)}
                                         (select-keys x2 [:name :description :source :target])))
            ;; Update first
            _  (mt/user-http-request :crowberto :put 200
                                     (ws-url ws-id "/transform" ws-x-1-id)
                                     {:name "UPDATED 1"})
            ;; Archive second
            _ (mt/user-http-request :crowberto :post 204
                                    (ws-url ws-id "/transform" ws-x-2-id "/archive"))
            ;; And add _workspace only transform_
            {ws-x-3-id :ref_id :as ws-x-3}
            (mt/user-http-request :crowberto :post 200
                                  (ws-url ws-id "/transform")
                                  {:name "WS only transform"
                                   :description "this is ws only x"
                                   :source {:type :query
                                            :database (mt/id)
                                            :query (lib/native-query mp "select 1")}
                                   :target {:type "table"
                                            :schema "public"
                                            :name "merge_test_table_3"}})]
        (testing "Merge all 3"
          (let [resp (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/merge"))
                new-global-id (:global_id (m/find-first (comp #{"create"} :op) (get-in resp [:merged :transforms])))]
            (testing "Response"
              (is (empty? (:errors resp)))
              (is (some? (m/find-first
                          #{{:op "update"
                             :global_id (:id x1)
                             :ref_id ws-x-1-id}}
                          (get-in resp [:merged :transforms]))))
              (is (some? (m/find-first
                          #{{:op "delete"
                             :global_id (:id x2)
                             :ref_id ws-x-2-id}}
                          (get-in resp [:merged :transforms]))))
              (is (some? (m/find-first
                          #{{:op "create"
                             :global_id new-global-id
                             :ref_id ws-x-3-id}}
                          (get-in resp [:merged :transforms])))))
            (testing "All transforms were deleted on merge"
              (is (= 0 (count (t2/select :model/WorkspaceTransform :workspace_id ws-id)))))
            (testing "Propagation back to core"
              (is (= "UPDATED 1"
                     (t2/select-one-fn :name :model/Transform :id (:global_id ws-x-1))))
              (is (not (t2/exists? :model/Transform :id (:id x2))))
              (is (= (:name ws-x-3)
                     (t2/select-one-fn :name :model/Transform :id new-global-id))))))))))

(deftest create-workspace-transform-permissions-test
  (testing "POST /api/ee/workspace/:id/transform requires superuser"
    (ws.tu/with-workspaces! [workspace {:name "Transform Test"}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 (ws-url (:id workspace) "/transform")
                                   {:name   "Should Fail"
                                    :source {:type  "query"
                                             :query {}}
                                    :target {:type "table"
                                             :name "should_fail"}}))))))

(deftest create-workspace-transform-archived-test
  (testing "Cannot create transform in archived workspace"
    (ws.tu/with-workspaces! [workspace {:name "Archived"}]
      (t2/update! :model/Workspace (:id workspace) {:base_status :archived})
      (is (= "Cannot create transforms in an archived workspace"
             (mt/user-http-request :crowberto :post 400 (ws-url (:id workspace) "/transform")
                                   {:name   "Should Fail"
                                    :source {:type  "query"
                                             :query (mt/mbql-query venues)}
                                    :target {:type "table"
                                             :name "should_fail"}}))))))

(deftest add-transforms-to-workspace-test
  (testing "Add transforms to workspace via POST /transform"
    (with-transform-cleanup! [orig-name "ws_tables_test"]
      (mt/with-temp [:model/Transform {x1-id :id :as x1} {:name   "Transform to Check Out"
                                                          :target {:type     "table"
                                                                   :database (mt/id)
                                                                   :schema   "public"
                                                                   :name     orig-name}}]
        (let [{ws-id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                {:name        "Add Transforms Test"
                                                 :database_id (mt/id)})]
          (is (int? ws-id))
          (testing "Can check out a global transform into workspace"
            (let [response (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform")
                                                 (merge {:global_id x1-id}
                                                        (select-keys x1 [:name :description :source :target])))]
              (is (=? {:ref_id       string?
                       :global_id    x1-id
                       :name         "Transform to Check Out"
                       :target_stale true}
                      response))
              (is (= response (mt/user-http-request :crowberto :get 200 (ws-url ws-id "/transform" (:ref_id response)))))))

          (testing "Can create a new provisional transform"
            (let [response (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform")
                                                 {:name   "New Transform"
                                                  :source {:type  "query"
                                                           :query (mt/mbql-query venues)}
                                                  :target {:type "table"
                                                           :name "new_transform_output"}})]
              (is (=? {:ref_id          string?
                       :global_id       nil?
                       :name            "New Transform"
                       :target_stale    true
                       :target_isolated {:type     "table"
                                         :database pos-int?
                                         :schema   string?
                                         :name     string?}}
                      response))
              (is (= response (mt/user-http-request :crowberto :get 200 (ws-url ws-id "transform" (:ref_id response)))))))

          (testing "Cannot add transforms to archived workspace"
            (t2/update! :model/Workspace ws-id {:base_status :archived})
            (is (= "Cannot create transforms in an archived workspace"
                   (mt/user-http-request :crowberto :post 400 (ws-url ws-id "/transform")
                                         {:name   "Should Fail"
                                          :source {:type  "query"
                                                   :query (mt/mbql-query venues)}
                                          :target {:type "table"
                                                   :name "should_fail"}})))))))))

(deftest add-entities-requires-superuser-test
  (testing "POST /api/ee/workspace/:id/add requires superuser"
    (ws.tu/with-workspaces! [workspace {:name "Permission Test"}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 (ws-url (:id workspace) "/transform")
                                   {:name "blah", :source {}, :target {}}))))))

(deftest create-workspace-transform-test
  (mt/dataset transforms-dataset/transforms-test
    (let [{ws-id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                            {:name        "Test Workspace"
                                             :database_id (mt/id)})]
      (with-transform-cleanup! [table-name "workspace_transform_test"]
        (is (=? {:ref_id       string?
                 :workspace_id ws-id
                 ;:creator_id   (mt/user->id :crowberto)
                 :target       {:database (mt/id)}}
                (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform")
                                      {:name   "Workspace Transform"
                                       :source {:type  "query"
                                                :query (mt/mbql-query transforms_products)}
                                       :target {:type "table"
                                                :name table-name}})))
        (is (=? {:id ws-id, :status "ready"}
                (mt/user-http-request :crowberto :get 200 (ws-url ws-id))))
        (is (=? {:transforms [{:ref_id string?, :name "Workspace Transform", :source_type "mbql"}]}
                (mt/user-http-request :crowberto :get 200 (ws-url ws-id "/transform"))))))))

(deftest tables-endpoint-empty-ws-test
  (let [user-id (mt/user->id :crowberto)
        ws      (mt/user-http-request :crowberto :post 200 "ee/workspace/"
                                      {:name        "My test ws"
                                       :creator_id  user-id
                                       :database_id (mt/id)})]
    (is (= {:inputs  []
            :outputs []}
           (mt/user-http-request :crowberto :get 200 (ws-url (:id ws) "/table"))))))

(deftest tables-endpoint-transform-not-run-test
  (let [mp    (mt/metadata-provider)
        query (lib/native-query mp "select * from orders limit 10;")]
    (with-transform-cleanup! [orig-name "ws_tables_test"]
      (mt/with-temp [:model/Transform x1 {:name        "My X1"
                                          :source      {:type  "query"
                                                        :query query}
                                          :target      {:type     "table"
                                                        :database (mt/id)
                                                        :schema   "public"
                                                        :name     orig-name}}]
        (let [{ws-id :id}   (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                  {:name        "Test Workspace"
                                                   :database_id (mt/id)})
              ;; add the transform
              req           (assoc (select-keys x1 [:name :description :source :target]) :global_id (:id x1))
              ref-id        (:ref_id (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform") req))
              ;; get the tables
              tables-result (mt/user-http-request :crowberto :get 200 (ws-url ws-id "/table"))]
          (testing "/tables returns expected results"
            (is (=? {:inputs  [{:db_id (mt/id), :schema "public", :table "orders", :table_id int?}]
                     :outputs [{:db_id (mt/id)
                                :global {:schema "public", :table orig-name}
                                :isolated {:transform_id ref-id}}]}
                    tables-result))))))))

(deftest tables-endpoint-test
  (let [mp          (mt/metadata-provider)
        ;; Following needed for driver specific sql.
        orders-meta (lib.metadata/table mp (mt/id :orders))
        sql-str (-> (lib/query mp orders-meta)
                    (lib/limit 10)
                    (qp.compile/compile)
                    :query)
        query       (lib/native-query mp sql-str)
        orig-schema (or (:schema orders-meta) (driver.sql/default-schema driver/*driver*))
        orig-name (:name orders-meta)
        target-schema (driver.sql/default-schema driver/*driver*)]
    (with-transform-cleanup! [target-name "ws_tables_test"]
      (mt/with-temp [:model/Transform x1 {:name   "My X1"
                                          :source {:type  "query"
                                                   :query query}
                                          :target {:type     "table"
                                                   :database (mt/id)
                                                   :schema   target-schema
                                                   :name     target-name}}]
        ;; create the global table
        (transforms.execute/execute! x1 {:run-method :manual})
        (let [workspace    (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                 {:name        "Test Workspace"
                                                  :database_id (mt/id)})
              create-url   (ws-url (:id workspace) "/transform")
              create-req   (assoc (select-keys x1 [:name :source :target]) :global_id (:id x1))
              ;; add the transform
              ref-id       (:ref_id (mt/user-http-request :crowberto :post 200 create-url create-req))
              ;; fetch the workspace again so we have the new schema
              workspace    (t2/select-one :model/Workspace (:id workspace))
              ws-transform (t2/select-one :model/WorkspaceTransform :workspace_id (:id workspace) :ref_id ref-id)
              orig-id      (t2/select-one-fn :id [:model/Table :id]
                                             :db_id (:database_id workspace)
                                             :schema (-> ws-transform :target :schema)
                                             :name (-> ws-transform :target :name))]
          (testing "/table returns expected results"
            ;; Schema is normalized to driver's default schema ("public" for Postgres) when stored
            (is (=? {:inputs [{:db_id (mt/id), :schema orig-schema, :table orig-name, :table_id int?}]
                     :outputs
                     [{:db_id    (mt/id)
                       :global   {:schema   target-schema
                                  :table    target-name
                                  :table_id orig-id}
                       :isolated {:transform_id ref-id
                                  #_#_:schema       (:schema workspace)
                                  :table        string?
                                  :table_id     nil}}]}
                    (mt/user-http-request :crowberto :get 200 (ws-url (:id workspace) "/table")))))
          (testing "and after we run the transform, id for isolated table appears"
            (is (=? {:status "succeeded"}
                    (mt/user-http-request :crowberto :post 200 (ws-url (:id workspace) "transform" ref-id "run"))))
            (is (=? {:inputs [{:db_id (mt/id), :schema orig-schema, :table orig-name, :table_id int?}]
                     :outputs
                     [{:db_id    (mt/id)
                       :global   {:schema   target-schema
                                  :table    target-name
                                  :table_id orig-id}
                       :isolated {:transform_id ref-id
                                  :schema       (:schema workspace)
                                  ;; maybe this is a bit too specific, but gives me a peace of mind for now
                                  :table        (ws.u/isolated-table-name target-schema target-name)
                                  :table_id     int?}}]}
                    (mt/user-http-request :crowberto :get 200 (ws-url (:id workspace) "/table"))))))))))

;; TODO write a test for /table that covers the shadowing
;; e.g. have two transforms in a chain connecting 3 tables:  (A -> X1 -> B -> X2 -> C)
;; raw-inputs:      A (from X1) and B (from X2)
;; outputs:         B (from X1) and C (from X2)
;; external-inputs: A (raw-inputs - outputs)

;;;; Card dependency rejection tests

(defn- query-with-source-card
  "Create a pMBQL query that uses a card as its source."
  [card-id]
  {:lib/type :mbql/query
   :database (mt/id)
   :stages   [{:lib/type    :mbql.stage/mbql
               :source-card card-id}]})

(defn- create-transform-with-card-source!
  "Create a transform whose source query depends on a card.
  The after-insert hook triggers dependency calculation automatically."
  [card]
  (t2/insert-returning-instance! :model/Transform
                                 {:name   "Transform depending on card"
                                  :source {:type  :query
                                           :query (query-with-source-card (:id card))}
                                  :target {:type     "table"
                                           :database (mt/id)
                                           :schema   "public"
                                           :name     "card_dep_output"}}))

(deftest add-transform-rejects-card-dependencies-test
  (testing "Cannot add transforms that depend on cards"
    (mt/with-temp [:model/Card card {:name          "Test Card"
                                     :database_id   (mt/id)
                                     :dataset_query (mt/mbql-query venues)}]
      (let [tx        (create-transform-with-card-source! card)
            ws        (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                            {:name        "Card Dep Workspace"
                                             :database_id (mt/id)})
            ;; TODO add validation
            _response (mt/user-http-request :crowberto :post 200 #_403 (ws-url (:id ws) "/transform") tx)]
        #_(is (re-find #"Cannot add transforms that depend on saved questions" ws))))))

(deftest add-transform-rejects-transitive-card-dependencies-test
  (testing "Cannot add transforms that transitively depend on cards"
    (mt/with-temp [:model/Card card {:name          "Base Card"
                                     :database_id   (mt/id)
                                     :dataset_query (mt/mbql-query venues)}]
      ;; tx1 depends on card
      (let [tx1 (create-transform-with-card-source! card)
            ;; tx2 depends on tx1 (via a manually created dependency - simulating transform chain)
            tx2 (t2/insert-returning-instance! :model/Transform
                                               {:name   "Transform 2 - depends on tx1"
                                                :source {:type  :query
                                                         :query {:database (mt/id)
                                                                 :type     :native
                                                                 :native   {:query "SELECT 1"}}}
                                                :target {:type     "table"
                                                         :database (mt/id)
                                                         :schema   "public"
                                                         :name     "tx2_output"}})]
        ;; Create dependency: tx2 depends on tx1
        (t2/insert! :model/Dependency
                    {:from_entity_type "transform"
                     :from_entity_id   (:id tx2)
                     :to_entity_type   "transform"
                     :to_entity_id     (:id tx1)})
        ;; Try to add tx2 (which transitively depends on card via tx1) to workspace
        (let [ws        (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                              {:name        "Transitive Card Dep Workspace"
                                               :database_id (mt/id)})
              ;; TODO add validation
              _response (mt/user-http-request :crowberto :post 200 #_403 (ws-url (:id ws) "/transform") tx2)]
          #_(is (re-find #"Cannot add transforms that depend on saved questions" response)))))))

(deftest rename-workspace-test
  (testing "POST /api/ee/workspace/:id/name updates the workspace name"
    (ws.tu/with-workspaces! [workspace {:name "Original Name"}]
      (let [response (mt/user-http-request :crowberto :put 200 (ws-url (:id workspace))
                                           {:name "Updated Name"})]
        (is (= "Updated Name"
               (:name response)
               (t2/select-one-fn :name :model/Workspace :id (:id workspace)))))))

  (testing "Requires superuser"
    (ws.tu/with-workspaces! [workspace {:name "Permission Test"}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 (ws-url (:id workspace))
                                   {:name "Should Fail"})))))

  (testing "Cannot rename an archived workspace"
    (ws.tu/with-workspaces! [workspace {:name "Archived"}]
      (t2/update! :model/Workspace (:id workspace) {:base_status :archived})
      (is (= "Cannot update an archived workspace"
             (mt/user-http-request :crowberto :put 400 (ws-url (:id workspace))
                                   {:name "Should Fail"}))))))

(deftest add-transform-rejects-card-dependencies-to-existing-workspace-test
  (testing "Cannot add transforms with card dependencies to existing workspace"
    (mt/with-temp [:model/Card card {:name          "Test Card"
                                     :database_id   (mt/id)
                                     :dataset_query (mt/mbql-query venues)}]
      (let [tx           (create-transform-with-card-source! card)
            workspace-id (:id (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                    {:name        "Empty Workspace"
                                                     :database_id (mt/id)}))
            ;; TODO add validation
            _response    (mt/user-http-request :crowberto :post 200 (ws-url workspace-id "/transform") tx)]
        #_(is (re-find #"Cannot add transforms that depend on saved questions" response))))))

(deftest validate-target-test
  (let [table (t2/select-one :model/Table :db_id (mt/id) :active true {:where [:not [:like :schema "mb__%"]]})]
    (ws.tu/with-workspaces! [ws {:name "test" :database_id (:db_id table)}]
      (mt/with-temp [:model/WorkspaceTransform _x1 {:workspace_id (:id ws)
                                                    :target       {:database (:db_id table)
                                                                   :type     "table"
                                                                   :schema   (:schema table)
                                                                   :name     (str "q_" (:name table))}}]
        (testing "Unique"
          (is (= "OK"
                 (mt/with-log-level [metabase.driver.sql-jdbc.sync.describe-table :fatal]
                   (mt/user-http-request :crowberto :post 200 (ws-url (:id ws) "/transform/validate/target")
                                         {:db_id  (:db_id table)
                                          :target {:type   "table"
                                                   :schema "public"
                                                   :name   (str/replace (str (random-uuid)) "-" "_")}})))))
        ;; We've decided to defer this error until merge.
        ;; Also, this logic is going to become more relaxed, where we're allowed to take over a "dormant" table.
        #_(testing "Conflict outside of workspace"
            (is (= "A table with that name already exists."
                   (mt/user-http-request :crowberto :post 403 (ws-url (:id ws) "/transform/validate/target")
                                         {:db_id  (:db_id table)
                                          :target {:type   "table"
                                                   :schema (:schema table)
                                                   :name   (:name table)}}))))
        (testing "Must not target the isolated schema"
          (is (= "Must not target an isolated workspace schema"
                 (mt/with-log-level [metabase.driver.sql-jdbc.sync.describe-table :fatal]
                   (mt/user-http-request :crowberto :post 403 (ws-url (:id ws) "/transform/validate/target")
                                         {:db_id  (:db_id table)
                                          :target {:type   "table"
                                                   ;; TODO the schema on the workspace is only set as part of adding tx
                                                   :schema "mb__isolation_blah" #_(:schema ws)
                                                   :name   (str "q_" (:name table))}})))))

        (testing "Conflict inside of workspace"
          (is (= "Another transform in this workspace already targets that table"
                 (mt/with-log-level [metabase.driver.sql-jdbc.sync.describe-table :fatal]
                   (mt/user-http-request :crowberto :post 403 (ws-url (:id ws) "/transform/validate/target")
                                         {:db_id  (:db_id table)
                                          :target {:type   "table"
                                                   :schema (:schema table)
                                                   :name   (str "q_" (:name table))}})))))))))

;;;; Async workspace creation tests

;; TODO need to add a transform to trigger initialization
#_(deftest create-workspace-returns-updating-status-test
    (testing "Creating workspace returns status :pending immediately"
      (let [res (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                      {:name "async-test" :database_id (mt/id)})]
      ;; TODO this isn't async yet, but it should be after BOT-746
        #_(is (=? {:status "pending"} res))
        (testing "and then it becomes ready"
          (is (=? {:status :ready} (ws.tu/ws-ready res)))))))

;; TODO need to add a transform to trigger initialization
#_(deftest workspace-log-endpoint-test
    (testing "GET /api/ee/workspace/:id/log returns status and log entries"
      (let [{ws-id :id} (ws.tu/ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                              {:name "log-test" :database_id (mt/id)}))]
        (is (=? {:workspace_id      ws-id
                 :status            "ready"
                 :updated_at        some?
                 :last_completed_at some?
                 :logs              [{:task   "database-isolation"
                                      :status "success"}
                                     {:task "workspace-setup"}]}
                (mt/user-http-request :crowberto :get 200 (ws-url ws-id "/log")))))))

(deftest workspace-log-endpoint-404-test
  (testing "GET /api/ee/workspace/:id/log returns 404 for non-existent workspace"
    (is (= "Not found."
           (mt/user-http-request :crowberto :get 404 "ee/workspace/999999/log")))))

;; TODO need to add a transform to trigger initialization
#_(deftest workspace-log-entries-created-test
    (testing "WorkspaceLog entries are created during setup"
      (let [{ws-id :id} (ws.tu/ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                              {:name "log-entries-test" :database_id (mt/id)}))]
        (is (=? [{:task   :database-isolation
                  :status :success}
                 {:task   :workspace-setup
                  :status :success}]
                (t2/select :model/WorkspaceLog :workspace_id ws-id {:order-by [[:started_at :desc]]}))))))

;; TODO this test doesn't work yet, because we need to add a transform before it'll do the initialization
#_(deftest workspace-setup-failure-logs-error-test
    (testing "Failed workspace setup logs error message"
      (mt/with-dynamic-fn-redefs [ws.isolation/ensure-database-isolation!
                                  (fn [& _] (throw (ex-info "Test isolation error" {})))]
        (let [{ws-id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                {:name "fail-test" :database_id (mt/id)})
              _           (try (ws.tu/ws-ready ws-id) (catch Exception _))]
          (Thread/sleep 500)
          (is (=? [{:task    :database-isolation
                    :status  :failure
                    :message "Test isolation error"}
                   {:task   :workspace-setup
                    :status :failure}]
                  (t2/select :model/WorkspaceLog :workspace_id ws-id {:order-by [[:started_at :desc]]})))))))

;;; ---------------------------------------- Uninitialized Workspace Tests ----------------------------------------

(deftest uninitialized-workspace-lifecycle-test
  (testing "Workspace can be created without database_id (uses provisional default)"
    (let [{ws-id :id :as ws} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                   {:name "uninitialized-lifecycle"})]
      ;; database_id is set to provisional default, but :status is uninitialized
      (is (=? {:status "uninitialized" :database_id pos-int?} ws))
      (testing "can be archived and deleted"
        (is (= "archived" (:status (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/archive")))))
        (is (= {:ok true} (mt/user-http-request :crowberto :delete 200 (ws-url ws-id))))
        (is (not (t2/exists? :model/Workspace :id ws-id)))))))

(deftest ^:synchronized initialize-uninitialized-workspace-test
  (testing "via adding transform"
    (let [ws (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                   {:name "init-via-transform"})]
      (is (= "uninitialized" (:status ws)))
      (let [transform (mt/user-http-request :crowberto :post 200 (ws-url (:id ws) "/transform")
                                            {:name   "New Transform"
                                             :source {:type  "query"
                                                      :query (mt/mbql-query venues)}
                                             :target {:type     "table"
                                                      :database (mt/id)
                                                      :schema   "public"
                                                      :name     "init_transform_output"}})]
        (is (some? (:ref_id transform)))
        (let [ws (ws.tu/ws-ready ws)]
          (is (=? {:db_status   :ready
                   :database_id (mt/id)}
                  ws)))
        (testing "PUT database_id fails on already initialized workspace"
          (is (= "Can only set database_id on uninitialized workspace"
                 (mt/user-http-request :crowberto :put 400 (ws-url (:id ws))
                                       {:database_id (mt/id)}))))))))

;;; ---------------------------------------- Workspace Transform CRUD Tests ----------------------------------------

(deftest get-workspace-transforms-test
  (testing "GET /api/ee/workspace/:id/transform"
    (ws.tu/with-workspaces! [workspace {:name "List Transforms Test"}]
      (mt/with-temp [:model/WorkspaceTransform tx1  {:name         "Transform 1"
                                                     :workspace_id (:id workspace)}
                     :model/WorkspaceTransform tx2  {:name         "Transform 2"
                                                     :workspace_id (:id workspace)}
                     :model/Transform          _tx3 {:name "Global Transform"}]
        (testing "returns transforms in workspace"
          (is (=? {:transforms [{:ref_id (:ref_id tx1)}
                                {:ref_id (:ref_id tx2)}]}
                  (mt/user-http-request :crowberto :get 200 (ws-url (:id workspace) "/transform")))))
        (testing "requires superuser"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (ws-url (:id workspace) "/transform")))))))
    (testing "returns empty list when no transforms"
      (ws.tu/with-workspaces! [workspace {:name "Empty Workspace"}]
        (is (= {:transforms []}
               (mt/user-http-request :crowberto :get 200 (ws-url (:id workspace) "/transform"))))))
    (testing "returns 404 for non-existent workspace"
      (is (= "Not found."
             (mt/user-http-request :crowberto :get 404 "ee/workspace/999999/transform"))))))

(deftest get-workspace-transform-by-id-test
  (testing "GET /api/ee/workspace/:id/transform/:txid"
    (ws.tu/with-workspaces! [workspace1 {:name "Workspace 1"}
                             workspace2 {:name "Workspace 2"}]
      (mt/with-temp [:model/WorkspaceTransform transform {:name         "My Transform"
                                                          :description  "Test description"
                                                          :workspace_id (:id workspace1)}]
        (testing "returns specific transform"
          (is (=? {:ref_id      (:ref_id transform)
                   :name        "My Transform"
                   :description "Test description"}
                  (mt/user-http-request :crowberto :get 200
                                        (ws-url (:id workspace1) "/transform" (:ref_id transform))))))
        (testing "returns 404 if transform not in workspace"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :get 404
                                       (ws-url (:id workspace2) "/transform" (:ref_id transform))))))
        (testing "requires superuser"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403
                                       (ws-url (:id workspace1) "/transform" (:ref_id transform))))))))))

(deftest update-workspace-transform-test
  (testing "PUT /api/ee/workspace/:id/transform/:txid"
    (ws.tu/with-workspaces! [workspace1 {:name "Workspace 1"}
                             workspace2 {:name "Workspace 2"}]
      (mt/with-temp [:model/WorkspaceTransform transform {:name         "Original Name"
                                                          :description  "Original description"
                                                          :workspace_id (:id workspace1)}]
        (testing "updates transform"
          (is (=? {:ref_id      (:ref_id transform)
                   :name        "Updated Name"
                   :description "Updated description"}
                  (mt/user-http-request :crowberto :put 200
                                        (ws-url (:id workspace1) "/transform" (:ref_id transform))
                                        {:name        "Updated Name"
                                         :description "Updated description"})))
          (is (= "Updated Name" (t2/select-one-fn :name :model/WorkspaceTransform :ref_id (:ref_id transform)))))
        (testing "returns 404 if transform not in workspace"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :put 404
                                       (ws-url (:id workspace2) "/transform" (:ref_id transform))
                                       {:name "Should Fail"}))))
        (testing "requires superuser"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403
                                       (ws-url (:id workspace1) "/transform" (:ref_id transform))
                                       {:name "Should Fail"}))))))))

(deftest delete-workspace-transform-test
  (testing "DELETE /api/ee/workspace/:id/transform/:txid"
    (ws.tu/with-workspaces! [workspace1 {:name "Workspace 1"}
                             workspace2 {:name "Workspace 2"}]
      (mt/with-temp [:model/WorkspaceTransform transform1 {:name         "Transform in WS1"
                                                           :workspace_id (:id workspace1)}
                     :model/WorkspaceTransform transform2 {:name         "To Delete"
                                                           :workspace_id (:id workspace1)}]
        (testing "returns 404 if transform not in workspace"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :delete 404
                                       (ws-url (:id workspace2) "/transform" (:ref_id transform1))))))
        (testing "requires superuser"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :delete 403
                                       (ws-url (:id workspace1) "/transform" (:ref_id transform1))))))
        (testing "deletes transform"
          (is (nil? (mt/user-http-request :crowberto :delete 204
                                          (ws-url (:id workspace1) "/transform" (:ref_id transform2)))))
          (is (t2/exists? :model/WorkspaceTransform :ref_id (:ref_id transform1)))
          (is (not (t2/exists? :model/WorkspaceTransform :ref_id (:ref_id transform2)))))))))

(deftest run-workspace-transform-test
  (testing "POST /api/ee/workspace/:id/transform/:txid/run"
    (transforms.tu/with-transform-cleanup! [output-table "ws_api"]
      (ws.tu/with-workspaces! [ws1 {:name "Workspace 1"}
                               ws2 {:name "Workspace 2"}]
        (mt/with-temp [:model/Transform x1 {:name   "Transform in WS1"
                                            :source {:type  "query"
                                                     :query (mt/native-query {:query "SELECT count(*) from orders"})}
                                            :target {:type     "table"
                                                     :database (mt/id)
                                                     :schema   "public"
                                                     :name     output-table}}]
          (let [ref-id        (:ref_id
                               (mt/user-http-request :crowberto :post 200 (ws-url (:id ws1) "/transform") x1))
                isolated-name (ws.u/isolated-table-name "public" output-table)
                ;; re-query the workspace to get newly populated fields, like schema
                ws1           (t2/select-one :model/Workspace (:id ws1))]
            (testing "returns 404 if transform not in workspace"
              (is (= "Not found."
                     (mt/user-http-request :crowberto :post 404
                                           (ws-url (:id ws2) "/transform/" ref-id "/run")))))
            (testing "requires superuser"
              (is (= "You don't have permissions to do that."
                     (mt/user-http-request :rasta :post 403
                                           (ws-url (:id ws1) "/transform/" ref-id "/run")))))
            (testing "successful execution with remapped target"
              (let [result (mt/user-http-request :crowberto :post 200 (ws-url (:id ws1) "transform" ref-id "run"))]
                (is (=? {:status     "succeeded"
                         :start_time some?
                         :end_time   some?
                         :table      {:schema (:schema ws1)
                                      :name   isolated-name}}
                        result)))
              (testing "and we don't get any excessive transforms in the db"
                (is (= (:id x1)
                       (t2/select-one-fn :id [:model/Transform :id] {:order-by [[:id :desc]]})))))
            (testing "transform has last_run_at after that"
              (is (=? {:last_run_at some?}
                      (mt/user-http-request :crowberto :get 200 (ws-url (:id ws1) "transform" ref-id)))))))))
    (testing "failed execution returns status and message"
      (transforms.tu/with-transform-cleanup! [output-table "ws_api_fail"]
        (ws.tu/with-workspaces! [ws {:name "Workspace for failure test"}]
          (let [bad-transform {:name   "Bad Transform"
                               :source {:type  "query"
                                        :query (mt/native-query {:query "SELECT nocolumn FROM orders"})}
                               :target {:type     "table"
                                        :database (mt/id)
                                        :schema   "public"
                                        :name     output-table}}
                ref-id        (:ref_id
                               (mt/user-http-request :crowberto :post 200 (ws-url (:id ws) "/transform") bad-transform))
                isolated-name (ws.u/isolated-table-name "public" output-table)
                ;; re-query the workspace to get newly populated fields, like schema
                ws            (t2/select-one :model/Workspace (:id ws))]
            (testing "failed execution returns 200 with failed status and error message"
              (let [result (mt/with-log-level [metabase-enterprise.transforms.query-impl :fatal]
                             (mt/user-http-request :crowberto :post 200 (ws-url (:id ws) "transform" ref-id "run")))]
                (is (=? {:status     "failed"
                         :start_time some?
                         :end_time   some?
                         :message    #"(?s).*nocolumn.*"
                         :table      {:schema (:schema ws)
                                      :name   isolated-name}}
                        result))))
            (testing "transform has last_run_at and last_run_message after failure"
              (is (=? {:last_run_at      some?
                       :last_run_message #"(?s).*nocolumn.*"}
                      (mt/user-http-request :crowberto :get 200 (ws-url (:id ws) "transform" ref-id)))))))))))

(deftest execute-workspace-test
  (testing "POST /api/ee/workspace/:id/execute"
    (ws.tu/with-workspaces! [ws-1 {:name "Workspace 1"}
                             ws-2 {:name "Workspace 2"}]
      (mt/with-temp [:model/WorkspaceTransform transform {:name "Transform in WS1", :workspace_id (:id ws-1)}]
        (testing "returns empty when no transforms"
          (is (= {:succeeded []
                  :failed    []
                  :not_run   []}
                 (mt/user-http-request :crowberto :post 200 (ws-url (:id ws-2) "/run")))))
        (testing "executes transforms in workspace"
          (is (= {:succeeded [(:ref_id transform)]
                  :failed    []
                  :not_run   []}
                 (mt/user-http-request :crowberto :post 200 (ws-url (:id ws-1) "/run")))))))))

(defn- random-target [db-id]
  {:type     "table"
   :database db-id
   :schema   "transform_output"
   :name     (str/replace (str "t_" (random-uuid)) "-" "_")})

(defn- my-native-query [db-id sql & [card-mapping]]
  ;; TODO (chris 2025/12/11) don't build MBQL manually
  ;; For some reason, when is use mt/native-query the transforms hook thinks this is MBQL.
  ;; It's probably a dialect version issue.
  {:database db-id
   :lib/type :mbql/query
   :stages   [{:lib/type      :mbql.stage/native
               :native        sql
               :template-tags (u/for-map [[tag card-id] card-mapping]
                                [tag {:name         tag
                                      :display-name tag
                                      :type         :card
                                      :card-id      card-id}])}]})

(deftest external-transforms-test
  (testing "GET /api/ee/workspace/id/external/transform"
    (mt/with-premium-features #{:transforms :workspaces}
      (let [db-1 (mt/id)]
        (ws.tu/with-workspaces! [ws1 {:name "Our Workspace"}
                                 ws2 {:name "Their Workspace"}]
          (mt/with-temp [;; Global transforms (workspace_id = null)
                         :model/Database          {db-2 :id}   {:name "Other Db"}
                         :model/Transform          {xf1-id :id} {:name   "Checked out - 1"
                                                                 :target (random-target db-1)}
                         :model/Transform          {xf2-id :id} {:name   "Checked out - 2"
                                                                 :target (random-target db-1)}
                         :model/Transform          {xf3-id :id} {:name   "Not checked out - python"
                                                                 :source {:type "python"}
                                                                 :target (random-target db-1)}
                         :model/Transform          {xf4-id :id} {:name   "Not checked out - mbql"
                                                                 :source {:type     :query
                                                                          :query    (mt/mbql-query venues)}
                                                                 :target (random-target db-1)}
                         :model/Transform          {xf5-id :id} {:name   "Not checked out - native"
                                                                 :source {:type  "query"
                                                                          :query (my-native-query db-1 "SELECT 1")}
                                                                 :target (random-target db-1)}
                         ;; Native transform referencing a card - should be disabled once BOT-694 is implemented
                         :model/Card               {card-id :id} {:name          "Source Card"
                                                                  :database_id   db-1
                                                                  :dataset_query (mt/mbql-query venues)}
                         :model/Transform          {xf6-id :id} {:name        "Not checked out - native with card dep"
                                                                 :source_type :native
                                                                 :source      {:type  "query"
                                                                               :query (my-native-query
                                                                                       db-1
                                                                                       "SELECT * FROM {{card}}"
                                                                                       {"card" card-id})}
                                                                 :target      (random-target db-1)}
                         :model/Transform          {xf7-id :id} {:name   "Using another database"
                                                                 :target (random-target db-2)}
                         ;; Workspace transforms (mirrored from global1 and global2)
                         :model/WorkspaceTransform _            {:global_id    xf1-id
                                                                 :workspace_id (:id ws1)}
                         :model/WorkspaceTransform _            {:global_id    xf2-id
                                                                 :workspace_id (:id ws2)}]
            (testing "excludes irrelevant transforms, and indicates which remaining transforms cannot be checked out."
              (let [transforms (:transforms (mt/user-http-request :crowberto :get 200 (ws-url (:id ws1) "/external/transform")))
                    test-ids   #{xf1-id xf2-id xf3-id xf4-id xf5-id xf6-id xf7-id}
                    ;; Filter out cruft from dev, leaky tests, etc
                    ids        (into #{} (comp (map :id) (filter test-ids)) transforms)]
                (testing "we filter out the expected transforms"
                  ;; ❌ xf1 is checked out in this workspace, so it's filtered out
                  ;; ✅ xf2 is only checked out in another workspace, so it's kept
                  ;; ❌ xf7 is in another database, so it's filtered out
                  (is (= (disj test-ids xf1-id xf7-id) ids)))
                (testing "we get the correct checkout_disabled reasons"
                  (is (= {xf2-id nil
                          xf3-id nil #_python-is-supported
                          xf4-id "mbql"
                          xf5-id nil #_native-is-supported
                          xf6-id "card-reference"}
                         (u/index-by :id :checkout_disabled transforms))))))
            (testing "passing database-id shows transforms from that database"
              (is (= [xf7-id]
                     (map :id
                          (:transforms
                           (mt/user-http-request :crowberto :get 200
                                                 (ws-url (:id ws1) (str "external/transform?database-id=" db-2))))))))))))))

;;; ---------------------------------------- Table ID Fallback Tests ----------------------------------------
;; These tests verify that when WorkspaceOutput rows have null table IDs (e.g., because sync
;; hasn't run yet), the /table endpoint will look up the IDs from metabase_table as a fallback.

(deftest tables-endpoint-fallback-global-table-id-test
  (testing "GET /api/ee/workspace/:id/table uses fallback for null global_table_id"
    (mt/with-premium-features #{:workspaces}
      ;; TODO remove :schema workaround once this adds a transform properly, triggering async initialization
      (ws.tu/with-workspaces! [workspace {:name "Fallback Test WS" :schema "workaround"}]
        (mt/with-temp [:model/WorkspaceTransform ws-tx {:workspace_id (:id workspace)
                                                        :name         "Test Transform"
                                                        :target       {:type     "table"
                                                                       :database (mt/id)
                                                                       :schema   "public"
                                                                       :name     "fallback_test_table"}}
                       ;; Create a table that exists but WorkspaceOutput doesn't know about yet
                       :model/Table              table {:db_id  (mt/id)
                                                        :schema "public"
                                                        :name   "fallback_test_table"
                                                        :active true}
                       ;; Create WorkspaceOutput with null global_table_id (simulating pre-sync state)
                       :model/WorkspaceOutput    _     {:workspace_id      (:id workspace)
                                                        :ref_id            (:ref_id ws-tx)
                                                        :db_id             (mt/id)
                                                        :global_schema     "public"
                                                        :global_table      "fallback_test_table"
                                                        :global_table_id   nil
                                                        ;; TODO another spot
                                                        :isolated_schema   (or (:schema workspace) "workaround")
                                                        :isolated_table    "public__fallback_test_table"
                                                        :isolated_table_id nil}]
          (let [result (mt/user-http-request :crowberto :get 200 (ws-url (:id workspace) "/table"))]
            (testing "fallback populates global table_id from metabase_table"
              (is (= (:id table)
                     (-> result :outputs first :global :table_id))))
            (testing "isolated table_id remains nil when table doesn't exist"
              (is (nil? (-> result :outputs first :isolated :table_id))))))))))

(deftest ^:parallel tables-endpoint-fallback-isolated-table-id-test
  (testing "GET /api/ee/workspace/:id/table uses fallback for null isolated_table_id"
    (mt/with-premium-features #{:workspaces}
      (mt/with-temp [:model/Workspace          workspace {:name        "Isolated Fallback Test WS"
                                                          :database_id (mt/id)
                                                          :schema      "ws_iso_fallback"}
                     :model/WorkspaceTransform ws-tx     {:workspace_id (:id workspace)
                                                          :name         "Test Transform"
                                                          :target       {:type     "table"
                                                                         :database (mt/id)
                                                                         :schema   "public"
                                                                         :name     "iso_fallback_table"}}
                     ;; Create the isolated table in metabase_table
                     :model/Table              iso-table {:db_id  (mt/id)
                                                          :schema "ws_iso_fallback"
                                                          :name   "public__iso_fallback_table"
                                                          :active true}
                     ;; Create WorkspaceOutput with null isolated_table_id
                     :model/WorkspaceOutput    _         {:workspace_id      (:id workspace)
                                                          :ref_id            (:ref_id ws-tx)
                                                          :db_id             (mt/id)
                                                          :global_schema     "public"
                                                          :global_table      "iso_fallback_table"
                                                          :global_table_id   nil
                                                          :isolated_schema   "ws_iso_fallback"
                                                          :isolated_table    "public__iso_fallback_table"
                                                          :isolated_table_id nil}]
        (let [result (mt/user-http-request :crowberto :get 200 (ws-url (:id workspace) "/table"))]
          (testing "fallback populates isolated table_id from metabase_table"
            (is (= (:id iso-table)
                   (-> result :outputs first :isolated :table_id)))))))))

(deftest ^:parallel tables-endpoint-fallback-both-table-ids-test
  (testing "GET /api/ee/workspace/:id/table uses fallback for both null table IDs"
    (mt/with-premium-features #{:workspaces}
      (mt/with-temp [:model/Workspace          workspace    {:name        "Both Fallback Test WS"
                                                             :database_id (mt/id)
                                                             :schema      "ws_both_fallback"}
                     :model/WorkspaceTransform ws-tx        {:workspace_id (:id workspace)
                                                             :name         "Test Transform"
                                                             :target       {:type     "table"
                                                                            :database (mt/id)
                                                                            :schema   "public"
                                                                            :name     "both_fallback_table"}}
                     ;; Create both tables
                     :model/Table              global-table {:db_id  (mt/id)
                                                             :schema "public"
                                                             :name   "both_fallback_table"
                                                             :active true}
                     :model/Table              iso-table    {:db_id  (mt/id)
                                                             :schema "ws_both_fallback"
                                                             :name   "public__both_fallback_table"
                                                             :active true}
                     ;; Create WorkspaceOutput with both table IDs null
                     :model/WorkspaceOutput    _            {:workspace_id      (:id workspace)
                                                             :ref_id            (:ref_id ws-tx)
                                                             :db_id             (mt/id)
                                                             :global_schema     "public"
                                                             :global_table      "both_fallback_table"
                                                             :global_table_id   nil
                                                             :isolated_schema   "ws_both_fallback"
                                                             :isolated_table    "public__both_fallback_table"
                                                             :isolated_table_id nil}]
        (let [result (mt/user-http-request :crowberto :get 200 (ws-url (:id workspace) "/table"))]
          (testing "fallback populates both table IDs"
            (is (= (:id global-table)
                   (-> result :outputs first :global :table_id)))
            (is (= (:id iso-table)
                   (-> result :outputs first :isolated :table_id)))))))))

(deftest graph-test
  (testing "GET /api/ee/workspace/:id/graph"
    (ws.tu/with-workspaces! [ws {:name "Workspace 1"}]
      ;; TODO use dag creation helper or DSL instead
      (mt/with-temp [:model/WorkspaceTransform tx {:name         "Transform in WS1"
                                                   :workspace_id (:id ws)}]
        ;; Workaround - remove the temp thing and add one manually via API, to trigger init + analysis
        (t2/delete! :model/WorkspaceTransform :workspace_id (:id ws))
        ;; Fetch it again, as the ref_id will have changed
        (let [tx (mt/user-http-request :crowberto :post 200 (ws-url (:id ws) "transform")
                                       ;; with-temp doesn't populate a database id, and doesn't query a table
                                       (-> tx
                                           (assoc-in [:target :database] (mt/id))
                                           (assoc-in [:target :schema] "test_schema")
                                           (assoc-in [:source :query :stages 0 :native] "SELECT 1 as numb FROM venues")))]

          ;; Cheeky dag test, that really belongs in dag-test (move it there?)
          ;; Schemas are normalized to driver's default (case varies by driver)
          (is (=? {:dependencies {{:id (:ref_id tx), :node-type :workspace-transform}
                                  [{:id {:db (mt/id) :schema string?, :table string?, :id int?}, :node-type :table}]},
                   :entities     [{:id (:ref_id tx), :node-type :workspace-transform}],
                   :inputs       [{:db (mt/id), :id int?, :schema string?, :table string?}],
                   :outputs      [{:db     (mt/id),
                                   :id     nil,
                                   :schema string?,
                                   :table  #"test_table_.*"}]}
                  (ws.dag/path-induced-subgraph (:id ws) [{:entity-type :transform, :id (:ref_id tx)}])))

          (testing "returns empty when no transforms"
            ;; TODO not sure what we want to pass for "data", maybe leave it out for now?
            ;;      i guess stuff like "name" is useful for transforms...
            ;; TODO fix dependents count for inputs
            ;; Schema/table names vary by driver (H2 uppercase, Postgres lowercase)
            (is (=? {:nodes [{:type             "input-table"
                              :id               string?
                              :data             {:db     (mt/id)
                                                 :schema string?
                                                 :table  string?
                                                 :id     (mt/id :venues)}
                              :dependents_count {:workspace-transform 1}}
                             {:type             "workspace-transform"
                              :id               (:ref_id tx)
                              :data             {:ref_id (:ref_id tx)
                                                 :name "Transform in WS1"
                                                 :target {:db     (mt/id)
                                                          :schema string?
                                                          :table  string?}}
                              :dependents_count {}}],
                     :edges [{:from_entity_type "input-table"
                              :from_entity_id   string?
                              :to_entity_type   "workspace-transform"
                              :to_entity_id     (:ref_id tx)}]}
                    (mt/user-http-request :crowberto :get 200 (ws-url (:id ws) "graph"))))))))))

;; TODO having trouble with test setup, but manually verified this stuff is working in dev environment :-(
;; This should be tested using a non-trivial graph:
;; - Non-included ancestor transforms.
;; - Non-included descendant transforms.
;; - Enclosed transforms outside of the working set.
;; - Direct input table dependencies for enclosed transforms.
;; - A disconnected component.
;; Whatever else you can think of.
(deftest fancier-graph-test
  (testing "GET /api/ee/workspace/:id/graph"
    (ws.tu/with-workspaces! [ws {:name "Workspace 1"}]
      ;; TODO use dag creation helper
      (mt/with-temp [:model/WorkspaceTransform tx-1 {:name "A Tx in WS1", :workspace_id (:id ws)}
                     :model/Transform          tx-2 {:name "An external Tx"}
                     :model/WorkspaceTransform tx-3 {:name "Another Tx in WS1", :workspace_id (:id ws)}]
        ;; hacks to trigger initialization of the workspace
        (let [_ (t2/delete! :model/WorkspaceTransform :workspace_id (:id ws) :ref_id (:ref_id tx-1))
              tx-1 (mt/user-http-request :crowberto :post 200 (ws-url (:id ws) "transform") tx-1)
              ;; we need the MBQL to use vectors not lists, so we can use assoc-in
              tx-1 (walk/postwalk (fn [x] (if (seq? x) (vec x) x)) tx-1)

              driver         (t2/select-one-fn :engine [:model/Database :engine] (:database_id ws))
              default-schema (driver.sql/default-schema driver)
              tx-1-output    (:name (:target tx-1))
              tx-2-output    (sql.normalize/normalize-name driver (:name (:target tx-2)))
              venues-table   (sql.normalize/normalize-name driver "venues")
              tx-1-input     (str (mt/id) "-" default-schema "-" venues-table)
              ;; Reference for an input table we shouldn't actually have (it should be shadowed by t2)
              tx-3-input     (str (mt/id) "-" default-schema "-" tx-2-output)
              t1-ref         (:ref_id tx-1)
              t3-ref         (:ref_id tx-3)]

          ;; Resubmit transform to trigger analysis
          (mt/user-http-request :crowberto :put 200 (ws-url (:id ws) "transform" t1-ref)
                                ;; with-temp doesn't populate a database id, and doesn't query a table
                                (-> tx-1
                                    (select-keys [:source :target])
                                    (assoc-in [:target :database] (mt/id))
                                    (assoc-in [:source :query :stages 0 :native] "SELECT * FROM venues")))

          ;; Global dependency analysis requires tables to actually exist
          ;; Note - we need the transform to run **without** remapping, to generate the global table
          (mt/with-test-user :crowberto
            (ws.execute/run-transform-with-remapping (t2/select-one :model/WorkspaceTransform :ref_id t1-ref) {}))

          ;; Toucan hook will analyze this for us.
          (t2/update! :model/Transform (:id tx-2)
                      {:source (assoc-in (:source tx-2) [:query :stages 0 :native] (str "SELECT * FROM " tx-1-output))
                       :target (assoc (:target tx-2) :database (mt/id))})

          ;; Run it to complete the analysis
          ;; TODO for some reason we have the active table metadata, but the query transform fails due to missing table
          #_#_p (t2/select [:model/Table :id :name :active] :db_id (mt/id) :name (:name (:target tx-1)))
          #_(transforms.execute/execute! #p (t2/select-one :model/Transform (:id tx-2)) {:run-method :manual})
          #_#p (t2/select [:model/Dependency] :from_entity_type :transform :from_entity_id (:id tx-2))
          #_#p (t2/select [:model/Dependency] :to_entity_type :transform :to_entity_id (:id tx-2))

          ;; Naive code currently tries to grant permissions to the output of the external dependency, not realizing it is already shadowed.
          ;; TODO fix eager analysis to be aware of shadowing
          (mt/user-http-request :crowberto :put 200 (ws-url (:id ws) "transform" t3-ref)
                                ;; with-temp doesn't populate a database id, and doesn't query a table
                                (-> tx-3
                                    (select-keys [:source :target])
                                    (assoc-in [:target :database] (mt/id))
                                    (assoc-in [:source :query :stages 0 :native] (str "SELECT * FROM " tx-2-output))))

          ;; TODO investigate why the enclosed transform is not being included, could be bad setup
          (testing "returns enclosed external transform too"
            (is (= {:nodes #{{:type "input-table", :id tx-1-input, :data {:db (mt/id), :schema default-schema, :table venues-table, :id (mt/id :venues)}, :dependents_count {:workspace-transform 1}}
                             {:type "workspace-transform", :id t1-ref, :data {:ref_id t1-ref, :name "A Tx in WS1"}, :dependents_count {} #_{:external-transform 1}}
                             #_{:type "external-transform", :id (:id tx-2), :data {:id (:id tx-1), :name "An external Tx"}, :dependents_count {:workspace-transform 1}}
                             ;; We won't have this input table when we fix finding the enclosed global transform.
                             {:type "input-table", :id tx-3-input, :data {:db (mt/id), :schema default-schema, :table tx-2-output, :id nil}, :dependents_count {:workspace-transform 1}}
                             {:type "workspace-transform", :id t3-ref, :data {:ref_id t3-ref, :name "Another Tx in WS1"}, :dependents_count {}}},
                    :edges #{{:from_entity_type "input-table"
                              :from_entity_id   tx-1-input
                              :to_entity_type   "workspace-transform"
                              :to_entity_id     t1-ref}
                             ;; This input table will be replaced by a transform chain.
                             {:from_entity_type "input-table"
                              :from_entity_id   tx-3-input
                              :to_entity_type   "workspace-transform"
                              :to_entity_id     t3-ref}
                             #_{:from_entity_type "workspace-transform"
                                :from_entity_id   (:ref_id tx-1)
                                :to_entity_type   "external-transform"
                                :to_entity_id     (:id tx-2)}
                             #_{:from_entity_type "external-transform"
                                :from_entity_id   (:id tx-2)
                                :to_entity_type   "workspace-transform"
                                :to_entity_id     (:ref_id tx-3)}}}
                   (-> (mt/user-http-request :crowberto :get 200 (ws-url (:id ws) "graph"))
                       (update-vals set))))))))))

(deftest enabled-test
  (let [url "ee/workspace/enabled"]
    (testing "Requires admin"
      (is (= "You don't have permissions to do that." (mt/user-http-request :rasta :get 403 url)))
      (is (= {:supported true} (mt/user-http-request :crowberto :get 200 url))))
    (mt/with-temp [:model/Database {db-1 :id} {:name "Y", :engine "postgres"}
                   ;; For some reason, using a real but unsupported value like "databricks" is returning support :-C
                   :model/Database {db-2 :id} {:name "N", :engine "crazy"}]
      (testing "Unsupported driver"
        (is (= {:supported false, :reason "Database type not supported."}
               (mt/user-http-request :crowberto :get 200 (str url "?database-id=" db-2)))))
      (testing "Supported driver"
        (is (= {:supported true}
               (mt/user-http-request :crowberto :get 200 (str url "?database-id=" db-1)))))
      (testing "Listing"
        (is (= {:databases [{:id db-1, :name "Y", :supported true}]}
               (-> (mt/user-http-request :crowberto :get 200 "ee/workspace/database")
                   (update :databases #(filter (comp #{db-1 db-2} :id) %))))))
      (testing "Audit not returned"
        (is (nil?
             (m/find-first (comp #{audit/audit-db-id} :id)
                           (:databases (mt/user-http-request :crowberto :get 200 "ee/workspace/database")))))))))
