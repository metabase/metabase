(ns metabase.models.permissions-v2-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.permissions-v2 :as perms-v2]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(defn do-with-restored-perms!
  "Implementation of `with-restored-perms` and related helper functions. Optionally takes `group-ids` to restore only the
  permissions for a set of groups."
  [group-ids thunk]
  (let [select-condition [(when group-ids [:in :group_id group-ids])]
        original-perms (t2/select :model/PermissionsV2 {:where select-condition})]
    (try
      (thunk)
      (finally
        (t2/delete! :model/PermissionsV2 {:where select-condition})
        (t2/insert! :model/PermissionsV2 original-perms)))))

(defmacro with-restored-perms!
  "Runs `body`, and restores all permissions to their original state afterwards."
  [& body]
  `(do-with-restored-perms! nil (fn [] ~@body)))

(defmacro with-restored-perms-for-group!
  "Runs `body`, and restores all permissions for `group-id` to their original state afterwards."
  [group-id & body]
  `(do-with-restored-perms! [~group-id] (fn [] ~@body)))

(defmacro with-restored-perms-for-groups!
  "Runs `body`, and restores all permissions for `group-ids` to their original state afterwards."
  [group-ids & body]
  `(do-with-restored-perms! ~group-ids (fn [] ~@body)))

(deftest ^:parallel coalesce-test
  (testing "`coalesce` correctly returns the most permissive value by default"
    (are [expected args] (= expected (apply perms-v2/coalesce args))
      :unrestricted    [:data-access #{:unrestricted :restricted :none}]
      :no-self-service [:data-access #{:no-self-service :none}]
      :block           [:data-access #{:block}]
      nil              [:data-access #{}]

      :curate          [:collection #{:curate :view :no-access}]
      :view            [:collection #{:view :no-access}]
      :no-access       [:collection #{:no-access}]
      nil              [:collection #{}]

      :yes             [:settings-access  #{:yes :no}]
      :no              [:settings-access  #{:no}]
      nil              [:settings-access  #{}]

      ;; We can also pass in a list
      :view            [:collection [:view :view :no-access :view :no-access]])))

(deftest set-permission!-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                 :model/Table            {table-id :id} {}]
    (with-restored-perms-for-group! group-id
      (testing "`set-permission!` can set a new permission"
        (is (= 1 (perms-v2/set-permission! :data-access group-id :unrestricted table-id)))
        (is (= :unrestricted (t2/select-one-fn :value
                                               :model/PermissionsV2
                                               :type      :data-access
                                               :group_id  group-id
                                               :object_id table-id))))

      (testing "`set-permission!` can update an existing permission"
        (is (= 1 (perms-v2/set-permission! :data-access group-id :no-self-service table-id)))
        (is (= :no-self-service (t2/select-one-fn :value
                                                  :model/PermissionsV2
                                                  :type      :data-access
                                                  :group_id  group-id
                                                  :object_id table-id))))

      (testing "A permission associated with a model (e.g. :data-access) cannot be saved without an object_id"
        (is (thrown-with-msg?
             ExceptionInfo
             #"Permission type :data-access requires an object ID"
             (perms-v2/set-permission! :data-access group-id :unrestricted nil))))

      (testing "An invalid permission type cannot be saved"
        (is (thrown-with-msg?
             ExceptionInfo
             #"Invalid permission type: :invalid"
             (perms-v2/set-permission! :invalid group-id :unrestricted nil)))))))

(deftest set-permissions!-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id}   {}
                 :model/Table            {table-id-1 :id} {}
                 :model/Table            {table-id-2 :id} {}]
    (with-restored-perms-for-group! group-id
      (testing "`set-permissions!` can set multiple permissions at once"
        (is (= 2 (perms-v2/set-permissions! :data-access group-id {table-id-1 :unrestricted
                                                                   table-id-2 :no-self-service})))
        (is (= [:unrestricted :no-self-service]
               (t2/select-fn-vec :value :model/PermissionsV2
                                 :type      :data-access
                                 :group_id  group-id
                                 {:order-by [[:object_id :asc]]}))))

      (testing "`set-permissions!` can update an existing permission"
        (is (= 2 (perms-v2/set-permissions! :data-access group-id {table-id-1 :no-self-service
                                                                   table-id-2 :no-self-service})))
        (is (= [:no-self-service :no-self-service]
               (t2/select-fn-vec :value :model/PermissionsV2
                                 :type      :data-access
                                 :group_id  group-id
                                 {:order-by [[:object_id :asc]]}))))

      (testing "`set-permissions! will not affect permissions for objects which are not specified"
        (is (= 1 (perms-v2/set-permissions! :data-access group-id {table-id-1 :block})))
        (is (= [:block :no-self-service]
               (t2/select-fn-vec :value :model/PermissionsV2
                                 :type      :data-access
                                 :group_id  group-id
                                 {:order-by [[:object_id :asc]]}))))

      (testing "An invalid permission type cannot be saved"
        (is (thrown-with-msg?
             ExceptionInfo
             #"Invalid permission type: :invalid"
             (perms-v2/set-permissions! :invalid group-id {table-id-1 :block})))))))

(deftest permission-for-user-test
  (mt/with-temp [:model/PermissionsGroup           {group-id-1 :id} {}
                 :model/PermissionsGroup           {group-id-2 :id} {}
                 :model/User                       {user-id :id}    {}
                 :model/PermissionsGroupMembership {}               {:user_id  user-id
                                                                     :group_id group-id-1}
                 :model/PermissionsGroupMembership {}               {:user_id  user-id
                                                                     :group_id group-id-2}]
    (with-restored-perms-for-groups! [group-id-1 group-id-2]
      (testing "`permission-for-user` coalesces permissions from all groups a user is in"
        (perms-v2/set-permission! :native-query-editing group-id-1 :no 1)
        (is (= :no (perms-v2/permission-for-user user-id :native-query-editing 1)))

        (perms-v2/set-permission! :native-query-editing group-id-2 :yes 1)
        (is (= :yes (perms-v2/permission-for-user user-id :native-query-editing 1))))

      (testing "`permission-for-user` falls back to the least permissive value if no value exists for the user"
        (is (= :no (perms-v2/permission-for-user user-id :native-query-editing 2))))

      (testing "`permission-for-user` throws an exception if an object ID is required but not provided"
        (is (thrown-with-msg?
             ExceptionInfo
             #"Permission type :native-query-editing requires an object ID"
             (perms-v2/permission-for-user user-id :native-query-editing)))))))
