(ns metabase.permissions.user
  (:require
   [metabase.permissions.db :as permissions.db]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.path :as permissions.path]
   [metabase.permissions.published-tables :as published-tables]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]))

(defenterprise user->tenant-collection-and-descendant-ids
  "Returns descendant IDs for the user's tenant collection. Returns an empty vector in OSS since tenants are an EE feature."
  metabase-enterprise.tenants.models
  [_user-or-id]
  [])

(defn- worktree-collection-paths
  "Read-write paths for every remote-sync worktree collection, granted wholesale to a holder of the `:remote-sync`
  application permission: a worktree is a checkout the holder pulls and pushes as a unit, so its collection copies
  carry no permission rows of their own and worktree access stands in for collection access. `group-perms` are the
  paths the user's groups grant. Superusers need nothing here -- `/` already covers every path. (1 DB call)"
  [group-perms]
  (when (and (premium-features/enable-advanced-permissions?)
             (contains? group-perms (permissions.path/application-perms-path :remote-sync)))
    (map permissions.path/collection-readwrite-path (permissions.db/worktree-collection-ids))))

(defn user-permissions-set
  "Return a set of all permissions object paths that `user-or-id` has been granted access to. (2 DB Calls)"
  [user-or-id]
  (tracing/with-span :db-app "db-app.permissions-load" {}
    (set (when-let [user-id (u/the-id user-or-id)]
           (let [group-perms (set (permissions.db/permission-objects-for-user user-id))]
             (concat
              ;; Current User always gets readwrite perms for their Personal Collection and for its descendants! (1 DB
              ;; Call)
              (map permissions.path/collection-readwrite-path
                   ((requiring-resolve 'metabase.collections.models.collection/user->personal-collection-and-descendant-ids)
                    user-or-id))
              ;; Current User always gets readwrite perms for their Tenant Collection and for its descendants! (3 DB Calls)
              (map permissions.path/collection-readwrite-path
                   (user->tenant-collection-and-descendant-ids user-or-id))
              ;; Current User always gets read perms for Transforms if they are an analyst (1 DB Call)
              (when (or (data-perms/is-data-analyst? user-id) (data-perms/is-superuser? user-id))
                (concat ["/collection/namespace/transforms/root/"]
                        (map permissions.path/collection-readwrite-path ((requiring-resolve 'metabase.collections.models.collection/collections-in-namespace)
                                                                         :transforms))))
              ;; worktree collections for a holder of the remote-sync application permission (1 DB call)
              (worktree-collection-paths group-perms)
              ;; include the other Perms entries for any Group this User is in (1 DB Call)
              group-perms))))))

(defn query-creation-capabilities
  "Returns a map with `:can-create-queries` and `:can-create-native-queries` for the given user,
   based on their create-queries permissions across all databases."
  [user-id]
  (let [best (data-perms/most-permissive-database-permission-for-user user-id :perms/create-queries)]
    {:can-create-queries        (boolean
                                 (or (data-perms/at-least-as-permissive? :perms/create-queries best :query-builder)
                                     (published-tables/user-has-any-published-table-permission?)))
     :can-create-native-queries (= best :query-builder-and-native)}))
