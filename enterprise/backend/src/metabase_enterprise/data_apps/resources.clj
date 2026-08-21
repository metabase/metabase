(ns metabase-enterprise.data-apps.resources
  "Lifecycle for the permission group and resource collection owned by a data app."
  (:require
   [metabase.api.common :as api]
   [metabase.collections.core :as collection]
   [metabase.permissions.core :as perms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- resource-name [app]
  (format "Data App: %s" (:name app)))

(defn- create-permission-group! [app]
  (let [group (t2/insert-returning-instance! :model/PermissionsGroup
                                             (cond-> {:name (resource-name app)}
                                               (:permission_group_entity_id app)
                                               (assoc :entity_id (:permission_group_entity_id app))))]
    (t2/update! :model/DataApp :id (:id app)
                {:permission_group_id (:id group)})
    group))

(defn- permission-group! [app]
  (or (some->> (:permission_group_entity_id app)
               (t2/select-one :model/PermissionsGroup :entity_id))
      (some->> (:permission_group_id app)
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
    (binding [api/*is-superuser?*              true
              api/*current-user-permissions-set* (atom #{"/"})]
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
                                                  (cond-> {:name     (resource-name app)
                                                           :location "/"}
                                                    (:resource_collection_entity_id app)
                                                    (assoc :entity_id (:resource_collection_entity_id app))))]
    (t2/update! :model/DataApp :id (:id app)
                {:resource_collection_id (:id collection)})
    (doseq [group (t2/select :model/PermissionsGroup)
            :when (not= (:id group) (:id (perms/admin-group)))]
      (perms/revoke-collection-permissions! group collection))
    collection))

(defn- resource-collection! [app]
  (or (some->> (:resource_collection_entity_id app)
               (t2/select-one :model/Collection :entity_id))
      (some->> (:resource_collection_id app)
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
      {:permission_group_id     (:id group)
       :resource_collection_id (:id collection)})))

(defn resource-entity-ids
  "Return the portable entity IDs for the resources linked to `app`."
  [{:keys [permission_group_id resource_collection_id]}]
  {:permission_group_entity_id
   (t2/select-one-fn :entity_id :model/PermissionsGroup :id permission_group_id)
   :resource_collection_entity_id
   (t2/select-one-fn :entity_id :model/Collection :id resource_collection_id)})

(defn- resource-not-found!
  [app field entity-id]
  (throw (ex-info (format "%s '%s' for data app '%s' does not identify an existing resource."
                          (name field) entity-id (:name app))
                  {:data-app (:name app)
                   :field field
                   :entity-id entity-id})))

(defn- resolve-resource!
  [app model field entity-id]
  (or (t2/select-one model :entity_id entity-id)
      (resource-not-found! app field entity-id)))

(defn- claimed-by-another-app?
  [app foreign-key resource-id]
  (t2/exists? :model/DataApp
              :id [:not= (:id app)]
              foreign-key resource-id))

(defn- validate-unclaimed!
  [app foreign-key field resource]
  (when (claimed-by-another-app? app foreign-key (:id resource))
    (throw (ex-info (format "%s '%s' is linked to another data app."
                            (name field) (:entity_id resource))
                    {:data-app (:name app)
                     :field field
                     :entity-id (:entity_id resource)}))))

(defn- permission-group-empty?
  [{:keys [id]}]
  (not (or (t2/exists? :model/PermissionsGroupMembership :group_id id)
           (t2/exists? :model/Permissions :group_id id))))

(defn- validate-empty-rebind!
  [app foreign-key field resource empty-resource?]
  (when (and (not= (foreign-key app) (:id resource))
             (not (empty-resource? resource)))
    (throw (ex-info (format "%s '%s' must be empty before a data app can use it."
                            (name field) (:entity_id resource))
                    {:data-app (:name app)
                     :field field
                     :entity-id (:entity_id resource)}))))

(defn reconcile-resources!
  "Resolve the manifest resource entity IDs, validate their ownership, and update `app`.

  The manifest is the source of truth. `app-changes` and both resource links use
  the same transaction. This function does not create or delete resources."
  ([app manifest-resource-ids]
   (reconcile-resources! app manifest-resource-ids {}))
  ([app {:keys [permission_group_entity_id resource_collection_entity_id]} app-changes]
   (perms/with-global-permissions-lock
     (t2/with-transaction [_conn]
       (let [group      (resolve-resource! app :model/PermissionsGroup
                                           :permission_group_entity_id permission_group_entity_id)
             collection (resolve-resource! app :model/Collection
                                           :resource_collection_entity_id resource_collection_entity_id)
             links      {:permission_group_id     (:id group)
                         :resource_collection_id (:id collection)}
             changed?   (not= links (select-keys app (keys links)))]
         (validate-unclaimed! app :permission_group_id :permission_group_entity_id group)
         (validate-unclaimed! app :resource_collection_id :resource_collection_entity_id collection)
         (validate-empty-rebind! app :permission_group_id :permission_group_entity_id group
                                 permission-group-empty?)
         (validate-empty-rebind! app :resource_collection_id :resource_collection_entity_id collection
                                 collection/collection-empty?)
         (when (or changed? (seq app-changes))
           (t2/update! :model/DataApp :id (:id app) (merge app-changes links)))
         (restore-trashed-collection! collection)
         (apply-resource-permissions! group collection)
         (assoc links :changed? changed?))))))

(defn- view-data-permissions-match?
  [permissions group-id database-id tables table-ids]
  (let [current-permissions (get permissions [group-id database-id :perms/view-data])
        selected-table-ids  (into #{} (comp (map :id) (filter table-ids)) tables)]
    (if (empty? selected-table-ids)
      (and (= 1 (count current-permissions))
           (let [{:keys [table_id perm_value]} (first current-permissions)]
             (and (nil? table_id)
                  (= perm_value :blocked))))
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
  (ensure-resources! app)
  (let [app (t2/select-one :model/DataApp :id (:id app))]
    (perms/with-global-permissions-lock
      (t2/with-transaction [_conn]
        (let [group            (permission-group! app)
              all-database-ids (t2/select-pks-set :model/Database :router_database_id nil)
              permissions     (or (perms/index-database-permissions [(:id group)] all-database-ids) {})
              tables-by-db     (group-by :db_id (t2/select :model/Table))]
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
