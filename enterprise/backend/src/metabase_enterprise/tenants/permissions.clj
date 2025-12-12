(ns metabase-enterprise.tenants.permissions
  "Enterprise implementation of tenant-specific collection permissions management."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn- revoke-perms-when-moving-into-tenant-specific!
  "When moving a `collection` that is *not* in the tenant-specific namespace into the tenant-specific namespace
  (or one of its descendants), any previous Group Permissions entries for it need to be deleted, as tenant-specific
  collections do not use the Permissions table.

  This needs to be done recursively for all descendants as well."
  [collection :- (ms/InstanceOf :model/Collection)]
  (t2/query-one {:delete-from :permissions
                 :where       [:in :object (for [coll (cons collection (collection/descendants collection))
                                                 path-fn [perms/collection-read-path
                                                          perms/collection-readwrite-path]]
                                             (path-fn coll))]}))

(mu/defn- grant-perms-when-moving-out-of-tenant-specific!
  "When moving a descendant of a tenant-specific Collection into a regular Collection namespace, we need to grant it
  Permissions by copying the new parent's permissions, since now that it has moved across the boundary into the
  regular namespace it *requires* Permissions to be seen or 'curated'. If we did not grant Permissions when moving,
  it would immediately become invisible to all save admins, because no Group would have perms for it. This is
  obviously a bad experience -- we do not want a User to move a Collection that they have read/write perms for
  (by definition) to somewhere else and lose all access for it."
  [collection :- (ms/InstanceOf :model/Collection) new-location :- @#'collection/LocationPath]
  ;; TODO(johnswanson, 2025-11-25) fix the private bits
  (#'collection/copy-collection-permissions! (#'collection/parent {:location new-location})
                                             (cons collection (collection/descendants collection))))

(defenterprise update-perms-for-tenant-specific-namespace-change!
  "If a Collection is moving into or out of the tenant-specific namespace, adjust the Permissions for it accordingly.

  EE version: When moving INTO tenant-specific namespace, deletes all permissions entries. When moving OUT, copies
  parent permissions to the collection and all descendants."
  :feature :tenants
  [collection-before-updates collection-updates]
  ;; First, figure out if the collection is in the tenant-specific namespace now, and whether it will be after the update
  (let [is-tenant-specific?      (collection/is-dedicated-tenant-collection-or-descendant? collection-before-updates)
        will-be-tenant-specific? (collection/is-dedicated-tenant-collection-or-descendant?
                                  (merge collection-before-updates collection-updates))]
    ;; See if whether it is in the tenant-specific namespace or not is set to change. If it's not going to
    ;; change, we don't need to do anything
    (when (not= is-tenant-specific? will-be-tenant-specific?)
      ;; If it *is* in the tenant-specific namespace, and is about to be moved into the 'regular' namespace, we need
      ;; to copy the new parent's perms for it and for all of its descendants
      (if is-tenant-specific?
        (grant-perms-when-moving-out-of-tenant-specific! collection-before-updates (:location collection-updates))
        ;; Otherwise, if it is *not* in the tenant-specific namespace, but is set to become one, we need to delete
        ;; any perms entries for it and for all of its descendants, as tenant-specific collections don't use the
        ;; Permissions table
        (revoke-perms-when-moving-into-tenant-specific! collection-before-updates)))))
