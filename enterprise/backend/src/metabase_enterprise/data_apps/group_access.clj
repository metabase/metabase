(ns metabase-enterprise.data-apps.group-access
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.resources :as resources]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn- check-groups
  "Reject missing groups, administrator groups, and tenant groups before any mutation."
  [group-ids]
  (api/check-400 (= (count group-ids) (count (distinct group-ids)))
                 (tru "Group IDs must be distinct."))
  (let [group-tenant-flags (perms/group-tenant-flags (set group-ids))
        admin-group-id   (:id (perms/admin-group))]
    (api/check-404 (= (count group-tenant-flags) (count group-ids)))
    (api/check-400 (every? (fn [[group-id tenant?]]
                             (and (not tenant?) (not= group-id admin-group-id)))
                           group-tenant-flags)
                   (tru "Only internal groups other than Administrators can be assigned to data apps."))))

(defn assigned-groups
  "Assigned groups with their current member counts."
  [app]
  (let [using-tenants? (setting/get :use-tenants)]
    (mapv (fn [group]
            (assoc group :name (perms/group-display-name group using-tenants?)))
          (t2/hydrate (data-apps.db/assigned-groups (:id app)) :member_count))))

(defn add-groups!
  "Assign all groups and update collection grants in one transaction."
  [app group-ids]
  (perms/with-global-permissions-lock
    (t2/with-transaction [_conn]
      (check-groups group-ids)
      (let [assigned (into #{} (map :permission_group_id) (data-apps.db/app-assignments [(:id app)]))]
        (api/check-400 (not-any? assigned group-ids) (tru "One or more groups already have access to this data app.")))
      (data-apps.db/insert-assignments! (:id app) group-ids)
      (resources/ensure-resources! app)))
  (assigned-groups app))

(defn remove-group!
  "Remove an assignment and its collection grants in one transaction."
  [app group-id]
  (perms/with-global-permissions-lock
    (t2/with-transaction [_conn]
      (api/check-404 (pos? (data-apps.db/delete-assignment! (:id app) group-id)))
      (when-not (= group-id (:id (perms/admin-group)))
        (when-let [collection (some-> (:id app) data-apps.db/non-blob-data-app :resource_collection_id
                                      data-apps.db/resource-collection)]
          (perms/revoke-collection-permissions! group-id collection)))))
  nil)

(defn- group-has-table-access?
  [{:keys [permissions sandboxes impersonations]} group-id {table-id :id database-id :database_id}]
  (or (contains? sandboxes [group-id table-id])
      (contains? impersonations [group-id database-id])
      (some (fn [{permission-table-id :table_id value :perm_value}]
              (and (or (nil? permission-table-id) (= permission-table-id table-id))
                   (= value :unrestricted)))
            (get permissions [group-id database-id :perms/view-data]))))

(defn- group-table-access
  [group-ids tables]
  (let [table-ids    (mapv :id tables)
        database-ids (into #{} (map :database_id) tables)]
    (when (seq tables)
      {:permissions   (perms/index-database-permissions (vec group-ids) (vec database-ids))
       :sandboxes      (into #{} (map (juxt :group_id :table_id))
                             (data-apps.db/group-sandboxes group-ids table-ids))
       :impersonations (into #{} (map (juxt :group_id :db_id))
                             (data-apps.db/group-impersonations group-ids database-ids))})))

(defn permission-warnings
  "Missing table access for assigned groups, including access inherited from All Users."
  [{app-id :id table-ids :table_ids}]
  (let [assigned-ids (mapv :permission_group_id (data-apps.db/app-assignments [app-id]))]
    (if (and (seq assigned-ids) (seq table-ids))
      (let [tables       (data-apps.db/table-details table-ids)
            all-users-id (:id (perms/all-users-group))
            access       (group-table-access (conj (set assigned-ids) all-users-id) tables)]
        (into []
              (keep (fn [group-id]
                      (let [missing (filterv #(not (or (group-has-table-access? access group-id %)
                                                       (group-has-table-access? access all-users-id %)))
                                             tables)]
                        (when (seq missing)
                          {:group_id group-id :missing_tables missing}))))
              assigned-ids))
      [])))
