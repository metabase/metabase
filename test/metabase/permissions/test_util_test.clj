(ns metabase.permissions.test-util-test
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.core :as perms]
   [metabase.permissions.data-permissions :as data-perms]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest restoring-data-perms-keeps-the-rows-when-the-restore-fails-test
  (testing "a restore whose insert fails leaves the group's rows in place instead of deleting them"
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {}]
      (data-perms/set-database-permission! group-id (mt/id) :perms/view-data :unrestricted)
      (let [rows   #(t2/select-fn-set (juxt :db_id :perm_type :perm_value) :model/DataPermissions :group_id group-id)
            before (rows)]
        (is (seq before))
        (mt/with-dynamic-fn-redefs [t2/insert! (fn [& _] (throw (ex-info "insert failed" {})))]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"insert failed"
                                (perms.test-util/do-with-restored-data-perms! [group-id] (fn [])))))
        (is (= before (rows)))))))

(deftest restoring-perms-keeps-the-rows-when-the-restore-fails-test
  (testing "a restore whose insert fails leaves the permission rows in place instead of deleting them"
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                   :model/Collection       collection     {}]
      (perms/grant-collection-read-permissions! group-id collection)
      (let [rows   #(t2/select-fn-set :object :model/Permissions :group_id group-id)
            before (rows)]
        (is (seq before))
        (mt/with-dynamic-fn-redefs [t2/insert! (fn [& _] (throw (ex-info "insert failed" {})))]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"insert failed"
                                (perms.test-util/do-with-restored-perms! (fn [])))))
        (is (= before (rows)))))))
