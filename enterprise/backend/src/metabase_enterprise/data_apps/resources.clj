(ns metabase-enterprise.data-apps.resources
  "Lifecycle for the permission group and resource collection owned by a data app."
  (:require
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions :as perms]
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
  (doseq [database-id (t2/select-pks-set :model/Database :router_database_id nil)]
    (data-perms/set-database-permission! group database-id :perms/create-queries :no)))

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
  (let [group      (permission-group! app)
        collection (resource-collection! app)]
    (t2/update! :model/PermissionsGroup :id (:id group)
                {:name (resource-name app)})
    (t2/update! :model/Collection :id (:id collection)
                {:name (resource-name app)})
    (restrict-query-creation! group)
    (perms/revoke-collection-permissions! group collection)
    (perms/grant-collection-read-permissions! group collection)
    {:permission_group_id     (:id group)
     :resource_collection_id (:id collection)}))

(defn reconcile-view-data!
  "Give `app` view-data access to `database-ids` and block every other database."
  [app database-ids]
  (let [group        (permission-group! app)
        all-database-ids (t2/select-pks-set :model/Database :router_database_id nil)
        permissions  (data-perms/index-database-permissions [(:id group)] all-database-ids)]
    (doseq [database-id all-database-ids]
      (data-perms/set-database-permission! permissions group database-id :perms/view-data
                                           (if (contains? database-ids database-id)
                                             :unrestricted
                                             :blocked)))))

(defn delete-resources!
  "Delete the generated collection and permission group referenced by `app`."
  [{:keys [permission_group_id resource_collection_id]}]
  (when resource_collection_id
    (t2/delete! :model/Collection :id resource_collection_id))
  (when permission_group_id
    (t2/delete! :model/PermissionsGroup :id permission_group_id)))
