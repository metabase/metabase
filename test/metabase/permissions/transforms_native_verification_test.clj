(ns metabase.permissions.transforms-native-verification-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- row
  [group-id db-id perm-type perm-value]
  {:group_id group-id :db_id db-id :perm_type perm-type :perm_value perm-value})

(defn- try-write!
  "Store `stored-rows` as the only DataPermissions of the group with `group-id` in a rolled-back transaction, call
  `create-data-permissions!` with `rows`, and check that it refuses them with a 400 that writes nothing when
  `refused?`, and accepts them otherwise."
  [group-id stored-rows rows refused?]
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (t2/delete! :model/DataPermissions :group_id group-id)
    (when (seq stored-rows)
      (t2/insert! :model/DataPermissions stored-rows))
    (let [stored  #(t2/select-fn-set (juxt :db_id :table_id :perm_type :perm_value) :model/DataPermissions
                                     :group_id group-id)
          before  (stored)
          refusal (try
                    (data-perms/create-data-permissions! rows)
                    nil
                    (catch clojure.lang.ExceptionInfo e
                      (:status-code (ex-data e))))]
      (testing (pr-str {:stored stored-rows :written rows})
        (is (= (when refused? 400) refusal))
        (when refused?
          (is (= before (stored))))))))

(deftest create-data-permissions-refuses-transforms-without-native-access-test
  (mt/with-temp [:model/PermissionsGroup {g :id} {}
                 :model/Database         {d :id} {}
                 :model/Table            {t :id} {:db_id d}]
    (let [native     (row g d :perms/create-queries :query-builder-and-native)
          builder    (row g d :perms/create-queries :query-builder)
          no-queries (row g d :perms/create-queries :no)
          table-only (assoc (row g d :perms/create-queries :query-builder) :table_id t)
          yes        (row g d :perms/transforms :yes)
          no         (row g d :perms/transforms :no)]
      (doseq [[stored-rows rows refused?] [[[] [yes] true]
                                           [[] [no] false]
                                           [[] [native] false]
                                           [[] [builder] false]
                                           [[] [no-queries] false]
                                           [[] [table-only] false]
                                           [[] [native yes] false]
                                           [[] [builder yes] true]
                                           [[] [no-queries yes] true]
                                           [[] [table-only yes] true]
                                           [[] [builder no] false]
                                           [[native] [yes] false]
                                           [[native] [no] false]
                                           [[native] [table-only] false]
                                           [[native] [table-only yes] false]
                                           [[builder] [yes] true]
                                           [[builder] [no] false]
                                           [[builder] [table-only] false]
                                           [[builder] [table-only yes] true]
                                           [[yes] [native] false]
                                           [[yes] [builder] true]
                                           [[yes] [no-queries] true]
                                           [[yes] [table-only] false]
                                           [[no] [native] false]
                                           [[no] [builder] false]
                                           [[no] [no-queries] false]
                                           [[no] [table-only] false]
                                           [[native yes] [table-only] false]
                                           [[builder no] [table-only] false]]]
        (try-write! g stored-rows rows refused?)))))
