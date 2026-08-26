(ns metabase.permissions.user
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.path :as permissions.path]
   [metabase.permissions.published-tables :as published-tables]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defenterprise user->tenant-collection-and-descendant-ids
  "Returns descendant IDs for the user's tenant collection. Returns an empty vector in OSS since tenants are an EE feature."
  metabase-enterprise.tenants.models
  [_user-or-id]
  [])

(defn user-permissions-set
  "Return a set of all permissions object paths that `user-or-id` has been granted access to. (2 DB Calls)"
  [user-or-id]
  (tracing/with-span :db-app "db-app.permissions-load" {}
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
                                        :where  [:= :pgm.user_id user-id]})))))))

(defn- user-has-any-readable-card-source?
  "Whether the current user has collection read access to at least one non-archived model or metric.
  Ad-hoc queries whose primary source is such a card are authorized by the card's collection read
  perms alone — see [[metabase.query-permissions.impl/legacy-mbql-required-perms]] — so they allow
  building (card-sourced) queries even with no `create-queries` permission on any database."
  []
  (boolean
   (when api/*current-user-id*
     (t2/exists? :model/Card
                 {:where [:and
                          [:in :type [:inline ["model" "metric"]]]
                          [:= :archived false]
                          ;; requiring-resolve to avoid a circular dependency with the collections
                          ;; module, same as in [[user-permissions-set]]
                          ((requiring-resolve 'metabase.collections.models.collection/visible-collection-filter-clause)
                           :collection_id)]}))))

(defn query-creation-capabilities
  "Returns a map with `:can-create-queries` and `:can-create-native-queries` for the given user,
   based on their create-queries permissions across all databases."
  [user-id]
  (let [best (data-perms/most-permissive-database-permission-for-user user-id :perms/create-queries)]
    {:can-create-queries        (boolean
                                 (or (data-perms/at-least-as-permissive? :perms/create-queries best :query-builder)
                                     (published-tables/user-has-any-published-table-permission?)
                                     ;; collection read access to a model or metric also allows
                                     ;; building (card-sourced) queries
                                     (user-has-any-readable-card-source?)))
     :can-create-native-queries (= best :query-builder-and-native)}))
