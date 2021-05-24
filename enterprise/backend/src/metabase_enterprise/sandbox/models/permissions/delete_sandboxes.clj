(ns metabase-enterprise.sandbox.models.permissions.delete-sandboxes
  (:require [clojure.tools.logging :as log]
            [metabase-enterprise.enhancements.ee-strategy-impl :as ee-strategy-impl]
            [metabase-enterprise.sandbox.models.group-table-access-policy :refer [GroupTableAccessPolicy]]
            [metabase.models.permissions.delete-sandboxes :as delete-sandboxes]
            [metabase.models.permissions.parse :as perms.parse]
            [metabase.models.table :refer [Table]]
            [metabase.public-settings.metastore :as settings.metastore]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [pretty.core :as pretty]
            [toucan.db :as db]))

(defn- sandbox-delete-condition [path grant-or-revoke]
  (let [parsed (perms.parse/permissions->graph #{path})]
    (when-let [[[db-id {schema->perms :schemas}]] (seq (:db parsed))]
      (if (= schema->perms :all)
        ;; grant full perms for ALL schemas for a DB = delete all Sandboxes
        ;; revoke all perms for ALL schemas for a DB = delete all Sandboxes
        [:= :table.db_id db-id]
        (when-let [[[schema table->perms]] (seq schema->perms)]
          (if (= table->perms :all)
            ;; GRANT full schema perms = delete all sandboxes for Tables with that schema.
            ;; REVOKE all schema perms = delete all sandboxes for Tables with that schema.
            [:and
             [:= :table.db_id db-id]
             [:= :table.schema schema]]
            (when-let [[[table-id table-perms]] (seq table->perms)]
              (if (= table-perms :all)
                ;; GRANT full table perms = delete all sandboxes for that Table.
                ;; REVOKE all table perms = delete all sandboxes for that Table.
                [:= :table.id table-id]
                (when-let [[[perms-type perms-subtype]] (seq table-perms)]
                  (case perms-type
                    :read
                    ;; changing READ perms shouldn't affect anything.
                    nil

                    :query
                    (case perms-subtype
                      :all
                      (case grant-or-revoke
                        ;; GRANT query perms => remove sandbox for that Table
                        :grant
                        [:= :table.id table-id]

                        ;; REVOKE query perms => shouldn't affect anything
                        :revoke
                        nil)

                      :segmented
                      (case grant-or-revoke
                        ;; GRANT segmented perms = don't touch GTAPs.
                        :grant
                        nil

                        ;; REVOKE segmented perms = delete associated GTAPs.
                        :revoke
                        [:= :table.id table-id]))))))))))))

(defn- delete-sandboxes-with-condition! [group-or-id condition]
  (when (seq condition)
    (let [conditions (into
                      [:and
                       [:= :gtap.group_id (u/the-id group-or-id)]]
                      [condition])]
      (log/debugf "Deleting sandboxes for Group %d with conditions %s" (u/the-id group-or-id) (pr-str conditions))
      (try
        (when-let [gtap-ids (not-empty (set (map :id (db/query
                                                      {:select    [[:gtap.id :id]]
                                                       :from      [[GroupTableAccessPolicy :gtap]]
                                                       :left-join [[Table :table]
                                                                   [:= :gtap.table_id :table.id]]
                                                       :where     conditions}))))]
          (log/debugf "Deleting %d matching GTAPs: %s" (count gtap-ids) (pr-str gtap-ids))
          (db/delete! GroupTableAccessPolicy :id [:in gtap-ids]))
        (catch Throwable e
          (throw (ex-info (tru "Error deleting Sandboxes: {0}" (ex-message e))
                          {:group (u/the-id group-or-id), :conditions conditions}
                          e)))))))

(defn- revoke-perms-delete-sandboxes-if-needed! [group-or-id path]
  (log/debugf "Permissions revoked for Group %d, path %s; deleting sandboxes"  (u/the-id group-or-id) (pr-str path))
  (try
    (delete-sandboxes-with-condition! group-or-id (sandbox-delete-condition path :revoke))
    (catch Throwable e
      (throw (ex-info (tru "Error deleting sandbox after permissions were revoked: {0}" (ex-message e))
                      {:group (u/the-id group-or-id), :path path}
                      e)))))

(defn- grant-perms-delete-sandboxes-if-needed! [group-or-id path]
  (log/debugf "Permissions granted for Group %d, path %s; deleting sandboxes"  (u/the-id group-or-id) (pr-str path))
  (try
    (delete-sandboxes-with-condition! group-or-id (sandbox-delete-condition path :grant))
    (catch Throwable e
      (throw (ex-info (tru "Error deleting sandbox after permissions were granted: {0}" (ex-message e))
                      {:group (u/the-id group-or-id), :path path}
                      e)))))

(def ^:private impl
  (reify
    delete-sandboxes/DeleteSandboxes
    (revoke-perms-delete-sandboxes-if-needed!* [_ group-or-id path]
      (revoke-perms-delete-sandboxes-if-needed! group-or-id path))

    (grant-perms-delete-sandboxes-if-needed!* [_ group-or-id path]
      (grant-perms-delete-sandboxes-if-needed! group-or-id path))

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
