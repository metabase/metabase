(ns metabase-enterprise.workspaces.common-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.common :as workspaces.common]
   [metabase.api-keys.core :as api-key]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.request.core :as request]
   [metabase.server.middleware.session :as mw.session]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.secret :as u.secret]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users :web-server))

(deftest create-workspace!-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (mt/with-model-cleanup [:model/Workspace]
      (let [workspace (workspaces.common/create-workspace!
                       user-id
                       (mt/random-name)
                       "Dark Workspace")]
        (testing "Should have created a collection"
          (let [collection-id (:collection_id workspace)]
            (is (pos-int? collection-id))
            (is (t2/exists? :model/Collection collection-id))))
        (testing "should have created an API key"
          (let [api-key-id (:api_key_id workspace)]
            (is (pos-int? api-key-id))
            (is (t2/exists? :model/ApiKey api-key-id)))
          (testing "Should return raw API Key"
            (let [api-key (::workspaces.common/api-key workspace)]
              (is (u.secret/secret? api-key))
              (is (=? #"^mb_.{44}$"
                      (u.secret/expose api-key))))))))))

(deftest delete-workspace-test
  (let [workspace-exists?  (fn [workspace]
                             (t2/exists? :model/Workspace (:id workspace)))
        collection-exists? (fn [workspace]
                             (t2/exists? :model/Collection (:collection_id workspace)))
        api-key-exists?    (fn [workspace]
                             (t2/exists? :model/ApiKey (:api_key_id workspace)))
        workspace          (workspaces.common/create-workspace!
                            (mt/user->id :rasta)
                            (mt/random-name)
                            "Dark Workspace")]
    (is (workspace-exists? workspace))
    (is (collection-exists? workspace))
    (is (api-key-exists? workspace))
    (t2/delete! :model/Workspace (:id workspace))
    (testing "After deleting the workspace..."
      (is (not (workspace-exists? workspace)))
      (testing "Collection should still exist"
        (is (collection-exists? workspace)))
      (testing "API key should be deleted"
        (is (not (api-key-exists? workspace))))
      (testing "User should still be active"
        (is (t2/select-one-fn :is_active :model/User (mt/user->id :rasta)))))))

(deftest single-collection-api-key-e2e-test
  (mt/with-temp [:model/Collection {original-collection-id :id} {}]
    (let [perms-set             (fn [current-user-info]
                                  (request/do-with-current-user
                                   current-user-info
                                   (fn [] @api/*current-user-permissions-set*)))
          has-collection-perms? (fn [perms-set collection-id]
                                  (contains? perms-set (perms/collection-readwrite-path collection-id)))
          original-perms-set    (perms-set {:metabase-user-id (mt/user->id :rasta)})]
      (testing "Sanity check: original perms should have perms for collections"
        (is (has-collection-perms? original-perms-set original-collection-id)))
      (testing "with API key"
        (mt/with-model-cleanup [:model/Workspace]
          (let [workspace                 (workspaces.common/create-workspace!
                                           (mt/user->id :crowberto)
                                           (mt/random-name)
                                           "Dark Workspace")
                workspace-collection-id   (:collection_id workspace)
                _                         (is (> workspace-collection-id original-collection-id)
                                              "Should be a NEW collection")
                api-key                   (-> (::workspaces.common/api-key workspace)
                                              u.secret/expose)
                api-key-current-user-info (#'mw.session/merge-current-user-info {:headers {"x-api-key" api-key}})]
            (is (=? {:workspace/collection-id workspace-collection-id
                     :workspace/attributes    nil}
                    api-key-current-user-info))
            (let [api-key-perms-set (perms-set api-key-current-user-info)]
              (testing "Should not have unrestricted admin perms"
                (is (not (contains? api-key-perms-set "/"))))
              (is (set/subset? api-key-perms-set
                               (-> original-perms-set
                                   (conj (perms/collection-readwrite-path workspace-collection-id)))))
              (is (has-collection-perms? api-key-perms-set workspace-collection-id))
              (is (not (has-collection-perms? api-key-perms-set original-collection-id))))))))))
