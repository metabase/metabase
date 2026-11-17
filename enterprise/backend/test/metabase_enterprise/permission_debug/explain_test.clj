(ns metabase-enterprise.permission-debug.explain-test
  "`GET /api/ee/permission_debug/preview/*`: a user's, group's or tenant's effective access, each value with every
  group's own and the group that applies, and no rows."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.permission-debug.preview :as permission-debug.preview]
   [metabase-enterprise.test :as met]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- preview
  [path principal-type principal-id & params]
  (apply mt/user-http-request :crowberto :get 200 (str "ee/permission_debug/preview/" path)
         :principal-type principal-type
         :principal-id principal-id
         params))

(defn- table-entry
  [response table-key]
  (some #(when (= (mt/id table-key) (:id %)) %)
        (mapcat :tables (:databases response))))

(defn- group-values
  "Each group's own value of a cell, by group name."
  [cell]
  (into {} (map (juxt :name :value)) (:groups cell)))

(defn- applies
  "The name of the group a cell's value comes from."
  [cell]
  (some #(when (= (:group_id cell) (:group_id %)) (:name %)) (:groups cell)))

(deftest group-member-count-test
  (testing "A group's member count comes back as a number, for the frontend to pluralize"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-temp [:model/PermissionsGroup {one-id :id}   {}
                     :model/PermissionsGroup {seven-id :id} {}
                     :model/User             {user-4 :id}   {}
                     :model/User             {user-5 :id}   {}
                     :model/User             {user-6 :id}   {}
                     :model/User             {user-7 :id}   {}]
        (perms/add-user-to-group! (mt/user->id :rasta) one-id)
        (doseq [user-id (concat (map mt/user->id [:rasta :lucky :crowberto]) [user-4 user-5 user-6 user-7])]
          (perms/add-user-to-group! user-id seven-id))
        (is (= 1 (get-in (preview "data" "group" one-id) [:principal :member_count])))
        (is (= 7 (get-in (preview "data" "group" seven-id) [:principal :member_count])))))))

(deftest principals-user-group-ids-test
  (testing "Each user in the picker lists their groups, so a group's members can be listed"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}]
        (perms/add-user-to-group! (mt/user->id :rasta) group-id)
        (let [users     (:users (mt/user-http-request :crowberto :get 200 "ee/permission_debug/preview/principals"))
              group-ids (fn [user-key]
                          (some #(when (= (mt/user->id user-key) (:id %)) (set (:group_ids %))) users))]
          (is (contains? (group-ids :rasta) group-id))
          (is (contains? (group-ids :rasta) (:id (perms/all-users-group))))
          (is (not (contains? (group-ids :lucky) group-id))))))))

(deftest data-sandboxed-and-blocked-tables-test
  (met/with-gtaps! {:gtaps      {:venues {:remappings {:cat ["variable" [:field (mt/id :venues :category_id) nil]]}}}
                    :attributes {"cat" 50}}
    (mt/with-additional-premium-features #{:advanced-permissions}
      (perms/set-table-permission! &group (mt/id :users) :perms/view-data :blocked)
      (let [group-name (:name &group)
            response   (preview "data" "user" (mt/user->id :rasta))]
        (testing "the principal carries the user's groups and attributes"
          (is (=? {:type "user" :id (mt/user->id :rasta) :superuser false :tenant_side false :attributes {:cat "50"}}
                  (:principal response))))
        (testing "a sandboxed table shows row and column security from the sandbox's group, with the attribute value"
          (let [{:keys [view_data security]} (table-entry response :venues)]
            (is (= "sandboxed" (:value view_data)))
            (is (= group-name (applies view_data)))
            (is (= {"All Users" "blocked" group-name "sandboxed"} (group-values view_data)))
            (is (= {:kind          "sandbox"
                    :group_id      (u/the-id &group)
                    :group_name    group-name
                    :database_name (:name (mt/db))
                    :table_name    "Venues"
                    :rows          nil
                    :filters       [{:attribute "cat" :value "50" :each_member false :column "Venues.Category ID"}]
                    :columns       "All columns."}
                   security))))
        (testing "a table blocked in every group is blocked, with every group's value"
          (let [{:keys [view_data security]} (table-entry response :users)]
            (is (= "blocked" (:value view_data)))
            (is (= {"All Users" "blocked" group-name "blocked"} (group-values view_data)))
            (is (nil? security))))
        (testing "a table the group grants unrestricted is visible through that group"
          (is (= "unrestricted" (:value (:view_data (table-entry response :checkins))))))
        (testing "database-level permissions come with each group's value"
          (is (=? {:manage_database {:value "no" :groups [{:value "no"} {:value "no"}]}
                   :transforms      {:value "no"}}
                  (first (:databases response)))))
        (testing "a group previews any member: the sandbox names each member's own attribute value"
          (let [security (:security (table-entry (preview "data" "group" (u/the-id &group)) :venues))]
            (is (nil? (:rows security)))
            (is (= [{:attribute "cat" :value nil :each_member true :column "Venues.Category ID"}]
                   (:filters security)))))))))

(deftest data-with-preview-attribute-values-test
  (met/with-gtaps! {:gtaps      {:venues {:remappings {:cat ["variable" [:field (mt/id :venues :category_id) nil]]}}}
                    :attributes {"cat" 50}}
    (mt/with-additional-premium-features #{:advanced-permissions}
      (let [admin-id (mt/user->id :crowberto)
            rasta-id (mt/user->id :rasta)
            cat-of   (fn [& params]
                       (-> (apply preview "data" "user" rasta-id params)
                           (table-entry :venues)
                           :security :filters first :value))]
        (permission-debug.preview/set-attribute-overrides! admin-id rasta-id "preview-1" {"cat" "40"})
        (try
          (testing "the values the admin picked for the preview, in place of the user's own"
            (is (= "40" (cat-of :preview-id "preview-1"))))
          (testing "the user's own values for another preview, or with none"
            (is (= "50" (cat-of :preview-id "another-preview")))
            (is (= "50" (cat-of))))
          (finally
            (permission-debug.preview/clear-attribute-overrides! admin-id rasta-id "preview-1")))))))

(deftest data-sandbox-overridden-by-another-group-test
  (met/with-gtaps! {:gtaps {:venues {:remappings {:cat ["variable" [:field (mt/id :venues :category_id) nil]]}}}}
    (mt/with-additional-premium-features #{:advanced-permissions}
      (mt/with-temp [:model/PermissionsGroup {unrestricted-id :id} {:name "Unrestricted group"}
                     :model/PermissionsGroupMembership _ {:group_id unrestricted-id :user_id (mt/user->id :rasta)}]
        (perms/set-database-permission! unrestricted-id (mt/id) :perms/view-data :unrestricted)
        (testing "a sandbox doesn't apply when another group grants unrestricted access, matching the query processor"
          (let [{:keys [view_data security]} (table-entry (preview "data" "user" (mt/user->id :rasta)) :venues)]
            (is (= "unrestricted" (:value view_data)))
            (is (= "Unrestricted group" (applies view_data)))
            (is (= (str "Row and column security from " (:name &group)
                        " doesn't apply, because another group has Can view.")
                   (:note view_data)))
            (is (nil? security))))))))

(deftest data-admin-analyst-and-permissions-test
  (mt/with-premium-features #{:advanced-permissions}
    (testing "an admin gets the top value of every permission, from Administrators"
      (let [table (table-entry (preview "data" "user" (mt/user->id :crowberto)) :venues)]
        (is (= ["unrestricted" "query-builder-and-native" "one-million-rows" "yes"]
               (map (comp :value table) [:view_data :create_queries :download_results :manage_table_metadata])))
        (is (= "Administrators" (applies (:view_data table))))))
    (testing "the Data Analysts group manages every table's metadata, whatever its grants say"
      (let [{:keys [manage_table_metadata]} (table-entry (preview "data" "group" (:id (perms/data-analyst-group))) :venues)]
        (is (= "yes" (:value manage_table_metadata)))
        (is (= "Data analysts can manage every table's metadata." (:note manage_table_metadata)))))
    (testing "previewing All Users itself works: the group and the magic group are the same"
      (is (= ["All Users"] (map :name (:groups (:principal (preview "data" "group" (:id (perms/all-users-group)))))))))
    (testing "a non-admin can't preview anyone's access"
      (mt/user-http-request :rasta :get 403 "ee/permission_debug/preview/data"
                            :principal-type "user" :principal-id (mt/user->id :lucky)))))

(deftest table-access-by-user-test
  (met/with-gtaps! {:gtaps      {:venues {:remappings {:cat ["variable" [:field (mt/id :venues :category_id) nil]]}}}
                    :attributes {"cat" 50}}
    (mt/with-additional-premium-features #{:advanced-permissions}
      (let [response (mt/user-http-request :crowberto :get 200
                                           (str "ee/permission_debug/preview/table/" (mt/id :venues)))
            by-user  (into {} (map (juxt (comp :id :principal) :access)) (:users response))]
        (testing "the table, and every active user's access to it"
          (is (=? {:id (mt/id :venues) :db_id (mt/id)} (:table response)))
          (is (= "sandboxed" (get-in by-user [(mt/user->id :rasta) :view_data :value])))
          (is (= "unrestricted" (get-in by-user [(mt/user->id :crowberto) :view_data :value]))))))))

(deftest collections-test
  (mt/with-premium-features #{:advanced-permissions}
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Collection group"}
                   :model/PermissionsGroupMembership _ {:group_id group-id :user_id (mt/user->id :rasta)}
                   :model/Collection {parent-id :id} {:name "Preview parent"}
                   :model/Collection {child-id :id} {:name "Preview child" :location (str "/" parent-id "/")}]
      (perms/revoke-collection-permissions! (perms/all-users-group) parent-id)
      (perms/revoke-collection-permissions! (perms/all-users-group) child-id)
      (perms/grant-collection-readwrite-permissions! group-id parent-id)
      (perms/grant-collection-read-permissions! group-id child-id)
      (let [response    (preview "collections" "user" (mt/user->id :rasta) :namespace "default")
            collections (:collections response)
            by-id       (into {} (map (juxt :id identity)) collections)]
        (testing "the main collections apply to an internal user"
          (is (true? (:applies response))))
        (testing "each collection carries its own grants, nested under its parent: there's no inheritance at runtime"
          (is (=? {:name "Preview parent" :source "group" :access {:value "write"}} (by-id parent-id)))
          (is (= "Collection group" (applies (:access (by-id parent-id)))))
          (is (= {"All Users" "none" "Collection group" "read"} (group-values (:access (by-id child-id)))))
          (is (= (inc (:depth (by-id parent-id))) (:depth (by-id child-id)))))
        (testing "the user's personal collection is curated by them, not through a group"
          (is (=? {:source "personal" :access {:value "write" :groups []}}
                  (some #(when (= "personal" (:source %)) %) collections))))))))

(deftest tenant-collections-and-application-test
  (mt/with-premium-features #{:advanced-permissions :tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-temp [:model/Tenant {own-tenant-id :id own-collection-id :tenant_collection_id} {:name "Own tenant" :slug "own"}
                     :model/Tenant {other-collection-id :tenant_collection_id} {:name "Other tenant" :slug "other"}
                     :model/User {tenant-user-id :id} {:tenant_id own-tenant-id}]
        (doseq [[principal-type principal-id] [["tenant" own-tenant-id] ["user" tenant-user-id]]]
          (testing (str "a " principal-type " on the tenant side")
            (testing "gets Curate on its own tenant's collection from membership, and No access on another's"
              (let [by-id (into {} (map (juxt :id identity))
                                (:collections (preview "collections" principal-type principal-id :namespace "tenant")))]
                (is (=? {:source "tenant" :access {:value "write" :groups []}} (by-id own-collection-id)))
                (is (=? {:source "other-tenant" :access {:value "none"}} (by-id other-collection-id)))))
            (testing "doesn't get the main collections or application permissions, with the reason"
              (is (=? {:applies false :reason string? :collections []}
                      (preview "collections" principal-type principal-id :namespace "default")))
              (is (=? {:applies false :reason string? :permissions []}
                      (preview "application" principal-type principal-id))))))))))

(deftest application-test
  (mt/with-premium-features #{:advanced-permissions}
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Monitoring group"}
                   :model/PermissionsGroupMembership _ {:group_id group-id :user_id (mt/user->id :rasta)}]
      (perms/grant-application-permissions! group-id :monitoring)
      (let [by-key (into {} (map (juxt :key :access))
                         (:permissions (preview "application" "user" (mt/user->id :rasta))))]
        (testing "a permission granted to one of the user's groups applies from that group"
          (is (= "yes" (:value (by-key "monitoring"))))
          (is (= "Monitoring group" (applies (by-key "monitoring")))))
        (testing "a permission no group grants is No"
          (is (= "no" (:value (by-key "setting")))))))))
