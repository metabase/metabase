(ns ^:mb/driver-tests metabase-enterprise.workspaces.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.transforms.api :as transforms.api]
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase-enterprise.transforms.test-util :as transforms.tu :refer [with-transform-cleanup!]]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase-enterprise.workspaces.test-util :as ws.tu]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)))

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
  (mt/with-temp [:model/Workspace workspace {:name "Private Workspace"}]
    (testing "GET /api/ee/workspace requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "ee/workspace"))))

    (testing "GET /api/ee/workspace/:id requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 (ws-url (:id workspace) "")))))

    (testing "POST /api/ee/workspace requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "ee/workspace"
                                   {:name "Unauthorized Workspace"})))))

  (mt/with-temp [:model/Workspace workspace {:name "Put Workspace"}]
    (testing "PUT /api/ee/workspace/:id requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 (ws-url (:id workspace) "")
                                   {:name "Updated"})))))

  (mt/with-temp [:model/Workspace workspace {:name "Delete Workspace"}]
    (testing "DELETE /api/ee/workspace/:id requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :delete 403 (ws-url (:id workspace) ""))))))

  (mt/with-temp [:model/Workspace workspace {:name "Promote Workspace"}]
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
      (let [updated (mt/user-http-request :crowberto :post 200 (str "ee/workspace/" workspace-id "/archive"))]
        (is (some? (:archived_at updated)))))

    (testing "workspace can be unarchived"
      (let [updated (mt/user-http-request :crowberto :post 200 (str "ee/workspace/" workspace-id "/unarchive"))]
        (is (nil? (:archived_at updated)))))

    (testing "workspace cannot be deleted if it is not archived"
      (let [message (mt/user-http-request :crowberto :delete 400 (str "ee/workspace/" workspace-id))]
        (is (= "You cannot delete a workspace without first archiving it" message))))

    (testing "workspace can be deleted if it is archived"
      (let [updated (mt/user-http-request :crowberto :post 200 (str "ee/workspace/" workspace-id "/archive"))]
        (is (some? (:archived_at updated))))
      (let [response (mt/user-http-request :crowberto :delete 200 (str "ee/workspace/" workspace-id))]
        (is (= {:ok true} response))
        ;; todo: check the schema / tables and user are gone
        (is (false? (t2/exists? :model/Workspace workspace-id)))))))

(deftest ^:parallel promote-workspace-test
  (testing "POST /api/ee/workspace/:id/promote requires superuser"
    (mt/with-temp [:model/Workspace workspace {:name "Promote Test"}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 (ws-url (:id workspace) "/merge"))))))

  (testing "Cannot merge an already archived workspace"
    (mt/with-temp [:model/Workspace workspace {:name        "Archived Workspace"
                                               :archived_at (OffsetDateTime/now)}]
      (is (= "Cannot merge an archived workspace"
             (mt/user-http-request :crowberto :post 400 (ws-url (:id workspace) "/merge")))))))

(deftest merge-workspace-with-transform-test
  (testing "POST /api/ee/workspace/:id/merge promotes transforms and archives workspace"
    (mt/with-temp [:model/Table                     _table {:schema "public" :name "merge_test_table"}
                   :model/Transform                 x1    {:name        "Upstream Transform"
                                                           :description "Original description"
                                                           :target      {:type     "table"
                                                                         :database 1
                                                                         :schema   "public"
                                                                         :name     "merge_test_table"}}]
      (let [{ws-id :id} (ws.tu/ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                              {:name        "Merge test"
                                                               :database_id (mt/id)}))]
        (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform")
                              (merge {:global_id (:id x1)}
                                     (select-keys x1 [:name :description :source :target])))
        (testing "We've got our workspace with transform to merge"
          (is (int? ws-id))
          ;; (sanya) TODO: maybe switch to using transform APIs once we get our own
          (let [x2-id (t2/select-one-fn :downstream_id :model/WorkspaceMappingTransform :upstream_id (:id x1))]
            (t2/update! :model/Transform :id x2-id {:description "Modified in workspace"})))
        (testing "returns merged transforms"
          (is (=? {:merged    {:transforms [{:global_id (:id x1)}]}
                   :errors    []
                   :workspace {:id ws-id :name "Merge test"}}
                  (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/merge")))))
        (testing "workspace was deleted after successful merge"
          (is (nil? (t2/select-one :model/Workspace :id ws-id))))))))

(deftest merge-workspace-transaction-failure-test
  (testing "transactions"
    (mt/with-temp [:model/Table     _table {:schema "public" :name "merge_test_table"}
                   :model/Table     _table {:schema "public" :name "merge_test_table_2"}
                   :model/Transform x1 {:name        "Upstream Transform 1"
                                        :description "Original description 2"
                                        :target      {:type     "table"
                                                      :database 1
                                                      :schema   "public"
                                                      :name     "merge_test_table"}}
                   :model/Transform x2 {:name        "Upstream Transform 2"
                                        :description "Original description 2"
                                        :target      {:type     "table"
                                                      :database 1
                                                      :schema   "public"
                                                      :name     "merge_test_table_2"}}]
      (let [;; Create a workspace
            {ws-id :id} (ws.tu/ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                              {:name        "Merge test"
                                                               :database_id  (mt/id)}))
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
                                  (ws-url ws-id (str "/transform/" ws-x-1-id))
                                  {:name "UPDATED 1"})
            {ws-x-2-id :ref_id :as ws-x-2}
            (mt/user-http-request :crowberto :put 200
                                  (ws-url ws-id (str "/transform/" ws-x-2-id))
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
                  (is (= {:op "update"
                          :global_id (:id x2)
                          :ref_id ws-x-2-id
                          :message "boom"}
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
                   :model/Transform x1 {:name        "Upstream Transform 1"
                                        :description "Original description 2"
                                        :target      {:type     "table"
                                                      :database 1
                                                      :schema   "public"
                                                      :name     "merge_test_table"}}
                   :model/Transform x2 {:name        "Upstream Transform 2"
                                        :description "Original description 2"
                                        :target      {:type     "table"
                                                      :database 1
                                                      :schema   "public"
                                                      :name     "merge_test_table_2"}}]
      (let [;; Create a workspace
            {ws-id :id} (ws.tu/ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                              {:name        "Merge test"
                                                               :database_id  (mt/id)}))
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
                                  (ws-url ws-id (str "/transform/" ws-x-1-id))
                                  {:name "UPDATED 1"})
            {ws-x-2-id :ref_id :as ws-x-2}
            (mt/user-http-request :crowberto :put 200
                                  (ws-url ws-id (str "/transform/" ws-x-2-id))
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
              (is (some? (m/find-first #{{:op "update"
                                          :global_id (:id x1)
                                          :ref_id ws-x-1-id}}
                                       (get-in resp [:merged :transforms]))))
              (is (some? (m/find-first #{{:op "update"
                                          :global_id (:id x2)
                                          :ref_id ws-x-2-id}}
                                       (get-in resp [:merged :transforms]))))))
          (testing "Core transforms names are updated"
            (is (= (:name ws-x-1)
                   (t2/select-one-fn :name :model/Transform (:id x1))))
            (is (= (:name ws-x-2)
                   (t2/select-one-fn :name :model/Transform (:id x2)))))
          (testing "Workspace transforms are deleted"
            (is (nil? (t2/select-one :model/WorkspaceTransform
                                     :workspace_id ws-id :ref_id (:ref_id ws-x-1))))
            (is (nil? (t2/select-one :model/WorkspaceTransform
                                     :workspace_id ws-id :ref_id (:ref_id ws-x-2)))))
          ;; This should change going forward. Deletion of workspace is temporary.
          (testing "Workspace has been deleted"
            (is (nil? (t2/select-one :model/Workspace :id ws-id)))))))))

(deftest merge-empty-workspace-test
  (let [{ws-id :id} (ws.tu/ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                          {:name        "Merge test"
                                                           :database_id  (mt/id)}))]

    (testing "API response: empty errors, empty updates"
      (let [resp (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/merge"))]
        (is (=? {:errors []
                 :merged {:transforms []}}
                resp))))
    ;; This should change going forward. Deletion of workspace is temporary.
    (testing "Workspace has been deleted"
      (is (nil? (t2/select-one :model/Workspace :id ws-id))))))

(deftest merge-transfom-test
  (mt/with-temp [:model/Table     _table {:schema "public" :name "merge_test_table"}
                 :model/Table     _table {:schema "public" :name "merge_test_table_2"}
                 :model/Transform x1 {:name        "Upstream Transform 1"
                                      :description "Original description 2"
                                      :target      {:type     "table"
                                                    :database 1
                                                    :schema   "public"
                                                    :name     "merge_test_table"}}
                 :model/Transform x2 {:name        "Upstream Transform 2"
                                      :description "Original description 2"
                                      :target      {:type     "table"
                                                    :database 1
                                                    :schema   "public"
                                                    :name     "merge_test_table_2"}}]
    (let [;; Create a workspace
          {ws-id :id} (ws.tu/ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                            {:name        "Merge test"
                                                             :database_id  (mt/id)}))
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
                                (ws-url ws-id (str "/transform/" ws-x-1-id))
                                {:name "UPDATED 1"})
          {ws-x-2-id :ref_id :as ws-x-2}
          (mt/user-http-request :crowberto :put 200
                                (ws-url ws-id (str "/transform/" ws-x-2-id))
                                {:name "UPDATED 2"})]
      (testing "Merging first of 2 workspace transfroms"
        (let [resp (mt/user-http-request :crowberto :post 200 (ws-url ws-id (str "/transform/" ws-x-1-id "/merge")))
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
                   (t2/select-one-fn :name :model/Transform :id (:global_id resp)))))))
      (testing "Merging last workspace transfrom"
        (let [resp (mt/user-http-request :crowberto :post 200 (ws-url ws-id (str "/transform/" ws-x-2-id "/merge")))
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
              (is (empty? (:archived_at ws-after))))))))))

(deftest merge-single-transfom-failure-test
  (mt/with-temp [:model/Table     _table {:schema "public" :name "merge_test_table"}
                 :model/Transform x1 {:name        "Upstream Transform 1"
                                      :description "Original description 2"
                                      :target      {:type     "table"
                                                    :database 1
                                                    :schema   "public"
                                                    :name     "merge_test_table"}}]
    (let [;; Create a workspace
          {ws-id :id} (ws.tu/ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                            {:name        "Merge test"
                                                             :database_id  (mt/id)}))
          ;; Add transform
          {ws-x-1-id :ref_id :as ws-x-1}
          (mt/user-http-request :crowberto :post 200 (ws-url ws-id "/transform")
                                (merge {:global_id (:id x1)}
                                       (select-keys x1 [:name :description :source :target])))

          _ (mt/user-http-request :crowberto :post 204
                                  (ws-url ws-id (str "/transform/" ws-x-1-id "/archive")))]
      (testing "Failure on merge"
        (with-redefs [transforms.api/delete-transform! (fn [& _args]
                                                         (throw (Exception. "boom")))]
          (let [resp (mt/user-http-request :crowberto :post 500
                                           (ws-url ws-id (str "/transform/" ws-x-1-id "/merge")))]
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
            {ws-id :id} (ws.tu/ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                              {:name        "Merge test"
                                                               :database_id  (mt/id)}))
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
                                     (ws-url ws-id (str "/transform/" ws-x-1-id))
                                     {:name "UPDATED 1"})
            ;; Archive second
            _ (mt/user-http-request :crowberto :post 204
                                    (ws-url ws-id (str "/transform/" ws-x-2-id "/archive")))
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
              (is (nil? (t2/select-one :model/Transform :id (:id x2))))
              (is (= (:name ws-x-3)
                     (t2/select-one-fn :name :model/Transform :id new-global-id))))))))))

(deftest create-workspace-transform-permissions-test
  (testing "POST /api/ee/workspace/:id/transform requires superuser"
    (mt/with-temp [:model/Workspace workspace {:name "Transform Test"}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 (ws-url (:id workspace) "/transform")
                                   {:name   "Should Fail"
                                    :source {:type  "query"
                                             :query {}}
                                    :target {:type "table"
                                             :name "should_fail"}}))))))

(deftest create-workspace-transform-archived-test
  (testing "Cannot create transform in archived workspace"
    (mt/with-temp [:model/Workspace workspace {:name        "Archived"
                                               :archived_at (OffsetDateTime/now)}]
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
        (let [{ws-id :id} (ws.tu/ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                                {:name        "Add Transforms Test"
                                                                 :database_id (mt/id)}))]
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
              (is (=? {:ref_id       string?
                       :global_id    nil?
                       :name         "New Transform"
                       :target_stale true}
                      response))
              (is (= response (mt/user-http-request :crowberto :get 200 (ws-url ws-id "transform" (:ref_id response)))))))

          (testing "Cannot add transforms to archived workspace"
            (t2/update! :model/Workspace ws-id {:archived_at (OffsetDateTime/now)})
            (is (= "Cannot create transforms in an archived workspace"
                   (mt/user-http-request :crowberto :post 400 (ws-url ws-id "/transform")
                                         {:name   "Should Fail"
                                          :source {:type  "query"
                                                   :query (mt/mbql-query venues)}
                                          :target {:type "table"
                                                   :name "should_fail"}})))))))))

(deftest add-entities-requires-superuser-test
  (testing "POST /api/ee/workspace/:id/add requires superuser"
    (mt/with-temp [:model/Workspace workspace {:name "Permission Test"}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 (ws-url (:id workspace) "/transform")
                                   {:name "blah", :source {}, :target {}}))))))

(deftest create-workspace-transform-test
  (mt/dataset transforms-dataset/transforms-test
    (let [{ws-id :id} (ws.tu/ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                            {:name        "Test Workspace"
                                                             :database_id (mt/id)}))]
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
            (is (=? {:inputs  [{:db_id (mt/id), :schema nil, :table "orders", :table_id int?}]
                     :outputs [{:db_id (mt/id)
                                :global {:schema "public", :table orig-name}
                                :isolated {:transform_id ref-id}}]}
                    tables-result))))))))

(deftest tables-endpoint-test
  (let [mp          (mt/metadata-provider)
        query       (lib/native-query mp "select * from orders limit 10;")
        orig-schema "public"]
    (with-transform-cleanup! [orig-name "ws_tables_test"]
      (mt/with-temp [:model/Transform x1 {:name        "My X1"
                                          :source      {:type  "query"
                                                        :query query}
                                          :target      {:type     "table"
                                                        :database (mt/id)
                                                        :schema   "public"
                                                        :name     orig-name}}]
        ;; create the global table
        (transforms.i/execute! x1 {:run-method :manual})
        (let [workspace    (ws.tu/ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                                 {:name        "Test Workspace"
                                                                  :database_id (mt/id)}))
              create-url   (ws-url (:id workspace) "/transform")
              create-req   (assoc (select-keys x1 [:name :source :target]) :global_id (:id x1))
              ;; add the transform
              ref-id       (:ref_id (mt/user-http-request :crowberto :post 200 create-url create-req))
              ws-transform (t2/select-one :model/WorkspaceTransform :workspace_id (:id workspace) :ref_id ref-id)
              orig-id      (t2/select-one-fn :id [:model/Table :id]
                                             :db_id (:database_id workspace)
                                             :schema (-> ws-transform :target :schema)
                                             :name (-> ws-transform :target :name))]
          (testing "/table returns expected results"
            (is (=? {:inputs [{:db_id (mt/id), :schema nil, :table "orders", :table_id int?}]
                     :outputs
                     [{:db_id    (mt/id)
                       :global   {:schema   orig-schema
                                  :table    orig-name
                                  :table_id orig-id}
                       :isolated {:transform_id ref-id
                                  :schema       (:schema workspace)
                                  :table        string?}}]}
                    (mt/user-http-request :crowberto :get 200 (ws-url (:id workspace) "/table")))))
          (testing "and after we run the transform, id for isolated table appears"
            (is (=? {:status "succeeded"}
                    (mt/user-http-request :crowberto :post 200 (ws-url (:id workspace) "transform" ref-id "run"))))
            (is (=? {:inputs [{:db_id (mt/id), :schema nil, :table "orders", :table_id int?}]
                     :outputs
                     [{:db_id    (mt/id)
                       :global   {:schema   orig-schema
                                  :table    orig-name
                                  :table_id orig-id}
                       :isolated {:transform_id ref-id
                                  :schema       (:schema workspace)
                                  :table        string?
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
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Workspace  workspace     {:name          "Original Name"
                                                    :database_id   (mt/id)
                                                    :collection_id coll-id}]
      (let [response (mt/user-http-request :crowberto :put 200 (ws-url (:id workspace))
                                           {:name "Updated Name"})]
        (is (= "Updated Name"
               (:name response)
               (t2/select-one-fn :name :model/Workspace :id (:id workspace)))))))

  (testing "Requires superuser"
    (mt/with-temp [:model/Workspace workspace {:name "Permission Test"}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 (ws-url (:id workspace))
                                   {:name "Should Fail"})))))

  (testing "Cannot rename an archived workspace"
    (mt/with-temp [:model/Workspace workspace {:name        "Archived"
                                               :archived_at (OffsetDateTime/now)}]
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
  (let [table (t2/select-one :model/Table :active true {:where [:not [:like :schema "mb__%"]]})]
    (mt/with-temp [:model/Workspace          ws   {:name "test"}
                   :model/WorkspaceTransform _x1  {:workspace_id (:id ws)
                                                   :target       {:database (:db_id table)
                                                                  :type     "table"
                                                                  :schema   (:schema table)
                                                                  :name     (str "q_" (:name table))}}]
      (testing "Unique"
        (is (= "OK"
               (mt/with-log-level [metabase.driver.sql-jdbc.sync.describe-table :fatal]
                 (mt/user-http-request :crowberto :post 200 (ws-url (:id ws) "/transform/validate/target")
                                       {:db_id  (mt/id)
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
        (let [table (t2/select-one :model/Table :active true)]
          (is (= "Must not target an isolated workspace schema"
                 (mt/with-log-level [metabase.driver.sql-jdbc.sync.describe-table :fatal]
                   (mt/user-http-request :crowberto :post 403 (ws-url (:id ws) "/transform/validate/target")
                                         {:db_id  (:db_id table)
                                          :target {:type   "table"
                                                   :schema (:schema ws)
                                                   :name   (str "q_" (:name table))}}))))))

      (testing "Conflict inside of workspace"
        (let [table (t2/select-one :model/Table :active true)]
          (is (= "Must not target an isolated workspace schema"
                 (mt/with-log-level [metabase.driver.sql-jdbc.sync.describe-table :fatal]
                   (mt/user-http-request :crowberto :post 403 (ws-url (:id ws) "/transform/validate/target")
                                         {:db_id  (:db_id table)
                                          :target {:type   "table"
                                                   :schema (:schema table)
                                                   :name   (str "q_" (:name table))}})))))))))

;;;; Async workspace creation tests

(deftest create-workspace-returns-updating-status-test
  (testing "Creating workspace returns status :pending immediately"
    (let [res (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                    {:name "async-test" :database_id (mt/id)})]
      (is (=? {:status "pending"} res))
      (testing "and then it becomes ready"
        (is (=? {:status :ready} (ws.tu/ws-ready res)))))))

(deftest workspace-log-endpoint-test
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

(deftest workspace-log-entries-created-test
  (testing "WorkspaceLog entries are created during setup"
    (let [{ws-id :id} (ws.tu/ws-ready (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                            {:name "log-entries-test" :database_id (mt/id)}))]
      (is (=? [{:task   :database-isolation
                :status :success}
               {:task   :workspace-setup
                :status :success}]
              (t2/select :model/WorkspaceLog :workspace_id ws-id {:order-by [[:started_at :desc]]}))))))

(deftest workspace-setup-failure-logs-error-test
  (testing "Failed workspace setup logs error message"
    (with-redefs [ws.isolation/ensure-database-isolation!
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

;;; ---------------------------------------- Workspace Transform CRUD Tests ----------------------------------------

(deftest get-workspace-transforms-test
  (testing "GET /api/ee/workspace/:id/transform"
    (mt/with-temp [:model/Workspace          workspace {:name "List Transforms Test"}
                   :model/WorkspaceTransform tx1       {:name         "Transform 1"
                                                        :workspace_id (:id workspace)}
                   :model/WorkspaceTransform tx2       {:name         "Transform 2"
                                                        :workspace_id (:id workspace)}
                   :model/Transform          _tx3      {:name "Global Transform"}]
      (testing "returns transforms in workspace"
        (is (=? {:transforms [{:ref_id (:ref_id tx1)}
                              {:ref_id (:ref_id tx2)}]}
                (mt/user-http-request :crowberto :get 200 (ws-url (:id workspace) "/transform")))))
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 (ws-url (:id workspace) "/transform"))))))
    (testing "returns empty list when no transforms"
      (mt/with-temp [:model/Workspace workspace {:name "Empty Workspace"}]
        (is (= {:transforms []}
               (mt/user-http-request :crowberto :get 200 (ws-url (:id workspace) "/transform"))))))
    (testing "returns 404 for non-existent workspace"
      (is (= "Not found."
             (mt/user-http-request :crowberto :get 404 "ee/workspace/999999/transform"))))))

(deftest get-workspace-transform-by-id-test
  (testing "GET /api/ee/workspace/:id/transform/:txid"
    (mt/with-temp [:model/Workspace          workspace1 {:name "Workspace 1"}
                   :model/Workspace          workspace2 {:name "Workspace 2"}
                   :model/WorkspaceTransform transform  {:name         "My Transform"
                                                         :description  "Test description"
                                                         :workspace_id (:id workspace1)}]
      (testing "returns specific transform"
        (is (=? {:ref_id      (:ref_id transform)
                 :name        "My Transform"
                 :description "Test description"}
                (mt/user-http-request :crowberto :get 200
                                      (ws-url (:id workspace1) (str "/transform/" (:ref_id transform)))))))
      (testing "returns 404 if transform not in workspace"
        (is (= "Not found."
               (mt/user-http-request :crowberto :get 404
                                     (ws-url (:id workspace2) (str "/transform/" (:ref_id transform)))))))
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403
                                     (ws-url (:id workspace1) (str "/transform/" (:ref_id transform))))))))))

(deftest update-workspace-transform-test
  (testing "PUT /api/ee/workspace/:id/transform/:txid"
    (mt/with-temp [:model/Workspace          workspace1 {:name "Workspace 1"}
                   :model/Workspace          workspace2 {:name "Workspace 2"}
                   :model/WorkspaceTransform transform {:name         "Original Name"
                                                        :description  "Original description"
                                                        :workspace_id (:id workspace1)}]
      (testing "updates transform"
        (is (=? {:ref_id      (:ref_id transform)
                 :name        "Updated Name"
                 :description "Updated description"}
                (mt/user-http-request :crowberto :put 200
                                      (ws-url (:id workspace1) (str "/transform/" (:ref_id transform)))
                                      {:name        "Updated Name"
                                       :description "Updated description"})))
        (is (= "Updated Name" (t2/select-one-fn :name :model/WorkspaceTransform :ref_id (:ref_id transform)))))
      (testing "returns 404 if transform not in workspace"
        (is (= "Not found."
               (mt/user-http-request :crowberto :put 404
                                     (ws-url (:id workspace2) (str "/transform/" (:ref_id transform)))
                                     {:name "Should Fail"}))))
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403
                                     (ws-url (:id workspace1) (str "/transform/" (:ref_id transform)))
                                     {:name "Should Fail"})))))))

(deftest delete-workspace-transform-test
  (testing "DELETE /api/ee/workspace/:id/transform/:txid"
    (mt/with-temp [:model/Workspace workspace1 {:name "Workspace 1"}
                   :model/Workspace workspace2 {:name "Workspace 2"}
                   :model/WorkspaceTransform transform1 {:name         "Transform in WS1"
                                                         :workspace_id (:id workspace1)}
                   :model/WorkspaceTransform transform2 {:name         "To Delete"
                                                         :workspace_id (:id workspace1)}]
      (testing "returns 404 if transform not in workspace"
        (is (= "Not found."
               (mt/user-http-request :crowberto :delete 404
                                     (ws-url (:id workspace2) (str "/transform/" (:ref_id transform1)))))))
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :delete 403
                                     (ws-url (:id workspace1) (str "/transform/" (:ref_id transform1)))))))
      (testing "deletes transform"
        (is (nil? (mt/user-http-request :crowberto :delete 204
                                        (ws-url (:id workspace1) (str "/transform/" (:ref_id transform2))))))
        (is (some? (t2/select-one :model/WorkspaceTransform :ref_id (:ref_id transform1))))
        (is (nil? (t2/select-one :model/WorkspaceTransform :ref_id (:ref_id transform2))))))))

(deftest run-workspace-transform-test
  (testing "POST /api/ee/workspace/:id/transform/:txid/run"
    (transforms.tu/with-transform-cleanup! [output-table "ws_api"]
      (mt/with-temp [:model/Workspace ws1 {:name        "Workspace 1"
                                           :schema      "ws1"
                                           :database_id (mt/id)}
                     :model/Workspace ws2 {:name   "Workspace 2"
                                           :schema "ws2"}
                     :model/Transform x1  {:name   "Transform in WS1"
                                           :source {:type  "query"
                                                    :query (mt/native-query {:query "SELECT 42 as answer"})}
                                           :target {:type     "table"
                                                    :database (mt/id)
                                                    :schema   "public"
                                                    :name     output-table}}]
        (let [ref-id (:ref_id
                      (mt/user-http-request :crowberto :post 200 (ws-url (:id ws1) "/transform") x1))]
          (testing "returns 404 if transform not in workspace"
            (is (= "Not found."
                   (mt/user-http-request :crowberto :post 404
                                         (ws-url (:id ws2) "/transform/" ref-id "/run")))))
          (testing "requires superuser"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :post 403
                                         (ws-url (:id ws1) "/transform/" ref-id "/run")))))
          (testing "successful execution"
            (is (=? {:status     "succeeded"
                     :start_time some?
                     :end_time   some?
                     :table      {:name   #(str/includes? % output-table)
                                  :schema "ws1"}}
                    (mt/user-http-request :crowberto :post 200 (ws-url (:id ws1) "transform" ref-id "run"))))
            (testing "and we don't get any excessive transforms in the db"
              (is (= (:id x1)
                     (t2/select-one-fn :id [:model/Transform :id] {:order-by [[:id :desc]]})))))
          (testing "transform has last_run_at after that"
            (is (=? {:last_run_at some?}
                    (mt/user-http-request :crowberto :get 200 (ws-url (:id ws1) "transform" ref-id))))))))))

(deftest run-workspace-test
  (testing "POST /api/ee/workspace/:id/execute"
    (mt/with-temp [:model/Workspace          workspace1 {:name "Workspace 1", :database_id (mt/id)}
                   :model/Workspace          workspace2 {:name "Workspace 2"}
                   :model/WorkspaceTransform transform  {:name         "Transform in WS1"
                                                         :workspace_id (:id workspace1)}]
      (testing "returns empty when no transforms"
        (is (= {:succeeded []
                :failed    []
                :not_run   []}
               (mt/user-http-request :crowberto :post 200 (ws-url (:id workspace2) "/run")))))
      (testing "executes transforms in workspace"
        ;; Chris wasn't sure why it fails, but it works now, so ¯\_(ツ)_/¯
        (is (= {:succeeded [(:ref_id transform)]
                :failed    []
                :not_run   []}
               (mt/user-http-request :crowberto :post 200 (ws-url (:id workspace1) "/run"))))))))

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
        (mt/with-temp [;; Global transforms (workspace_id = null)
                       :model/Dashboard          {db-2 :id}   {:name "Other Db"}
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
                       ;; Workspace
                       :model/Workspace          {ws1-id :id} {:name        "Our Workspace"
                                                               :database_id db-1}
                       :model/Workspace          {ws2-id :id} {:name        "Their Workspace"
                                                               :database_id db-1}
                       ;; Workspace transforms (mirrored from global1 and global2)
                       :model/WorkspaceTransform _            {:global_id    xf1-id
                                                               :workspace_id ws1-id}
                       :model/WorkspaceTransform _            {:global_id    xf2-id
                                                               :workspace_id ws2-id}]
          (testing "excludes irrelevant transforms, and indicates which remaining transforms cannot be checked out."
            (let [transforms (:transforms (mt/user-http-request :crowberto :get 200 (str "ee/workspace/" ws1-id "/external/transform")))
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
                       (u/index-by :id :checkout_disabled transforms)))))))))))
