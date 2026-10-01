(ns metabase-enterprise.data-apps.group-access
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.resources :as resources]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn- check-groups-for-app-assignment
  "Reject missing groups, tenant groups and admin groups. Those cannot be assigned to data apps."
  [group-ids]
  (api/check-400 (= (count group-ids) (count (distinct group-ids)))
                 (tru "Group IDs must be unique."))

  (let [group-tenant-flags (perms/group-tenant-flags (set group-ids))
        admin-group-id   (:id (perms/admin-group))]
    ; every specified groups must exist
    (api/check-404 (= (count group-tenant-flags) (count group-ids)))
    (api/check-400 (every? (fn [[group-id tenant?]]
                             (and (not tenant?) (not= group-id admin-group-id)))
                           group-tenant-flags)
                   (tru "Tenant groups and admins cannot be assigned to data apps."))))

(defn assigned-groups
  "Assigned groups with their member counts."
  [app]
  (let [using-tenants? (setting/get :use-tenants)
        group-ids     (into #{} (map :permission_group_id) (data-apps.db/app-assignments [(:id app)]))]
    (mapv (fn [group]
            (assoc group :name (perms/group-display-name group using-tenants?)))
          (t2/hydrate (perms/groups-by-ids group-ids) :member_count))))

(defn add-groups!
  "Assign groups to app and update app collection grants."
  [app group-ids]
  (perms/with-global-permissions-lock
    (t2/with-transaction [_conn]
      (check-groups-for-app-assignment group-ids)
      (let [assigned (into #{} (map :permission_group_id) (data-apps.db/app-assignments [(:id app)]))]
        (api/check-400 (not-any? assigned group-ids) (tru "One or more groups already have access to this data app.")))
      (data-apps.db/insert-assignments! (:id app) group-ids)
      ; ensure the groups has access to the data app collection
      (resources/ensure-resources! app)))
  (assigned-groups app))

(defn remove-group!
  "Remove an assignment and its collection grants in one transaction."
  [app group-id]
  (perms/with-global-permissions-lock
    (t2/with-transaction [_conn]
      (api/check-404 (pos? (data-apps.db/delete-assignment! (:id app) group-id)))
      (when-not (= group-id (:id (perms/admin-group)))
        (when-let [collection (some-> (:id app) data-apps.db/data-app :resource_collection_id
                                      data-apps.db/resource-collection)]
          (perms/revoke-collection-permissions! group-id collection)))))
  nil)
