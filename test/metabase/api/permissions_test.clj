(ns metabase.api.permissions-test
  "Tests for `/api/permissions` endpoints."
  (:require [clojure.test :refer :all]
            [metabase
             [test :as mt]
             [util :as u]]
            [metabase.api.permissions :as permissions-api]
            [metabase.models
             [database :refer [Database]]
             [permissions :as perms]
             [permissions-group :as group :refer [PermissionsGroup]]
             [table :refer [Table]]]
            [metabase.test.fixtures :as fixtures]
            [metabase.util.schema :as su]
            [schema.core :as s]))

;; there are some issues where it doesn't look like the hydrate function for `member_count` is being added (?)
(comment permissions-api/keep-me)

;; make sure test users are created first, otherwise we're possibly going to have some WEIRD results
(use-fixtures :once (fixtures/initialize :test-users))

;; GET /permissions/group
;; Should *not* include inactive users in the counts.
;; It should also *not* include the MetaBot group because MetaBot should *not* be enabled
(defn- fetch-groups []
  (set ((mt/user->client :crowberto) :get 200 "permissions/group")))

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
                           (get id->group (:id group)))))))))))

(deftest fetch-group-test
  (testing "GET /permissions/group/:id"
    (let [{:keys [members]} ((mt/user->client :crowberto) :get 200 (format "permissions/group/%d" (:id (group/all-users))))
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
               (get id->member :trashbird)))))))

(deftest update-perms-graph-test
  (testing "PUT /api/permissions/graph"
    (testing "make sure we can update the perms graph from the API"
      (mt/with-temp PermissionsGroup [group]
        ((mt/user->client :crowberto) :put 200 "permissions/graph"
         (assoc-in (perms/graph)
                   [:groups (u/get-id group) (mt/id) :schemas]
                   {"PUBLIC" {(mt/id :venues) :all}}))
        (is (= {(mt/id :venues) :all}
               (get-in (perms/graph) [:groups (u/get-id group) (mt/id) :schemas "PUBLIC"]))))

      (testing "Table-specific perms"
        (mt/with-temp PermissionsGroup [group]
          ((mt/user->client :crowberto) :put 200 "permissions/graph"
           (assoc-in (perms/graph)
                     [:groups (u/get-id group) (mt/id) :schemas]
                     {"PUBLIC" {(mt/id :venues) {:read :all, :query :segmented}}}))
          (is (= {(mt/id :venues) {:read  :all
                                   :query :segmented}}
                 (get-in (perms/graph) [:groups (u/get-id group) (mt/id) :schemas "PUBLIC"]))))))

    (testing "permissions for new db"
      (let [new-id (inc (mt/id))]
        (mt/with-temp* [PermissionsGroup [group]
                        Database         [{db-id :id}]
                        Table            [_ {:db_id db-id}]]
          ((mt/user->client :crowberto) :put 200 "permissions/graph"
           (assoc-in (perms/graph)
                     [:groups (u/get-id group) db-id :schemas]
                     :all))
          (is (= :all
                 (get-in (perms/graph) [:groups (u/get-id group) db-id :schemas]))))))

    (testing "permissions for new db with no tables"
      (let [new-id (inc (mt/id))]
        (mt/with-temp* [PermissionsGroup [group]
                        Database         [{db-id :id}]]
          ((mt/user->client :crowberto) :put 200 "permissions/graph"
           (assoc-in (perms/graph)
                     [:groups (u/get-id group) db-id :schemas]
                     :all))
          (is (= :all
                 (get-in (perms/graph) [:groups (u/get-id group) db-id :schemas]))))))))

;;
