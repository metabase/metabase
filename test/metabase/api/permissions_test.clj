(ns metabase.api.permissions-test
  "Tests for `/api/permissions` endpoints."
  (:require [clojure.test :refer :all]
            [metabase.api.permissions :as permissions-api]
            [metabase.models :refer [Database PermissionsGroup PermissionsGroupMembership Table User]]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as group]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

;; there are some issues where it doesn't look like the hydrate function for `member_count` is being added (?)
(comment permissions-api/keep-me)

;; make sure test users are created first, otherwise we're possibly going to have some WEIRD results
(use-fixtures :once (fixtures/initialize :test-users))

;; GET /permissions/group
;; Should *not* include inactive users in the counts.
(defn- fetch-groups []
  (set (mt/user-http-request
        :crowberto :get 200 "permissions/group")))

;;; +---------------------------------------------- permissions group apis -----------------------------------------------------------+

(deftest fetch-groups-test
  (testing "GET /api/permissions/group"
    (letfn [(check-default-groups-returned [id->group]
              (testing "All Users Group should be returned"
                (is (schema= {:id           (s/eq (:id (group/all-users)))
                              :name         (s/eq "All Users")
                              :member_count su/IntGreaterThanZero}
                             (get id->group (:id (group/all-users))))))
              (testing "Administrators Group should be returned"
                (is (schema= {:id           (s/eq (:id (group/admin)))
                              :name         (s/eq "Administrators")
                              :member_count su/IntGreaterThanZero}
                             (get id->group (:id (group/admin)))))))]
      (let [id->group (u/key-by :id (fetch-groups))]
        (check-default-groups-returned id->group))

      (testing "should return empty groups"
        (mt/with-temp PermissionsGroup [group]
          (let [id->group (u/key-by :id (fetch-groups))]
            (check-default-groups-returned id->group)
            (testing "empty group should be returned"
              (is (schema= {:id           su/IntGreaterThanZero
                            :name         su/NonBlankString
                            :member_count (s/eq 0)}
                           (get id->group (:id group)))))))))
    (testing "requires superuser"
      (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "permissions/group"))))))

(deftest groups-list-limit-test
  (testing "GET /api/permissions/group?limit=1&offset=1"
    (testing "Limit and offset pagination have defaults"
      (is (= (mt/user-http-request :crowberto :get 200 "permissions/group" :limit "1" :offset "0")
             (mt/user-http-request :crowberto :get 200 "permissions/group" :limit "1")))
      (is (= (mt/user-http-request :crowberto :get 200 "permissions/group" :offset "1" :limit 50)
             (mt/user-http-request :crowberto :get 200 "permissions/group" :offset "1"))))
    (testing "Limit and offset pagination works for permissions list"
      (is (partial= [{:id 1, :name "All Users"}]
             (mt/user-http-request :crowberto :get 200 "permissions/group" :limit "1" :offset "1"))))))

(deftest fetch-group-test
  (testing "GET /permissions/group/:id"
    (let [{:keys [members]} (mt/user-http-request
                             :crowberto :get 200 (format "permissions/group/%d" (:id (group/all-users))))
          id->member        (u/key-by :user_id members)]
      (is (schema= {:first_name    (s/eq "Crowberto")
                    :last_name     (s/eq "Corv")
                    :email         (s/eq "crowberto@metabase.com")
                    :user_id       (s/eq (mt/user->id :crowberto))
                    :membership_id su/IntGreaterThanZero}
                   (get id->member (mt/user->id :crowberto))))
      (is (schema= {:first_name    (s/eq "Lucky")
                    :last_name     (s/eq "Pigeon")
                    :email         (s/eq "lucky@metabase.com")
                    :user_id       (s/eq (mt/user->id :lucky))
                    :membership_id su/IntGreaterThanZero}
                   (get id->member (mt/user->id :lucky))))
      (is (schema= {:first_name    (s/eq "Rasta")
                    :last_name     (s/eq "Toucan")
                    :email         (s/eq "rasta@metabase.com")
                    :user_id       (s/eq (mt/user->id :rasta))
                    :membership_id su/IntGreaterThanZero}
                   (get id->member (mt/user->id :rasta))))
      (testing "Should *not* include inactive users"
        (is (= nil
               (get id->member :trashbird)))))

    (testing "requires superuers"
      (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 (format "permissions/group/%d" (:id (group/all-users)))))))))

;;; +---------------------------------------------- permissions graph apis -----------------------------------------------------------+


(deftest fetch-perms-graph-test
  (testing "GET /api/permissions/graph"
    (testing "make sure we can fetch the perms graph from the API"
      (mt/with-temp Database [{db-id :id}]
        (let [graph (mt/user-http-request :crowberto :get 200 "permissions/graph")]
          (is (partial= {:groups {(u/the-id (group/admin))
                                  {db-id {:data {:native "write" :schemas "all"}}}}}
                        graph)))))

    (testing "make sure a non-admin cannot fetch the perms graph from the API"
      (mt/user-http-request :rasta :get 403 "permissions/graph"))))

(deftest update-perms-graph-test
  (testing "PUT /api/permissions/graph"
    (testing "make sure we can update the perms graph from the API"
      (mt/with-temp PermissionsGroup [group]
        (mt/user-http-request
         :crowberto :put 200 "permissions/graph"
         (assoc-in (perms/data-perms-graph)
                   [:groups (u/the-id group) (mt/id) :data :schemas]
                   {"PUBLIC" {(mt/id :venues) :all}}))
        (is (= {(mt/id :venues) :all}
               (get-in (perms/data-perms-graph) [:groups (u/the-id group) (mt/id) :data :schemas "PUBLIC"]))))

      (testing "Table-specific perms"
        (mt/with-temp PermissionsGroup [group]
          (mt/user-http-request
           :crowberto :put 200 "permissions/graph"
           (assoc-in (perms/data-perms-graph)
                     [:groups (u/the-id group) (mt/id) :data :schemas]
                     {"PUBLIC" {(mt/id :venues) {:read :all, :query :segmented}}}))
          (is (= {(mt/id :venues) {:read  :all
                                   :query :segmented}}
                 (get-in (perms/data-perms-graph) [:groups (u/the-id group) (mt/id) :data :schemas "PUBLIC"]))))))

    (testing "permissions for new db"
      (let [new-id (inc (mt/id))]
        (mt/with-temp* [PermissionsGroup [group]
                        Database         [{db-id :id}]
                        Table            [_ {:db_id db-id}]]
          (mt/user-http-request
           :crowberto :put 200 "permissions/graph"
           (assoc-in (perms/data-perms-graph)
                     [:groups (u/the-id group) db-id :data :schemas]
                     :all))
          (is (= :all
                 (get-in (perms/data-perms-graph) [:groups (u/the-id group) db-id :data :schemas]))))))

    (testing "permissions for new db with no tables"
      (let [new-id (inc (mt/id))]
        (mt/with-temp* [PermissionsGroup [group]
                        Database         [{db-id :id}]]
          (mt/user-http-request
           :crowberto :put 200 "permissions/graph"
           (assoc-in (perms/data-perms-graph)
                     [:groups (u/the-id group) db-id :data :schemas]
                     :all))
          (is (= :all
                 (get-in (perms/data-perms-graph) [:groups (u/the-id group) db-id :data :schemas]))))))))


;;; +---------------------------------------------- permissions membership apis -----------------------------------------------------------+

(deftest get-group-membership-test
  (testing "GET /api/permissions/membership"
    (testing "requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "permissions/membership"))))

    (testing "Return a graph of membership"
      (let [result (mt/user-http-request :crowberto :get 200 "permissions/membership")]
        (is (schema= {su/IntGreaterThanZero
                      [{:membership_id su/IntGreaterThanZero
                        :group_id su/IntGreaterThanZero
                        :user_id su/IntGreaterThanZero
                        :is_group_manager s/Bool}]}
                     result))
        (is (= (db/select-field :id 'User) (set (keys result))))))))


(deftest add-group-membership-test
  (testing "POST /api/permissions/membership"
    (mt/with-temp* [User             [user]
                    PermissionsGroup [group]]
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 "permissions/membership" {:group_id (:id group)
                                                                                :user_id  (:id user)}))))

      (testing "Add membership successfully"
        (mt/user-http-request :crowberto :post 200 "permissions/membership"
                              {:group_id         (:id group)
                               :user_id          (:id user)})))))

(deftest update-group-membership-test
  (testing "PUT /api/permissions/membership/:id"
    (mt/with-temp* [User                       [user]
                    PermissionsGroup           [group]
                    PermissionsGroupMembership [{id :id} {:group_id (:id group)
                                                          :user_id  (:id user)}]]
      (testing "This API is for EE only"
        (is (= "The group manager permissions functionality is only enabled if you have a premium token with the advanced-permissions feature."
               (mt/user-http-request :crowberto :put 402 (format "permissions/membership/%d" id) {:is_group_manager false})))))))

(deftest delete-group-membership-test
  (testing "DELETE /api/permissions/membership/:id"
    (mt/with-temp* [User                       [user]
                    PermissionsGroup           [group]
                    PermissionsGroupMembership [{id :id} {:group_id (:id group)
                                                          :user_id  (:id user)}]]
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :delete 403 (format "permissions/membership/%d" id)))))

      (testing "Delete membership successfully"
        (mt/user-http-request :crowberto :delete 204 (format "permissions/membership/%d" id))))))
