(ns metabase.permissions.user
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.path :as permissions.path]
   [metabase.permissions.published-tables :as published-tables]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defenterprise user->tenant-collection-and-descendant-ids
  "Returns descendant IDs for the user's tenant collection. Returns an empty vector in OSS since tenants are an EE feature."
  metabase-enterprise.tenants.model
  [_user-or-id]
  [])

(defn user-permissions-set
  "Return a set of all permissions object paths that `user-or-id` has been granted access to. (2 DB Calls)"
  [user-or-id]
  (let [s
        (set (when-let [user-id (u/the-id user-or-id)]
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

                ;; include the other Perms entries for any Group this User is in (1 DB Call)
                (map :object (app-db/query {:select [:p.object]
                                            :from   [[:permissions_group_membership :pgm]]
                                            :join   [[:permissions_group :pg] [:= :pgm.group_id :pg.id]
                                                     [:permissions :p]        [:= :p.group_id :pg.id]]
                                            :where  [:= :pgm.user_id user-id]})))))]
    ;; Append permissions as a vector for more efficient iteration in checks that go over each permission linearly.
    (with-meta s {:as-vec (vec s)})))

(defn query-creation-capabilities
  "Returns a map with `:can-create-queries` and `:can-create-native-queries` for the given user,
   based on their create-queries permissions across all databases."
  [user-id]
  (let [db-ids             (t2/select-pks-set :model/Database)
        _                  (data-perms/prime-db-cache db-ids)
        create-query-perms (into #{}
                                 (map #(data-perms/most-permissive-database-permission-for-user
                                        user-id :perms/create-queries %))
                                 db-ids)]
    {:can-create-queries        (boolean
                                 (or (some #(data-perms/at-least-as-permissive?
                                             :perms/create-queries % :query-builder)
                                           create-query-perms)
                                     (published-tables/user-has-any-published-table-permission?)))
     :can-create-native-queries (contains? create-query-perms :query-builder-and-native)}))
