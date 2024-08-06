(ns metabase-enterprise.sandbox.models.permissions.delete-sandboxes
  (:require
   [metabase-enterprise.sandbox.models.group-table-access-policy
    :refer [GroupTableAccessPolicy]]
   [metabase.db.query :as mdb.query]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- delete-gtaps-with-condition! [group-or-id condition]
  (when (seq condition)
    (let [conditions (into
                      [:and
                       [:= :sandboxes.group_id (u/the-id group-or-id)]]
                      [condition])]
      (log/debugf "Deleting GTAPs for Group %d with conditions %s" (u/the-id group-or-id) (pr-str conditions))
      (try
        (if-let [gtap-ids (not-empty (set (map :id (mdb.query/query
                                                    {:select    [[:sandboxes.id :id]]
                                                     :from      [[:sandboxes]]
                                                     :left-join [[:metabase_table :table]
                                                                 [:= :sandboxes.table_id :table.id]]
                                                     :where     conditions}))))]
          (do
            (log/debugf "Deleting %d matching GTAPs: %s" (count gtap-ids) (pr-str gtap-ids))
            (t2/delete! GroupTableAccessPolicy :id [:in gtap-ids]))
          (log/debug "No matching GTAPs need to be deleted."))
        (catch Throwable e
          (throw (ex-info (tru "Error deleting Sandboxes: {0}" (ex-message e))
                          {:group (u/the-id group-or-id), :conditions conditions}
                          e)))))))

(defn- delete-gtaps-for-group-table! [{:keys [group-id table-id] :as _context} changes]
  (log/debugf "Deleting unneeded GTAPs for Group %d for Table %d. Graph changes: %s"
             group-id table-id (pr-str changes))
  (if (not= changes :sandboxed)
    (do
      (log/debugf "Group %d now has full data perms for Table %d, deleting GTAP for this Table if one exists"
                 group-id table-id)
      (delete-gtaps-with-condition! group-id [:= :table.id table-id]))
    (log/debugf "Group %d now has full sandboxed query perms for Table %d. Do not need to delete GTAPs."
               group-id table-id)))

(defn- delete-gtaps-for-group-schema! [{:keys [group-id database-id schema-name], :as context} changes]
  (log/debugf "Deleting unneeded GTAPs for Group %d for Database %d, schema %s. Graph changes: %s"
             group-id database-id (pr-str schema-name) (pr-str changes))
  (if (keyword? changes)
    (do
      (log/debugf "Group %d changes has %s perms for Database %d schema %s, deleting all sandboxes for this schema"
                  group-id changes database-id (pr-str schema-name))
      (delete-gtaps-with-condition! group-id [:and [:= :table.db_id database-id] [:= :table.schema schema-name]]))
    (doseq [table-id (set (keys changes))]
      (delete-gtaps-for-group-table! (assoc context :table-id table-id) (get changes table-id)))))

(defn- delete-gtaps-for-group-database! [{:keys [group-id database-id], :as context} changes]
  (log/debugf "Deleting unneeded GTAPs for Group %d for Database %d. Graph changes: %s"
              group-id database-id (pr-str changes))
  (if (keyword? changes)
    ;; If we're setting a single permission type for the entire DB, clear all sandboxes in the DB
    (do
      (log/debugf "Group %d now has %s perms for Database %d, deleting all sandboxes for this schema"
                  group-id changes database-id)
      (delete-gtaps-with-condition! group-id [:= :table.db_id database-id]))
    (doseq [schema-name (set (keys changes))]
      (delete-gtaps-for-group-schema!
       (assoc context :schema-name schema-name)
       (get changes schema-name)))))

(defn- delete-gtaps-for-group! [{:keys [group-id]} changes]
  (log/debugf "Deleting unneeded GTAPs for Group %d. Graph changes: %s" group-id (pr-str changes))
  (doseq [database-id (set (keys changes))]
    (when-let [data-perm-changes (get-in changes [database-id :view-data])]
      (delete-gtaps-for-group-database!
       {:group-id group-id, :database-id database-id}
       data-perm-changes))))

(defenterprise delete-gtaps-if-needed-after-permissions-change!
  "For use only inside `metabase.models.permissions`; don't call this elsewhere. Delete GTAPs (sandboxes) that are no
  longer needed after the permissions graph is updated. `changes` are the parts of the graph that have changed, i.e.
  the `things-only-in-new` returned by `clojure.data/diff`."
  :feature :sandboxes
  [changes]
  (log/debug "Permissions updated, deleting unneeded GTAPs...")
  (doseq [group-id (set (keys changes))]
    (delete-gtaps-for-group! {:group-id group-id} (get changes group-id)))
  (log/debug "Done deleting unneeded GTAPs."))
