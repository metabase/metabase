(ns metabase-enterprise.metabot.models.metabot-permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot.models.metabot-permissions]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- insert-status!
  "The status code a MetabotPermissions insert of `row` throws, or `:inserted`."
  [row]
  (mt/with-model-cleanup [:model/MetabotPermissions]
    (try (t2/insert! :model/MetabotPermissions row)
         :inserted
         (catch clojure.lang.ExceptionInfo e (:status-code (ex-data e))))))

(defn- update-status
  "The status code an update of the MetabotPermissions with `id` to `changes` throws, or `:updated`."
  [id changes]
  (try (t2/update! :model/MetabotPermissions :id id changes)
       :updated
       (catch clojure.lang.ExceptionInfo e (:status-code (ex-data e)))))

(deftest perm-value-is-checked-for-perm-type-test
  (mt/with-premium-features #{:ai-controls}
    (mt/with-temporary-setting-values [metabot-advanced-permissions false]
      (let [admin-id (u/the-id (perms/admin-group))]
        (testing "insert"
          (is (= 400 (insert-status! {:group_id admin-id :perm_type :permission/metabot-nlq :perm_value :maybe})))
          (is (= 400 (insert-status! {:group_id admin-id :perm_type :permission/unknown :perm_value :yes}))))
        (testing "update"
          (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Test Group"}]
            (mt/with-temporary-setting-values [metabot-advanced-permissions true]
              (mt/with-temp [:model/MetabotPermissions {id :id} {:group_id   group-id
                                                                 :perm_type  :permission/metabot-nlq
                                                                 :perm_value :no}]
                (is (= 400 (update-status id {:perm_value :maybe})))
                (is (= :updated (update-status id {:perm_value :yes})))))))))))

(deftest rows-are-written-only-for-groups-current-mode-shows-test
  (mt/with-premium-features #{:ai-controls}
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Test Group"}]
      (let [row          (fn [gid] {:group_id gid :perm_type :permission/metabot-nlq :perm_value :yes})
            admin-row-id (t2/select-one-pk :model/MetabotPermissions
                                           :group_id  (u/the-id (perms/admin-group))
                                           :perm_type :permission/metabot-nlq)
            all-users-id (u/the-id (perms/all-users-group))]
        (testing "simple mode"
          (mt/with-temporary-setting-values [metabot-advanced-permissions false]
            (is (= 400 (insert-status! (row group-id))))
            (is (= :updated (update-status admin-row-id {:perm_value :no})))
            (is (= :updated (update-status admin-row-id {:perm_value :yes})))))
        (testing "group-level mode"
          (mt/with-temporary-setting-values [metabot-advanced-permissions true]
            (is (= 400 (insert-status! (row all-users-id))))
            (is (= :inserted (insert-status! (row group-id))))
            (is (= :updated (update-status admin-row-id {:perm_value :no})))
            (is (= :updated (update-status admin-row-id {:perm_value :yes})))))
        (testing "a row of a group the mode hides since a switch is not updated"
          (mt/with-temporary-setting-values [metabot-advanced-permissions true]
            (mt/with-temp [:model/MetabotPermissions {id :id} (row group-id)]
              (mt/with-temporary-setting-values [metabot-advanced-permissions false]
                (is (= 400 (update-status id {:perm_value :no})))))))
        (testing "the stored mode holds without the premium feature"
          (mt/with-temporary-setting-values [metabot-advanced-permissions true]
            (mt/with-premium-features #{}
              (is (= 400 (insert-status! (row all-users-id))))
              (is (= :inserted (insert-status! (row group-id)))))))))))
