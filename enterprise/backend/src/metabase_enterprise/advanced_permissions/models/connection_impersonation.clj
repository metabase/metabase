(ns metabase-enterprise.advanced-permissions.models.connection-impersonation
  "Model definition for Connection Impersonations, which are used to define specific database roles used by users in
  certain permission groups when running queries."
  (:require
   [medley.core :as m]
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
  [graph]
  (m/deep-merge
   graph
   (let [impersonations (t2/select :model/ConnectionImpersonation)]
     (reduce (fn [acc {:keys [db_id group_id]}]
               (assoc-in acc [group_id db_id] {:data {:schemas :impersonated}}))
             {}
             impersonations))))

(defenterprise upsert-impersonations!
  "Create new Connection Impersonation records or update existing ones, if they have an `:id`."
  :feature :advanced-permissions
  [impersonations]
  (for [impersonation impersonations]
    (if-let [id (:id impersonation)]
      (t2/update! :model/ConnectionImpersonation id impersonation)
      (-> (t2/insert-returning-instances! :model/ConnectionImpersonation impersonation)
          first))))

(defn- delete-impersonations-for-group-database! [{:keys [group-id database-id]} changes]
  (log/debugf "Deleting unneeded Connection Impersonations for Group %d for Database %d. Graph changes: %s"
              group-id database-id (pr-str changes))
  (when (not= :impersonated changes)
    (log/debugf "Group %d %s for Database %d, deleting all Connection Impersonations for this DB"
                group-id
                (case changes
                  :none  "no longer has any perms"
                  :all   "now has full data perms"
                  :block "is now BLOCKED from all non-data-perms access")
                database-id)
    (t2/delete! :model/ConnectionImpersonation :group_id group-id :db_id database-id)))

(defn- delete-impersonations-for-group! [{:keys [group-id]} changes]
  (log/debugf "Deleting unneeded Connection Impersonation policies for Group %d. Graph changes: %s" group-id (pr-str changes))
  (doseq [database-id (set (keys changes))]
    (delete-impersonations-for-group-database!
     {:group-id group-id, :database-id database-id}
     (get-in changes [database-id :data :schemas]))))

(defenterprise delete-impersonations-if-needed-after-permissions-change!
  "For use only inside `metabase.models.permissions`; don't call this elsewhere. Delete Connection Impersonations that
  are no longer needed after the permissions graph is updated. `changes` are the parts of the graph that have changed,
  i.e. the `things-only-in-new` returned by `clojure.data/diff`."
  :feature :advanced-permisisons
  [changes]
  (log/debug "Permissions updated, deleting unneeded Connection Impersonations...")
  (doseq [group-id (set (keys changes))]
    (delete-impersonations-for-group! {:group-id group-id} (get changes group-id)))
  (log/debug "Done deleting unneeded Connection Impersonations."))
