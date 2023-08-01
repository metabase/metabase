(ns metabase.api.permissions-test
  "Tests for `/api/permissions` endpoints."
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.api.permissions :as api.permissions]
   [metabase.config :as config]
   [metabase.models
    :refer [Database
            Permissions
            PermissionsGroup
            PermissionsGroupMembership
            Table
            User]]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.public-settings.premium-features-test
    :as premium-features-test]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

;; there are some issues where it doesn't look like the hydrate function for `member_count` is being added (?)
(comment api.permissions/keep-me)

;; make sure test users are created first, otherwise we're possibly going to have some WEIRD results
(use-fixtures :once (fixtures/initialize :test-users))

;; GET /permissions/group
;; Should *not* include inactive users in the counts.
(defn- fetch-groups []
  (set (mt/user-http-request
        :crowberto :get 200 "permissions/group")))

(deftest fetch-groups-test
  (testing "GET /api/permissions/group"
    (letfn [(check-default-groups-returned [id->group]
              (testing "All Users Group should be returned"
                (is (malli= [:map
                             [:id           [:= (:id (perms-group/all-users))]]
                             [:name         [:= "All Users"]]
                             [:member_count ms/PositiveInt]]
                            (get id->group (:id (perms-group/all-users))))))
              (testing "Administrators Group should be returned"
                (is (malli= [:map
                             [:id           [:= (:id (perms-group/admin))]]
                             [:name         [:= "Administrators"]]
                             [:member_count ms/PositiveInt]]
                            (get id->group (:id (perms-group/admin)))))))]
      (let [id->group (m/index-by :id (fetch-groups))]
        (check-default-groups-returned id->group))

      (testing "should return empty groups"
        (t2.with-temp/with-temp [PermissionsGroup group]
          (let [id->group (m/index-by :id (fetch-groups))]
            (check-default-groups-returned id->group)
            (testing "empty group should be returned"
              (is (malli= [:map
                           [:id           ms/PositiveInt]
                           [:name         ms/NonBlankString]
                           [:member_count [:= 0]]]
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
                             :crowberto :get 200 (format "permissions/group/%d" (:id (perms-group/all-users))))
          id->member        (m/index-by :user_id members)]
      (is (malli= [:map
                   [:first_name    [:= "Crowberto"]]
                   [:last_name     [:= "Corv"]]
                   [:email         [:= "crowberto@metabase.com"]]
                   [:user_id       [:= (mt/user->id :crowberto)]]
                   [:membership_id ms/PositiveInt]]
                  (get id->member (mt/user->id :crowberto))))
      (is (malli= [:map
                   [:first_name    [:= "Lucky"]]
                   [:last_name     [:= "Pigeon"]]
                   [:email         [:= "lucky@metabase.com"]]
                   [:user_id       [:= (mt/user->id :lucky)]]
                   [:membership_id ms/PositiveInt]]
                  (get id->member (mt/user->id :lucky))))
      (is (malli= [:map
                   [:first_name    [:= "Rasta"]]
                   [:last_name     [:= "Toucan"]]
                   [:email         [:= "rasta@metabase.com"]]
                   [:user_id       [:= (mt/user->id :rasta)]]
                   [:membership_id ms/PositiveInt]]
                  (get id->member (mt/user->id :rasta))))
      (testing "Should *not* include inactive users"
        (is (nil?
               (get id->member :trashbird)))))

    (testing "returns 404 for nonexistent id"
      (is (= "Not found."
             (mt/user-http-request :crowberto :get 404 "permissions/group/10000"))))

    (testing "requires superuers"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 (format "permissions/group/%d" (:id (perms-group/all-users)))))))))

(deftest create-group-test
  (testing "POST /permissions/group"
    (testing "happy path"
      (mt/with-model-cleanup [PermissionsGroup]
        (mt/user-http-request :crowberto :post 200 "permissions/group" {:name "Test Group"})
        (is (some? (t2/select PermissionsGroup :name "Test Group")))))

    (testing "requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "permissions/group" {:name "Test Group"}))))

    (testing "group name is required"
      (is (= {:errors          {:name "value must be a non-blank string."},
              :specific-errors {:name ["value must be a non-blank string., received: nil"]}}
             (mt/user-http-request :crowberto :post 400 "permissions/group" {:name nil}))))))

(deftest delete-group-test
  (testing "DELETE /permissions/group/:id"
    (testing "happy path"
      (t2.with-temp/with-temp [PermissionsGroup {group-id :id} {:name "Test group"}]
        (mt/user-http-request :crowberto :delete 204 (format "permissions/group/%d" group-id))
        (is (= 0 (t2/count PermissionsGroup :name "Test group")))))

    (testing "requires superuser"
      (t2.with-temp/with-temp [PermissionsGroup {group-id :id} {:name "Test group"}]
         (is (= "You don't have permissions to do that."
                (mt/user-http-request :rasta :delete 403 (format "permissions/group/%d" group-id))))))))

(deftest fetch-perms-graph-test
  (testing "GET /api/permissions/graph"
    (testing "make sure we can fetch the perms graph from the API"
      (t2.with-temp/with-temp [Database {db-id :id}]
        (let [graph (mt/user-http-request :crowberto :get 200 "permissions/graph")]
          (is (partial= {:groups {(u/the-id (perms-group/admin))
                                  {db-id {:data {:native "write" :schemas "all"}}}}}
                        graph)))))

    (testing "make sure a non-admin cannot fetch the perms graph from the API"
      (mt/user-http-request :rasta :get 403 "permissions/graph"))))

(deftest fetch-perms-graph-v2-test
  (testing "GET /api/permissions/graph-v2"
    (testing "make sure we can fetch the perms graph from the API"
      (t2.with-temp/with-temp [Database {db-id :id}]
        (let [graph (mt/user-http-request :crowberto :get 200 "permissions/graph-v2")]
          (is (partial= {:groups {(u/the-id (perms-group/admin))
                                  {db-id {:data {:native "write" :schemas "all"}}}}}
                        graph)))))

    (testing "make sure a non-admin cannot fetch the perms graph from the API"
      (mt/user-http-request :rasta :get 403 "permissions/graph-v2"))))

(deftest update-perms-graph-test
  (testing "PUT /api/permissions/graph"
    (testing "make sure we can update the perms graph from the API"
      (let [db-id (mt/id :venues)]
        (t2.with-temp/with-temp [PermissionsGroup group]
          (mt/user-http-request
           :crowberto :put 200 "permissions/graph"
           (assoc-in (perms/data-perms-graph)
                     [:groups (u/the-id group) (mt/id) :data :schemas]
                     {"PUBLIC" {db-id :all}}))
          (is (= {db-id :all}
                 (get-in (perms/data-perms-graph) [:groups (u/the-id group) (mt/id) :data :schemas "PUBLIC"])))
          (is (= {:query {:schemas {"PUBLIC" {(mt/id :venues) :all}}},
                  :data {:schemas {"PUBLIC" {(mt/id :venues) :all}}}}
                 (get-in (perms/data-perms-graph-v2) [:groups (u/the-id group) (mt/id)]))))))))

(deftest update-perms-graph-table-specific-perms-test
  (testing "PUT /api/permissions/graph"
    (testing "make sure we can update the perms graph from the API"
      (testing "Table-specific perms"
        (t2.with-temp/with-temp [PermissionsGroup group]
          (mt/user-http-request
           :crowberto :put 200 "permissions/graph"
           (assoc-in (perms/data-perms-graph)
                     [:groups (u/the-id group) (mt/id) :data :schemas]
                     {"PUBLIC" {(mt/id :venues) {:read :all, :query :segmented}}}))
          (is (= {(mt/id :venues) {:read  :all
                                   :query :segmented}}
                 (get-in (perms/data-perms-graph) [:groups (u/the-id group) (mt/id) :data :schemas "PUBLIC"])))
          (is (= {:query {:schemas {"PUBLIC" {(mt/id :venues) :all}}},
                  :data  {:schemas {"PUBLIC" {(mt/id :venues) :all}}}}
                 (get-in (perms/data-perms-graph-v2) [:groups (u/the-id group) (mt/id)]))))))))

(deftest update-perms-graph-perms-for-new-db-test
  (testing "PUT /api/permissions/graph"
    (testing "permissions for new db"
      (t2.with-temp/with-temp [PermissionsGroup group       {}
                               Database         {db-id :id} {}
                               Table            _           {:db_id db-id}]
        (mt/user-http-request
         :crowberto :put 200 "permissions/graph"
         (assoc-in (perms/data-perms-graph)
                   [:groups (u/the-id group) db-id :data :schemas]
                   :all))
        (is (= {:data {:schemas :all}}
               (get-in (perms/data-perms-graph) [:groups (u/the-id group) db-id])))
        (is (= {:data {:native :write}, :query {:schemas :all}}
               (get-in (perms/data-perms-graph-v2) [:groups (u/the-id group) db-id])))))))

(deftest update-perms-graph-perms-for-new-db-with-no-tables-test
  (testing "PUT /api/permissions/graph"
    (testing "permissions for new db with no tables"
      (t2.with-temp/with-temp [PermissionsGroup group       {}
                               Database         {db-id :id} {}]
        (mt/user-http-request
         :crowberto :put 200 "permissions/graph"
         (assoc-in (perms/data-perms-graph)
                   [:groups (u/the-id group) db-id :data :schemas]
                   :all))
        (is (= {:data {:schemas :all}}
               (get-in (perms/data-perms-graph) [:groups (u/the-id group) db-id])))
        (is (= {:query {:schemas :all}, :data {:native :write}}
               (get-in (perms/data-perms-graph-v2) [:groups (u/the-id group) db-id])))))))

(deftest update-perms-graph-group-has-no-permissions-test
  (testing "PUT /api/permissions/graph"
    (testing "permissions when group has no permissions"
      (t2.with-temp/with-temp [PermissionsGroup group]
        (mt/user-http-request :crowberto :put 200 "permissions/graph"
                              (assoc-in (perms/data-perms-graph) [:groups (u/the-id group)] nil))
        (is (empty? (t2/select Permissions :group_id (u/the-id group))))
        (is (nil? (get-in (perms/data-perms-graph) [:groups (u/the-id group)])))
        (is (nil? (get-in (perms/data-perms-graph-v2) [:groups (u/the-id group)])))))))

(deftest can-delete-permsissions-via-graph-test
  (testing "PUT /api/permissions/graph"
    (testing "permissions when group has no permissions"
      (let [db-id (mt/id :venues)]
        (t2.with-temp/with-temp [PermissionsGroup group]
          (mt/user-http-request
           :crowberto :put 200 "permissions/graph"
           (assoc-in (perms/data-perms-graph)
                     [:groups (u/the-id group) (mt/id) :data :schemas] {"PUBLIC" {db-id :all}}))
          (is (= (set (for [template ["/data/db/%s/schema/PUBLIC/table/%s/"
                                      "/query/db/%s/schema/PUBLIC/table/%s/"
                                      "/db/%s/schema/PUBLIC/table/%s/"]]
                        (format template (mt/id) db-id)))
                 (set (mapv :object (t2/select Permissions :group_id (u/the-id group))))))
          (mt/user-http-request
           :crowberto :put 200 "permissions/graph"
           (assoc-in (perms/data-perms-graph)
                     [:groups (u/the-id group) (mt/id)]
                     {:data {:native "none" :schemas "none"}}))
          (is (= #{}
                 (set (mapv :object (t2/select Permissions :group_id (u/the-id group)))))))))))

(deftest update-perms-graph-error-test
  (testing "PUT /api/permissions/graph"
    (testing "make sure an error is thrown if the :sandboxes key is included in an OSS request"
      (is (= "Sandboxes is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
             (mt/user-http-request :crowberto :put 402 "permissions/graph"
                                   (assoc (perms/data-perms-graph) :sandboxes [{:card_id 1}])))))))

(deftest update-execution-perms-graph-global-execute-permission-test
  (mt/with-model-cleanup [Permissions]
    (testing "PUT /api/permissions/execution/graph global execute permission"
      (testing "without :advanced-permissions feature flag"
        (testing "for All Users"
          (let [group-id (:id (perms-group/all-users))]
            (mt/user-http-request
             :crowberto :put 200 "permissions/execution/graph"
             (assoc-in (perms/execution-perms-graph) [:groups group-id] :all))
            (is (= :all
                   (get-in (perms/execution-perms-graph) [:groups group-id])))))
        (testing "for non-magic group"
          (t2.with-temp/with-temp [PermissionsGroup {group-id :id}]
            (mt/user-http-request
             :crowberto :put 402 "permissions/execution/graph"
             (assoc-in (perms/execution-perms-graph) [:groups group-id] :all)))))

      (when config/ee-available?
        (testing "with :advanced-permissions feature flag"
          (premium-features-test/with-premium-features #{:advanced-permissions}
            (testing "for All Users"
              (let [group-id (:id (perms-group/all-users))]
                (mt/user-http-request
                 :crowberto :put 200 "permissions/execution/graph"
                 (assoc-in (perms/execution-perms-graph) [:groups group-id] :all))
                (is (= :all
                       (get-in (perms/execution-perms-graph) [:groups group-id])))))
            (testing "for non-magic group"
              (t2.with-temp/with-temp [PermissionsGroup {group-id :id}]
                (mt/user-http-request
                 :crowberto :put 200 "permissions/execution/graph"
                 (assoc-in (perms/execution-perms-graph) [:groups group-id] :all))
                (is (= :all
                       (get-in (perms/execution-perms-graph) [:groups group-id])))))))))))

(deftest update-execution-perms-graph-db-execute-permission-test
  (mt/with-model-cleanup [Permissions]
    (testing "PUT /api/permissions/execution/graph DB execute permission"
      (t2.with-temp/with-temp [PermissionsGroup {group-id :id} {}
                               Database         {db-id :id}    {}]
        (testing "without :advanced-permissions feature flag"
          (testing "for All Users"
            (mt/user-http-request
             :crowberto :put 402 "permissions/execution/graph"
             (assoc-in (perms/execution-perms-graph) [:groups (:id (perms-group/all-users))] {db-id :all})))

          (testing "for non-magic group"
            (mt/user-http-request
             :crowberto :put 402 "permissions/execution/graph"
             (assoc-in (perms/execution-perms-graph) [:groups group-id db-id] :all))))

        (when config/ee-available?
          (testing "with :advanced-permissions feature flag"
            (premium-features-test/with-premium-features #{:advanced-permissions}
              (testing "for All Users"
                (mt/user-http-request
                 :crowberto :put 200 "permissions/execution/graph"
                 (assoc-in (perms/execution-perms-graph) [:groups (:id (perms-group/all-users))] {db-id :all}))
                (is (= :all
                       (get-in (perms/execution-perms-graph) [:groups (:id (perms-group/all-users)) db-id]))))

              (testing "for non-magic group"
                (mt/user-http-request
                 :crowberto :put 200 "permissions/execution/graph"
                 (assoc-in (perms/execution-perms-graph) [:groups group-id] {db-id :all}))
                (is (= :all
                       (get-in (perms/execution-perms-graph) [:groups group-id db-id])))))))))))

(deftest get-group-membership-test
  (testing "GET /api/permissions/membership"
    (testing "requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "permissions/membership"))))

    (testing "Return a graph of membership"
      (let [result (mt/user-http-request :crowberto :get 200 "permissions/membership")]
        (is (malli= [:map-of ms/PositiveInt [:sequential [:map
                                                          [:membership_id    ms/PositiveInt]
                                                          [:group_id         ms/PositiveInt]
                                                          [:user_id          ms/PositiveInt]
                                                          [:is_group_manager :boolean]]]]
                    result))
        (is (= (t2/select-fn-set :id 'User) (set (keys result))))))))

(deftest add-group-membership-test
  (testing "POST /api/permissions/membership"
    (t2.with-temp/with-temp [User             user  {}
                             PermissionsGroup group {}]
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
    (t2.with-temp/with-temp [User                       user     {}
                             PermissionsGroup           group    {}
                             PermissionsGroupMembership {id :id} {:group_id (:id group)
                                                                  :user_id  (:id user)}]
      (testing "This API is for EE only"
        (is (= "The group manager permissions functionality is only enabled if you have a premium token with the advanced-permissions feature."
               (mt/user-http-request :crowberto :put 402 (format "permissions/membership/%d" id) {:is_group_manager false})))))))

(deftest clear-group-membership-test
  (testing "PUT /api/permissions/membership/:group-id/clear"
    (t2.with-temp/with-temp [User                       {user-id :id}  {}
                             PermissionsGroup           {group-id :id} {}
                             PermissionsGroupMembership _              {:group_id group-id
                                                                        :user_id  user-id}]
      (testing "requires superuser permisisons"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 (format "permissions/membership/%d/clear" group-id)))))

      (testing "Membership of a group can be cleared succesfully, while preserving the group itself"
        (is (= 1 (t2/count PermissionsGroupMembership :group_id group-id)))
        (mt/user-http-request :crowberto :put 204 (format "permissions/membership/%d/clear" group-id))
        (is (true? (t2/exists? PermissionsGroup :id group-id)))
        (is (= 0 (t2/count PermissionsGroupMembership :group_id group-id))))

      (testing "The admin group cannot be cleared using this endpoint"
        (mt/user-http-request :crowberto :put 400 (format "permissions/membership/%d/clear" (u/the-id (perms-group/admin))))))))

(deftest delete-group-membership-test
  (testing "DELETE /api/permissions/membership/:id"
    (t2.with-temp/with-temp [User                       user     {}
                             PermissionsGroup           group    {}
                             PermissionsGroupMembership {id :id} {:group_id (:id group)
                                                                  :user_id  (:id user)}]
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :delete 403 (format "permissions/membership/%d" id)))))

      (testing "Delete membership successfully"
        (mt/user-http-request :crowberto :delete 204 (format "permissions/membership/%d" id))))))
