(ns metabase-enterprise.data-studio.permissions.published-tables
  "Enterprise implementation of published table permissions.
  Provides query access to published tables via collection permissions."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [toucan2.core :as t2]))

(defenterprise user-published-table-permission
  "Returns :query-builder permission if table is published and user has collection access.
  Tables published into the root collection (collection_id=nil) are accessible to all users."
  :feature :library
  [perm-type table-id]
  (when (and (= perm-type :perms/create-queries)
             (t2/exists? :model/Table
                         {:where [:and
                                  [:= :id table-id]
                                  [:= :is_published true]
                                  (collection/visible-collection-filter-clause :collection_id)]}))
    :query-builder))

(defenterprise user-has-any-published-table-permission?
  "Returns true if user has access to any published table via collection permissions."
  :feature :library
  []
  (t2/exists? :model/Table
              {:where [:and
                       [:= :is_published true]
                       (collection/visible-collection-filter-clause :collection_id)]}))

(defenterprise user-has-published-table-permission-for-database?
  "Returns true if user has access to any published table in the given database via collection permissions."
  :feature :library
  [database-id]
  (t2/exists? :model/Table
              {:where [:and
                       [:= :db_id database-id]
                       [:= :is_published true]
                       (collection/visible-collection-filter-clause :collection_id)]}))

(defenterprise can-access-via-collection?
  "Returns true if the user can access this published table via collection read permissions."
  :feature :library
  [table]
  (when (:is_published table)
    (mi/current-user-has-full-permissions? (perms/perms-objects-set-for-parent-collection table :read))))
