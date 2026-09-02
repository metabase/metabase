(ns metabase-enterprise.data-apps.resources-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.resources :as data-app.resources]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.sso.core :as sso]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- create-data-app!
  [name]
  (t2/insert-returning-instance! :model/DataApp
                                 {:name name
                                  :display_name name
                                  :bundle_path (format "data_apps/%s/index.js" name)}))

(deftest ensure-resources-restores-a-collection-trashed-through-an-ancestor-test
  (testing "an app collection filed under another collection is archived indirectly when that
            ancestor is trashed, and the ancestor stays there — so it is restored to the root
            rather than to a parent that would reject it"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (mt/with-test-user :crowberto
        (mt/with-temp [:model/Collection {ancestor-id :id} {:name "Filed under" :location "/"}]
          (let [app (create-data-app! "wrens")
                {:keys [resource_collection_id]} (data-app.resources/ensure-resources! app)]
            (collection/move-collection!
             (t2/select-one :model/Collection :id resource_collection_id)
             (collection/children-location (t2/select-one :model/Collection :id ancestor-id)))
            (collection/archive-or-unarchive-collection!
             (t2/select-one :model/Collection :id ancestor-id)
             {:archived true})
            (is (true? (t2/select-one-fn :archived :model/Collection :id resource_collection_id))
                "precondition: the ancestor took the app collection with it")
            (data-app.resources/ensure-resources! (t2/select-one :model/DataApp :id (:id app)))
            (is (false? (t2/select-one-fn :archived :model/Collection :id resource_collection_id))
                "the app collection is usable again")
            (is (= "/" (t2/select-one-fn :location :model/Collection :id resource_collection_id))
                "and sits at the root, not under the ancestor still in the trash")
            (is (true? (t2/select-one-fn :archived :model/Collection :id ancestor-id))
                "the ancestor is left where the admin put it")))))))

(deftest ensure-resources-restores-a-trashed-collection-test
  (testing "trashing the resource collection archives the copies the app is served from,
            so ensure-resources! has to bring both back or a successful sync leaves the app blank"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (let [app (create-data-app! "sparrows")
            {:keys [resource_collection_id]} (data-app.resources/ensure-resources! app)]
        ;; The app collection is readable by its own group alone, so only an admin
        ;; can put the copy there.
        (mt/with-test-user :crowberto
          (mt/with-temp [:model/Card {card-id :id} {:collection_id resource_collection_id}]
            (collection/archive-or-unarchive-collection!
             (t2/select-one :model/Collection :id resource_collection_id)
             {:archived true})
            (is (true? (t2/select-one-fn :archived :model/Collection :id resource_collection_id))
                "precondition: the collection is in the trash")
            (is (true? (t2/select-one-fn :archived :model/Card :id card-id))
                "precondition: trashing the collection archived the copy")
            (data-app.resources/ensure-resources! (t2/select-one :model/DataApp :id (:id app)))
            (is (false? (t2/select-one-fn :archived :model/Collection :id resource_collection_id))
                "the app collection is out of the trash")
            (is (false? (t2/select-one-fn :archived :model/Card :id card-id))
                "the copy the app serves is readable again")))))))

(deftest ensure-resources-blocks-the-app-groups-view-data-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [app (create-data-app! "birds")
          {:keys [permission_group_id]} (data-app.resources/ensure-resources! app)
          perm (fn [perm-type] (t2/select [:model/DataPermissions :table_id :perm_value]
                                          :group_id permission_group_id
                                          :db_id (mt/id)
                                          :perm_type perm-type))]
      (testing "the app group is flagged as a data-app group (its own namespace)"
        (is (true? (t2/select-one-fn :is_data_app_group :model/PermissionsGroup :id permission_group_id))))
      (testing "the app group is blocked at the database level, granting no data access of its own"
        (is (=? [{:table_id nil, :perm_value :blocked}] (perm :perms/view-data)))
        (testing "view-data :blocked cascades download-results/transforms to :no"
          (is (=? [{:table_id nil, :perm_value :no}] (perm :perms/download-results)))
          (is (=? [{:table_id nil, :perm_value :no}] (perm :perms/transforms)))))
      (testing "a manual table-level view-data grant is swept back to the database-wide block on the next sync"
        (perms/set-table-permissions! permission_group_id :perms/view-data
                                      {(mt/id :venues) :unrestricted})
        (data-app.resources/ensure-resources! app)
        (is (=? [{:table_id nil, :perm_value :blocked}] (perm :perms/view-data))))
      (testing "a manual download-results grant that left view-data blocked is swept back too"
        (perms/set-database-permission! permission_group_id (mt/id) :perms/download-results :one-million-rows)
        (data-app.resources/ensure-resources! app)
        (is (=? [{:table_id nil, :perm_value :no}] (perm :perms/download-results)))
        (is (=? [{:table_id nil, :perm_value :blocked}] (perm :perms/view-data)))))))

(deftest data-app-groups-in-the-groups-api-test
  (testing "GET /api/permissions/group hides data-app groups by default (permission-config screens);
            include_app_groups shows them for the People/Groups admin and flags the stale ones"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (mt/with-temp [:model/PermissionsGroup {normal-group-id :id} {:name "Normal Group"}]
        (let [app     (create-data-app! "some-app")
              {app-group-id :permission_group_id} (data-app.resources/ensure-resources! app)
              group   (fn [url id] (some #(when (= id (:id %)) %)
                                         (mt/user-http-request :crowberto :get 200 url)))
              default #(group "permissions/group" %)
              admin   #(group "permissions/group?include-app-groups=true" %)]
          (testing "a normal group is listed in both views"
            (is (some? (default normal-group-id)))
            (is (some? (admin normal-group-id))))
          (testing "an active data-app group is hidden by default, shown (not stale) with include_app_groups"
            (is (nil? (default app-group-id)))
            (is (=? {:id app-group-id, :is_data_app_group true, :is_stale_data_app_group false}
                    (admin app-group-id))))
          (testing "when the app is gone but its group remains, it is marked stale (still hidden by default)"
            ;; Raw-delete the data_app row so its group survives — a stale group.
            (t2/delete! :data_app :id (:id app))
            (is (nil? (default app-group-id)))
            (is (=? {:id app-group-id, :is_data_app_group true, :is_stale_data_app_group true}
                    (admin app-group-id)))))))))

(deftest stale-data-app-group-can-be-deleted-test
  (testing "a stale data-app group (flagged, no app) is removable through the standard endpoint, so an
            admin can clean it up from the groups page"
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Data App: orphaned" :is_data_app_group true}]
      (mt/user-http-request :crowberto :delete 204 (format "permissions/group/%d" group-id))
      (is (not (t2/exists? :model/PermissionsGroup :id group-id))))))

(deftest sso-group-sync-does-not-add-a-user-to-a-data-app-group-test
  (testing "a data app's permission group is server-managed: membership is granted by an admin, not
            an IdP claim. SSO group sync must not add a user to it, or an IdP `groups` value naming
            \"Data App: <slug>\" would hand the app's collection to whoever it names."
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (mt/with-temp [:model/User {user-id :id} {}]
        (let [app (create-data-app! "birds")
              {:keys [permission_group_id]} (data-app.resources/ensure-resources! app)]
          ;; As a name-based SSO sync would, ask to put the user in the data-app group.
          (sso/sync-group-memberships! user-id [permission_group_id])
          (is (not (t2/exists? :model/PermissionsGroupMembership
                               :user_id user-id :group_id permission_group_id))
              "SSO group sync must not add a user to a data-app group"))))))
