(ns ^:mb/driver-tests metabase-enterprise.workspaces.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase-enterprise.transforms.test-util :refer [get-test-schema with-transform-cleanup!]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest workspace-endpoints-require-superuser-test
  (mt/with-temp [:model/Workspace workspace {:name "Private Workspace"}]
    (testing "GET /api/ee/workspace requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "ee/workspace"))))

    (testing "GET /api/ee/workspace/:id requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 (str "ee/workspace/" (:id workspace))))))

    (testing "POST /api/ee/workspace requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "ee/workspace"
                                   {:name "Unauthorized Workspace"})))))

  (mt/with-temp [:model/Workspace workspace {:name "Put Workspace"}]
    (testing "PUT /api/ee/workspace/:id requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 (str "ee/workspace/" (:id workspace))
                                   {:name "Updated"})))))

  (mt/with-temp [:model/Workspace workspace {:name "Delete Workspace"}]
    (testing "DELETE /api/ee/workspace/:id requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :delete 403 (str "ee/workspace/" (:id workspace)))))))

  (mt/with-temp [:model/Workspace workspace {:name "Promote Workspace"}]
    (testing "POST /api/ee/workspace/:id/promote requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 (str "ee/workspace/" (:id workspace) "/merge")))))))

(deftest workspace-crud-flow-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features [:workspaces :dependencies :transforms]
      (mt/with-model-cleanup [:model/Collection :model/Workspace :model/Transform]
        (let [tx-id          (->> (t2/select :model/Transform :workspace_id nil)
                                  (filter #(= (mt/id) (get-in % [:target :database])))
                                  (sort-by :id >)
                                  first
                                  :id)
              workspace-name (str "Workspace " (random-uuid))
              ;; Create workspace with or without upstream transforms depending on availability
              created        (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                   (cond-> {:name        workspace-name
                                                            :database_id (mt/id)}
                                                     tx-id (assoc :upstream {:transforms [tx-id]})))
              workspace-id   (:id created)
              collection-id  (:collection_id created)]
          (is (=? {:id            int?
                   :collection_id int?
                   :name          workspace-name}
                  created))
          (is (t2/exists? :model/Workspace :id workspace-id :collection_id collection-id))
          (is (t2/exists? :model/Collection :id collection-id :workspace_id workspace-id))

          (testing "workspace appears in list response"
            (let [{:keys [items]} (mt/user-http-request :crowberto :get 200 "ee/workspace")]
              (is (some #(= workspace-id (:id %)) items))))

          (testing "workspace can be fetched individually"
            (let [response (mt/user-http-request :crowberto :get 200 (str "ee/workspace/" workspace-id))]
              (is (= workspace-id (:id response)))))

          #_(testing "workspace can be archived"
              (let [updated (mt/user-http-request :crowberto :post 200 (str "ee/workspace/" workspace-id "/archive"))]
                (is (some? (:archived_at updated))))))))))

(deftest ^:parallel promote-workspace-test
  (testing "POST /api/ee/workspace/:id/promote requires superuser"
    (mt/with-temp [:model/Workspace workspace {:name "Promote Test"}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 (str "ee/workspace/" (:id workspace) "/merge"))))))

  (testing "Cannot promote an already archived workspace"
    (mt/with-temp [:model/Workspace workspace {:name      "Archived Workspace"
                                               :archived_at (java.time.OffsetDateTime/now)}]
      (is (= "Cannot promote an already archived workspace"
             (mt/user-http-request :crowberto :post 400 (str "ee/workspace/" (:id workspace) "/merge")))))))

(deftest create-workspace-transform-permissions-test
  (testing "POST /api/ee/workspace/:id/transform requires superuser"
    (mt/with-temp [:model/Workspace workspace {:name "Transform Test"}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403
                                   (str "ee/workspace/" (:id workspace) "/transform")
                                   {:name "Should Fail"
                                    :source {:type "query"
                                             :query {}}
                                    :target {:type "table"
                                             :name "should_fail"}}))))))

(deftest create-workspace-transform-archived-test
  (testing "Cannot create transform in archived workspace"
    (mt/with-temp [:model/Workspace workspace {:name "Archived"
                                               :archived_at (java.time.OffsetDateTime/now)}]
      (is (= "Cannot create transforms in an archived workspace"
             (mt/user-http-request :crowberto :post 400
                                   (str "ee/workspace/" (:id workspace) "/transform")
                                   {:name "Should Fail"
                                    :source {:type "query"
                                             :query (mt/mbql-query venues)}
                                    :target {:type "table"
                                             :name "should_fail"}}))))))

(deftest add-entities-to-workspace-test
  (testing "Add entities to workspace"
    (mt/with-premium-features [:workspaces :dependencies :transforms]
      (mt/with-model-cleanup [:model/Collection :model/Workspace :model/Transform :model/WorkspaceMappingTransform]
        (let [transform-ids (t2/select-pks-vec :model/Transform :workspace_id nil {:limit 2 :order-by [[:id :asc]]})
              first-tx-id   (first transform-ids)
              second-tx-id  (second transform-ids)]
          (when (and first-tx-id second-tx-id)
            (let [workspace-id (:id (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                          {:name     "Add Entities Test"
                                                           :upstream {:transforms [first-tx-id]}}))]

              (testing "Can add new entities to workspace"
                (is (=? {:contents {:transforms #(>= (count %) 2)}}
                        (mt/user-http-request :crowberto :post 200
                                              (str "ee/workspace/" workspace-id "/contents")
                                              {:add {:transforms [second-tx-id]}}))))

              (testing "Cannot add duplicate entities"
                (is (= "Transforms 1 are already in workspace"
                       (mt/user-http-request :crowberto :post 400
                                             (str "ee/workspace/" workspace-id "/contents")
                                             {:add {:transforms [first-tx-id]}}))))

              (testing "Cannot add entities to archived workspace"
                (t2/update! :model/Workspace workspace-id {:archived_at (java.time.OffsetDateTime/now)})
                (is (= "Cannot add entities to an archived workspace"
                       (mt/user-http-request :crowberto :post 400
                                             (str "ee/workspace/" workspace-id "/contents")
                                             {:add {:transforms [second-tx-id]}})))))))))))

(deftest add-entities-requires-superuser-test
  (testing "POST /api/ee/workspace/:id/add requires superuser"
    (mt/with-temp [:model/Workspace workspace {:name "Permission Test"}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403
                                   (str "ee/workspace/" (:id workspace) "/contents")
                                   {:add {:transforms [1]}}))))))

(deftest add-entities-no-nested-branching-test
  (testing "Cannot add transforms that belong to another workspace (no nested branching)"
    (mt/with-temp [:model/Workspace workspace-1 {:name "Workspace 1"}
                   :model/Workspace workspace-2 {:name "Workspace 2"}
                   :model/Transform transform {:name         "Downstream Transform"
                                               :workspace_id (:id workspace-1)}]
      (is (= "Cannot add transforms that belong to another workspace"
             (mt/user-http-request :crowberto :post 400
                                   (str "ee/workspace/" (:id workspace-2) "/contents")
                                   {:add {:transforms [(:id transform)]}}))))))

(deftest create-workspace-transform-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:workspaces :transforms}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-model-cleanup [:model/Workspace :model/Transform :model/Collection]
          (let [workspace-id (:id (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                        {:name        "Test Workspace"
                                                         :database_id (mt/id)}))]
            (with-transform-cleanup! [table-name "workspace_transform_test"]
              (is (=? {:id           pos-int?
                       :workspace_id workspace-id
                       :creator_id   (mt/user->id :crowberto)
                       :target       {:database (mt/id)}}
                      (mt/user-http-request :crowberto :post 200
                                            (str "ee/workspace/" workspace-id "/transform")
                                            {:name   "Workspace Transform"
                                             :source {:type  "query"
                                                      :query (mt/mbql-query transforms_products)}
                                             :target {:type   "table"
                                                      :name   table-name}}))))))))))
