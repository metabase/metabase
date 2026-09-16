(ns metabase-enterprise.data-apps.group-access
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.resources :as resources]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn check-groups
  "Reject missing groups, administrator groups, and tenant groups before any mutation."
  [group-ids]
  (api/check-400 (= (count group-ids) (count (distinct group-ids)))
                 (tru "Group IDs must be distinct."))
  (let [groups (data-apps.db/permission-groups group-ids)]
    (api/check-404 (= (count groups) (count group-ids)))
    (api/check-400 (every? #(and (not (:is_tenant_group %))
                                 (not= (:id %) (:id (perms/admin-group)))) groups)
                   (tru "Only internal groups other than Administrators can be assigned to data apps."))
    groups))

(defn assigned-groups
  "Assigned groups with their current member counts."
  [app]
  (t2/hydrate (data-apps.db/assigned-groups (:id app)) :member_count))

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
      (check-groups [group-id])
      (api/check-404 (pos? (data-apps.db/delete-assignment! (:id app) group-id)))
      (when-let [collection (some-> (:id app) data-apps.db/non-blob-data-app :resource_collection_id
                                    data-apps.db/resource-collection)]
        (perms/revoke-collection-permissions! group-id collection))))
  nil)

(defn- access-pairs
  [group-ids table-ids]
  (if (and (seq group-ids) (seq table-ids))
    (into #{} (map (juxt :group_id :table_id))
          (concat
           (data-apps.db/group-table-access (conj (set group-ids) (:id (perms/all-users-group))) table-ids)
           (data-apps.db/sandboxed-group-table-access (conj (set group-ids) (:id (perms/all-users-group))) table-ids)))
    #{}))

(defn- missing-tables
  [pairs all-users-id group-id tables]
  (remove #(or (pairs [group-id (:id %)]) (pairs [all-users-id (:id %)])) tables))

(defn permission-warnings
  "Warnings use each group's permissions plus All Users, regardless of current membership."
  [table-ids group-ids]
  (if (and (seq table-ids) (seq group-ids))
    (let [tables (data-apps.db/table-details table-ids)
          pairs (access-pairs group-ids table-ids)
          all-users-id (:id (perms/all-users-group))]
      (into [] (keep (fn [group-id]
                       (when-let [missing (seq (missing-tables pairs all-users-id group-id tables))]
                         {:group_id group-id :missing_tables (vec missing)}))) group-ids))
    []))

(defn apps-with-permission-warnings
  "App IDs with deficient assignments. Query count does not grow with apps, groups, or members."
  [apps]
  (let [assignments (data-apps.db/app-assignments (map :id apps))
        app->groups (group-by :data_app_id assignments)
        pairs (access-pairs (map :permission_group_id assignments) (into #{} (mapcat :table_ids) apps))
        all-users-id (:id (perms/all-users-group))]
    (into #{} (keep (fn [app]
                      (when (some #(seq (missing-tables pairs all-users-id (:permission_group_id %)
                                                        (map (fn [id] {:id id}) (:table_ids app))))
                                  (app->groups (:id app)))
                        (:id app)))) apps)))
