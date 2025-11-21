(ns metabase-enterprise.workspaces.api-test
  (:require
   [clojure.test :refer :all]
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
  (mt/with-premium-features [:workspaces :dependencies]
    (mt/with-model-cleanup [:model/Collection :model/Workspace :model/Transform]
      (let [tx-id          (t2/select-one-pk :model/Transform {:order-by [[:id :desc]]})
            upstream       {:transforms [tx-id]}
            workspace-name (str "Workspace " (random-uuid))
            created        (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                 {:name     workspace-name
                                                  :upstream upstream})
            workspace-id   (:id created)
            collection-id  (:collection_id created)]
        (is (pos-int? workspace-id))
        (is (pos-int? collection-id))
        (is (= workspace-name (:name created)))
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
              (is (some? (:archived_at updated)))))))))

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
