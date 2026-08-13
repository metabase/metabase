(ns metabase-enterprise.data-apps.resources
  "Lifecycle for the permission group and resource collection owned by a data app."
  (:require
   [metabase.permissions.core :as perms]
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

(defn- restrict-query-creation! [group]
  (let [database-ids (t2/select-pks-set :model/Database :router_database_id nil)
        permissions  (or (perms/index-database-permissions [(:id group)] database-ids) {})]
    (doseq [database-id database-ids
            :let [current-value (some-> permissions
                                        (get [(:id group) database-id :perms/create-queries])
                                        first
                                        :perm_value)]
            :when (not= current-value :no)]
      (perms/set-database-permission! permissions group database-id :perms/create-queries :no))))

(defn- create-resource-collection! [app]
  (let [collection (t2/insert-returning-instance! :model/Collection
                                                  :name (resource-name app)
                                                  :location "/")]
    (t2/update! :model/DataApp :id (:id app) {:resource_collection_id (:id collection)})
    (doseq [group (t2/select :model/PermissionsGroup)
            :when (not= (:id group) (:id (perms/admin-group)))]
      (perms/revoke-collection-permissions! group collection))
    collection))

(defn- resource-collection! [app]
  (or (some->> (:resource_collection_id app)
               (t2/select-one :model/Collection :id))
      (create-resource-collection! app)))

(defn ensure-resources!
  "Create or restore the server-owned permission resources for `app` and return their IDs."
  [app]
  (perms/with-global-permissions-lock
    (let [group      (permission-group! app)
          collection (resource-collection! app)]
      (t2/update! :model/PermissionsGroup :id (:id group)
                  {:name (resource-name app)})
      (t2/update! :model/Collection :id (:id collection)
                  {:name (resource-name app)})
      (restrict-query-creation! group)
      (doseq [permission-group (t2/select :model/PermissionsGroup)
              :when (not= (:id permission-group) (:id (perms/admin-group)))]
        (perms/revoke-collection-permissions! permission-group collection))
      (perms/grant-collection-read-permissions! group collection)
      {:permission_group_id     (:id group)
       :resource_collection_id (:id collection)})))

(defn reconcile-view-data!
  "Make `database-ids` the authoritative view-data permission set for `app`."
  [app database-ids]
  (ensure-resources! app)
  (let [app (t2/select-one :model/DataApp :id (:id app))]
    (perms/with-global-permissions-lock
      (t2/with-transaction [_conn]
        (let [group            (permission-group! app)
              all-database-ids (t2/select-pks-set :model/Database :router_database_id nil)
              permissions     (or (perms/index-database-permissions [(:id group)] all-database-ids) {})]
          (doseq [database-id all-database-ids]
            (perms/set-database-permission! permissions group database-id :perms/view-data
                                            (if (contains? database-ids database-id)
                                              :unrestricted
                                              :blocked))))))))

(defn delete-resources!
  "Delete the generated collection and permission group referenced by `app`."
  [{:keys [permission_group_id resource_collection_id]}]
  (when resource_collection_id
    (t2/delete! :model/Collection :id resource_collection_id))
  (when permission_group_id
    (t2/delete! :model/PermissionsGroup :id permission_group_id)))
