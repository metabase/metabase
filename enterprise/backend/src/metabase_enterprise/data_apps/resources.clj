(ns metabase-enterprise.data-apps.resources
  "Lifecycle for the permission group and resource collection owned by a data app."
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.collections.core :as collection]
   [metabase.permissions.core :as perms]
   [metabase.request.core :as request]))

(set! *warn-on-reflection* true)

(defn- resource-name [app]
  (format "Data App: %s" (:name app)))

(defn- create-permission-group! [app]
  (let [group (data-apps.db/insert-permission-group! {:name (resource-name app)
                                                      :is_data_app_group true})]
    (data-apps.db/update-data-app! (:id app) {:permission_group_id (:id group)})
    group))

(defn- permission-group! [app]
  (or (some->> (:permission_group_id app)
               (data-apps.db/permission-group))
      (create-permission-group! app)))

(defn- database-level-permission?
  "Whether `rows` (one `[group db perm-type]` entry of an [[perms/index-database-permissions]]
   index) is exactly a database-wide permission of `value`, with no table-level rows."
  [rows value]
  (and (= 1 (count rows))
       (let [{:keys [table_id perm_value]} (first rows)]
         (and (nil? table_id)
              (= perm_value value)))))

(defn- block-view-data!
  "Block the app group's view-data at the database level on every database, so it grants no data access
   of its own — a viewer reaches an app's data only through access they already hold in another group.
   `view-data :blocked` cascades `download-results`/`transforms` to `:no`; we reassert whenever any of
   that has drifted, so a manual grant can't survive a sync."
  [group]
  (let [database-ids (data-apps.db/non-router-database-ids)
        permissions  (or (perms/index-database-permissions [(:id group)] database-ids) {})
        db-level?    (fn [database-id perm-type value]
                       (database-level-permission? (get permissions [(:id group) database-id perm-type]) value))]
    (doseq [database-id database-ids
            :when (not (and (db-level? database-id :perms/view-data :blocked)
                            (db-level? database-id :perms/download-results :no)
                            (db-level? database-id :perms/transforms :no)))]
      (perms/set-database-permission! permissions group database-id :perms/view-data :blocked))))

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

(defn- apply-collection-permissions!
  "Gives the group read access. Preserves permission grants that are already correct."
  [group collection]
  (let [read-path (perms/collection-read-path collection)
        write-path (perms/collection-readwrite-path collection)
        permissions-by-group (group-by :group_id
                                       (data-apps.db/permissions-for-paths-excluding-group
                                        ["/" read-path write-path] (:id (perms/admin-group))))
        app-read-only? (= #{read-path} (set (map :object (get permissions-by-group (:id group)))))]
    ;; Remove write grants and access from other groups
    (doseq [group-id (keys permissions-by-group)
            :when (not (and (= group-id (:id group)) app-read-only?))]
      (perms/revoke-collection-permissions! group-id collection))
    (when-not app-read-only?
      (perms/grant-collection-read-permissions! group collection))))

(defn- apply-resource-permissions!
  [group collection]
  (block-view-data! group)
  (apply-collection-permissions! group collection))

(defn- create-resource-collection! [app]
  (let [collection (data-apps.db/insert-resource-collection! {:name (resource-name app)
                                                              :location "/"})]
    (data-apps.db/update-data-app! (:id app) {:resource_collection_id (:id collection)})
    collection))

(defn- resource-collection! [app]
  (or (some->> (:resource_collection_id app)
               (data-apps.db/resource-collection))
      (create-resource-collection! app)))

(defn ensure-resources!
  "Create or restore the server-owned permission resources for `app` and return their IDs."
  [app]
  (perms/with-global-permissions-lock
    (let [app        (data-apps.db/non-blob-data-app (:id app))
          group      (permission-group! app)
          collection (resource-collection! app)]
      (data-apps.db/update-permission-group! (:id group)
                                             {:name (resource-name app)})
      (data-apps.db/update-resource-collection! (:id collection)
                                                {:name (resource-name app)})
      (restore-trashed-collection! collection)
      (apply-resource-permissions! group collection)
      {:permission_group_id    (:id group)
       :resource_collection_id (:id collection)})))

(defn delete-resources!
  "Delete the generated collection and permission group referenced by `app`."
  [{:keys [permission_group_id resource_collection_id]}]
  (when resource_collection_id
    (data-apps.db/delete-resource-collection! resource_collection_id))
  (when permission_group_id
    (data-apps.db/delete-permission-group! permission_group_id)))
