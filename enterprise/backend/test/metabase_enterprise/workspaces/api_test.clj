(ns ^:mb/driver-tests metabase-enterprise.workspaces.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.workspaces.api :as ws.api]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.execute :as ws.execute]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase-enterprise.workspaces.test-util :as ws.tu]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.api.macros :as api.macros]
   [metabase.audit-app.core :as audit]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.driver.sql.util :as sql.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]
   [metabase.transforms.api.transform :as transforms.api]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.test-dataset :as transforms-dataset]
   [metabase.transforms.test-util :as transforms.tu :refer [with-transform-cleanup!]]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

(ws.tu/ws-fixtures!)

(use-fixtures :once (fn [thunk] (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table) (thunk))))

(def ws-url
  "Alias for ws.tu/ws-url for convenience."
  ws.tu/ws-url)

(def ^:private ->native
  "It's convenient to construct queries using MBQL helper, but only native queries can be used in workspaces."
  (comp mt/native-query ws.tu/mbql->native))

;;; Authorization tests for all workspace routes are in service-user-authorization-test at the bottom of this file.

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
        ;; TODO (Chris 2026-02-02) -- would be good to check that the user, schema, and table metadata is gone too.
        (is (false? (t2/exists? :model/Workspace workspace-id)))))))

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

(deftest ^:synchronized merge-workspace-calls-destroy-isolation-test
  (testing "POST /api/ee/workspace/:id/merge calls destroy-workspace-isolation!"
    (let [called?   (atom false)
          workspace (ws.tu/create-ready-ws! "Merge Isolation Test")]
      (mt/with-dynamic-fn-redefs [ws.isolation/destroy-workspace-isolation!
                                  (fn [_database _workspace]
                                    (reset! called? true))]
        (mt/user-http-request :crowberto :post 200 (ws-url (:id workspace) "/merge"))
        (is @called? "destroy-workspace-isolation! should be called when merging")))))

(deftest unarchive-workspace-calls-ensure-isolation-test
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

(deftest unarchive-workspace-calls-sync-grant-accesses-test
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
      (testing "Archive resets access_granted to false"
        (mt/user-http-request :crowberto :post 200 (ws-url (:id workspace) "/archive"))
        (ws.tu/analyze-workspace! (:id workspace))
        (is (false? (t2/select-one-fn :access_granted :model/WorkspaceInput :workspace_id (:id workspace)))))

      (testing "Unarchive re-grants access and sets access_granted to true"
        (mt/with-dynamic-fn-redefs [ws.isolation/grant-read-access-to-tables!
                                    (fn [_database _workspace tables]
                                      (reset! granted-tables tables))]
          (mt/user-http-request :crowberto :post 200 (ws-url (:id workspace) "/unarchive"))
          (ws.tu/analyze-workspace! (:id workspace))
          (is (=? [{:schema string? :name "test_table_1"}] @granted-tables)
              "grant-read-access-to-tables! should be called with the input tables")
          (is (true? (t2/select-one-fn :access_granted :model/WorkspaceInput :workspace_id (:id workspace)))
              "access_granted should be true after unarchive"))))))

(deftest merge-workspace-test
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
          ;; We could make an API call here instead :shrug:
          (t2/update! :model/WorkspaceTransform {:workspace_id ws-id :ref_id ws-tx-ref-id} {:description "Modified in workspace"}))
        (testing "returns merged transforms"
          (is (=? {:merged    {:transforms [{:global_id (:id x1)}]}
                   :errors    []
                   :workspace {:id ws-id :name ws-name}}
                  (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/merge")
                                        {:commit-message commit-msg}))))
        (testing "workspace was archived after successful merge"
          (is (= :archived (t2/select-one-fn :base_status :model/Workspace :id ws-id))))
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
                   (t2/select-one-fn :creator_id :model/WorkspaceTransform :workspace_id ws-id :ref_id ws-tx-ref-id))))

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
            ;; Ensure deterministic merge order by setting x2's created_at later than x1's.
            x1-created-at (t2/select-one-fn :created_at :model/WorkspaceTransform
                                            :workspace_id ws-id :ref_id ws-x-1-id)
            _ (t2/update! (t2/table-name :model/WorkspaceTransform) {:workspace_id ws-id :ref_id ws-x-2-id}
                          {:created_at (t/plus x1-created-at (t/hours 1))})

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
          (testing "Workspace transforms are not deleted"
            (is (= 2 (t2/count :model/WorkspaceTransform
                               :workspace_id ws-id
                               :ref_id [:in (map :ref_id [ws-x-1 ws-x-2])])))))
        (testing "Workspace has been archived"
          (is (= :archived (t2/select-one-fn :base_status :model/Workspace :id ws-id))))))))

(deftest merge-empty-workspace-test
  (let [{ws-id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                          {:name        "Merge test"
                                           :database_id (mt/id)})]

    (testing "API response: empty errors, empty updates"
      (let [resp (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/merge"))]
        (is (=? {:errors []
                 :merged {:transforms []}}
                resp))))
    (testing "Workspace has been archived"
      (is (= :archived (t2/select-one-fn :base_status :model/Workspace :id ws-id))))))

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
          (testing "Workspace transforms are left untouched"
            (is (= 2 (count remaining)))
            (is (=? (into #{} (map :name [ws-x-1 ws-x-2]))
                    (into #{} (map :name remaining)))))
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
          (testing "Workspace transforms still remain"
            (is (= 2 (count remaining))))
          (testing "Propagation back to core"
            (is (= (:name ws-x-2)
                   (t2/select-one-fn :name :model/Transform :id (:global_id resp)))))
          (testing "Workspace is not archived nor deleted"
            (let [ws-after (t2/select-one :model/Workspace :id ws-id)]
              (is (some? ws-after))
              (is (not= :archived (:status ws-after))))))))))

(deftest merge-history-endpoint-test
  (mt/with-premium-features #{:transforms :transforms-python :workspaces}
    (testing "GET /api/transform/:id/merge-history"
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
          (t2/update! :model/WorkspaceTransform {:workspace_id ws-id :ref_id ws-tx-ref-id} {:description "Modified for history test"})
          (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/merge")
                                {:commit-message commit-msg})

          (testing "returns merge history for a transform"
            ;; workspace_id is preserved since workspace is archived (not deleted) after merge
            (is (=? [{:id                 pos-int?
                      :workspace_merge_id pos-int?
                      :commit_message     commit-msg
                      :workspace_id       ws-id
                      :workspace_name     ws-name
                      :merging_user_id    (mt/user->id :crowberto)
                      :created_at         some?}]
                    (mt/user-http-request :crowberto :get 200
                                          (str "transform/" (:id x1) "/merge-history")))))

          (testing "returns 404 for non-existent transform"
            (is (= "Not found."
                   (mt/user-http-request :crowberto :get 404
                                         "transform/999999/merge-history"))))

          (testing "requires superuser"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403
                                         (str "transform/" (:id x1) "/merge-history"))))))))))

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
            (testing "No transforms are deleted on merge"
              (is (= 3 (count (t2/select :model/WorkspaceTransform :workspace_id ws-id)))))
            (testing "Propagation back to core"
              (is (= "UPDATED 1"
                     (t2/select-one-fn :name :model/Transform :id (:global_id ws-x-1))))
              (is (not (t2/exists? :model/Transform :id (:id x2))))
              (is (= (:name ws-x-3)
                     (t2/select-one-fn :name :model/Transform :id new-global-id))))))))))

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
    (with-transform-cleanup! [orig-name "ws_add_transforms_test"]
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
                                                           :query (->native (mt/mbql-query venues))}
                                                  :target {:type "table"
                                                           :name "new_transform_output"}})]

              ;; Fetch the graph, to trigger analysis
              (is (=? {:ref_id          string?
                       :global_id       nil?
                       :name            "New Transform"
                       :target_stale    true
                       ;; TODO (Chris 2026-01-07) -- this is now only populated lazily - is this OK?
                       #_#_:target_isolated {:type     "table"
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
                                                   :query (->native (mt/mbql-query venues))}
                                          :target {:type "table"
                                                   :name "should_fail"}})))))))))

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
                                                :query (->native (mt/mbql-query transforms_products))}
                                       :target {:type "table"
                                                :name table-name}})))
        (is (=? {:id ws-id, :status "ready"}
                (mt/user-http-request :crowberto :get 200 (ws-url ws-id))))
        (is (=? {:transforms [{:ref_id string?, :name "Workspace Transform", :source_type "native"}]}
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
  (with-transform-cleanup! [orig-name "ws_tables_not_run_test"]
    (mt/with-temp [:model/Transform x1 {:name        "My X1"
                                        :source      {:type  "query"
                                                      :query (mt/native-query (ws.tu/mbql->native (mt/mbql-query orders {:limit 10})))}
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
          (is (=? {:inputs  [{:db_id (mt/id), :schema (t2/select-one-fn :schema :model/Table (mt/id :orders)), :table "orders", :table_id int?}]
                   :outputs [{:db_id (mt/id)
                              :global {:schema "public", :table orig-name}
                              :isolated {:transform_id ref-id}}]}
                  tables-result)))))))

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
    (with-transform-cleanup! [target-name "ws_tables_endpoint_test"]
      (mt/with-temp [:model/Transform x1 {:name   "My X1"
                                          :source {:type  "query"
                                                   :query query}
                                          :target {:type     "table"
                                                   :database (mt/id)
                                                   :schema   target-schema
                                                   :name     target-name}}]
        ;; create the global table
        (transforms.execute/execute! x1 {:run-method :manual})
        (ws.tu/with-workspaces! [workspace {:name        "Test Workspace"
                                            :database_id (mt/id)}]
          (let [body         {:name   (:name x1)
                              :source (:source x1)
                              :target (:target x1)}
                ws-transform (ws.common/add-to-changeset! (mt/user->id :crowberto) workspace :transform (:id x1) body)
                workspace    (ws.tu/ws-done! (:id workspace))
                ref-id       (:ref_id ws-transform)
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
                      (mt/user-http-request :crowberto :get 200 (ws-url (:id workspace) "/table")))))))))))

;; TODO (Chris 2025-12-12) -- write a test for /table that covers the shadowing
;; e.g. have two transforms in a chain connecting 3 tables:  (A -> X1 -> B -> X2 -> C)
;; raw-inputs:      A (from X1) and B (from X2)
;; outputs:         B (from X1) and C (from X2)
;; external-inputs: A (raw-inputs - outputs)

(deftest rename-workspace-test
  (testing "POST /api/ee/workspace/:id/name updates the workspace name"
    (ws.tu/with-workspaces! [workspace {:name "Original Name"}]
      (let [response (mt/user-http-request :crowberto :put 200 (ws-url (:id workspace))
                                           {:name "Updated Name"})]
        (is (= "Updated Name"
               (:name response)
               (t2/select-one-fn :name :model/Workspace :id (:id workspace)))))))

  (testing "Cannot rename an archived workspace"
    (ws.tu/with-workspaces! [workspace {:name "Archived"}]
      (t2/update! :model/Workspace (:id workspace) {:base_status :archived})
      (is (= "Cannot update an archived workspace"
             (mt/user-http-request :crowberto :put 400 (ws-url (:id workspace))
                                   {:name "Should Fail"}))))))

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
                                                   ;; TODO (Chris 2026-01-05) -- the schema on the workspace is only set as part of adding tx
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

(deftest workspace-log-endpoint-test
  (testing "GET /api/ee/workspace/:id/log returns status and log entries"
    (let [{ws-id :id} (ws.tu/create-ready-ws! "Log tester")]
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

(deftest workspace-log-entries-created-test
  (testing "WorkspaceLog entries are created during setup"
    (let [{ws-id :id} (ws.tu/create-ready-ws! "Log tester #2")]
      (is (=? [{:task   :database-isolation
                :status :success}
               {:task   :workspace-setup
                :status :success}]
              (t2/select :model/WorkspaceLog :workspace_id ws-id {:order-by [[:started_at :desc]]}))))))

(deftest workspace-setup-failure-logs-error-test
  (testing "Failed workspace setup logs error message"
    (mt/with-dynamic-fn-redefs [ws.isolation/ensure-database-isolation!
                                (fn [& _] (throw (ex-info "Test isolation error" {})))]
      (let [{ws-id :id} (ws.tu/initialize-ws! "Log tester #3")]
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
                                                      :query (mt/native-query (ws.tu/mbql->native (mt/mbql-query venues)))}
                                             :target {:type     "table"
                                                      :database (mt/id)
                                                      :schema   "public"
                                                      :name     "init_transform_output"}})]
        (is (some? (:ref_id transform)))
        (let [ws (ws.tu/ws-done! ws)]
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
        (testing "returns empty list when no transforms"
          (ws.tu/with-workspaces! [workspace {:name "Empty Workspace"}]
            (is (= {:transforms []}
                   (mt/user-http-request :crowberto :get 200 (ws-url (:id workspace) "/transform"))))))
        (testing "returns 404 for non-existent workspace"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :get 404 "ee/workspace/999999/transform"))))))))

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
                                       (ws-url (:id workspace2) "/transform" (:ref_id transform))))))))))

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
          (is (= "Updated Name" (t2/select-one-fn :name :model/WorkspaceTransform :workspace_id (:id workspace1) :ref_id (:ref_id transform)))))
        (testing "returns 404 if transform not in workspace"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :put 404
                                       (ws-url (:id workspace2) "/transform" (:ref_id transform))
                                       {:name "Should Fail"}))))))))

(deftest delete-workspace-transform-test
  (testing "DELETE /api/ee/workspace/:id/transform/:txid"
    (ws.tu/with-workspaces! [workspace1 {:name "Workspace 1"}
                             workspace2 {:name "Workspace 2"}]
      (mt/with-temp [:model/WorkspaceTransform transform1 {:name         "Transform in WS1"
                                                           :workspace_id (:id workspace1)}
                     :model/WorkspaceTransform transform2 {:name         "To Delete"
                                                           :workspace_id (:id workspace1)}]
        (is (:ref_id transform1) "Transform 1 created successfully")
        (is (:ref_id transform2) "Transform 2 created successfully")
        (testing "returns 404 if transform not in workspace"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :delete 404
                                       (ws-url (:id workspace2) "/transform" (:ref_id transform1))))))
        (testing "deletes transform"
          (is (nil? (mt/user-http-request :crowberto :delete 204
                                          (ws-url (:id workspace1) "/transform" (:ref_id transform2)))))
          (is (t2/exists? :model/WorkspaceTransform :workspace_id (:id workspace1) :ref_id (:ref_id transform1)))
          (is (not (t2/exists? :model/WorkspaceTransform :workspace_id (:id workspace1) :ref_id (:ref_id transform2)))))))))

(deftest run-workspace-transform-not-found-test
  (testing "POST /api/ee/workspace/:id/transform/:txid/run returns 404 if transform not in workspace"
    (transforms.tu/with-transform-cleanup! [output-table "ws_api_notfound"]
      (ws.tu/with-workspaces! [ws1 {:name "Workspace 1"}
                               ws2 {:name "Workspace 2"}]
        (mt/with-temp [:model/Transform x1 {:name   "Transform in WS1"
                                            :source {:type  "query"
                                                     :query (mt/native-query {:query "SELECT count(*) from orders"})}
                                            :target {:type     "table"
                                                     :database (mt/id)
                                                     :schema   "public"
                                                     :name     output-table}}]
          (let [ref-id (:ref_id (mt/user-http-request :crowberto :post 200 (ws-url (:id ws1) "/transform") x1))]
            (is (= "Not found."
                   (mt/user-http-request :crowberto :post 404
                                         (ws-url (:id ws2) "/transform/" ref-id "/run"))))))))))

(deftest run-workspace-transform-success-test
  (testing "POST /api/ee/workspace/:id/transform/:txid/run successful execution"
    (transforms.tu/with-transform-cleanup! [output-table "ws_api_success"]
      (ws.tu/with-workspaces! [ws {:name "Workspace 1"}]
        (let [target-schema (t2/select-one-fn :schema :model/Table (mt/id :orders))]
          (mt/with-temp [:model/Transform x1 {:name   "Transform"
                                              :source {:type  "query"
                                                       :query (mt/native-query (ws.tu/mbql->native (mt/mbql-query orders {:aggregation [[:count]]})))}
                                              :target {:type     "table"
                                                       :database (mt/id)
                                                       :schema   target-schema
                                                       :name     output-table}}]
            (let [ref-id (:ref_id (mt/user-http-request :crowberto :post 200 (ws-url (:id ws) "/transform") x1))
                  ws     (ws.tu/ws-done! (:id ws))]
              (testing "returns succeeded status with isolated table info"
                (let [result (mt/user-http-request :crowberto :post 200 (ws-url (:id ws) "transform" ref-id "run"))]
                  (is (=? {:status     "succeeded"
                           :message    nil
                           :start_time some?
                           :end_time   some?
                           :table      {:schema (:schema ws)
                                        :name   (str target-schema "__" output-table)}}
                          result))))
              (testing "doesn't create excessive transforms in the db"
                (is (= (:id x1)
                       (t2/select-one-fn :id [:model/Transform :id] {:order-by [[:id :desc]]}))))
              (testing "transform has last_run_at and last_run_status after success"
                (is (=? {:last_run_at     some?
                         :last_run_status "succeeded"}
                        (mt/user-http-request :crowberto :get 200 (ws-url (:id ws) "transform" ref-id))))))))))))

(deftest run-workspace-transform-failure-test
  (testing "POST /api/ee/workspace/:id/transform/:txid/run failed execution"
    (transforms.tu/with-transform-cleanup! [output-table "ws_api_fail"]
      (ws.tu/with-workspaces! [ws {:name "Workspace for failure test"}]
        (let [bad-transform {:name   "Bad Transform"
                             :source {:type  "query"
                                      :query (mt/native-query {:query "SELECT * FROM nonexistent_table_xyz"})}
                             :target {:type     "table"
                                      :database (mt/id)
                                      :schema   "public"
                                      :name     output-table}}
              ref-id        (:ref_id
                             (mt/user-http-request :crowberto :post 200 (ws-url (:id ws) "/transform") bad-transform))
              ws            (ws.tu/ws-done! (:id ws))]
          (testing "returns failed status with error message and isolated table info"
            (let [result (mt/with-log-level [metabase.transforms.query-impl :fatal]
                           (mt/user-http-request :crowberto :post 200 (ws-url (:id ws) "transform" ref-id "run")))]
              (is (=? {:status     "failed"
                       :message    some?
                       :start_time some?
                       :end_time   some?
                       :table      {:schema (:schema ws)
                                    :name   (str "public__" output-table)}}
                      result))))
          (testing "transform has last_run_at, last_run_status, and last_run_message after failure"
            (is (=? {:last_run_at      some?
                     :last_run_status  "failed"
                     :last_run_message some?}
                    (mt/user-http-request :crowberto :get 200 (ws-url (:id ws) "transform" ref-id))))))))))

(defn- quote-table-name
  [driver {:keys [schema], table :name}]
  (sql.u/quote-name driver :table schema table))

(deftest run-workspace-transform-bad-column-test
  (testing "POST /api/ee/workspace/:id/transform/:txid/run with non-existent column"
    (transforms.tu/with-transform-cleanup! [output-table "ws_api_badcol"]
      (ws.tu/with-workspaces! [ws {:name "Workspace for bad column test"}]
        (let [order-table (t2/select-one :model/Table (mt/id :orders))
              bad-transform {:name   "Bad Column Transform"
                             :source {:type  "query"
                                      :query (mt/native-query {:query (format "SELECT nocolumn FROM %s" (quote-table-name (:engine (mt/db)) order-table))})}
                             :target {:type     "table"
                                      :database (mt/id)
                                      :schema   (:schema order-table)
                                      :name     output-table}}
              ref-id        (:ref_id
                             (mt/user-http-request :crowberto :post 200 (ws-url (:id ws) "/transform") bad-transform))
              ws            (ws.tu/ws-done! (:id ws))]

          (testing "returns failed status with error message mentioning the bad column"
            (let [result  (mt/with-log-level [metabase.transforms.query-impl :fatal]
                            (mt/user-http-request :crowberto :post 200 (ws-url (:id ws) "transform" ref-id "run")))]
              (is (=? {:status     "failed"
                       :message    #"(?si).*nocolumn.*"
                       :start_time some?
                       :end_time   some?
                       :table      {:schema (:schema ws)
                                    :name   (str (:schema order-table) "__" output-table)}}
                      result))))
          (testing "transform has last_run_message mentioning the bad column"
            (is (=? {:last_run_at      some?
                     :last_run_status  "failed"
                     :last_run_message #"(?si).*nocolumn.*"}
                    (mt/user-http-request :crowberto :get 200 (ws-url (:id ws) "transform" ref-id))))))))))

(deftest execute-workspace-test
  (testing "POST /api/ee/workspace/:id/execute"
    (transforms.tu/with-transform-cleanup! [output-table "ws_execute_test"]
      (ws.tu/with-workspaces! [ws-1 {:name "Workspace 1"}
                               ws-2 {:name "Workspace 2"}]
        (let [body         {:name   "Transform for execute test"
                            :source {:type  "query"
                                     :query (mt/native-query (ws.tu/mbql->native (mt/mbql-query orders {:aggregation [[:count]]})))}
                            :target {:type     "table"
                                     :database (mt/id)
                                     :schema   nil
                                     :name     output-table}}
              ws-transform (ws.common/add-to-changeset! (mt/user->id :crowberto) ws-1 :transform nil body)
              ws-1         (ws.tu/ws-done! (:id ws-1))]
          (testing "returns empty when no transforms"
            (is (= {:succeeded []
                    :failed    []
                    :not_run   []}
                   (mt/user-http-request :crowberto :post 200 (ws-url (:id ws-2) "/run")))))
          (testing "executes transforms in workspace"
            (is (= {:succeeded [(:ref_id ws-transform)]
                    :failed    []
                    :not_run   []}
                   (mt/user-http-request :crowberto :post 200 (ws-url (:id ws-1) "/run"))))))))))

(deftest execute-workspace-stale-only-test
  (testing "POST /api/ee/workspace/:id/run?stale_only=true respects staleness with enclosed transforms"
    (ws.tu/with-resources! [{:keys [workspace-id workspace-map global-map]}
                            ;; (x1) -> x2 -> (x3)
                            {:global    {:x1 [:t0], :x2 [:x1], :x3 [:x2]}
                             :workspace {:checkouts [:x1 :x3]}}]
      (ws.tu/ws-done! workspace-id)
      (let [ref-x1    (workspace-map :x1)
            ref-x3    (workspace-map :x3)
            global-x2 (str "global-id:" (global-map :x2))
            ->source  (t2/select-fn->fn :ref_id :source [:model/WorkspaceTransform :ref_id :source]
                                        :workspace_id workspace-id)
            counter   (atom 1)
            run!      #(ws.tu/with-mocked-execution
                         (mt/user-http-request :crowberto :post 200 (ws-url workspace-id "/run") {:stale_only 1}))
            inc-limit #(str (str/replace % #" LIMIT \d+" "") " LIMIT " (swap! counter inc))
            edit!     (fn [ref-id]
                        (let [current (->source ref-id)
                              tweaked (update-in current [:query :stages 0 :native] inc-limit)]
                          (mt/user-http-request :crowberto :put 200
                                                (ws-url workspace-id "/transform/" ref-id)
                                                {:source tweaked})))]
        (testing "initial run executes all stale transforms"
          (is (= {:succeeded [ref-x1 global-x2 ref-x3]
                  :failed    []
                  :not_run   []}
                 (run!))))
        (testing "second run with nothing stale executes nothing"
          (is (= {:succeeded []
                  :failed    []
                  :not_run   []}
                 (run!))))
        (edit! ref-x3)
        (testing "after editing x3, only x3 runs"
          (is (= {:succeeded [ref-x3]
                  :failed    []
                  :not_run   []}
                 (run!))))
        (testing "after running x3, nothing stale"
          (is (= {:succeeded []
                  :failed    []
                  :not_run   []}
                 (run!))))
        (edit! ref-x1)
        (testing "after editing x1, staleness propagates through enclosed x2 to x3"
          (is (= {:succeeded [ref-x1 global-x2 ref-x3]
                  :failed    []
                  :not_run   []}
                 (run!))))
        (testing "after running all, nothing stale"
          (is (= {:succeeded []
                  :failed    []
                  :not_run   []}
                 (run!))))))))

(deftest dry-run-workspace-transform-test
  (testing "POST /api/ee/workspace/:id/transform/:txid/dry-run returns 404 if transform not in workspace"
    (ws.tu/with-workspaces! [ws1 {:name "Workspace 1"}
                             ws2 {:name "Workspace 2"}]
      (mt/with-temp [:model/Transform x1 {:name   "Transform in WS1"
                                          :source {:type  "query"
                                                   :query (mt/native-query
                                                           {:query "SELECT 1 as id, 'hello' as name UNION ALL SELECT 2, 'world' ORDER BY 1"})}
                                          :target {:type     "table"
                                                   :database (mt/id)
                                                   :schema   "public"
                                                   :name     "ws_dryrun"}}]
        (let [ref-id (:ref_id (mt/user-http-request :crowberto :post 200 (ws-url (:id ws1) "/transform") x1))
              ws1    (ws.tu/ws-done! (:id ws1))]
          (testing "Not found in different workspace"
            (is (= "Not found."
                   (mt/user-http-request :crowberto :post 404
                                         (ws-url (:id ws2) "/transform/" ref-id "/dry-run")))))
          (testing "returns succeeded status with data"
            (let [result (mt/user-http-request :crowberto :post 200 (ws-url (:id ws1) "transform" ref-id "dry-run"))]
              (is (=? {:status "succeeded"
                       :data   {:rows [[1 "hello"] [2 "world"]]
                                :cols [{:name #"(?i)id"} {:name #"(?i)name"}]}}
                      result))))
          (testing "does NOT update last_run_at"
            (is (nil? (:last_run_at (mt/user-http-request :crowberto :get 200 (ws-url (:id ws1) "transform" ref-id))))))
          (testing "returns failed status with message"
            (t2/update! :model/WorkspaceTransform {:workspace_id (:id ws1) :ref_id ref-id}
                        {:source {:type  "query"
                                  :query (mt/native-query {:query "SELECT * FROM nonexistent_table_xyz"})}})
            (is (=? {:status  "failed"
                     :message string?}
                    (mt/user-http-request :crowberto :post 200 (ws-url (:id ws1) "transform" ref-id "dry-run"))))))))))

(deftest run-transform-with-stale-ancestors-test
  (testing "POST /api/ee/workspace/:id/transform/:txid/run with run_stale_ancestors=true"
    ;; Chain: x1 -> x2 -> x3, where x1 is stale
    (ws.tu/with-resources! [{:keys [workspace-id workspace-map]}
                            {:workspace {:definitions {:x1 [:t0] :x2 [:x1] :x3 [:x2]}
                                         :properties  {:x1 {:definition_changed true}
                                                       :x2 {:definition_changed false}
                                                       :x3 {:definition_changed false}}}}]
      (ws.tu/ws-done! workspace-id)
      (let [x1-ref (workspace-map :x1)
            x2-ref (workspace-map :x2)
            x3-ref (workspace-map :x3)]
        ;; Use a mock that returns :table (required by the API schema)
        (mt/with-dynamic-fn-redefs [ws.execute/run-transform-with-remapping
                                    (fn [{:keys [target]} _remapping]
                                      {:status   :succeeded
                                       :end_time (Instant/now)
                                       :message  "Mocked execution"
                                       :table    (select-keys target [:schema :name])})]
          (testing "without flag, ancestors are not run"
            (let [result (mt/user-http-request :crowberto :post 200
                                               (ws-url workspace-id "/transform/" x3-ref "/run"))]
              (is (= "succeeded" (:status result)))
              (is (nil? (:ancestors result)))))
          (testing "with flag, stale ancestors are run before target"
            (let [result (mt/user-http-request :crowberto :post 200
                                               (ws-url workspace-id "/transform/" x3-ref "/run")
                                               {:run_stale_ancestors true})]
              (is (= "succeeded" (:status result)))
              (is (= {:succeeded [x1-ref x2-ref]
                      :failed    []
                      :not_run   []}
                     (:ancestors result))))))))))

(deftest dry-run-transform-with-stale-ancestors-test
  (testing "POST /api/ee/workspace/:id/transform/:txid/dry-run with run_stale_ancestors=true"
    ;; Chain: x1 -> x2 -> x3, where x1 is stale
    (ws.tu/with-resources! [{:keys [workspace-id workspace-map]}
                            {:workspace {:definitions {:x1 [:t0] :x2 [:x1] :x3 [:x2]}
                                         :properties  {:x1 {:definition_changed true}
                                                       :x2 {:definition_changed false}
                                                       :x3 {:definition_changed false}}}}]
      (ws.tu/ws-done! workspace-id)
      (let [x1-ref (workspace-map :x1)
            x2-ref (workspace-map :x2)
            x3-ref (workspace-map :x3)]
        ;; Mock both run (for ancestors) and preview (for dry-run target)
        (mt/with-dynamic-fn-redefs [ws.execute/run-transform-with-remapping
                                    (fn [{:keys [target]} _remapping]
                                      {:status   :succeeded
                                       :end_time (Instant/now)
                                       :message  "Mocked execution"
                                       :table    (select-keys target [:schema :name])})
                                    ws.execute/run-transform-preview
                                    (fn [_transform _remapping]
                                      {:status :succeeded
                                       :data   {:rows [[1 "test"]]
                                                :cols [{:name "id"} {:name "name"}]}})]
          (testing "with flag, stale ancestors are run before dry-run"
            (let [result (mt/user-http-request :crowberto :post 200
                                               (ws-url workspace-id "/transform/" x3-ref "/dry-run")
                                               {:run_stale_ancestors true})]
              (is (= "succeeded" (:status result)))
              (is (= {:succeeded [x1-ref x2-ref]
                      :failed    []
                      :not_run   []}
                     (:ancestors result))))))))))

;;; ---------------------------------------- Adhoc Query Tests ----------------------------------------

(deftest ^:synchronized adhoc-query-test
  (testing "POST /api/ee/workspace/:id/query"
    (let [ws (ws.tu/create-ready-ws! "Adhoc Query Test")]
      (testing "happy path - returns query results for valid SQL"
        (let [result (mt/user-http-request :crowberto :post 200
                                           (ws-url (:id ws) "/query")
                                           {:sql "SELECT 1 as id, 'hello' as name"})]
          (is (=? {:status "succeeded"
                   :data   {:rows [[1 "hello"]]
                            :cols [{:name #"(?i)id"} {:name #"(?i)name"}]}}
                  result))))

      (testing "returns results for multi-row queries"
        (let [sql    "SELECT 1 as num UNION ALL SELECT 2 UNION ALL SELECT 3 ORDER BY 1"
              result (mt/user-http-request :crowberto :post 200
                                           (ws-url (:id ws) "/query")
                                           {:sql sql})]
          (is (=? {:status "succeeded"
                   :data   {:rows [[1] [2] [3]]}}
                  result)))))))

(deftest ^:synchronized adhoc-query-error-handling-test
  (testing "POST /api/ee/workspace/:id/query error handling"
    (let [ws (ws.tu/create-ready-ws! "Adhoc Query Error Test")]
      (testing "returns failed status with message for invalid SQL"
        (let [result (mt/user-http-request :crowberto :post 200
                                           (ws-url (:id ws) "/query")
                                           {:sql "SELECT FROM WHERE INVALID"})]
          (is (=? {:status  "failed"
                   :message string?}
                  result))))

      (testing "returns failed status for syntax errors"
        (let [result (mt/user-http-request :crowberto :post 200
                                           (ws-url (:id ws) "/query")
                                           {:sql "SELECT 1 LIMIT"})]
          (is (=? {:status  "failed"
                   :message string?}
                  result)))))))

(deftest ^:synchronized adhoc-query-validation-test
  (testing "POST /api/ee/workspace/:id/query validation"
    (ws.tu/with-workspaces! [ws {:name "Adhoc Query Validation Test"}]
      (testing "returns 404 for non-existent workspace"
        (is (= "Not found."
               (mt/user-http-request :crowberto :post 404
                                     (ws-url 999999 "/query")
                                     {:sql "SELECT 1"}))))

      (testing "returns 400 for missing sql parameter"
        (is (=? {:errors {:sql "string with length >= 1"}}
                (mt/user-http-request :crowberto :post 400
                                      (ws-url (:id ws) "/query")
                                      {}))))

      (testing "returns 400 for empty sql parameter"
        (is (=? {:errors {:sql "string with length >= 1"}}
                (mt/user-http-request :crowberto :post 400
                                      (ws-url (:id ws) "/query")
                                      {:sql ""})))))))

(deftest ^:synchronized adhoc-query-archived-workspace-test
  (testing "POST /api/ee/workspace/:id/query on archived workspace"
    (let [ws (ws.tu/create-ready-ws! "Adhoc Query Archived Test")]
      ;; Archive the workspace
      (mt/user-http-request :crowberto :post 200 (ws-url (:id ws) "/archive"))

      (testing "returns 400 for archived workspace"
        (is (= "Cannot query archived workspace"
               (mt/user-http-request :crowberto :post 400
                                     (ws-url (:id ws) "/query")
                                     {:sql "SELECT 1"})))))))

(deftest ^:synchronized adhoc-query-remapping-test
  (testing "POST /api/ee/workspace/:id/query remaps table references to isolated tables"
    (ws.tu/with-workspaces! [ws {:name "Adhoc Query Remapping Test"}]
      (let [target-schema (driver.sql/default-schema driver/*driver*)
            target-table  (str "adhoc_remap_" (str/replace (str (random-uuid)) "-" "_"))
            transform-def {:name   "Remapping Test Transform"
                           :source {:type  "query"
                                    :query (mt/native-query
                                            {:query "SELECT 1 as id, 'remapped' as status"})}
                           :target {:type     "table"
                                    :database (mt/id)
                                    :schema   target-schema
                                    :name     target-table}}
            ;; Add transform to workspace
            ref-id        (:ref_id (mt/user-http-request :crowberto :post 200
                                                         (ws-url (:id ws) "/transform")
                                                         transform-def))
            ws            (ws.tu/ws-done! (:id ws))]
        ;; Run the transform to populate the isolated table
        (let [run-result (mt/user-http-request :crowberto :post 200
                                               (ws-url (:id ws) "/transform/" ref-id "/run"))]
          (is (= "succeeded" (:status run-result)) "Transform should run successfully"))

        (testing "ad-hoc query can SELECT from transform output using schema-qualified table name"
          (let [query-sql (str "SELECT * FROM " target-schema "." target-table)
                result    (mt/user-http-request :crowberto :post 200
                                                (ws-url (:id ws) "/query")
                                                {:sql query-sql})]
            (is (=? {:status "succeeded"
                     :data   {:rows [[1 "remapped"]]
                              :cols [{:name #"(?i)id"} {:name #"(?i)status"}]}}
                    result))))

        (testing "ad-hoc query can SELECT from transform output using unqualified table name"
          (let [query-sql (str "SELECT * FROM " target-table)
                result    (mt/user-http-request :crowberto :post 200
                                                (ws-url (:id ws) "/query")
                                                {:sql query-sql})]
            (is (=? {:status "succeeded"
                     :data   {:rows [[1 "remapped"]]
                              :cols [{:name #"(?i)id"} {:name #"(?i)status"}]}}
                    result))))))))

(deftest ^:synchronized adhoc-query-uses-isolated-credentials-test
  (testing "POST /api/ee/workspace/:id/query executes with workspace isolated credentials"
    (let [isolated?      (atom false)
          workspace-used (atom nil)
          ws             (ws.tu/create-ready-ws! "Adhoc Query Isolation Test")]
      (mt/with-dynamic-fn-redefs [ws.isolation/do-with-workspace-isolation
                                  (fn [workspace thunk]
                                    (reset! isolated? true)
                                    (reset! workspace-used workspace)
                                    (thunk))]
        (mt/user-http-request :crowberto :post 200
                              (ws-url (:id ws) "/query")
                              {:sql "SELECT 1"}))
      (is @isolated? "Query should execute within workspace isolation context")
      (is (= (:id ws) (:id @workspace-used)) "Should use correct workspace for isolation")
      (is (some? (:database_details @workspace-used))
          "Workspace should have database_details for proper isolation"))))

(defn- random-target [db-id]
  {:type     "table"
   :database db-id
   :schema   (driver.sql/default-schema driver/*driver*)
   :name     (str/replace (str "t_" (random-uuid)) "-" "_")})

(defn- my-native-query [db-id sql & [card-mapping]]
  ;; TODO (Chris 2025-12-11) -- don't build MBQL manually
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
                         :model/Database           {db-2 :id}   {:name "Other Db"}
                         :model/Transform          {xf1-id :id} {:name   "Checked out - 1"
                                                                 :target (random-target db-1)}
                         :model/Transform          {xf2-id :id} {:name   "Checked out - 2"
                                                                 :target (random-target db-1)}
                         :model/Transform          {xf3-id :id} {:name   "Not checked out - python"
                                                                 :source {:type "python" :source-database db-1}
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
                                                                 :source      {:type  "query"
                                                                               :query (my-native-query
                                                                                       db-1
                                                                                       "SELECT * FROM {{card}}"
                                                                                       {"card" card-id})}
                                                                 :target      (random-target db-1)}
                         :model/Transform          {xf7-id :id} {:name   "Using another database"
                                                                 :source {:type "python" :source-database db-1}
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
      ;; TODO (Chris 2026-01-05) -- remove :schema workaround once this adds a transform properly, triggering async initialization
      (ws.tu/with-workspaces! [workspace {:name "Fallback Test WS"}]
        ;; TODO (Chris 2026-01-07) -- things fail because the workspace won't have been initialized yet.
        ;;                         ... the correct thing to do would be for the relevant code to initialize it!
        (t2/update! :model/Workspace (:id workspace) {:schema "isolated_schema"})
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
                                                        ;; TODO (Chris 2026-01-05) -- another spot
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
  (testing "GET /api/ee/workspace/:id/graph - explicit shape for a smaller graph"
    (let [{ws-id  :workspace-id
           id-map :global-map
           tx-ids :workspace-map} (ws.tu/create-resources! {:global    {:x1 [:t0]
                                                                        :x2 [:x1]}
                                                            :workspace {:checkouts   [:x1]
                                                                        :definitions {:x3 [:x2]}}})

          ws             (ws.tu/ws-done! ws-id)
          tx-1           (t2/select-one :model/WorkspaceTransform :workspace_id ws-id, :ref_id (tx-ids :x1))
          tx-2           (t2/select-one :model/Transform (id-map :x2))
          tx-3           (t2/select-one :model/WorkspaceTransform :workspace_id ws-id, :ref_id (tx-ids :x3))

          driver         (t2/select-one-fn :engine [:model/Database :engine] (:database_id ws))
          tx-schema      (:schema (:target tx-1))
          tx-1-output    (:name (:target tx-1))
          tx-2-output    (sql.normalize/normalize-name driver (:name (:target tx-2)))
          tx-3-output    (:name (:target tx-3))
          {input-id     :id
           input-schema :schema
           input-table  :name} (t2/select-one :model/Table (id-map :t0))
          ;; Look up output table IDs for transform targets
          tx-1-table-id  (t2/select-one-fn :id :model/Table :db_id (mt/id) :schema tx-schema :name tx-1-output)
          tx-2-table-id  (t2/select-one-fn :id :model/Table :db_id (mt/id) :schema tx-schema :name tx-2-output)
          tx-3-table-id  (t2/select-one-fn :id :model/Table :db_id (mt/id) :schema tx-schema :name tx-3-output)
          tx-1-input     (str (mt/id) "-" input-schema "-" input-table)
          t1-ref         (:ref_id tx-1)
          t3-ref         (:ref_id tx-3)]

      (testing "returns enclosed external transform too"
        (is (= {:nodes #{{:type             "input-table"
                          :id               tx-1-input
                          :data             {:db (mt/id), :schema input-schema, :table input-table, :id input-id}
                          :dependents_count {:workspace-transform 1}}
                         {:type             "workspace-transform"
                          :id               t1-ref
                          :data             {:ref_id t1-ref
                                             :name   (:name tx-1)
                                             :target {:db       (mt/id)
                                                      :schema   tx-schema
                                                      :table    tx-1-output
                                                      :table_id tx-1-table-id}}
                          :dependents_count {:external-transform 1}}
                         {:type             "external-transform"
                          :id               (:id tx-2)
                          :data             {:id     (:id tx-2)
                                             :name   (:name tx-2)
                                             :target {:db       (mt/id)
                                                      :schema   tx-schema
                                                      :table    tx-2-output
                                                      :table_id tx-2-table-id}}
                          :dependents_count {:workspace-transform 1}}
                         {:type             "workspace-transform"
                          :id               t3-ref
                          :data             {:ref_id t3-ref
                                             :name   (:name tx-3)
                                             :target {:db       (mt/id)
                                                      :schema   tx-schema
                                                      :table    tx-3-output
                                                      :table_id tx-3-table-id}}
                          :dependents_count {}}},
                :edges #{{:to_entity_type   "input-table"
                          :to_entity_id     tx-1-input
                          :from_entity_type "workspace-transform"
                          :from_entity_id   t1-ref}
                         {:to_entity_type   "workspace-transform"
                          :to_entity_id     t1-ref
                          :from_entity_type "external-transform"
                          :from_entity_id   (:id tx-2)}
                         {:to_entity_type   "external-transform"
                          :to_entity_id     (:id tx-2)
                          :from_entity_type "workspace-transform"
                          :from_entity_id   (:ref_id tx-3)}}}
               (-> (mt/user-http-request :crowberto :get 200 (ws-url (:id ws) "graph"))
                   (update-vals set))))))))

;; Edge cases covered:
;;
;; 1. excluded ancestor
;; 2. excluded descendant
;; 3. disconnected components
;; 4. enclosed by chain
;; 5. workspace tx input
;; 6. enclosed tx input
;; 7. overridden dependency
;;
;; Ideas for more:
;;
;; - Removed dependency
;; - Inverted dependency
;; - ...
(deftest larger-test
  (testing "GET /api/ee/workspace/:id/graph - structure for a larger and more complex graph"
    (let [{ws-id :workspace-id
           :as   resources-map} (ws.tu/create-resources! {:global    {:x1 [:t100]
                                                                      :x2 [:x1 :t101]
                                                                      :x3 [:x2 :t102]
                                                                      :x4 [:x3 :t103]
                                                                      :x5 [:x4 :t104]
                                                                      :x6 [:t105]
                                                                      :x7 [:106]}
                                                          :workspace {:checkouts   [:x2 :x4 :x6]
                                                                      :definitions {:x4 [:x3 :t199]}}})]
      (testing "returns enclosed external transform too"
        (is (= {:nodes #{;; checked out
                         :x2
                         :x4
                         :x6
                         ;; enclosed
                         :x3
                         ;; output of non-enclosed ancestor
                         :t1
                         ;; global input for workspace transforms
                         :t101
                         :t105
                         ;; global input for enclosed transform
                         :t102
                         ;; overridden input
                         :t199},
                :edges {:x2 #{:t1 :t101}
                        :x3 #{:x2 :t102}
                        :x4 #{:x3 :t199}
                        :x6 #{:t105}}}
               (-> (mt/user-http-request :crowberto :get 200 (ws-url ws-id "graph"))
                   (ws.tu/translate-graph resources-map))))))))

(deftest enabled-test
  (let [url "ee/workspace/enabled"]
    (is (= {:supported true} (mt/user-http-request :crowberto :get 200 url)))
    (mt/with-temp [:model/Database {db-1 :id} {:name "Y", :engine "postgres"}
                   ;; For some reason, using a real but unsupported value like "databricks" is returning support :-C
                   :model/Database {db-2 :id} {:name "N", :engine "crazy"}]
      (testing "Unsupported driver"
        (is (= {:supported false, :reason "Database type not supported."}
               (mt/user-http-request :crowberto :get 200 (str url "?database-id=" db-2)))))
      (testing "Supported driver"
        (is (= {:supported true}
               (mt/user-http-request :crowberto :get 200 (str url "?database-id=" db-1)))))
      (testing "Audit not returned"
        (is (nil?
             (m/find-first (comp #{audit/audit-db-id} :id)
                           (:databases (mt/user-http-request :crowberto :get 200 "ee/workspace/database")))))))))

(deftest workspace-database-listing-test
  (testing "GET /api/ee/workspace/database"
    (testing "databases with workspaces_enabled=true show as enabled"
      (mt/with-temp [:model/Database {db-enabled :id} {:name "DB Enabled"
                                                       :engine driver/*driver*
                                                       :is_audit false
                                                       :is_sample false
                                                       :workspace_permissions_status {:status "ok" :checked_at "2025-01-01"}
                                                       :settings                     {:database-enable-workspaces true}}
                     :model/Database {db-disabled :id} {:name "DB Disabled"
                                                        :engine driver/*driver*
                                                        :is_audit false
                                                        :is_sample false
                                                        :workspace_permissions_status {:status "ok" :checked_at "2025-01-01"}
                                                        :settings                     {}}]
        (let [response      (mt/user-http-request :crowberto :get 200 "ee/workspace/database")
              enabled-entry (m/find-first #(= (:id %) db-enabled) (:databases response))
              disabled-entry (m/find-first #(= (:id %) db-disabled) (:databases response))]
          (is (true? (:enabled enabled-entry)))
          (is (= "ok" (get-in enabled-entry [:workspace_permissions_status :status])))
          (is (false? (:enabled disabled-entry)))
          (is (= "ok" (get-in disabled-entry [:workspace_permissions_status :status]))))))

    (testing "databases with failed permission check include permissions_status"
      (mt/with-temp [:model/Database {db-failed :id} {:name "DB Failed"
                                                      :engine driver/*driver*
                                                      :is_audit false
                                                      :is_sample false
                                                      :workspace_permissions_status {:status "failed" :error "permission denied" :checked_at "2025-01-01"}}]
        (let [response   (mt/user-http-request :crowberto :get 200 "ee/workspace/database")
              fail-entry (m/find-first #(= (:id %) db-failed) (:databases response))]
          (is (false? (:enabled fail-entry)))
          (is (= "failed" (get-in fail-entry [:workspace_permissions_status :status])))
          (is (= "permission denied" (get-in fail-entry [:workspace_permissions_status :error]))))))

    (testing "databases without permission check have unknown permissions_status"
      (mt/with-temp [:model/Database {db-uncached :id} {:name "DB Uncached"
                                                        :engine driver/*driver*
                                                        :is_audit false
                                                        :is_sample false}]
        (let [response (mt/user-http-request :crowberto :get 200 "ee/workspace/database")
              entry    (m/find-first #(= (:id %) db-uncached) (:databases response))]
          (is (false? (:enabled entry)))
          (is (= {:status "unknown"} (:workspace_permissions_status entry))))))))

(deftest checkout-endpoint-test
  (testing "GET /api/ee/workspace/checkout returns checkout status for a transform"
    (mt/with-temp [:model/Transform tx {:name   "Native Transform"
                                        :source {:type  :query
                                                 :query {:database (mt/id)
                                                         :type     :native
                                                         :native   {:query "SELECT 1"}}}
                                        :target {:type     "table"
                                                 :database (mt/id)
                                                 :schema   "public"
                                                 :name     "checkout_test_table"}}]
      (ws.tu/with-workspaces! [ws1 {:name "Workspace One" :database_id (mt/id)}
                               ws2 {:name "Workspace Two" :database_id (mt/id)}]
        (testing "initially all workspaces for the database are returned, none checked out"
          (is (=? {:checkout_disabled nil
                   :workspaces        [{:id (:id ws1) :name "Workspace One" :status string? :existing nil}
                                       {:id (:id ws2) :name "Workspace Two" :status string? :existing nil}]
                   :transforms        []}
                  (mt/user-http-request :crowberto :get 200 "ee/workspace/checkout"
                                        :transform-id (:id tx)))))

        (testing "after checkout, the workspace shows the existing checkout info"
          (mt/user-http-request :crowberto :post 200 (ws-url (:id ws1) "/transform")
                                (merge {:global_id (:id tx)}
                                       (select-keys tx [:name :source :target])))
          (is (=? {:checkout_disabled nil
                   :workspaces        [{:id (:id ws1) :name "Workspace One" :status string?
                                        :existing {:ref_id string? :name "Native Transform"}}
                                       {:id (:id ws2) :name "Workspace Two" :status string? :existing nil}]
                   :transforms        [{:id string? :name "Native Transform"
                                        :workspace {:id (:id ws1) :name "Workspace One"}}]}
                  (mt/user-http-request :crowberto :get 200 "ee/workspace/checkout"
                                        :transform-id (:id tx)))))

        (testing "returns 404 for non-existent transform"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :get 404 "ee/workspace/checkout"
                                       :transform-id 999999))))))))

(deftest checkout-disabled-reason-test
  (testing "GET /api/ee/workspace/checkout returns correct checkout_disabled reasons"
    (testing "MBQL transforms cannot be checked out"
      (mt/with-temp [:model/Transform tx {:name   "MBQL Transform"
                                          :source {:type  :query
                                                   :query (mt/mbql-query venues)}
                                          :target {:type     "table"
                                                   :database (mt/id)
                                                   :schema   "public"
                                                   :name     "mbql_checkout_test"}}]
        (is (=? {:checkout_disabled "mbql"
                 :workspaces        []
                 :transforms        []}
                (mt/user-http-request :crowberto :get 200 "ee/workspace/checkout"
                                      :transform-id (:id tx))))))

    (testing "Python transforms can be checked out"
      (mt/with-temp [:model/Transform tx {:name        "Python Transform"
                                          :source      {:type :python :code "print(1)" :source-database (mt/id)}
                                          :source_type :python
                                          :target      {:type     "table"
                                                        :database (mt/id)
                                                        :schema   "public"
                                                        :name     "python_checkout_test"}}]
        (is (=? {:checkout_disabled nil
                 :workspaces        []
                 :transforms        []}
                (mt/user-http-request :crowberto :get 200 "ee/workspace/checkout"
                                      :transform-id (:id tx))))))))

(deftest checkout-blocked-for-mbql-transforms-test
  (testing "POST /api/ee/workspace/:id/transform blocks MBQL transform checkout"
    (mt/with-temp [:model/Transform tx {:name   "MBQL Transform"
                                        :source {:type  :query
                                                 :query (mt/mbql-query venues)}
                                        :target {:type     "table"
                                                 :database (mt/id)
                                                 :schema   "public"
                                                 :name     "mbql_blocked_test"}}]
      (ws.tu/with-workspaces! [ws {:name "Test Workspace" :database_id (mt/id)}]
        (is (= "MBQL transforms cannot be added to workspaces."
               (mt/user-http-request :crowberto :post 400 (ws-url (:id ws) "/transform")
                                     (merge {:global_id (:id tx)}
                                            (select-keys tx [:name :source :target])))))))))

(deftest checkout-blocked-for-card-reference-transforms-test
  (testing "POST /api/ee/workspace/:id/transform blocks transform with card references"
    (mt/with-temp [:model/Card card {:name          "Referenced Card"
                                     :database_id   (mt/id)
                                     :dataset_query (mt/native-query {:query "SELECT 1"})}
                   :model/Transform tx {:name   "Card Reference Transform"
                                        :source {:type     :query
                                                 :database (mt/id)
                                                 :query    (mt/native-query {:query         "SELECT * FROM {{#card}}"
                                                                             :template-tags {"card" {:type         "card"
                                                                                                     :card-id      (:id card)
                                                                                                     :display-name "Card"}}})}
                                        :target {:type     "table"
                                                 :database (mt/id)
                                                 :schema   "public"
                                                 :name     "card_ref_blocked_test"}}]
      (ws.tu/with-workspaces! [ws {:name "Test Workspace" :database_id (mt/id)}]
        (is (= "Transforms that reference other questions cannot be added to workspaces."
               (mt/user-http-request :crowberto :post 400 (ws-url (:id ws) "/transform")
                                     (merge {:global_id (:id tx)}
                                            (select-keys tx [:name :source :target])))))))))

(deftest global-id-immutable-test
  (testing "PUT /api/ee/workspace/:id/transform/:tx-id cannot change global_id"
    (let [{:keys [workspace-id global-map workspace-map]}
          (ws.tu/create-resources!
           {:global    {:x1 [:t1]
                        :x2 [:t2]}
            :workspace {:checkouts   [:x1]
                        :definitions {:x3 [:t3]}}})]
      (testing "cannot clear global_id on a checked-out transform"
        (is (=? {:cause "Cannot change global_id of an existing workspace transform."}
                (mt/user-http-request :crowberto :put 400 (ws-url workspace-id "/transform/" (workspace-map :x1))
                                      {:global_id nil}))))
      (testing "cannot set global_id on a workspace-only transform"
        (is (=? {:cause "Cannot change global_id of an existing workspace transform."}
                (mt/user-http-request :crowberto :put 400 (ws-url workspace-id "/transform/" (workspace-map :x3))
                                      {:global_id (global-map :x2)})))))))

(defmacro ^:private with-test-resources-cleanup! [& body]
  `(mt/with-model-cleanup [:model/Transform :model/Workspace :model/Table]
     ~@body))

(deftest test-resources-empty
  (testing "POST /api/ee/workspace/test-resources with global transforms only (no workspace)"
    (with-test-resources-cleanup!
      (is (=? {:workspace-id  nil
               :global-map    {}
               :workspace-map {}}
              (mt/user-http-request :crowberto :post 200 "ee/workspace/test-resources"
                                    {:global {}}))))))

(deftest test-resources-single
  (testing "POST /api/ee/workspace/test-resources with global transforms only (no workspace)"
    (with-test-resources-cleanup!
      (is (=? {:workspace-id  nil
               :global-map    {:x1 int?}
               :workspace-map {}}
              (mt/user-http-request :crowberto :post 200 "ee/workspace/test-resources"
                                    {:global {:x1 []}}))))))

(deftest test-resources-global-only-test
  (testing "POST /api/ee/workspace/test-resources with global transforms only (no workspace)"
    (with-test-resources-cleanup!
      (let [orders (mt/format-name :orders)]
        (is (=? {:workspace-id  nil
                 :global-map    {(keyword orders) int?, :x1 int?, :x2 int?}
                 :workspace-map {}}
                (mt/user-http-request :crowberto :post 200 "ee/workspace/test-resources"
                                      {:global {:x1 [orders], :x2 [:x1]}})))))))

(deftest test-resources-complex-graph-test
  (testing "POST /api/ee/workspace/test-resources with complex graph"
    (with-test-resources-cleanup!
      (let [orders   (mt/format-name :orders)
            products (mt/format-name :products)
            people   (mt/format-name :people)]
        (is (=? {:workspace-id  int?
                 :global-map    {(keyword orders)   int?
                                 (keyword products) int?
                                 :t4                int?
                                 :x1                int?
                                 :x2                int?
                                 :x3                int?
                                 :x4                int?}
                 :workspace-map {:x5 string?, :x6 string?}}
                (mt/user-http-request :crowberto :post 200 "ee/workspace/test-resources"
                                      {:global    {:x1 [orders]
                                                   :x2 [products]
                                                   :x3 [:x1 :x2]
                                                   :x4 [:t4]}
                                       :workspace {:definitions {:x2 [:x1]
                                                                 :x5 [orders :x3]
                                                                 :x6 [:x5 people]}}})))))))

(deftest test-resources-custom-database-test
  (testing "POST /api/ee/workspace/test-resources with custom database_id"
    (mt/with-temp [:model/Database {other-db-id :id} {:name "Other DB" :engine driver/*driver*}
                   :model/Table    {table-id    :id} {:name "coffee", :db_id other-db-id}]
      (with-test-resources-cleanup!
        (let [result (mt/user-http-request :crowberto :post 200 "ee/workspace/test-resources"
                                           {:database_id other-db-id
                                            :global      {:x1 [:t1 "coffee"]}
                                            :workspace   {:definitions {:x2 [:t2]}}})]
          (is (=? {:workspace-id  int?
                   :global-map    {:t1 int?, :t2 int?, :x1 int?, :coffee table-id}
                   :workspace-map {:x2 string?}}
                  result))
          (testing "workspace uses the specified database"
            (is (= other-db-id
                   (t2/select-one-fn :database_id :model/Workspace :id (:workspace-id result)))))
          (testing "mock tables are created in the specified database"
            (is (= other-db-id
                   (t2/select-one-fn :db_id :model/Table :id (:t1 (:global-map result)))))
            (is (= other-db-id
                   (t2/select-one-fn :db_id :model/Table :id (:t2 (:global-map result))))))
          (testing "transform targets the specified database"
            (is (= other-db-id
                   (get-in (t2/select-one :model/Transform :id (:x1 (:global-map result))) [:target :database])))))))))

;;; ============================================ Authorization Test Matrix ============================================

(def ^:private admin-only-routes
  "Routes that require superuser access"
  [[:get  "/"]
   [:post "/"]
   [:get  "/enabled"]
   [:get  "/database"]
   [:get  "/checkout"]
   [:put  "/:ws-id"]
   [:post "/:ws-id/unarchive"]
   [:delete "/:ws-id"]
   [:post "/:ws-id/merge"]
   [:post "/:ws-id/transform/:tx-id/merge"]
   [:post "/test-resources"]])

(def ^:private service-user-routes
  "Routes that allow workspace service users ({:access :workspace})"
  [[:get  "/:ws-id"]
   [:get  "/:ws-id/table"]
   [:get  "/:ws-id/log"]
   [:get  "/:ws-id/graph"]
   [:get  "/:ws-id/problem"]
   [:get  "/:ws-id/external/transform"]
   [:get  "/:ws-id/transform"]
   [:post "/:ws-id/archive"]
   [:post "/:ws-id/transform"]
   [:get  "/:ws-id/transform/:tx-id"]
   [:put  "/:ws-id/transform/:tx-id"]
   [:delete "/:ws-id/transform/:tx-id"]
   [:post "/:ws-id/transform/:tx-id/archive"]
   [:post "/:ws-id/transform/:tx-id/unarchive"]
   [:post "/:ws-id/run"]
   [:post "/:ws-id/transform/:tx-id/run"]
   [:post "/:ws-id/transform/:tx-id/dry-run"]
   [:post "/:ws-id/transform/validate/target"]
   [:post "/:ws-id/query"]])

(def ^:private permission-denied-msg "You don't have permissions to do that.")

(deftest service-user-authorization-test
  (ws.tu/with-workspaces! [ws1 {:name "Workspace 1"}
                           ws2 {:name "Workspace 2"}]
    (mt/with-temp [:model/WorkspaceTransform tx {:name         "Test Transform"
                                                 :workspace_id (:id ws1)}]
      (let [service-user-1 (:execution_user ws1)
            service-user-2 (:execution_user ws2)
            resolve-url    (fn [pattern]
                             (-> pattern
                                 (str/replace ":ws-id" (str (:id ws1)))
                                 (str/replace ":tx-id" (:ref_id tx))
                                 (->> (str "ee/workspace"))))]

        ;; We don't test whether an admin can access the routes - that's implicit in the regular tests for each route.

        (testing "Admin-only routes reject service users and other non-admins"
          (doseq [[method pattern] admin-only-routes
                  :let [url (resolve-url pattern)]]
            (testing (str method " " pattern)
              (is (= permission-denied-msg (mt/user-http-request :rasta method 403 url))
                  "Should reject regular users")
              (is (= permission-denied-msg (mt/user-http-request service-user-1 method 403 url))
                  "Should reject even its own service user"))))

        (testing "Workspace routes allow own service user, reject others"
          (doseq [[method pattern] service-user-routes
                  :let [url (resolve-url pattern)]]
            (testing (str method " " pattern)
              ;; We check for NOT 403 since some routes may 404 without full setup.
              ;; If auth passes, we won't get the permission-denied message.
              (let [resp (mt/user-http-request-full-response service-user-1 method url)]
                (is (not= 403 (:status_code resp)) "Should allow its own service user")
                (is (not= permission-denied-msg (:body resp)) "Should allow its own service user"))
              (is (= permission-denied-msg (mt/user-http-request service-user-2 method 403 url))
                  "Should reject other service users"))))))))

(deftest service-user-access-metadata-matches-patterns-test
  (testing "Endpoint {:access :workspace} metadata matches service-user-patterns"
    (let [;; Get all endpoints from the workspace API namespace
          endpoints          (api.macros/ns-routes 'metabase-enterprise.workspaces.api)
          ;; Convert route path to the expected pattern suffix (what comes after /api/ee/workspace/\d+)
          ;; e.g., /:ws-id/run -> /run, /:ws-id/transform/:tx-id -> /transform/[^/]+
          route->suffix      (fn [route]
                               (-> route
                                   (str/replace #"^/:ws-id" "")  ; Remove ws-id prefix
                                   (str/replace #"/:tx-id" "/[^/]+")))  ; tx-id is string
          ;; Extract [method route] pairs with {:access :workspace} metadata
          workspace-access   (into #{}
                                   (keep (fn [[[method route _] info]]
                                           (when (= :workspace (get-in info [:form :metadata :access]))
                                             [method route])))
                                   endpoints)
          ;; Get the private vars from the API namespace
          patterns           @#'ws.api/service-user-patterns
          ws-prefix          @#'ws.api/ws-prefix
          ;; Check the inverse: for each pattern, find endpoints that match
          pattern->endpoints (fn [method pattern]
                               (filter (fn [[[m route _] _info]]
                                         (and (= m method)
                                              (let [suffix           (route->suffix route)
                                                    expected-pattern (str ws-prefix suffix "$")]
                                                (= (str pattern) expected-pattern))))
                                       endpoints))]

      (testing "Every endpoint with {:access :workspace} is covered by service-user-patterns"
        (doseq [[method route] workspace-access]
          (testing (str method " " route)
            (let [suffix           (route->suffix route)
                  expected-pattern (str ws-prefix suffix "$")
                  method-patterns  (get patterns method)]
              (is (some #(= (str %) expected-pattern) method-patterns)
                  (str "Endpoint has {:access :workspace} but no matching pattern in service-user-patterns. "
                       "Expected pattern: " expected-pattern))))))

      (testing "Every pattern in service-user-patterns matches only endpoints with {:access :workspace}"
        (doseq [[method method-patterns] patterns
                pattern                  method-patterns]
          (let [matching-endpoints (pattern->endpoints method pattern)]
            (testing (str method " " pattern)
              (is (seq matching-endpoints)
                  "Pattern doesn't match any endpoint. Remove the stale pattern.")
              (doseq [[[_ route _] info] matching-endpoints]
                (is (= :workspace (get-in info [:form :metadata :access]))
                    (str "Pattern matches " route " but endpoint lacks {:access :workspace} metadata. "
                         "Add the metadata or remove the pattern."))))))))))
