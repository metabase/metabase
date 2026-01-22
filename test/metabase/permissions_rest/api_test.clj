(ns metabase.permissions-rest.api-test
  "Tests for `/api/permissions` endpoints."
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.config.core :as config]
   [metabase.permissions-rest.api :as api.permissions]
   [metabase.permissions-rest.api-test-util :as perm-test-util]
   [metabase.permissions-rest.data-permissions.graph :as data-perms.graph]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;; there are some issues where it doesn't look like the hydrate function for `member_count` is being added (?)
(comment api.permissions/keep-me)

;; make sure test users are created first, otherwise we're possibly going to have some WEIRD results
(use-fixtures :once (fixtures/initialize :test-users))

;; GET /permissions/group
;; Should *not* include inactive users in the counts.
(defn- fetch-groups
  ([]
   (fetch-groups {}))
  ([& query-params]
   (set (apply mt/user-http-request
               :crowberto :get 200 "permissions/group" query-params))))

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
        (mt/with-temp [:model/PermissionsGroup group]
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

(deftest no-data-analyst-groups-test
  (testing "GET /api/permissions/group"
    (testing "in OSS, the data analyst group is hidden"
      ;; note that this uses `config/ee-available?` instead of a feature to avoid hiding a group that may stil provide permissions!
      (when-not config/ee-available?
        (is (not (contains? (set (map :name (mt/user-http-request :crowberto :get 200 "permissions/group")))
                            "Data Analysts")))))))

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

(deftest fetch-groups-tenancy-filter-test
  (testing "GET /api/permissions/group with tenancy filter"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/PermissionsGroup regular-group {:name "Regular Group" :is_tenant_group false}
                       :model/PermissionsGroup tenant-group {:name "Tenant Group" :is_tenant_group true}]
          (let [all-groups (fetch-groups)
                internal-groups (fetch-groups :tenancy "internal")
                external-groups (fetch-groups :tenancy "external")
                regular-id (:id regular-group)
                tenant-id (:id tenant-group)]

            (testing "default behavior (no tenancy param) returns all groups"
              (is (some #(= regular-id (:id %)) all-groups))
              (is (some #(= tenant-id (:id %)) all-groups)))

            (testing "tenancy=internal returns only non-tenant groups"
              (is (some #(= regular-id (:id %)) internal-groups))
              (is (not (some #(= tenant-id (:id %)) internal-groups))))

            (testing "tenancy=external returns only tenant groups"
              (is (not (some #(= regular-id (:id %)) external-groups)))
              (is (some #(= tenant-id (:id %)) external-groups)))

            (testing "magic groups are handled correctly"
              (let [all-internal-users-id (:id (perms-group/all-users))
                    find-group-by-type (fn [groups magic-type]
                                         (some #(when (= magic-type (:magic_group_type %)) %) groups))]
                (testing "all-internal-users appears in internal filter"
                  (is (some #(= all-internal-users-id (:id %)) internal-groups)))
                (testing "all-external-users appears in external filter when available"
                  (when-let [external-users-group (find-group-by-type all-groups "all-external-users")]
                    (is (some #(= (:id external-users-group) (:id %)) external-groups))))))))))

    (testing "when tenants feature is disabled"
      (mt/with-temporary-setting-values [use-tenants false]
        (mt/with-temp [:model/PermissionsGroup regular-group {:name "Regular Group" :is_tenant_group false}]
          (let [all-groups (fetch-groups)
                internal-groups (fetch-groups :tenancy "internal")
                external-groups (fetch-groups :tenancy "external")
                regular-id (:id regular-group)]

            (testing "default behavior excludes tenant groups when tenants disabled"
              (is (some #(= regular-id (:id %)) all-groups)))

            (testing "tenancy=internal still works when tenants disabled"
              (is (some #(= regular-id (:id %)) internal-groups)))

            (testing "tenancy=external returns empty when tenants disabled"
              (is (empty? external-groups)))))))

    (testing "invalid tenancy value returns 400"
      (:status (mt/user-http-request :crowberto :get 400 "permissions/group" :tenancy "invalid")))))

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
      (mt/with-model-cleanup [:model/PermissionsGroup]
        (mt/user-http-request :crowberto :post 200 "permissions/group" {:name "Test Group"})
        (is (some? (t2/select :model/PermissionsGroup :name "Test Group")))))

    (testing "requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "permissions/group" {:name "Test Group"}))))

    (testing "group name is required"
      (is (= {:errors          {:name "value must be a non-blank string."},
              :specific-errors {:name ["should be a string, received: nil" "non-blank string, received: nil"]}}
             (mt/user-http-request :crowberto :post 400 "permissions/group" {:name nil}))))

    (testing "creates regular group by default"
      (mt/with-model-cleanup [:model/PermissionsGroup]
        (mt/user-http-request :crowberto :post 200 "permissions/group" {:name "Regular Group"})
        (let [group (t2/select-one :model/PermissionsGroup :name "Regular Group")]
          (is (some? group))
          (is (false? (:is_tenant_group group))))))

    (testing "creates regular group when is_tenant_group is explicitly false"
      (mt/with-model-cleanup [:model/PermissionsGroup]
        (mt/user-http-request :crowberto :post 200 "permissions/group" {:name "Explicit Regular Group" :is_tenant_group false})
        (let [group (t2/select-one :model/PermissionsGroup :name "Explicit Regular Group")]
          (is (some? group))
          (is (false? (:is_tenant_group group))))))

    (testing "creates regular group when is_tenant_group is nil"
      (mt/with-model-cleanup [:model/PermissionsGroup]
        (mt/user-http-request :crowberto :post 200 "permissions/group" {:name "Nil Tenant Group" :is_tenant_group nil})
        (let [group (t2/select-one :model/PermissionsGroup :name "Nil Tenant Group")]
          (is (some? group))
          (is (false? (:is_tenant_group group))))))))

(deftest create-group-test-enterprise-features
  (testing "POST /permissions/group enterprise feature enforcement"
    (testing "throws ee-feature-error when trying to create tenant group without tenants feature"
      (mt/with-premium-features #{}
        (is (=? {:message "Tenants is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"}
                (mt/user-http-request :crowberto :post 402 "permissions/group" {:name "Tenant Group" :is_tenant_group true})))))))

(deftest delete-group-test
  (testing "DELETE /permissions/group/:id"
    (testing "happy path"
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Test group"}]
        (mt/user-http-request :crowberto :delete 204 (format "permissions/group/%d" group-id))
        (is (= 0 (t2/count :model/PermissionsGroup :name "Test group")))))

    (testing "requires superuser"
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Test group"}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :delete 403 (format "permissions/group/%d" group-id))))))))

(deftest create-group-audit-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-model-cleanup [:model/PermissionsGroup]
      (let [initial-audit-count (t2/count :model/AuditLog)]
        (testing "permissions group create is audited"
          (let [{group-id :id} (mt/user-http-request :crowberto :post 200 "permissions/group" {:name "Test Group"})]
            (is (= (inc initial-audit-count) (t2/count :model/AuditLog)))
            (let [audit-entry (t2/select-one :model/AuditLog
                                             :topic "group-create"
                                             :model_id group-id
                                             {:order-by [[:id :desc]]})]
              (is (some? audit-entry))
              (is (= "PermissionsGroup" (:model audit-entry)))
              (is (= group-id (:model_id audit-entry)))
              (is (= "Test Group" (get-in audit-entry [:details :name]))))))))))

(deftest delete-group-audit-test
  (mt/with-premium-features #{:audit-app}
    (testing "permissions group delete is audited"
      (let [{group-id :id} (t2/insert-returning-instance! :model/PermissionsGroup {:name "Delete Me"})
            before-delete-count (t2/count :model/AuditLog)]
        (mt/user-http-request :crowberto :delete 204 (format "permissions/group/%d" group-id))
        (is (= (inc before-delete-count) (t2/count :model/AuditLog)))
        (let [audit-entry (t2/select-one :model/AuditLog
                                         :topic "group-delete"
                                         :model_id group-id
                                         {:order-by [[:id :desc]]})]
          (is (some? audit-entry))
          (is (= "PermissionsGroup" (:model audit-entry)))
          (is (= group-id (:model_id audit-entry)))
          (is (= "Delete Me" (get-in audit-entry [:details :name]))))))))

(deftest update-group-audit-test
  (mt/with-premium-features #{:audit-app}
    (testing "permissions group update is audited"
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Test Group"}]
        (let [before-update-count (t2/count :model/AuditLog)]
          (mt/user-http-request :crowberto :put 200 (format "permissions/group/%d" group-id) {:name "Updated Group"})
          (is (= (inc before-update-count) (t2/count :model/AuditLog)))
          (let [audit-entry (t2/select-one :model/AuditLog
                                           :topic "group-update"
                                           :model_id group-id
                                           {:order-by [[:id :desc]]})]
            (is (some? audit-entry))
            (is (= "PermissionsGroup" (:model audit-entry)))
            (is (= group-id (:model_id audit-entry)))
            (is (= "Updated Group" (get-in audit-entry [:details :new :name])))
            (is (= "Test Group" (get-in audit-entry [:details :previous :name])))))))))

(deftest fetch-perms-graph-test
  (testing "GET /api/permissions/graph"
    (testing "make sure we can fetch the perms graph from the API"
      (mt/with-temp [:model/Database {db-id :id}]
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
      (mt/with-temp [:model/PermissionsGroup {group-id :id :as group}    {}
                     :model/Database         db                          {}]
        (data-perms/set-database-permission! group db :perms/view-data :unrestricted)
        (let [graph (mt/user-http-request :crowberto :get 200 (format "permissions/graph/group/%s" group-id))]
          (is (mr/validate nat-int? (:revision graph)))
          (is (perm-test-util/validate-graph-api-groups (:groups graph)))
          (is (= #{group-id} (set (keys (:groups graph))))))))))

(deftest fetch-perms-graph-by-db-id-test
  (testing "GET /api/permissions/graph"
    (testing "make sure we can fetch the perms graph from the API"
      (mt/with-temp [:model/PermissionsGroup group       {}
                     :model/Database         {db-id :id} {}]
        (data-perms/set-database-permission! group db-id :perms/view-data :unrestricted)
        (let [graph (mt/user-http-request :crowberto :get 200 (format "permissions/graph/db/%s" db-id))]
          (is (mr/validate nat-int? (:revision graph)))
          (is (perm-test-util/validate-graph-api-groups (:groups graph)))
          (is (= #{db-id} (->> graph :groups vals (mapcat keys) set))))))))

(deftest update-perms-graph-test
  (testing "PUT /api/permissions/graph"
    (testing "make sure we can update the perms graph from the API"
      (mt/with-temp [:model/PermissionsGroup group]
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
        (mt/with-temp [:model/PermissionsGroup group]
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
      (mt/with-temp [:model/PermissionsGroup group       {}
                     :model/Database         {db-id :id} {}
                     :model/Table            _           {:db_id db-id}]
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
      (mt/with-temp [:model/PermissionsGroup group       {}
                     :model/Database         {db-id :id} {}]
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

(deftest update-perms-graph-with-skip-graph-test
  (testing "PUT /api/permissions/graph"
    (testing "permissions graph is not returned when skip-graph"
      (mt/with-temp [:model/PermissionsGroup group       {}
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
            (is (mr/validate [:map [:revision pos-int?]] returned-g)))

          (testing "return-g-two"
            (is (perm-test-util/validate-graph-api-groups (:groups returned-g-two)))
            (is (mr/validate [:map [:revision pos-int?]] returned-g-two)))

          (testing "no returned g"
            (is (not (perm-test-util/validate-graph-api-groups (:groups no-returned-g))))
            (is (mr/validate [:map {:closed true}
                              [:revision pos-int?]] no-returned-g))))))))

(deftest update-perms-graph-force-test
  (testing "PUT /api/permissions/graph"
    (testing "permissions graph does not check revision number when force=true"
      (let [do-perm-put    (fn [url status] (mt/user-http-request
                                             :crowberto :put status url
                                             (-> (data-perms.graph/api-graph)
                                                 (update :revision dec))))]
        (is (= (str "Looks like someone else edited the permissions and your data is out of date. "
                    "Please fetch new data and try again.")
               (do-perm-put "permissions/graph?force=false" 409)))

        (do-perm-put "permissions/graph?force=true" 200)))))

(deftest can-revoke-permsissions-via-graph-test
  (testing "PUT /api/permissions/graph"
    (let [table-id (mt/id :venues)]
      (mt/with-temp [:model/PermissionsGroup group]
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
        (mt/assert-has-premium-feature-error "Sandboxes" (mt/user-http-request :crowberto :put 402 "permissions/graph"
                                                                               (assoc (data-perms.graph/api-graph) :sandboxes [{:card_id 1}])))))))

(deftest update-perms-graph-blocked-view-data-test
  (testing "PUT /api/permissions/graph"
    (testing "setting view-data to blocked automatically sets download-results to no, even if requested otherwise"
      (mt/with-temp [:model/PermissionsGroup group       {}
                     :model/Database         {db-id :id}  {}
                     :model/Table            {table-id :id} {:db_id db-id, :schema "PUBLIC"}]
        (mt/with-no-data-perms-for-all-users!
          (perms/add-user-to-group! (mt/user->id :rasta) group)
          ;; First set both permissions to unrestricted/full
          (mt/user-http-request
           :crowberto :put 200 "permissions/graph"
           (-> (data-perms.graph/api-graph)
               (assoc-in [:groups (u/the-id group) db-id :view-data]
                         {"PUBLIC" {table-id :unrestricted}})
               (assoc-in [:groups (u/the-id group) db-id :download :schemas]
                         {"PUBLIC" {table-id :full}})))

          ;; Verify initial state
          (is (= :unrestricted
                 (data-perms/table-permission-for-user (mt/user->id :rasta)
                                                       :perms/view-data
                                                       db-id
                                                       table-id)))
          (is (= :one-million-rows
                 (data-perms/table-permission-for-user (mt/user->id :rasta)
                                                       :perms/download-results
                                                       db-id
                                                       table-id)))
          ;; Now try to set view-data to blocked while keeping download-results as full
          (mt/user-http-request
           :crowberto :put 200 "permissions/graph"
           (-> (data-perms.graph/api-graph)
               (assoc-in [:groups (u/the-id group) db-id :view-data]
                         {"PUBLIC" {table-id :blocked}})
               (assoc-in [:groups (u/the-id group) db-id :download :schemas]
                         {"PUBLIC" {table-id :full}})))

          ;; Verify that download-results was automatically set to no
          (is (= :blocked
                 (data-perms/table-permission-for-user (mt/user->id :rasta)
                                                       :perms/view-data
                                                       db-id
                                                       table-id)))
          (is (= :no
                 (data-perms/table-permission-for-user (mt/user->id :rasta)
                                                       :perms/download-results
                                                       db-id
                                                       table-id))))))))

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
    (mt/with-temp [:model/User             user  {}
                   :model/PermissionsGroup group {}]
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
    (mt/with-temp [:model/User                       user     {}
                   :model/PermissionsGroup           group    {}
                   :model/PermissionsGroupMembership {id :id} {:group_id (:id group)
                                                               :user_id  (:id user)}]
      (testing "This API is for EE only"
        (mt/with-premium-features #{}
          (is (= "The group manager permissions functionality is only enabled if you have a premium token with the advanced-permissions feature."
                 (mt/user-http-request :crowberto :put 402 (format "permissions/membership/%d" id) {:is_group_manager false}))))))))

(deftest clear-group-membership-test
  (testing "PUT /api/permissions/membership/:group-id/clear"
    (mt/with-temp [:model/User                       {user-id :id}  {}
                   :model/PermissionsGroup           {group-id :id} {}
                   :model/PermissionsGroupMembership _              {:group_id group-id
                                                                     :user_id  user-id}]
      (testing "requires superuser permisisons"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 (format "permissions/membership/%d/clear" group-id)))))

      (testing "Membership of a group can be cleared succesfully, while preserving the group itself"
        (is (= 1 (t2/count :model/PermissionsGroupMembership :group_id group-id)))
        (mt/user-http-request :crowberto :put 204 (format "permissions/membership/%d/clear" group-id))
        (is (true? (t2/exists? :model/PermissionsGroup :id group-id)))
        (is (= 0 (t2/count :model/PermissionsGroupMembership :group_id group-id))))

      (testing "The admin group cannot be cleared using this endpoint"
        (mt/user-http-request :crowberto :put 400 (format "permissions/membership/%d/clear" (u/the-id (perms-group/admin))))))))

(deftest delete-group-membership-test
  (testing "DELETE /api/permissions/membership/:id"
    (mt/with-temp [:model/User                       user     {}
                   :model/PermissionsGroup           group    {}
                   :model/PermissionsGroupMembership {id :id} {:group_id (:id group)
                                                               :user_id  (:id user)}]
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :delete 403 (format "permissions/membership/%d" id)))))

      (testing "Delete membership successfully"
        (mt/user-http-request :crowberto :delete 204 (format "permissions/membership/%d" id))))))

(deftest enabling-tenants-changes-groups
  (let [get-magic-group (fn [group-type]
                          (->>
                           (mt/user-http-request :crowberto :get 200 "/permissions/group")
                           (filter #(= group-type (:magic_group_type %)))
                           first))]
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants false]
        (testing "When disabled, 'All Users' is 'All Users'"
          (is (=? {:magic_group_type "all-internal-users"
                   :name "All Users"}
                  (get-magic-group "all-internal-users"))))
        (testing "When disabled, 'All tenant users' is not visible"
          (is (nil? (get-magic-group "all-external-users")))))
      (mt/with-temporary-setting-values [use-tenants true]
        (testing "When enabled, 'All Users' is 'All internal users'"
          (is (=? {:magic_group_type "all-internal-users"
                   :name "All internal users"}
                  (get-magic-group "all-internal-users"))))
        (testing "When enabled, 'All tenant users' is visible"
          (is (=? {:magic_group_type "all-external-users"
                   :name "All tenant users"}
                  (get-magic-group "all-external-users"))))))))
