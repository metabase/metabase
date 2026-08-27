(ns metabase-enterprise.data-apps.resources
  "Lifecycle for the permission group and resource collection owned by a data app."
  (:require
   [metabase.collections.core :as collection]
   [metabase.permissions.core :as perms]
   [metabase.request.core :as request]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- resource-name [app]
  (format "Data App: %s" (:name app)))

(defn- create-permission-group! [app]
  (let [group (t2/insert-returning-instance! :model/PermissionsGroup
                                             :name (resource-name app))]
    (t2/update! :model/DataApp :id (:id app) {:permission_group_id (:id group)})
    group))

(defn- permission-group! [app]
  (or (some->> (:permission_group_id app)
               (t2/select-one :model/PermissionsGroup :id))
      (create-permission-group! app)))

(defn- database-level-permission?
  "Whether `rows` (one `[group db perm-type]` entry of an [[perms/index-database-permissions]]
   index) is exactly a database-wide permission of `value`, with no table-level rows."
  [rows value]
  (and (= 1 (count rows))
       (let [{:keys [table_id perm_value]} (first rows)]
         (and (nil? table_id)
              (= perm_value value)))))

(defn- restrict-query-creation! [group]
  (let [database-ids (t2/select-pks-set :model/Database :router_database_id nil)
        permissions  (or (perms/index-database-permissions [(:id group)] database-ids) {})]
    (doseq [database-id database-ids
            :let [rows (get permissions [(:id group) database-id :perms/create-queries])]
            :when (not (database-level-permission? rows :no))]
      (perms/set-database-permission! permissions group database-id :perms/create-queries :no))))

(defn- restore-trashed-collection!
  "Bring `collection` back out of the trash, with everything archived alongside it.

   Trashing it archives every copy inside, and an app is served from those copies,
   so a sync that left it there would report success over an app whose viewers see
   nothing. It goes back to the root, where the app created it: restoring in place
   fails outright when an ancestor is still in the trash.

   The restore runs with full permissions because a repository import reaches this
   from a scheduled task, where no user is bound; the collection is the app's own,
   so there is no one else's decision to weigh."
  [collection]
  (when (:archived collection)
    (request/as-admin
      (collection/archive-or-unarchive-collection! collection
                                                   {:archived false, :parent_id nil}))))

(defn- apply-resource-permissions!
  [group collection]
  (restrict-query-creation! group)
  (doseq [permission-group (t2/select :model/PermissionsGroup)
          :when (not= (:id permission-group) (:id (perms/admin-group)))]
    (perms/revoke-collection-permissions! permission-group collection))
  (perms/grant-collection-read-permissions! group collection))

(defn- create-resource-collection! [app]
  (let [collection (t2/insert-returning-instance! :model/Collection
                                                  :name (resource-name app)
                                                  :location "/")]
    (t2/update! :model/DataApp :id (:id app) {:resource_collection_id (:id collection)})
    collection))

(defn- resource-collection! [app]
  (or (some->> (:resource_collection_id app)
               (t2/select-one :model/Collection :id))
      (create-resource-collection! app)))

(defn ensure-resources!
  "Create or restore the server-owned permission resources for `app` and return their IDs."
  [app]
  (perms/with-global-permissions-lock
    (let [app        (t2/select-one :model/DataApp :id (:id app))
          group      (permission-group! app)
          collection (resource-collection! app)]
      (t2/update! :model/PermissionsGroup :id (:id group)
                  {:name (resource-name app)})
      (t2/update! :model/Collection :id (:id collection)
                  {:name (resource-name app)})
      (restore-trashed-collection! collection)
      (apply-resource-permissions! group collection)
      {:permission_group_id    (:id group)
       :resource_collection_id (:id collection)})))

(defn- view-data-permissions-match?
  [permissions group-id database-id tables table-ids]
  (let [current-permissions (get permissions [group-id database-id :perms/view-data])
        selected-table-ids  (into #{} (comp (map :id) (filter table-ids)) tables)]
    (if (empty? selected-table-ids)
      (database-level-permission? current-permissions :blocked)
      (= (into {}
               (map (fn [{:keys [id]}]
                      [id (if (contains? selected-table-ids id)
                            :unrestricted
                            :blocked)]))
               tables)
         (into {}
               (map (juxt :table_id :perm_value))
               current-permissions)))))

(defn reconcile-view-data!
  "Make `table-ids` the authoritative view-data permission set for `app`."
  [app table-ids]
  (let [{:keys [permission_group_id]} (ensure-resources! app)
        group (t2/select-one :model/PermissionsGroup :id permission_group_id)]
    (perms/with-global-permissions-lock
      (t2/with-transaction [_conn]
        (let [all-database-ids (t2/select-pks-set :model/Database :router_database_id nil)
              permissions      (or (perms/index-database-permissions [(:id group)] all-database-ids) {})
              tables-by-db     (group-by :db_id (t2/select [:model/Table :id :db_id]))]
          (doseq [database-id all-database-ids
                  :let [tables (get tables-by-db database-id [])
                        table-permissions (into {}
                                                (keep (fn [{:keys [id]}]
                                                        (when (contains? table-ids id)
                                                          [id :unrestricted])))
                                                tables)]
                  :when (not (view-data-permissions-match? permissions
                                                           (:id group)
                                                           database-id
                                                           tables
                                                           table-ids))]
            (perms/set-database-permission! permissions group database-id :perms/view-data :blocked)
            (when (seq table-permissions)
              (perms/set-table-permissions! group :perms/view-data table-permissions))))))))

(defn delete-resources!
  "Delete the generated collection and permission group referenced by `app`."
  [{:keys [permission_group_id resource_collection_id]}]
  (when resource_collection_id
    (t2/delete! :model/Collection :id resource_collection_id))
  (when permission_group_id
    (t2/delete! :model/PermissionsGroup :id permission_group_id)))
