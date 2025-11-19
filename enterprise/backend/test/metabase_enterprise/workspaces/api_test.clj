(ns metabase-enterprise.workspaces.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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
             (mt/user-http-request :rasta :delete 403 (str "ee/workspace/" (:id workspace))))))))

(deftest workspace-crud-flow-test
  (mt/with-model-cleanup [:model/Collection :model/Workspace]
    (let [stuffs         {:transform [1]}
          workspace-name (str "Workspace " (random-uuid))
          {ws-id :id
           :keys [collection_id]
           :as   created}  (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                 {:name        workspace-name
                                                  :database_id 1
                                                  :stuffs      stuffs})
          ws             (t2/select-one :model/Workspace :id ws-id)
          coll           (t2/select-one :model/Collection :id collection_id)]
      (is (= workspace-name (:name created)))
      (is ws)
      (is coll)
      (is (=? {:namespace :workspaces}
              coll))

      (testing "workspace appears in list response"
        (let [{:keys [items]} (mt/user-http-request :crowberto :get 200 "ee/workspace")]
          (is (some #(= ws-id (:id %)) items))))

      (testing "workspace can be fetched individually"
        (let [response (mt/user-http-request :crowberto :get 200 (str "ee/workspace/" ws-id))]
          (is (= ws-id (:id response)))))

      (testing "workspace can be archived"
        (let [updated (mt/user-http-request :crowberto :post 200 (str "ee/workspace/" ws-id "/archive"))]
          (is (some? (:archived_at updated))))))))
