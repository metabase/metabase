(ns metabase-enterprise.data-studio.api.permissions-groups-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest testing is]]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.models.permissions-group-membership :as perms-group-membership]
   [metabase.premium-features.token-check :as token-check]
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

(defmacro with-reset-data-analyst-group! [& body]
  `(let [original-group# (t2/select-one :model/PermissionsGroup :magic_group_type perms-group/data-analyst-magic-group-type)]
     (try
       (mt/with-model-cleanup [:model/PermissionsGroup]
         (do ~@body))
       (finally
         (with-bindings {(var perms-group/*allow-modifying-magic-groups*) true}
           (t2/update! :model/PermissionsGroup :id (:id original-group#)
                       {:magic_group_type perms-group/data-analyst-magic-group-type
                        :name             (:name original-group#)}))))))

(deftest sync-data-analyst-group-for-oss!-ee-noop-test
  (testing "When we canonically have the feature, sync-data-analyst-group-for-oss! does nothing"
    (with-redefs [token-check/canonically-has-feature? (constantly true)]
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

(deftest sync-data-analyst-group-for-oss!-converts-with-members-test
  (testing "When canonically lacking the feature, sync-data-analyst-group-for-oss! converts the Data Analysts group when it has members"
    (with-redefs [token-check/canonically-has-feature? (constantly false)]
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

(deftest sync-data-analyst-group-for-oss!-preserves-name-test
  (testing "When the magic group has a non-default name (e.g. from a migration conflict), the new magic group keeps that name"
    (with-redefs [token-check/canonically-has-feature? (constantly false)]
      (with-reset-data-analyst-group!
        (let [original-group-id (t2/select-one-pk :model/PermissionsGroup :magic_group_type perms-group/data-analyst-magic-group-type)]
          ;; Simulate the migration conflict scenario: rename the magic group to the fallback name
          (with-bindings {(var perms-group/*allow-modifying-magic-groups*) true}
            (t2/update! :model/PermissionsGroup original-group-id {:name "Metabase Data Analysts"}))
          (mt/with-temp [:model/User {user-id :id} {}]
            (perms/add-user-to-group! user-id original-group-id)
            (perms-group/sync-data-analyst-group-for-oss!)
            (testing "Converted group should use the magic group's name as its base"
              (let [converted-group (t2/select-one :model/PermissionsGroup :id original-group-id)]
                (is (= "Metabase Data Analysts (converted)" (:name converted-group)))
                (is (nil? (:magic_group_type converted-group)))))
            (testing "New magic group should reuse the old magic group's name"
              (let [new-magic-group (t2/select-one :model/PermissionsGroup
                                                   :magic_group_type perms-group/data-analyst-magic-group-type)]
                (is (= "Metabase Data Analysts" (:name new-magic-group)))))))))))

(deftest sync-data-analyst-group-for-oss!-idempotent-empty-test
  (testing "Sync is idempotent when magic group is empty (no members to convert)"
    (with-redefs [token-check/canonically-has-feature? (constantly false)]
      (with-reset-data-analyst-group!
        (let [group-count-before (t2/count :model/PermissionsGroup)
              data-analyst-group-id (t2/select-one-pk :model/PermissionsGroup :magic_group_type perms-group/data-analyst-magic-group-type)]
          ;; Ensure no members in the group
          (perms-group-membership/with-allow-direct-deletion
            (t2/delete! :model/PermissionsGroupMembership :group_id data-analyst-group-id))
          (perms-group/sync-data-analyst-group-for-oss!)
          (testing "No new groups should be created"
            (is (= group-count-before (t2/count :model/PermissionsGroup))))
          (testing "Magic group should still exist unchanged"
            (is (= perms-group/data-analyst-magic-group-type
                   (t2/select-one-fn :magic_group_type :model/PermissionsGroup :id data-analyst-group-id)))))))))

(deftest sync-data-analyst-group-for-oss!-indeterminate-retries-test
  (testing "When token check is indeterminate, sync retries in background until canonical response"
    (let [call-count (atom 0)
          check-results (atom [nil nil false])] ;; indeterminate, indeterminate, then definitively no feature
      (with-redefs [token-check/canonically-has-feature? (fn [_feature]
                                                           (let [idx (swap! call-count inc)]
                                                             (nth @check-results (min (dec idx) (dec (count @check-results))))))
                    perms-group/seconds-to-sleep-per-attempt 0]
        (with-reset-data-analyst-group!
          (let [original-group-id (t2/select-one-pk :model/PermissionsGroup :magic_group_type perms-group/data-analyst-magic-group-type)]
            (mt/with-temp [:model/User {user-id :id} {}]
              (perms/add-user-to-group! user-id original-group-id)
              ;; sync-data-analyst-group-for-oss! will spawn a future since first call returns nil
              (let [result (perms-group/sync-data-analyst-group-for-oss!)]
                ;; Wait for the future to complete
                (when (future? result)
                  (deref result 500 :timeout))
                (testing "Should have retried until canonical response"
                  (is (>= @call-count 3)))
                (testing "Original group should be converted after retries"
                  (let [original-group (t2/select-one :model/PermissionsGroup :id original-group-id)]
                    (is (str/starts-with? (:name original-group) "Data Analysts (converted)"))
                    (is (nil? (:magic_group_type original-group)))))))))))))
