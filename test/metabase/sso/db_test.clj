(ns metabase.sso.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.core :as perms]
   [metabase.sso.db :as sso.db]
   [metabase.test :as mt]))

(deftest user-group-ids-among-partitions-test
  (mt/with-temp [:model/PermissionsGroup {group-a :id} {}
                 :model/PermissionsGroup {group-b :id} {}
                 :model/PermissionsGroup {group-c :id} {}
                 :model/User             {user-id :id} {}
                 :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-a}
                 :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-c}]
    (let [among  #(sso.db/user-group-ids-among user-id #{group-a group-b group-c (:id (perms/admin-group))} #{group-c})
          single (among)]
      (is (= #{group-a} single))
      (is (= single (mt/with-partition-size 2 (among)))))))
