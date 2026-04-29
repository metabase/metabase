(ns metabase-enterprise.workspaces.api.sharing-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- with-premium-feature [f]
  (mt/with-premium-features #{:workspaces}
    (f)))

(use-fixtures :each with-premium-feature)

;;; ----------------------------------------- Sharing key management -----------------------------------------------

(deftest sharing-key-default-nil-test
  (testing "new workspaces have no sharing key by default"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                     {:name "Default Key Test"})]
        (is (nil? (:sharing_key (t2/select-one :model/Workspace :id (:id ws)))))))))

(deftest sharing-key-set-test
  (testing "POST /:id/sharing-key sets a UUID sharing key"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws  (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                      {:name "Set Key Test"})
            res (mt/user-http-request :crowberto :post 200
                                      (str "ee/workspace-manager/" (:id ws) "/sharing-key"))]
        (is (some? (:sharing_key res)))
        (is (uuid? (parse-uuid (:sharing_key res))))
        (is (= (:sharing_key res)
               (:sharing_key (t2/select-one :model/Workspace :id (:id ws)))))))))

(deftest sharing-key-rotate-test
  (testing "calling POST /:id/sharing-key again rotates to a new key"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws   (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                       {:name "Rotate Key Test"})
            res1 (mt/user-http-request :crowberto :post 200
                                       (str "ee/workspace-manager/" (:id ws) "/sharing-key"))
            res2 (mt/user-http-request :crowberto :post 200
                                       (str "ee/workspace-manager/" (:id ws) "/sharing-key"))]
        (is (some? (:sharing_key res1)))
        (is (some? (:sharing_key res2)))
        (is (not= (:sharing_key res1) (:sharing_key res2)))))))

(deftest sharing-key-clear-test
  (testing "DELETE /:id/sharing-key clears the key"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws  (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                      {:name "Clear Key Test"})
            _   (mt/user-http-request :crowberto :post 200
                                      (str "ee/workspace-manager/" (:id ws) "/sharing-key"))
            res (mt/user-http-request :crowberto :delete 200
                                      (str "ee/workspace-manager/" (:id ws) "/sharing-key"))]
        (is (nil? (:sharing_key res)))
        (is (nil? (:sharing_key (t2/select-one :model/Workspace :id (:id ws)))))))))

(deftest sharing-key-requires-superuser-test
  (testing "non-admins cannot set or clear sharing keys"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                     {:name "Auth Key Test"})]
        (mt/user-http-request :rasta :post 403
                              (str "ee/workspace-manager/" (:id ws) "/sharing-key"))
        (mt/user-http-request :rasta :delete 403
                              (str "ee/workspace-manager/" (:id ws) "/sharing-key"))))))

;;; ----------------------------------------- Public sharing endpoints ---------------------------------------------

(deftest public-config-yaml-test
  (testing "config YAML is accessible via sharing key without auth"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws  (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                      {:name "Public Config Test"})
            key (:sharing_key (mt/user-http-request :crowberto :post 200
                                                    (str "ee/workspace-manager/" (:id ws) "/sharing-key")))
            res (mt/client :get 200 (str "ee/workspace-sharing/" key "/config/yaml"))]
        (is (string? res))
        (is (re-find #"Public Config Test" res))))))

(deftest public-metadata-test
  (testing "metadata is accessible via sharing key without auth"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws  (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                      {:name "Public Metadata Test"})
            key (:sharing_key (mt/user-http-request :crowberto :post 200
                                                    (str "ee/workspace-manager/" (:id ws) "/sharing-key")))
            res (mt/client :get 200 (str "ee/workspace-sharing/" key "/metadata"))]
        (is (= "Public Metadata Test" (get-in res [:workspace :name])))
        (is (map? (:databases res)))))))

(deftest public-invalid-key-test
  (testing "invalid sharing key returns 404"
    (mt/client :get 404 "ee/workspace-sharing/00000000-0000-0000-0000-000000000000/config/yaml")
    (mt/client :get 404 "ee/workspace-sharing/00000000-0000-0000-0000-000000000000/metadata")))

(deftest public-cleared-key-test
  (testing "cleared sharing key no longer works"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws  (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                      {:name "Cleared Key Test"})
            key (:sharing_key (mt/user-http-request :crowberto :post 200
                                                    (str "ee/workspace-manager/" (:id ws) "/sharing-key")))]
        ;; Works before clearing
        (is (string? (mt/client :get 200 (str "ee/workspace-sharing/" key "/config/yaml"))))
        ;; Clear the key
        (mt/user-http-request :crowberto :delete 200
                              (str "ee/workspace-manager/" (:id ws) "/sharing-key"))
        ;; No longer works
        (mt/client :get 404 (str "ee/workspace-sharing/" key "/config/yaml"))))))

(deftest public-rotated-key-test
  (testing "old sharing key stops working after rotation"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws   (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                       {:name "Rotated Key Test"})
            key1 (:sharing_key (mt/user-http-request :crowberto :post 200
                                                     (str "ee/workspace-manager/" (:id ws) "/sharing-key")))
            key2 (:sharing_key (mt/user-http-request :crowberto :post 200
                                                     (str "ee/workspace-manager/" (:id ws) "/sharing-key")))]
        ;; Old key fails
        (mt/client :get 404 (str "ee/workspace-sharing/" key1 "/config/yaml"))
        ;; New key works
        (is (string? (mt/client :get 200 (str "ee/workspace-sharing/" key2 "/config/yaml"))))))))
