(ns metabase-enterprise.sandbox.models.permissions.delete-sandboxes
  (:require [clojure.tools.logging :as log]
            [metabase-enterprise.enhancements.ee-strategy-impl :as ee-strategy-impl]
            [metabase-enterprise.sandbox.models.group-table-access-policy :refer [GroupTableAccessPolicy]]
            [metabase.models.permissions.delete-sandboxes :as delete-sandboxes]
            [metabase.models.table :refer [Table]]
            [metabase.public-settings.metastore :as settings.metastore]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [pretty.core :as pretty]
            [toucan.db :as db]))

(defn- delete-gtaps-with-condition! [group-or-id condition]
  (when (seq condition)
    (let [conditions (into
                      [:and
                       [:= :gtap.group_id (u/the-id group-or-id)]]
                      [condition])]
      (log/debugf "Deleting GTAPs for Group %d with conditions %s" (u/the-id group-or-id) (pr-str conditions))
      (try
        (if-let [gtap-ids (not-empty (set (map :id (db/query
                                                      {:select    [[:gtap.id :id]]
                                                       :from      [[GroupTableAccessPolicy :gtap]]
                                                       :left-join [[Table :table]
                                                                   [:= :gtap.table_id :table.id]]
                                                       :where     conditions}))))]
          (do
            (log/debugf "Deleting %d matching GTAPs: %s" (count gtap-ids) (pr-str gtap-ids))
            (db/delete! GroupTableAccessPolicy :id [:in gtap-ids]))
          (log/debug "No matching GTAPs need to be deleted."))
        (catch Throwable e
          (throw (ex-info (tru "Error deleting Sandboxes: {0}" (ex-message e))
                          {:group (u/the-id group-or-id), :conditions conditions}
                          e)))))))

(defn- delete-gtaps-for-group-table! [{:keys [group-id table-id], :as context} changes]
  (log/debugf "Deleting unneeded GTAPs for Group %d for Table %d. Graph changes: %s"
             group-id table-id (pr-str changes))
  (cond
    (= changes :none)
    (do
      (log/debugf "Group %d no longer has any permissions for Table %d, deleting GTAP for this Table if one exists"
                 group-id table-id)
      (delete-gtaps-with-condition! group-id [:= :table.id table-id]))

    (= changes :all)
    (do
      (log/debugf "Group %d now has full data perms for Table %d, deleting GTAP for this Table if one exists"
                 group-id table-id)
      (delete-gtaps-with-condition! group-id [:= :table.id table-id]))

    :else
    (let [new-query-perms (get changes :query :none)]
      (case new-query-perms
        :none
        (do
          (log/debugf "Group %d no longer has any query perms for Table %d; deleting GTAP for this Table if one exists"
                     group-id table-id)
          (delete-gtaps-with-condition! group-id [:= :table.id table-id]))

        :all
        (do
          (log/debugf "Group %d now has full non-sandboxed query perms for Table %d; deleting GTAP for this Table if one exists"
                     group-id table-id)
          (delete-gtaps-with-condition! group-id [:= :table.id table-id]))

        :segmented
        (log/debugf "Group %d now has full segmented query perms for Table %d. Do not need to delete GTAPs."
                   group-id table-id)))))

(defn- delete-gtaps-for-group-schema! [{:keys [group-id database-id schema-name], :as context} changes]
  (log/debugf "Deleting unneeded GTAPs for Group %d for Database %d, schema %s. Graph changes: %s"
             group-id database-id (pr-str schema-name) (pr-str changes))
  (cond
    (= changes :none)
    (do
      (log/debugf "Group %d no longer has any permissions for Database %d schema %s, deleting all GTAPs for this schema"
                  group-id database-id (pr-str schema-name))
      (delete-gtaps-with-condition! group-id [:and [:= :table.db_id database-id] [:= :table.schema schema-name]]))

    (= changes :all)
    (do
      (log/debugf "Group %d changes has full data perms for Database %d schema %s, deleting all GTAPs for this schema"
                  group-id database-id (pr-str schema-name))
      (delete-gtaps-with-condition! group-id [:and [:= :table.db_id database-id] [:= :table.schema schema-name]]))

    :else
    (doseq [table-id (set (keys changes))]
      (delete-gtaps-for-group-table! (assoc context :table-id table-id) (get changes table-id)))))

(defn- delete-gtaps-for-group-database! [{:keys [group-id database-id], :as context} changes]
  (log/debugf "Deleting unneeded GTAPs for Group %d for Database %d. Graph changes: %s"
             group-id database-id (pr-str changes))
  (cond
    (= changes :none)
    (do
      (log/debugf "Group %d no longer has any perms for Database %d, deleting all GTAPs for this DB" group-id database-id)
      (delete-gtaps-with-condition! group-id [:= :table.db_id database-id]))

    (= changes :all)
    (do
      (log/debugf "Group %d now has full data perms for Database %d, deleting all GTAPs for this DB" group-id database-id)
      (delete-gtaps-with-condition! group-id [:= :table.db_id database-id]))

    :else
    (doseq [schema-name (set (keys changes))]
      (delete-gtaps-for-group-schema!
       (assoc context :schema-name schema-name)
       (get changes schema-name)))))

(defn- delete-gtaps-for-group! [{:keys [group-id]} changes]
  (log/debugf "Deleting unneeded GTAPs for Group %d. Graph changes: %s" group-id (pr-str changes))
  (doseq [database-id (set (keys changes))]
    (delete-gtaps-for-group-database!
     {:group-id group-id, :database-id database-id}
     (get-in changes [database-id :schemas]))))

(defn- delete-gtaps-if-needed-after-permissions-change! [changes]
  (log/debug "Permissions updated, deleting unneeded GTAPs...")
  (doseq [group-id (set (keys changes))]
    (delete-gtaps-for-group! {:group-id group-id} (get changes group-id)))
  (log/debug "Done deleting unneeded GTAPs."))

(def ^:private impl
  (reify
    delete-sandboxes/DeleteSandboxes
    (delete-gtaps-if-needed-after-permissions-change!* [_ changes]
      (delete-gtaps-if-needed-after-permissions-change! changes))

    pretty/PrettyPrintable
    (pretty [_]
      `impl)))

(def ee-strategy-impl
  "EE impl for Sandbox (GTAP) deletion behavior. Don't use this directly."
  (ee-strategy-impl/reify-ee-strategy-impl
    #'settings.metastore/enable-sandboxes?
    impl
    delete-sandboxes/oss-default-impl
    delete-sandboxes/DeleteSandboxes))
