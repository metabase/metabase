(ns metabase-enterprise.advanced-permissions.api.group-manager-test
  "Permisisons tests for API that needs to be enforced by Group Mnanager permisisons."
  (:require [clojure.test :refer :all]
            [metabase.models :refer [PermissionsGroup PermissionsGroupMembership User]]
            [metabase.public-settings.premium-features-test :as premium-features-test]
            [metabase.test :as mt]
            [toucan.db :as db]))

(deftest permissions-group-apis-test
  (testing "/api/permissions/group"
    (mt/with-user-in-groups
      [group {:name "New Group"}
       user  [group]]
      (letfn [(get-groups [user status]
                (testing (format ", get groups with %s user" (mt/user-descriptor user))
                  (mt/user-http-request user :get status "permissions/group")))

              (get-one-group [user status group]
                (testing (format ", get one group with %s user" (mt/user-descriptor user))
                  (mt/user-http-request user :get status (format "permissions/group/%d" (:id group)))))

              (update-group [user status group]
                (testing (format ", update group with %s user" (mt/user-descriptor user))
                  (let [new-name (mt/random-name)]
                    (mt/user-http-request user :put status (format "permissions/group/%d" (:id group)) {:name new-name}))))]

        (testing "if `advanced-permissions` is disabled, require admins"
          (premium-features-test/with-premium-features #{}
            (get-groups user 403)
            (get-one-group user 403 group)
            (update-group user 403 group)
            (get-groups :crowberto 200)
            (get-one-group :crowberto 200 group)
            (update-group :crowberto 200 group)))

        (testing "if `advanced-permissions` is enabled"
          (premium-features-test/with-premium-features #{:advanced-permissions}
            (testing "still fails if user is not a manager"
              (get-groups user 403)
              (get-one-group user 403 group)
              (update-group user 403 group)
              (get-groups :crowberto 200)
              (get-one-group :crowberto 200 group)
              (update-group :crowberto 200 group))

            (testing "succeed if users access group that they are manager of"
              (db/update-where! PermissionsGroupMembership {:user_id  (:id user)
                                                            :group_id (:id group)}
                                :is_group_manager true)
              (testing "non-admin user can only view groups that are manager of"
                (is (= #{(:id group)}
                       (set (map :id (get-groups user 200))))))
              (get-one-group user 200 group)
              (update-group user 200 group)
              (testing "admins could view all groups"
                (is (= (db/select-field :name PermissionsGroup)
                       (set (map :name (get-groups :crowberto 200)))))))))))))

(deftest memebership-apis-test
  (testing "/api/permissions/memebership"
    (letfn [(get-membership [user status]
              (testing (format ", get groups with %s user" (mt/user-descriptor user))
                (mt/user-http-request user :get status "permissions/membership")))

            (add-membership [user status group-info is-group-manager]
              (testing (format ", add membership with %s user" (mt/user-descriptor user))
                (mt/with-temp User [user-info]
                  (mt/user-http-request user :post status "permissions/membership"
                                        {:group_id         (:id group-info)
                                         :user_id          (:id user-info)
                                         :is_group_manager is-group-manager}))))

            (update-membership [user status group-info is-group-manager]
              (testing (format ", update membership with %s user" (mt/user-descriptor user))
                (mt/with-temp* [User                       [user-info]
                                PermissionsGroupMembership [{:keys [id]} {:user_id  (:id user-info)
                                                                          :group_id (:id group-info)}]]
                  (mt/user-http-request user :put status (format "permissions/membership/%d" id)
                                        {:is_group_manager is-group-manager}))))

            (delete-membership [user status group-info]
              (testing (format ", delete membership with %s user" (mt/user-descriptor user))
                (mt/with-temp* [User                       [user-info]
                                PermissionsGroupMembership [{pgm-id :id} {:user_id  (:id user-info)
                                                                          :group_id (:id group-info)}]]
                  (mt/user-http-request user :delete status (format "permissions/membership/%d" pgm-id)))))

            (membership->groups-ids [membership]
              (->> membership
                   vals
                   flatten
                   (map :group_id)
                   set))]

      (testing "permissions test - "
        (mt/with-user-in-groups
          [group  {:name "New Group"}
           user   [group]]
          (testing "if `advanced-permissions` is disabled, require admins"
            (premium-features-test/with-premium-features #{}
              (get-membership user 403)
              (add-membership user 403 group false)
              (update-membership user 402 group false)
              (delete-membership user 403 group)
              (get-membership :crowberto 200)
              (add-membership :crowberto 200 group false)
              (update-membership :crowberto 402 group false)
              (delete-membership :crowberto 204 group)))

          (testing "if `advanced-permissions` is enabled"
            (premium-features-test/with-premium-features #{:advanced-permissions}
              (testing "requires Group Manager or admins"
                (get-membership user 403)
                (add-membership user 403 group false)
                (update-membership user 403 group false)
                (delete-membership user 403 group)
                (get-membership :crowberto 200)
                (add-membership :crowberto 200 group false)
                (update-membership :crowberto 200 group false)
                (delete-membership :crowberto 204 group))

              (testing "succeed if users access group that they are manager of"
                (db/update-where! PermissionsGroupMembership {:user_id  (:id user)
                                                              :group_id (:id group)}
                                  :is_group_manager true)
                (get-membership user 200)
                (add-membership user 200 group false)
                (update-membership user 200 group false)
                (delete-membership user 204 group))))))

      (testing "edge case tests - "
        (mt/with-user-in-groups
          [group {:name "New Group"}
           user  [group]]

          (testing "if `advanced-permissions` is disabled"
            (premium-features-test/with-premium-features #{}
              (testing "fail when try to set is_group_manager=true"
                (add-membership :crowberto 402 group true))))

          (testing "if advanced-permissions is enabled, "
            (premium-features-test/with-premium-features #{:advanced-permissions}
              (testing "succeed if users access group that they are manager of,"
                (db/update-where! PermissionsGroupMembership {:user_id  (:id user)
                                                              :group_id (:id group)}
                                :is_group_manager true)
              (testing "can set is_group_manager=true"
                (add-membership :crowberto 200 group true)
                (add-membership user 200 group true))

              (testing "non-admin user can only view groups that are manager of"
                (is (= #{(:id group)} (membership->groups-ids (get-membership user 200))))))

              (testing "admin cant be group manager"
                (mt/with-temp* [User                       [new-user {:is_superuser true}]
                                PermissionsGroupMembership [_ {:user_id          (:id new-user)
                                                               :group_id         (:id group)
                                                               :is_group_manager false}]]
                  (is (= "Admin cant be a group manager."
                         (mt/user-http-request user :post 400 "permissions/membership"
                                               {:group_id         (:id group)
                                                :user_id          (:id new-user)
                                                :is_group_manager true})))))

                (testing "Admin can could view all groups"
                  (is (= (db/select-field :id PermissionsGroup)
                         (membership->groups-ids (get-membership :crowberto 200))))))))))))
