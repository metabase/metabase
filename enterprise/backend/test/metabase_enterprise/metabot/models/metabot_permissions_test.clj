(ns metabase-enterprise.metabot.models.metabot-permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot.models.metabot-permissions :as metabot-perms]
   [metabase-enterprise.metabot.schema :as metabot-ee.schema]
   [metabase.lib.core :as lib]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(defn- set-status!
  "The status code setting the MetabotPermissions `row` throws, or `:set`."
  [row]
  (try (metabot-perms/set-metabot-permissions! [row])
       :set
       (catch clojure.lang.ExceptionInfo e (:status-code (ex-data e)))))

(defn- insert-status!
  "The status code setting the MetabotPermissions `row` of a group without one throws, or `:inserted`."
  [row]
  (mt/with-model-cleanup [:model/MetabotPermissions]
    (let [status (set-status! row)]
      (get {:set :inserted} status status))))

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
        (testing "schema"
          (is (not (mr/validate ::metabot-ee.schema/metabot-permissions.update
                                {:group_id admin-id :perm_type :permission/unknown :perm_value :yes})))
          (is (not (mr/validate ::metabot-ee.schema/metabot-permissions.update
                                {:group_id admin-id :perm_type :permission/metabot-nlq :perm_value :maybe})))
          (is (=? {:status-code 400}
                  (try (metabot-ee.schema/check-perm-value-fits-type {:perm_type "permission/metabot-nlq" :perm_value "maybe"})
                       (catch clojure.lang.ExceptionInfo e (ex-data e)))))
          (is (=? {:status-code 400}
                  (try (lib/normalize ::metabot-ee.schema/metabot-permissions.update
                                      {:perm_type "permission/metabot-nlq" :perm_value "maybe"}
                                      {:throw? true})
                       (catch clojure.lang.ExceptionInfo e (ex-data e)))))
          (is (= {:perm_value :yes}
                 (lib/normalize ::metabot-ee.schema/metabot-permissions.update {:perm_value "yes"} {:throw? true})))
          (is (= {:group_id admin-id :perm_type :permission/metabot-nlq :perm_value :yes}
                 (lib/normalize ::metabot-ee.schema/metabot-permissions.update
                                {:group_id admin-id :perm_type "permission/metabot-nlq" :perm_value "yes"}
                                {:throw? true}))))
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
      (let [row       (fn [gid] {:group_id gid :perm_type :permission/metabot-nlq :perm_value :yes})
            admin-row (fn [value] {:group_id   (u/the-id (perms/admin-group))
                                   :perm_type  :permission/metabot-nlq
                                   :perm_value value})
            all-users-id (u/the-id (perms/all-users-group))
            changed-row  (fn [gid]
                           (let [stored (t2/select-one-fn :perm_value :model/MetabotPermissions
                                                          :group_id gid :perm_type :permission/metabot-nlq)]
                             (assoc (row gid) :perm_value (if (= stored :yes) :no :yes))))]
        (testing "simple mode"
          (mt/with-temporary-setting-values [metabot-advanced-permissions false]
            (is (= 400 (insert-status! (row group-id))))
            (is (= :set (set-status! (admin-row :no))))
            (is (= :set (set-status! (admin-row :yes))))))
        (testing "group-level mode"
          (mt/with-temporary-setting-values [metabot-advanced-permissions true]
            (is (= 400 (set-status! (changed-row all-users-id))))
            (is (= :inserted (insert-status! (row group-id))))
            (is (= :set (set-status! (admin-row :no))))
            (is (= :set (set-status! (admin-row :yes))))))
        (testing "row of group mode hides since switch is not updated"
          (mt/with-temporary-setting-values [metabot-advanced-permissions true]
            (mt/with-temp [:model/MetabotPermissions _ (row group-id)]
              (mt/with-temporary-setting-values [metabot-advanced-permissions false]
                (is (= 400 (set-status! (assoc (row group-id) :perm_value :no))))
                (is (= :set (set-status! (row group-id))))))))
        (testing "stored mode holds without premium feature"
          (mt/with-temporary-setting-values [metabot-advanced-permissions true]
            (mt/with-premium-features #{}
              (is (= 400 (set-status! (changed-row all-users-id))))
              (is (= :inserted (insert-status! (row group-id)))))))))))
