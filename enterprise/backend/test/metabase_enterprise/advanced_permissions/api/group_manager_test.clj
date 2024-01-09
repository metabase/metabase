(ns ^:mb/once metabase-enterprise.advanced-permissions.api.group-manager-test
  "Permisisons tests for API that needs to be enforced by Group Manager permisisons."
  (:require
   [clojure.set :refer [subset?]]
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-permissions.models.permissions.group-manager :as gm]
   [metabase.models :refer [PermissionsGroup PermissionsGroupMembership User]]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.user :as user]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

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
                    (mt/user-http-request user :put status (format "permissions/group/%d" (:id group)) {:name new-name}))))

              (delete-group [user status group-manager?]
                (testing (format ", delete group with %s user" (mt/user-descriptor user))
                  (let [user-id (u/the-id (if (keyword? user) (mt/fetch-user user) user))]
                    (mt/with-temp
                      [PermissionsGroup           {group-id :id} {:name "Test delete group"}
                       PermissionsGroupMembership _              {:group_id group-id :user_id user-id}]
                      (when group-manager?
                        (t2/update! PermissionsGroupMembership {:user_id  user-id
                                                                :group_id group-id}
                                    {:is_group_manager true}))
                      (mt/user-http-request user
                                            :delete status
                                            (format "permissions/group/%d" group-id))))))]

        (testing "if `advanced-permissions` is disabled, require admins"
          (mt/with-premium-features #{}
            (get-groups user 403)
            (get-one-group user 403 group)
            (update-group user 403 group)
            (delete-group user 403 false)
            (get-groups :crowberto 200)
            (get-one-group :crowberto 200 group)
            (update-group :crowberto 200 group)
            (delete-group :crowberto 204 false)))

        (testing "if `advanced-permissions` is enabled"
          (mt/with-premium-features #{:advanced-permissions}
            (testing "still fails if user is not a manager"
              (get-groups user 403)
              (get-one-group user 403 group)
              (update-group user 403 group)
              (delete-group user 403 false)
              (get-groups :crowberto 200)
              (get-one-group :crowberto 200 group)
              (update-group :crowberto 200 group)
              (delete-group :crowberto 204 false))

            (testing "succeed if users access group that they are manager of"
              (t2/update! PermissionsGroupMembership {:user_id  (:id user)
                                                      :group_id (:id group)}
                          {:is_group_manager true})
              (testing "non-admin user can only view groups that are manager of"
                (is (= #{(:id group)}
                       (set (map :id (get-groups user 200))))))

              (get-one-group user 200 group)
              (update-group user 200 group)
              (delete-group user 204 true)

              (testing "admins could view all groups"
                (is (= (t2/select-fn-set :name PermissionsGroup)
                       (set (map :name (get-groups :crowberto 200)))))))))))))

(defn- get-membership [user status]
  (testing (format ", get groups with %s user" (mt/user-descriptor user))
    (mt/user-http-request user :get status "permissions/membership")))

(defn- add-membership! [user status group-info is-group-manager]
  (testing (format ", add membership with %s user" (mt/user-descriptor user))
    (t2.with-temp/with-temp [User user-info]
      (mt/user-http-request user :post status "permissions/membership"
                            {:group_id         (:id group-info)
                             :user_id          (:id user-info)
                             :is_group_manager is-group-manager}))))

(defn- update-membership! [user status group-info is-group-manager]
  (testing (format ", update membership with %s user" (mt/user-descriptor user))
    (t2.with-temp/with-temp [User                       user-info    {}
                             PermissionsGroupMembership {:keys [id]} {:user_id  (:id user-info)
                                                                      :group_id (:id group-info)}]
      (mt/user-http-request user :put status (format "permissions/membership/%d" id)
                            {:is_group_manager is-group-manager}))))

(defn- delete-membership! [user status group-info]
  (testing (format ", delete membership with %s user" (mt/user-descriptor user))
    (t2.with-temp/with-temp [User                       user-info    {}
                             PermissionsGroupMembership {pgm-id :id} {:user_id  (:id user-info)
                                                                      :group_id (:id group-info)}]
      (mt/user-http-request user :delete status (format "permissions/membership/%d" pgm-id)))))

(defn- clear-memberships! [user status group-info]
  (testing (format ", clearing group memberships with %s user" (mt/user-descriptor :crowberto))
    (t2.with-temp/with-temp [User                       user-info-1 {}
                             User                       user-info-2 {}
                             PermissionsGroupMembership _           {:user_id  (:id user-info-1)
                                                                     :group_id (:id group-info)}
                             PermissionsGroupMembership _           {:user_id  (:id user-info-2)
                                                                     :group_id (:id group-info)}]
      (mt/user-http-request user :put status (format "permissions/membership/%d/clear" (:id group-info))))))

(defn- membership->groups-ids [membership]
  (->> membership
       vals
       flatten
       (map :group_id)
       set))

(deftest memebership-apis-permissions-test
  (testing "/api/permissions/memebership"
    (mt/with-user-in-groups
      [group  {:name "New Group"}
       user   [group]]
      (testing "if `advanced-permissions` is disabled, require admins"
        (mt/with-premium-features #{}
          (get-membership user 403)
          (add-membership! user 403 group false)
          (update-membership! user 402 group false)
          (delete-membership! user 403 group)
          (clear-memberships! user 403 group)
          (get-membership :crowberto 200)
          (add-membership! :crowberto 200 group false)
          (update-membership! :crowberto 402 group false)
          (delete-membership! :crowberto 204 group)
          (clear-memberships! :crowberto 204 group))))

    ;; Use different groups for each block since `clear-memberships!` is destructive
    (mt/with-user-in-groups
      [group  {:name "New Group"}
       user   [group]]
      (testing "if `advanced-permissions` is enabled"
        (mt/with-premium-features #{:advanced-permissions}
          (testing "requires Group Manager or admins"
            (get-membership user 403)
            (add-membership! user 403 group false)
            (update-membership! user 403 group false)
            (delete-membership! user 403 group)
            (clear-memberships! user 403 group)
            (get-membership :crowberto 200)
            (add-membership! :crowberto 200 group false)
            (update-membership! :crowberto 200 group false)
            (delete-membership! :crowberto 204 group)
            (clear-memberships! :crowberto 204 group))

          (mt/with-user-in-groups
            [group-2  {:name "New Group 2"}
             user-2   [group-2]]
            (testing "succeed if users access group that they are manager of"
              (t2/update! PermissionsGroupMembership {:user_id  (:id user-2)
                                                      :group_id (:id group-2)}
                          {:is_group_manager true})
              (get-membership user-2 200)
              (add-membership! user-2 200 group-2 false)
              (update-membership! user-2 200 group-2 false)
              (delete-membership! user-2 204 group-2)
              (clear-memberships! user-2 204 group-2))))))))

(deftest memebership-apis-edge-cases-test
  (testing "/api/permissions/memebership"
    (mt/with-user-in-groups
      [group {:name "New Group"}
       user  [group]]

      (testing "if `advanced-permissions` is disabled"
        (mt/with-premium-features #{}
          (testing "fail when try to set is_group_manager=true"
            (add-membership! :crowberto 402 group true))))

      (testing "if advanced-permissions is enabled, "
        (mt/with-premium-features #{:advanced-permissions}
          (testing "succeed if users access group that they are manager of,"
            (t2/update! PermissionsGroupMembership {:user_id  (:id user)
                                                    :group_id (:id group)}
                        {:is_group_manager true})
            (testing "can set is_group_manager=true"
              (add-membership! :crowberto 200 group true)
              (add-membership! user 200 group true))

            (testing "non-admin user can only view groups that are manager of"
              (is (= #{(:id group)} (membership->groups-ids (get-membership user 200))))))

          (testing "admin cant be group manager"
            (t2.with-temp/with-temp [User                       new-user {:is_superuser true}
                                     PermissionsGroupMembership _        {:user_id          (:id new-user)
                                                                          :group_id         (:id group)
                                                                          :is_group_manager false}]
              (is (= "Admin cant be a group manager."
                     (mt/user-http-request user :post 400 "permissions/membership"
                                           {:group_id         (:id group)
                                            :user_id          (:id new-user)
                                            :is_group_manager true})))))

          (testing "Admin can could view all groups"
            (is (= (t2/select-fn-set :id PermissionsGroup)
                   (membership->groups-ids (get-membership :crowberto 200))))))))))

(deftest get-users-api-test
  (testing "GET /api/user?status=all"
    (mt/with-user-in-groups
      [group {:name "New Group"}
       user  [group]]
      (letfn [(get-users [req-user status]
                (testing (format "- get users with %s user" (mt/user-descriptor user))
                  (mt/user-http-request req-user :get status "/user?status=all")))]
        (testing "if `advanced-permissions` is disabled, require admins"
          (mt/with-premium-features #{}
            (get-users user 403)
            (get-users :crowberto 200)))

        (testing "if `advanced-permissions` is enabled"
          (mt/with-premium-features #{:advanced-permissions}
            (testing "requires Group Manager or admins"
              (get-users user 403)
              (get-users :crowberto 200))
            (testing "succeed if users is a group manager and returns additional fields"
              (t2/update! PermissionsGroupMembership {:user_id  (:id user)
                                                      :group_id (:id group)}
                          {:is_group_manager true})
              (is (subset? (set user/group-manager-visible-columns)
                           (-> (:data (get-users user 200))
                               first
                               keys
                               set))))))))))

(deftest get-users-api-group-id-test
  (testing "GET /api/user?group_id=:group_id"
    (testing "should sort by admins -> group managers -> normal users when filter by group_id"
      (t2.with-temp/with-temp [User                       user-a {:first_name "A"
                                                                  :last_name  "A"}
                               User                       user-b {:first_name "B"
                                                                  :last_name  "B"}
                               User                       user-c {:first_name   "C"
                                                                  :last_name    "C"
                                                                  :is_superuser true}
                               PermissionsGroup           group  {}
                               PermissionsGroupMembership _      {:user_id          (:id user-a)
                                                                  :group_id         (:id group)
                                                                  :is_group_manager false}
                               PermissionsGroupMembership _      {:user_id          (:id user-b)
                                                                  :group_id         (:id group)
                                                                  :is_group_manager true}
                               PermissionsGroupMembership _      {:user_id          (:id user-c)
                                                                  :group_id         (:id group)
                                                                  :is_group_manager false}]
        (is (=? {:data [{:first_name "C"}
                        {:first_name "B"}
                        {:first_name "A"}]}
                (mt/user-http-request :crowberto :get 200 (format "/user?limit=25&offset=0&group_id=%d" (:id group)))))))))

(deftest get-user-api-test
  (testing "GET /api/user/:id"
    (mt/with-user-in-groups
      [group {:name "New Group"}
       user  [group]]
      (letfn [(get-user [req-user status]
                (testing (format "- get user with %s user" (mt/user-descriptor user))
                  (t2.with-temp/with-temp [User new-user]
                    (mt/user-http-request req-user :get status (format "user/%d" (:id new-user))))))]

        (testing "if `advanced-permissions` is disabled, require admins"
          (mt/with-premium-features #{}
            (get-user user 403)
            (get-user :crowberto 200)))

        (testing "if `advanced-permissions` is enabled"
          (mt/with-premium-features #{:advanced-permissions}
            (testing "requires Group Manager or admins"
              (get-user user 403)
              (get-user :crowberto 200))

            (testing "succeed if users is a group manager and returns additional fields"
              (t2/update! PermissionsGroupMembership {:user_id  (:id user)
                                                      :group_id (:id group)}
                          {:is_group_manager true})
              (is (= [{:id               (:id (perms-group/all-users))
                       :is_group_manager false}]
                     (:user_group_memberships (get-user user 200)))))))))))

(deftest update-user-api-test
  (testing "PUT /api/user/:id"
    (mt/test-helpers-set-global-values!
      (mt/with-user-in-groups
        [group {:name "New Group"}
         user  [group]]
        (mt/with-temp [User user-to-update]
          (letfn [(update-user-firstname! [req-user status]
                    (testing (format "- update users firstname with %s test-user" (mt/user-descriptor user))
                      (mt/user-http-request req-user :put status (format "user/%d" (:id user-to-update))
                                            {:first_name (mt/random-name)})))
                  (add-user-to-group! [req-user status group-to-add]
                    ;; ensure `user-to-update` is not in `group-to-add`
                    (t2/delete! PermissionsGroupMembership
                                :user_id (:id user-to-update)
                                :group_id (:id group-to-add))
                    (let [current-user-group-membership (gm/user-group-memberships user-to-update)
                          new-user-group-membership     (conj current-user-group-membership
                                                              {:id               (:id group-to-add)
                                                               :is_group_manager true})]
                      (testing (format "- add user to group with %s user" (mt/user-descriptor user))
                        (mt/user-http-request req-user :put status (format "user/%d" (:id user-to-update))
                                              {:user_group_memberships new-user-group-membership}))))
                  (remove-user-from-group! [req-user status group-to-remove]
                    (u/ignore-exceptions
                     ;; ensure `user-to-update` is in `group-to-remove`
                     (t2/insert! PermissionsGroupMembership
                                 :user_id (:id user-to-update)
                                 :group_id (:id group-to-remove)))
                    (let [current-user-group-membership (gm/user-group-memberships user-to-update)
                          new-user-group-membership     (into [] (filter #(not= (:id group-to-remove)
                                                                                (:id %))
                                                                         current-user-group-membership))]
                      (testing (format "- remove user from group with %s user" (mt/user-descriptor user))
                        (mt/user-http-request req-user :put status (format "user/%d" (:id user-to-update))
                                              {:user_group_memberships new-user-group-membership}))))]
            (testing "if `advanced-permissions` is disabled, requires admins"
              (mt/with-premium-features #{}
                (update-user-firstname! user 403)
                (add-user-to-group! user 403 group)
                (remove-user-from-group! user 403 group)
                (update-user-firstname! :crowberto 200)
                (add-user-to-group! :crowberto 200 group)
                (remove-user-from-group! :crowberto 200 group)))

            (testing "if `advanced-permissions` is enabled"
              (mt/with-premium-features #{:advanced-permissions}
                (testing "Group Managers"
                  (t2/update! PermissionsGroupMembership {:user_id  (:id user)
                                                          :group_id (:id group)}
                              {:is_group_manager true})

                  (testing "Can't edit users' info"
                    (let [current-user-first-name (t2/select-one-fn :first_name User :id (:id user))]
                      (update-user-firstname! user 200)
                      ;; call still success but first name won't get updated
                      (is (= current-user-first-name
                             (t2/select-one-fn :first_name User :id (:id user))))))

                  (testing "Can add/remove user to groups they're manager of"
                    (is (= (set [{:id               (:id (perms-group/all-users))
                                  :is_group_manager false}
                                 {:id               (:id group)
                                  :is_group_manager true}])
                           (set (:user_group_memberships (add-user-to-group! user 200 group)))))
                    (is (= (set [{:id               (:id (perms-group/all-users))
                                  :is_group_manager false}])
                           (set (:user_group_memberships (remove-user-from-group! user 200 group))))))

                  (testing "Can't remove users from group they're not manager of"
                    (t2.with-temp/with-temp [PermissionsGroup random-group]
                      (add-user-to-group! user 403 random-group)
                      (remove-user-from-group! user 403 random-group))))))))))))
