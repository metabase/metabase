(ns metabase-enterprise.data-apps.group-access
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.resources :as resources]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

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
  (let [group-ids (vec (distinct group-ids))]
    (perms/with-global-permissions-lock
      (t2/with-transaction [_conn]
        (let [assigned (into #{} (map :permission_group_id) (data-apps.db/app-assignments [(:id app)]))]
          (api/check-400 (not-any? assigned group-ids) (tru "One or more groups already have access to this data app.")))
        (data-apps.db/insert-assignments! (:id app) group-ids)
        (resources/reconcile-existing-collection-permissions! app))))
  (assigned-groups app))

(defn remove-group!
  "Remove an assignment and its collection grants in one transaction."
  [app group-id]
  (perms/with-global-permissions-lock
    (t2/with-transaction [_conn]
      (api/check-404 (pos? (data-apps.db/delete-assignments! (:id app) [group-id])))
      (when-not (= group-id (:id (perms/admin-group)))
        (when-let [collection (some-> (:id app) data-apps.db/data-app :resource_collection_id
                                      data-apps.db/resource-collection)]
          (perms/revoke-collection-permissions! group-id collection)))))
  nil)

(defn- group-has-table-access?
  [{:keys [permissions]} group-id {table-id :id database-id :database_id}]
  (some (fn [{permission-table-id :table_id value :perm_value}]
          (and (or (nil? permission-table-id) (= permission-table-id table-id))
               (= value :unrestricted)))
        (get permissions [group-id database-id :perms/view-data])))

(defn- group-table-access
  [group-ids tables]
  (let [table-ids    (mapv :id tables)
        database-ids (into #{} (map :database_id) tables)]
    (when (seq tables)
      {:permissions (group-by (juxt :group_id :db_id :perm_type)
                              (data-apps.db/permissions-for-warnings group-ids database-ids table-ids))})))

(defn- table-details
  [table-ids]
  (->> (t2/hydrate (data-apps.db/active-tables (set table-ids)) :db)
       (map (fn [{:keys [id schema db] table-name :display_name database-id :db_id}]
              {:id id
               :name table-name
               :schema schema
               :database_id database-id
               :database_name (:name db)}))
       (sort-by (juxt :database_name :schema :name))
       vec))

(defn permission-warnings
  "Missing table access for assigned groups, including access inherited from All Users."
  [{app-id :id table-ids :table_ids}]
  (let [assigned-ids (mapv :permission_group_id (data-apps.db/app-assignments [app-id]))]
    (if (and (seq assigned-ids) (seq table-ids))
      (let [tables       (table-details table-ids)
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
