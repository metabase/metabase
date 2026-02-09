(ns metabase-enterprise.data-studio.api.permissions-groups-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest testing is]]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest fetch-groups-test
  (testing "GET /api/permissions/group - Data Analysts group is visible with the feature"
    (mt/with-premium-features #{:advanced-permissions}
      (is (contains? (set (map :id (mt/user-http-request :crowberto :get 200 "permissions/group")))
                     (:id (perms-group/data-analyst))))))
  (testing "GET /api/permissions/group - Data Analysts group is not visible without the feature"
    (mt/with-premium-features #{}
      (is (not (contains? (set (map :id (mt/user-http-request :crowberto :get 200 "permissions/group")))
                          (:id (perms-group/data-analyst))))))))

;;; ---------------------------------------- sync-data-analyst-group-for-oss! tests ----------------------------------------

(deftest sync-data-analyst-group-for-oss!-ee-noop-test
  (testing "When we have the feature, sync-data-analyst-group-for-oss! does nothing"
    (mt/with-premium-features #{:advanced-permissions}
      (let [data-analyst-group-id (:id (perms-group/data-analyst))]
        (mt/with-temp [:model/User {user-id :id} {}]
          (perms/add-user-to-group! user-id data-analyst-group-id)
          (let [member-count-before (t2/count :model/PermissionsGroupMembership :group_id data-analyst-group-id)]
            (perms-group/sync-data-analyst-group-for-oss!)
            ;; Group should still have same members
            (is (= member-count-before
                   (t2/count :model/PermissionsGroupMembership :group_id data-analyst-group-id)))
            ;; Group should still be the magic group
            (is (= perms-group/data-analyst-magic-group-type
                   (t2/select-one-fn :magic_group_type :model/PermissionsGroup :id data-analyst-group-id)))))))))

(defmacro with-reset-data-analyst-group! [& body]
  `(let [original# (t2/select-one-pk :model/PermissionsGroup :magic_group_type perms-group/data-analyst-magic-group-type)]
     (try
       (mt/with-model-cleanup [:model/PermissionsGroup]
         (do ~@body))
       (finally (t2/update! :model/PermissionsGroup :id original# {:magic_group_type perms-group/data-analyst-magic-group-type})))))

(deftest sync-data-analyst-group-for-oss!-converts-with-members-test
  (testing "Without the premium feature, sync-data-analyst-group-for-oss! converts the Data Analysts group when it has members"
    (mt/with-premium-features #{}
      (with-reset-data-analyst-group!
        (let [original-group-id (t2/select-one-pk :model/PermissionsGroup :magic_group_type perms-group/data-analyst-magic-group-type)]
          (mt/with-temp [:model/User {user-id :id} {}]
            (perms/add-user-to-group! user-id original-group-id)
            (perms-group/sync-data-analyst-group-for-oss!)
            (testing "Original group should be renamed and demoted"
              (let [original-group (t2/select-one :model/PermissionsGroup :id original-group-id)]
                (is (str/starts-with? (:name original-group) "Data Analysts (converted)"))
                (is (nil? (:magic_group_type original-group)))))
            (testing "User should still be in the converted group"
              (is (t2/exists? :model/PermissionsGroupMembership
                              :user_id user-id
                              :group_id original-group-id)))
            (testing "New magic group should exist and be empty"
              (let [new-magic-group (t2/select-one :model/PermissionsGroup
                                                   :magic_group_type perms-group/data-analyst-magic-group-type)]
                (is (some? new-magic-group))
                (is (= "Data Analysts" (:name new-magic-group)))
                (is (zero? (t2/count :model/PermissionsGroupMembership :group_id (:id new-magic-group))))))))))))

(deftest sync-data-analyst-group-for-oss!-idempotent-empty-test
  (testing "In OSS, sync-data-analyst-group-for-oss! is idempotent when magic group is empty"
    (mt/with-premium-features #{}
      (with-reset-data-analyst-group!
        (let [group-count-before (t2/count :model/PermissionsGroup)
              data-analyst-group-id (t2/select-one-pk :model/PermissionsGroup :magic_group_type perms-group/data-analyst-magic-group-type)]
          ;; Ensure no members in the group
          ;; Use raw table name to bypass before-delete guard (test setup, not a real user action)
          (t2/delete! (t2/table-name :model/PermissionsGroupMembership) :group_id data-analyst-group-id)
          (perms-group/sync-data-analyst-group-for-oss!)
          (testing "No new groups should be created"
            (is (= group-count-before (t2/count :model/PermissionsGroup))))
          (testing "Magic group should still exist unchanged"
            (is (= perms-group/data-analyst-magic-group-type
                   (t2/select-one-fn :magic_group_type :model/PermissionsGroup :id data-analyst-group-id)))))))))
