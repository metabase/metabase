(ns metabase-enterprise.data-apps.models.data-app-group-assignment-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.group-access :as group-access]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest permissions-test
  (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                 :model/PermissionsGroup group {}]
    (group-access/add-groups! app [(:id group)])
    (perms/add-user-to-group! (mt/user->id :rasta) (:id group))
    (let [assignment (t2/select-one :model/DataAppGroupAssignment :data_app_id (:id app))]
      ; crowberto is an admin. rasta is a member of the group. lucky is neither.
      (doseq [[user allowed?] [[:crowberto true] [:rasta false] [:lucky false]]]
        (testing (str "assignment permissions for " user)
          (mt/with-current-user (mt/user->id user)
            (is (= allowed? (mi/can-read? assignment)))
            (is (= allowed? (mi/can-read? :model/DataAppGroupAssignment (:id assignment))))
            (is (= allowed? (mi/can-write? assignment)))
            (is (= allowed? (mi/can-write? :model/DataAppGroupAssignment (:id assignment))))
            (is (= allowed? (mi/can-create? :model/DataAppGroupAssignment
                                            {:data_app_id (:id app) :permission_group_id (:id group)})))))))))

(deftest insert-validates-group-test
  (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                 :model/PermissionsGroup tenant-group {:is_tenant_group true}]
    ; admins, tenant groups and non-existent groups can't be assigned
    (doseq [group-id [(:id (perms/admin-group)) (:id tenant-group) Integer/MAX_VALUE]]
      (testing (str "cannot assign group " group-id)
        (is (thrown? clojure.lang.ExceptionInfo
                     (t2/with-transaction [_conn]
                       (t2/insert! :model/DataAppGroupAssignment
                                   {:data_app_id (:id app) :permission_group_id group-id}))))
        (is (empty? (t2/select :model/DataAppGroupAssignment :data_app_id (:id app))))))))

(deftest update-validates-group-test
  (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                 :model/PermissionsGroup group {}
                 :model/PermissionsGroup replacement-group {}
                 :model/PermissionsGroup tenant-group {:is_tenant_group true}
                 :model/DataAppGroupAssignment assignment {:data_app_id (:id app) :permission_group_id (:id group)}]
    ; admins, tenant groups and non-existent groups can't be assigned
    (doseq [group-id [(:id (perms/admin-group)) (:id tenant-group) Integer/MAX_VALUE]]
      (testing (str "cannot change an assignment to group " group-id)
        (is (thrown? clojure.lang.ExceptionInfo
                     (t2/with-transaction [_conn]
                       (t2/update! :model/DataAppGroupAssignment (:id assignment) {:permission_group_id group-id}))))
        (is (= (:id group)
               (t2/select-one-fn :permission_group_id :model/DataAppGroupAssignment :id (:id assignment))))))
    (testing "an assignment can move to another eligible group"
      (t2/update! :model/DataAppGroupAssignment (:id assignment) {:permission_group_id (:id replacement-group)})
      (is (= (:id replacement-group)
             (t2/select-one-fn :permission_group_id :model/DataAppGroupAssignment :id (:id assignment)))))))
