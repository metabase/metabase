(ns metabase-enterprise.advanced-permissions.models.permissions.group-manager-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-permissions.models.permissions.group-manager :as gm]
   [metabase.models.permissions-group :as perms-group]
   [metabase.test :as mt]))

(defn- user-group-memberships
  [user]
  (set (map #(into {} %) (gm/user-group-memberships user))))

(deftest set-user-group-permissions-test
  (testing "set-user-group-memberships!"
    (testing "should be able to add user to a new group"
      (mt/with-user-in-groups
        [group-1 {:name "Group 1"}
         group-2 {:name "Group 2"}
         user    [group-1]]
        (mt/with-test-user :crowberto
          (gm/set-user-group-memberships! user [{:id               (:id (perms-group/all-users))
                                                 :is_group_manager false}
                                                {:id               (:id group-1)
                                                 :is_group_manager false}
                                                {:id               (:id group-2)
                                                 :is_group_manager false}])

          (is (= #{{:id               (:id (perms-group/all-users))
                    :is_group_manager false}
                   {:id               (:id group-1)
                    :is_group_manager false}
                   {:id               (:id group-2)
                    :is_group_manager false}}
                 (user-group-memberships user))))))

    (testing "should be able to remove User from an existing groups"
      (mt/with-user-in-groups
        [group-1 {:name "Group 1"}
         group-2 {:name "Group 2"}
         user    [group-1 group-2]]
        (mt/with-test-user :crowberto
          (gm/set-user-group-memberships! user [{:id               (:id (perms-group/all-users))
                                                 :is_group_manager false}
                                                {:id               (:id group-1)
                                                 :is_group_manager false}])
          (is (= #{{:id               (:id (perms-group/all-users))
                    :is_group_manager false}
                   {:id               (:id group-1)
                    :is_group_manager false}}
                 (user-group-memberships user))))))

    (testing "should be able to add and remove users' groups at the same time"
      (mt/with-user-in-groups
        [group-1 {:name "Group 1"}
         group-2 {:name "Group 2"}
         user    [group-1]]
        (mt/with-test-user :crowberto
          (gm/set-user-group-memberships! user [{:id               (:id (perms-group/all-users))
                                                 :is_group_manager false}
                                                {:id               (:id group-2)
                                                 :is_group_manager false}])
          (is (= #{{:id               (:id (perms-group/all-users))
                    :is_group_manager false}
                   {:id               (:id group-2)
                    :is_group_manager false}}
                 (user-group-memberships user))))))

    (testing "Should be able to promote an existing user to Group manger"
      (mt/with-user-in-groups
        [group {:name "Group"}
         user  [group]]
        (mt/with-test-user :crowberto
          (gm/set-user-group-memberships! user [{:id               (:id (perms-group/all-users))
                                                 :is_group_manager false}
                                                {:id               (:id group)
                                                 :is_group_manager true}])
          (is (= #{{:id               (:id (perms-group/all-users))
                    :is_group_manager false}
                   {:id               (:id group)
                    :is_group_manager true}}
                 (user-group-memberships user))))))

    (testing "No-op should be fine"
      (mt/with-user-in-groups
        [group {:name "Group"}
         user  [group]]
        (mt/with-test-user :crowberto
          (gm/set-user-group-memberships! user [{:id               (:id (perms-group/all-users))
                                                 :is_group_manager false}
                                                {:id               (:id group)
                                                 :is_group_manager false}])
          (is (= #{{:id               (:id (perms-group/all-users))
                    :is_group_manager false}
                   {:id               (:id group)
                    :is_group_manager false}}
                 (user-group-memberships user))))))))
