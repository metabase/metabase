(ns metabase-enterprise.workspaces.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(deftest workspace-crud-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (mt/user-http-request :rasta :post 200 "ee/workspace" {:branch "alex/my-branch"})]
        (testing "POST /api/ee/workspace"
          (is (=? {:branch     "alex/my-branch"
                   :creator_id (mt/user->id :rasta)}
                  ws)))
        (testing "GET /api/ee/workspace"
          (is (some #(= (:id %) (:id ws))
                    (mt/user-http-request :rasta :get 200 "ee/workspace"))))
        (testing "GET /api/ee/workspace/:id"
          (is (=? {:id (:id ws), :branch "alex/my-branch"}
                  (mt/user-http-request :rasta :get 200 (str "ee/workspace/" (:id ws))))))
        (testing "PUT /api/ee/workspace/:id"
          (is (=? {:id (:id ws), :branch "alex/renamed"}
                  (mt/user-http-request :rasta :put 200 (str "ee/workspace/" (:id ws))
                                        {:branch "alex/renamed"}))))
        (testing "DELETE /api/ee/workspace/:id"
          (mt/user-http-request :rasta :delete 204 (str "ee/workspace/" (:id ws)))
          (mt/user-http-request :rasta :get 404 (str "ee/workspace/" (:id ws))))))))

(deftest workspace-requires-feature-test
  (mt/with-premium-features #{}
    (testing "the /api/ee/workspace routes 402 without the :workspaces feature"
      (mt/user-http-request :rasta :get 402 "ee/workspace"))))

(deftest set-current-workspace-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-temp [:model/Workspace ws {:branch "My branch"}]
      (testing "a user can set their own active workspace and read it back"
        (is (=? {:workspace_id (:id ws)}
                (mt/user-http-request :rasta :put 200 (str "user/" (mt/user->id :rasta))
                                      {:workspace_id (:id ws)})))
        (is (=? {:workspace_id (:id ws)}
                (mt/user-http-request :rasta :get 200 "user/current"))))
      (testing "setting a nonexistent workspace is a 400"
        (mt/user-http-request :rasta :put 400 (str "user/" (mt/user->id :rasta))
                              {:workspace_id 31337000}))
      (testing "explicit nil clears the active workspace"
        (is (=? {:workspace_id nil}
                (mt/user-http-request :rasta :put 200 (str "user/" (mt/user->id :rasta))
                                      {:workspace_id nil})))))))

(deftest set-current-workspace-requires-feature-test
  (mt/with-temp [:model/Workspace ws {:branch "My branch"}]
    (mt/with-premium-features #{}
      (testing "setting an active workspace without the :workspaces feature is a 400"
        (mt/user-http-request :rasta :put 400 (str "user/" (mt/user->id :rasta))
                              {:workspace_id (:id ws)}))
      (testing "nil workspace_id is still accepted (clears state)"
        (is (=? {:workspace_id nil}
                (mt/user-http-request :rasta :put 200 (str "user/" (mt/user->id :rasta))
                                      {:workspace_id nil})))))))
