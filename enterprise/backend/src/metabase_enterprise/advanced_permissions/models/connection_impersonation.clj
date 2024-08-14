(ns metabase-enterprise.advanced-permissions.models.connection-impersonation
  "Model definition for Connection Impersonations, which are used to define specific database roles used by users in
  certain permission groups when running queries."
  (:require
   [medley.core :as m]
   [metabase.audit :as audit]
   [metabase.models.interface :as mi]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(doto :model/ConnectionImpersonation
  (derive :metabase/model)
  ;; Only admins can work with Connection Impersonation configs
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser))

(methodical/defmethod t2/table-name :model/ConnectionImpersonation [_model] :connection_impersonations)

(defenterprise add-impersonations-to-permissions-graph
  "Augment a provided permissions graph with active connection impersonation policies."
  :feature :advanced-permissions
  [graph & {:keys [group-ids group-id db-id audit-db?]}]
  (m/deep-merge
   graph
   (let [impersonations (t2/select :model/ConnectionImpersonation
                                   {:where [:and
                                            (when db-id [:= :db_id db-id])
                                            (when group-id [:= :group_id group-id])
                                            (when group-ids [:in :group_id group-ids])
                                            (when-not audit-db? [:not [:= :db_id audit/audit-db-id]])]})]
     (reduce (fn [acc {:keys [db_id group_id]}]
                (assoc-in acc [group_id db_id :view-data] :impersonated))
             {}
             impersonations))))

(defenterprise insert-impersonations!
  "Create new Connection Impersonation records. Deletes any existing Connection Impersonation records for the same
  group and database before creating new ones."
  :feature :advanced-permissions
  [impersonations]
  (doall
   (for [impersonation impersonations]
     (do
       (t2/delete! :model/ConnectionImpersonation
                   :group_id (:group_id impersonation)
                   :db_id (:db_id impersonation))
       (-> (t2/insert-returning-instances! :model/ConnectionImpersonation impersonation)
           first)))))

(defn- delete-impersonations-for-group-database! [{:keys [group-id database-id]} changes]
  (log/debugf "Deleting unneeded Connection Impersonations for Group %d for Database %d. Graph changes: %s"
              group-id database-id (pr-str changes))
  (when (not= :impersonated changes)
    (log/debugf "Group %d %s for Database %d, deleting all Connection Impersonations for this DB"
                group-id
                (case changes
                  :unrestricted "now has full data perms"
                  :blocked      "is now BLOCKED from all non-data-perms access"
                  "now has granular (sandboxed) data access")
                database-id)
    (t2/delete! :model/ConnectionImpersonation :group_id group-id :db_id database-id)))

(defn- delete-impersonations-for-group! [{:keys [group-id]} changes]
  (log/debugf "Deleting unneeded Connection Impersonation policies for Group %d. Graph changes: %s" group-id (pr-str changes))
  (doseq [database-id (set (keys changes))]
    (when-let [data-perm-changes (get-in changes [database-id :view-data])]
      (delete-impersonations-for-group-database!
       {:group-id group-id, :database-id database-id}
       data-perm-changes))))

(defenterprise delete-impersonations-if-needed-after-permissions-change!
  "For use only inside `metabase.models.permissions`; don't call this elsewhere. Delete Connection Impersonations that
  are no longer needed after the permissions graph is updated. `changes` are the parts of the graph that have changed,
  i.e. the `things-only-in-new` returned by `clojure.data/diff`."
  :feature :advanced-permissions
  [changes]
  (log/debug "Permissions updated, deleting unneeded Connection Impersonations...")
  (doseq [group-id (set (keys changes))]
    (delete-impersonations-for-group! {:group-id group-id} (get changes group-id)))
  (log/debug "Done deleting unneeded Connection Impersonations."))
