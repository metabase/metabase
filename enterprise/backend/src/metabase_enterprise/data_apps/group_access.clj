(ns metabase-enterprise.data-apps.group-access
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase.api.common :as api]
   [metabase.graph.core :as graph]
   [metabase.permissions.core :as perms]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn- access-group-ids
  "The ids of the groups other than Administrators that can read the resource collection of `app`."
  [app]
  (if-let [collection-id (:resource_collection_id app)]
    (disj (perms/collection-read-access-group-ids collection-id) (:id (perms/admin-group)))
    #{}))

(defn assigned-groups
  "The groups other than Administrators that can read the resource collection of `app`, with their member counts."
  [app]
  (let [using-tenants? (setting/get :use-tenants)]
    (mapv (fn [group]
            (assoc group :name (perms/group-display-name group using-tenants?)))
          (t2/hydrate (perms/groups-by-ids (access-group-ids app)) :member_count))))

(defn- check-assignable-groups
  "Throws unless every group with an id in `group-ids` exists and is neither a tenant group nor Administrators."
  [group-ids]
  (let [group-tenant-flags (perms/group-tenant-flags (set group-ids))]
    (api/check-404 (every? #(contains? group-tenant-flags %) group-ids))
    (api/check-400 (not-any? #(or (get group-tenant-flags %) (= % (:id (perms/admin-group)))) group-ids)
                   (tru "Tenant groups and admins cannot be assigned to data apps."))))

(defn- app-collection
  "The resource collection of `app`, or a 404."
  [app]
  (api/check-404 (some-> (:resource_collection_id app) data-apps.db/resource-collection)))

(defn add-groups!
  "Grant groups read access to the resource collection of `app`."
  [app group-ids]
  (let [group-ids  (vec (distinct group-ids))
        collection (app-collection app)]
    (check-assignable-groups group-ids)
    (perms/with-global-permissions-lock
      (t2/with-transaction [_conn]
        (api/check-400 (not-any? (access-group-ids app) group-ids)
                       (tru "One or more groups already have access to this data app."))
        (doseq [group-id group-ids]
          (perms/grant-collection-read-permissions! group-id collection)))))
  (assigned-groups app))

(defn remove-group!
  "Revoke a group's access to the resource collection of `app`."
  [app group-id]
  (let [collection (app-collection app)]
    (perms/with-global-permissions-lock
      (t2/with-transaction [_conn]
        (api/check-404 (contains? (access-group-ids app) group-id))
        (perms/revoke-collection-permissions! group-id collection))))
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

(defn- resource-table-ids
  "The IDs of the tables the cards and actions in the resource collection with `collection-id` read, directly or
  through the cards, measures, segments and snippets they use, with a transform they name standing for its output."
  [collection-id]
  (let [nodes (models.dependency/entities->nodes {:card   (data-apps.db/collection-card-ids collection-id)
                                                  :action (data-apps.db/collection-action-ids collection-id)})
        graph (models.dependency/filtered-graph-dependencies nil {:types #{:action :card :measure :segment :snippet}})
        {:keys [table transform]} (models.dependency/group-nodes (graph/transitive graph (vec nodes)))
        outputs (->> (models.dependency/entities->nodes {:transform transform})
                     models.dependency/direct-dependents
                     vals
                     (apply concat)
                     models.dependency/group-nodes
                     :table)]
    (vec (into (set table) outputs))))

(defn permission-warnings
  "Missing table access for the groups with access to `app`, including access inherited from All Users."
  [{collection-id :resource_collection_id :as app}]
  (let [assigned-ids (sort (access-group-ids app))
        table-ids    (when (seq assigned-ids)
                       (resource-table-ids collection-id))]
    (if (seq table-ids)
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
