(ns metabase-enterprise.workspaces.api.public-test
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

;;; ----------------------------------------- Access key management ------------------------------------------------

(deftest access-key-default-nil-test
  (testing "new workspaces have no access key by default"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                     {:name "Default Key Test"})]
        (is (nil? (:access_key (t2/select-one :model/Workspace :id (:id ws)))))))))

(deftest access-key-set-test
  (testing "POST /:id/access-key sets a UUID access key"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws  (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                      {:name "Set Key Test"})
            res (mt/user-http-request :crowberto :post 200
                                      (str "ee/workspace-manager/" (:id ws) "/access-key"))]
        (is (some? (:access_key res)))
        (is (uuid? (parse-uuid (:access_key res))))
        (is (= (:access_key res)
               (:access_key (t2/select-one :model/Workspace :id (:id ws)))))))))

(deftest access-key-rotate-test
  (testing "calling POST /:id/access-key again rotates to a new key"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws   (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                       {:name "Rotate Key Test"})
            res1 (mt/user-http-request :crowberto :post 200
                                       (str "ee/workspace-manager/" (:id ws) "/access-key"))
            res2 (mt/user-http-request :crowberto :post 200
                                       (str "ee/workspace-manager/" (:id ws) "/access-key"))]
        (is (some? (:access_key res1)))
        (is (some? (:access_key res2)))
        (is (not= (:access_key res1) (:access_key res2)))))))

(deftest access-key-clear-test
  (testing "DELETE /:id/access-key clears the key"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws  (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                      {:name "Clear Key Test"})
            _   (mt/user-http-request :crowberto :post 200
                                      (str "ee/workspace-manager/" (:id ws) "/access-key"))
            res (mt/user-http-request :crowberto :delete 200
                                      (str "ee/workspace-manager/" (:id ws) "/access-key"))]
        (is (nil? (:access_key res)))
        (is (nil? (:access_key (t2/select-one :model/Workspace :id (:id ws)))))))))

(deftest access-key-requires-superuser-test
  (testing "non-admins cannot set or clear access keys"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                     {:name "Auth Key Test"})]
        (mt/user-http-request :rasta :post 403
                              (str "ee/workspace-manager/" (:id ws) "/access-key"))
        (mt/user-http-request :rasta :delete 403
                              (str "ee/workspace-manager/" (:id ws) "/access-key"))))))

;;; ----------------------------------------- Public endpoints ---------------------------------------------------

(deftest public-config-yaml-test
  (testing "config YAML is accessible via access key without auth"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws  (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                      {:name "Public Config Test"})
            key (:access_key (mt/user-http-request :crowberto :post 200
                                                   (str "ee/workspace-manager/" (:id ws) "/access-key")))
            res (mt/client :get 200 (str "ee/workspace-public/" key "/config/yaml"))]
        (is (string? res))
        (is (re-find #"Public Config Test" res))))))

(deftest public-invalid-key-test
  (testing "invalid access key returns 404"
    (mt/client :get 404 "ee/workspace-public/00000000-0000-0000-0000-000000000000/config/yaml")))

(deftest public-cleared-key-test
  (testing "cleared access key no longer works"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws  (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                      {:name "Cleared Key Test"})
            key (:access_key (mt/user-http-request :crowberto :post 200
                                                   (str "ee/workspace-manager/" (:id ws) "/access-key")))]
        ;; Works before clearing
        (is (string? (mt/client :get 200 (str "ee/workspace-public/" key "/config/yaml"))))
        ;; Clear the key
        (mt/user-http-request :crowberto :delete 200
                              (str "ee/workspace-manager/" (:id ws) "/access-key"))
        ;; No longer works
        (mt/client :get 404 (str "ee/workspace-public/" key "/config/yaml"))))))

(deftest public-rotated-key-test
  (testing "old access key stops working after rotation"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws   (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                       {:name "Rotated Key Test"})
            key1 (:access_key (mt/user-http-request :crowberto :post 200
                                                    (str "ee/workspace-manager/" (:id ws) "/access-key")))
            key2 (:access_key (mt/user-http-request :crowberto :post 200
                                                    (str "ee/workspace-manager/" (:id ws) "/access-key")))]
        ;; Old key fails
        (mt/client :get 404 (str "ee/workspace-public/" key1 "/config/yaml"))
        ;; New key works
        (is (string? (mt/client :get 200 (str "ee/workspace-public/" key2 "/config/yaml"))))))))
