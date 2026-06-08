(ns metabase-enterprise.workspaces.models.workspace-instance-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [toucan2.core :as t2]))

(defn- instance-attrs
  ([] (instance-attrs {}))
  ([overrides]
   (merge {:url     "https://child-1.example.com"
           :api_key "mb_superuser_key"}
          overrides)))

(deftest free-row-defaults-test
  (testing "a registered instance with no workspace_id is free in the pool"
    (mt/with-model-cleanup [:model/WorkspaceInstance]
      (let [{id :id} (t2/insert-returning-instance! :model/WorkspaceInstance (instance-attrs))
            row      (t2/select-one :model/WorkspaceInstance :id id)]
        (is (some? id))
        (is (nil? (:workspace_id row)))
        (testing "timestamps are populated by the :hook/timestamped? hook"
          (is (some? (:created_at row)))
          (is (some? (:updated_at row))))))))

(deftest api-key-round-trips-encrypted-test
  (testing "api_key is encrypted at rest and decrypts back to the original on read"
    (encryption-test/with-secret-key "secret"
      (mt/with-model-cleanup [:model/WorkspaceInstance]
        (let [{id :id} (t2/insert-returning-instance!
                        :model/WorkspaceInstance (instance-attrs {:api_key "s3cr3t-key"}))]
          (testing "Toucan read decrypts the value"
            (is (= "s3cr3t-key" (:api_key (t2/select-one :model/WorkspaceInstance :id id)))))
          (testing "the raw column is stored encrypted, not plaintext"
            (let [raw (:api_key (t2/query-one {:select [:api_key]
                                               :from   [:workspace_instance]
                                               :where  [:= :id id]}))]
              (is (encryption/possibly-encrypted-string? raw))
              (is (not= "s3cr3t-key" raw)))))))))

(deftest url-unique-test
  (testing "url has a unique constraint"
    (mt/with-model-cleanup [:model/WorkspaceInstance]
      (t2/insert! :model/WorkspaceInstance (instance-attrs {:url "https://dup.example.com"}))
      (is (thrown? Exception
                   (t2/insert! :model/WorkspaceInstance
                               (instance-attrs {:url "https://dup.example.com"})))))))

(deftest workspace-fk-set-null-on-delete-test
  (testing "deleting the bound workspace nulls workspace_id (instance returns to the pool, not deleted)"
    (mt/with-model-cleanup [:model/WorkspaceInstance]
      (mt/with-temp [:model/Workspace {ws-id :id} {:name "Bound"}]
        (let [{id :id} (t2/insert-returning-instance!
                        :model/WorkspaceInstance (instance-attrs {:workspace_id ws-id}))]
          (is (= ws-id (:workspace_id (t2/select-one :model/WorkspaceInstance :id id))))
          (t2/delete! :model/Workspace :id ws-id)
          (let [row (t2/select-one :model/WorkspaceInstance :id id)]
            (is (some? row) "the instance survives the workspace delete")
            (is (nil? (:workspace_id row)) "and is freed back to the pool")))))))

;;; ========================================= Permission predicates =========================================
;;; The pool registry is superuser-only.

(deftest superuser-only-perms-test
  (mt/with-temp [:model/WorkspaceInstance inst {:url "https://perm.example.com" :api_key "k"}]
    (testing "non-superuser — false"
      (mt/with-test-user :rasta
        (is (false? (mi/can-read? inst)))
        (is (false? (mi/can-write? inst)))
        (is (false? (mi/can-create? :model/WorkspaceInstance {})))))
    (testing "superuser — true"
      (mt/with-test-user :crowberto
        (is (true? (mi/can-read? inst)))
        (is (true? (mi/can-write? inst)))
        (is (true? (mi/can-create? :model/WorkspaceInstance {})))))))
