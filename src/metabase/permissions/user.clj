(ns metabase.permissions.user
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.permissions.path :as permissions.path]
   [metabase.util :as u]))

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
                ;; include the other Perms entries for any Group this User is in (1 DB Call)
                (map :object (app-db/query {:select [:p.object]
                                            :from   [[:permissions_group_membership :pgm]]
                                            :join   [[:permissions_group :pg] [:= :pgm.group_id :pg.id]
                                                     [:permissions :p]        [:= :p.group_id :pg.id]]
                                            :where  [:= :pgm.user_id user-id]})))))]
    ;; Append permissions as a vector for more efficient iteration in checks that go over each permission linearly.
    (with-meta s {:as-vec (vec s)})))
