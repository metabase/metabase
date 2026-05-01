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

(defn- create-key!
  "Create an access key via the API and return the create-response (which is the
   only place the plaintext :key is exposed)."
  [workspace-id key-name]
  (mt/user-http-request :crowberto :post 200
                        (str "ee/workspace-manager/" workspace-id "/access-key")
                        {:name key-name}))

;;; ----------------------------------------- Public endpoints ---------------------------------------------------

(deftest public-config-yaml-test
  (testing "config YAML is accessible via access key without auth, and the call is logged"
    (mt/with-model-cleanup [:model/Workspace :model/WorkspaceAccessKeyLog]
      (let [ws  (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                      {:name "Public Config Test"})
            ak  (create-key! (:id ws) "shared")
            res (mt/client :get 200 (str "ee/workspace-public/" (:key ak) "/config/yaml"))]
        (is (string? res))
        (is (re-find #"Public Config Test" res))
        (testing "an access-key-log row is written with context=config"
          (let [log-row (t2/select-one :model/WorkspaceAccessKeyLog
                                       :workspace_access_key_id (:id ak))]
            (is (some? log-row))
            (is (= "config" (:context log-row)))
            (is (= (:id ws) (:workspace_id log-row)))))))))

(deftest public-invalid-key-test
  (testing "invalid access key returns 404"
    (mt/client :get 404 "ee/workspace-public/00000000-0000-0000-0000-000000000000/config/yaml")))

(deftest public-deleted-key-test
  (testing "a deleted access key no longer works"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                     {:name "Deleted Key Test"})
            ak (create-key! (:id ws) "to-delete")]
        ;; Works before delete
        (is (string? (mt/client :get 200 (str "ee/workspace-public/" (:key ak) "/config/yaml"))))
        ;; Delete the key
        (mt/user-http-request :crowberto :delete 200
                              (str "ee/workspace-manager/" (:id ws) "/access-key/" (:id ak)))
        ;; No longer works
        (mt/client :get 404 (str "ee/workspace-public/" (:key ak) "/config/yaml"))))))

(deftest public-multiple-keys-test
  (testing "any of a workspace's access keys can be used to fetch its config"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws    (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                        {:name "Multi-key Test"})
            ak-a  (create-key! (:id ws) "key-a")
            ak-b  (create-key! (:id ws) "key-b")]
        (is (string? (mt/client :get 200 (str "ee/workspace-public/" (:key ak-a) "/config/yaml"))))
        (is (string? (mt/client :get 200 (str "ee/workspace-public/" (:key ak-b) "/config/yaml"))))))))

(deftest public-cascade-on-workspace-delete-test
  (testing "deleting the workspace cascades to its access keys (FK ON DELETE CASCADE)"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                     {:name "Cascade Test"})
            ak (create-key! (:id ws) "key")]
        (is (some? (t2/select-one :model/WorkspaceAccessKey :id (:id ak))))
        (mt/user-http-request :crowberto :delete 200 (str "ee/workspace-manager/" (:id ws)))
        (is (nil? (t2/select-one :model/WorkspaceAccessKey :id (:id ak))))))))
