(ns metabase.api.permissions-test
  "Tests for `/api/permissions` endpoints."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.api.permissions :as api.permissions]
   [metabase.api.permissions-test-util :as perm-test-util]
   [metabase.config :as config]
   [metabase.models
    :refer [Database PermissionsGroup PermissionsGroupMembership Table User]]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.data-permissions.graph :as data-perms.graph]
   [metabase.models.permissions-group :as perms-group]
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
      (is (partial= [{:id (:id (perms-group/all-users)), :name "All Users"}]
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
              :specific-errors {:name ["should be a string, received: nil" "non-blank string, received: nil"]}}
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
                                  {db-id {:view-data "unrestricted"
                                          :create-queries "query-builder-and-native"}}}}
                        graph)))))

    (testing "make sure a non-admin cannot fetch the perms graph from the API"
      (mt/user-http-request :rasta :get 403 "permissions/graph"))))

(deftest fetch-perms-graph-by-group-id-test
  (testing "GET /api/permissions/graph"
    (testing "make sure we can fetch the perms graph from the API"
      (t2.with-temp/with-temp [PermissionsGroup {group-id :id :as group}    {}
                               Database         db                          {}]
        (data-perms/set-database-permission! group db :perms/view-data :unrestricted)
        (let [graph (mt/user-http-request :crowberto :get 200 (format "permissions/graph/group/%s" group-id))]
          (is (mc/validate nat-int? (:revision graph)))
          (is (perm-test-util/validate-graph-api-groups (:groups graph)))
          (is (= #{group-id} (set (keys (:groups graph))))))))))

(deftest fetch-perms-graph-by-db-id-test
  (testing "GET /api/permissions/graph"
    (testing "make sure we can fetch the perms graph from the API"
      (t2.with-temp/with-temp [PermissionsGroup group       {}
                               Database         {db-id :id} {}]
        (data-perms/set-database-permission! group db-id :perms/view-data :unrestricted)
        (let [graph (mt/user-http-request :crowberto :get 200 (format "permissions/graph/db/%s" db-id))]
          (is (mc/validate nat-int? (:revision graph)))
          (is (perm-test-util/validate-graph-api-groups (:groups graph)))
          (is (= #{db-id} (->> graph :groups vals (mapcat keys) set))))))))

(deftest update-perms-graph-test
  (testing "PUT /api/permissions/graph"
    (testing "make sure we can update the perms graph from the API"
      (t2.with-temp/with-temp [PermissionsGroup group]
        (mt/user-http-request
         :crowberto :put 200 "permissions/graph"
         (assoc-in (data-perms.graph/api-graph)
                   [:groups (u/the-id group) (mt/id) :view-data]
                   :unrestricted))
        (is (= :unrestricted
               (get-in (data-perms.graph/api-graph) [:groups (u/the-id group) (mt/id) :view-data])))))))

(deftest update-perms-graph-table-specific-perms-test
  (testing "PUT /api/permissions/graph"
    (testing "make sure we can update the perms graph from the API"
      (testing "Table-specific perms"
        (t2.with-temp/with-temp [PermissionsGroup group]
          (data-perms/set-database-permission! group (mt/id) :perms/create-queries :no)
          (mt/user-http-request
           :crowberto :put 200 "permissions/graph"
           (assoc-in (data-perms.graph/api-graph)
                     [:groups (u/the-id group) (mt/id) :create-queries]
                     {"PUBLIC" {(mt/id :venues) :query-builder
                                (mt/id :orders) :query-builder}}))
          (is (= {(mt/id :venues) :query-builder
                  (mt/id :orders) :query-builder}
                 (get-in (data-perms.graph/api-graph) [:groups (u/the-id group) (mt/id) :create-queries "PUBLIC"]))))))))

(deftest update-perms-graph-perms-for-new-db-test
  (testing "PUT /api/permissions/graph"
    (testing "permissions for new db"
      (t2.with-temp/with-temp [PermissionsGroup group       {}
                               Database         {db-id :id} {}
                               Table            _           {:db_id db-id}]
        (mt/user-http-request
         :crowberto :put 200 "permissions/graph"
         (assoc-in (data-perms.graph/api-graph)
                   [:groups (u/the-id group) db-id]
                   {:view-data :unrestricted
                    :create-queries :query-builder}))
        (is (partial=
             {:view-data :unrestricted
              :create-queries :query-builder}
             (get-in (data-perms.graph/api-graph) [:groups (u/the-id group) db-id])))))))

(deftest update-perms-graph-perms-for-new-db-with-no-tables-test
  (testing "PUT /api/permissions/graph"
    (testing "permissions for new db with no tables"
      (t2.with-temp/with-temp [PermissionsGroup group       {}
                               Database         {db-id :id} {}]
        (mt/user-http-request
         :crowberto :put 200 "permissions/graph"
         (assoc-in (data-perms.graph/api-graph)
                   [:groups (u/the-id group) db-id]
                   {:view-data :unrestricted
                    :create-queries :query-builder}))
        (is (partial=
             {:view-data :unrestricted
              :create-queries :query-builder}
             (get-in (data-perms.graph/api-graph) [:groups (u/the-id group) db-id])))))))

(deftest update-perms-graph-with-skip-graph-skips-graph-test
  (testing "PUT /api/permissions/graph"
    (testing "permissions graph is not returned when skip-graph"
      (t2.with-temp/with-temp [:model/PermissionsGroup group       {}
                               :model/Database         {db-id :id} {}]
        (let [do-perm-put    (fn [url] (mt/user-http-request
                                        :crowberto :put 200 url
                                        (assoc-in (data-perms.graph/api-graph)
                                                  ;; Get a new revision number each time
                                                  [:groups (u/the-id group) db-id :view-data] :unrestricted)))
              returned-g     (do-perm-put "permissions/graph")
              returned-g-two (do-perm-put "permissions/graph?skip-graph=false")
              no-returned-g  (do-perm-put "permissions/graph?skip-graph=true")]

          (testing "returned-g"
            (is (perm-test-util/validate-graph-api-groups (:groups returned-g)))
            (is (mc/validate [:map [:revision pos-int?]] returned-g)))

          (testing "return-g-two"
            (is (perm-test-util/validate-graph-api-groups (:groups returned-g-two)))
            (is (mc/validate [:map [:revision pos-int?]] returned-g-two)))

          (testing "no returned g"
            (is (not (perm-test-util/validate-graph-api-groups (:groups no-returned-g))))
            (is (mc/validate [:map {:closed true}
                              [:revision pos-int?]] no-returned-g))))))))

(deftest can-revoke-permsissions-via-graph-test
  (testing "PUT /api/permissions/graph"
    (let [table-id (mt/id :venues)]
      (t2.with-temp/with-temp [PermissionsGroup group]
        (mt/user-http-request
         :crowberto :put 200 "permissions/graph"
         (assoc-in (data-perms.graph/api-graph)
                   [:groups (u/the-id group) (mt/id) :view-data] :unrestricted))
        (is (= #{:unrestricted}
               (set (t2/select-fn-set :perm_value :model/DataPermissions
                                      :group_id  (u/the-id group)
                                      :perm_type :perms/view-data))))
        (mt/user-http-request
         :crowberto :put 200 "permissions/graph"
         (assoc-in (data-perms.graph/api-graph)
                   [:groups (u/the-id group) (mt/id)]
                   {:view-data :unrestricted
                    :create-queries :no}))
        (is (= #{:unrestricted}
               (set (t2/select-fn-set :perm_value :model/DataPermissions
                                      :group_id  (u/the-id group)
                                      :db_id     (mt/id)
                                      :perm_type :perms/view-data))))
        (is (= #{:no}
               (set (t2/select-fn-set :perm_value :model/DataPermissions
                                      :group_id  (u/the-id group)
                                      :db_id     (mt/id)
                                      :perm_type :perms/create-queries))))
        (is (= #{}
               (set (t2/select-fn-set :perm_value :model/DataPermissions
                                      :group_id  (u/the-id group)
                                      :table_id  table-id
                                      :perm_type :perms/view-data))))))))

(deftest update-perms-graph-error-test
  (testing "PUT /api/permissions/graph"
    (testing "make sure an error is thrown if the :sandboxes key is included in an OSS request"
      (mt/with-premium-features #{}
        (is (= "Sandboxes is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
               (mt/user-http-request :crowberto :put 402 "permissions/graph"
                                     (assoc (data-perms.graph/api-graph) :sandboxes [{:card_id 1}]))))))))

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
        (is (= (t2/select-fn-set :id 'User)
               (conj (set (keys result)) config/internal-mb-user-id)))))))

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
        (mt/with-premium-features #{}
          (is (= "The group manager permissions functionality is only enabled if you have a premium token with the advanced-permissions feature."
                 (mt/user-http-request :crowberto :put 402 (format "permissions/membership/%d" id) {:is_group_manager false}))))))))

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

(let [->expected {{:new-admin? true :setting-value true} false
                  {:new-admin? true :setting-value false} false
                  {:new-admin? false :setting-value true} true
                  {:new-admin? false :setting-value false} false}]
  (deftest show-updated-permission-modal-test
    (doseq [instance-creation-time [(t/local-date-time 2020) (t/local-date-time 2022)]
            fifty-migration-time [(t/local-date-time 2021) (t/local-date-time 2023)]
            modal-setting-value [true false]]
      (testing (str "instance-creation-time: " instance-creation-time
                    ", migration-time: " fifty-migration-time
                    ", modal-setting-value: " modal-setting-value)
        (mt/with-current-user (mt/user->id :crowberto)
          (api.permissions/show-updated-permission-modal! modal-setting-value)
          (with-redefs [api.permissions/instance-create-time (constantly instance-creation-time)
                        api.permissions/v-fifty-migration-time (constantly fifty-migration-time)]
            (let [expected-modal-value (get ->expected
                                            {:new-admin? (t/after? instance-creation-time fifty-migration-time)
                                             :setting-value modal-setting-value})]
              (is (= expected-modal-value (api.permissions/show-updated-permission-modal)))))))))
  (deftest show-updated-permission-banner-test
    (doseq [instance-creation-time [(t/local-date-time 2020) (t/local-date-time 2022)]
            fifty-migration-time [(t/local-date-time 2021) (t/local-date-time 2023)]
            banner-setting-value [true false]]
      (testing (str "instance-creation-time: " instance-creation-time
                    ", migration-time: " fifty-migration-time
                    ", banner-setting-value: " banner-setting-value)
        (mt/with-current-user (mt/user->id :crowberto)
          (api.permissions/show-updated-permission-banner! banner-setting-value)
          (with-redefs [api.permissions/instance-create-time (constantly instance-creation-time)
                        api.permissions/v-fifty-migration-time (constantly fifty-migration-time)]
            (let [expected-banner-value (get ->expected
                                             {:new-admin? (t/after? instance-creation-time fifty-migration-time)
                                              :setting-value banner-setting-value})]
              (is (= expected-banner-value (api.permissions/show-updated-permission-banner))))))))))
