(ns metabase-enterprise.permissions.published-tables
  "Enterprise implementation of published table permissions.
  Provides query access to published tables via collection permissions."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.premium-features.core :refer [defenterprise]]
   [toucan2.core :as t2]))

(defenterprise user-published-table-permission
  "Returns :query-builder permission if table is published and user has collection access.
  Tables published into the root collection (collection_id=nil) are accessible to all users."
  :feature :data-studio
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
  :feature :data-studio
  []
  (t2/exists? :model/Table
              {:where [:and
                       [:= :is_published true]
                       (collection/visible-collection-filter-clause :collection_id)]}))

(defenterprise user-has-published-table-permission-for-database?
  "Returns true if user has access to any published table in the given database via collection permissions."
  :feature :data-studio
  [database-id]
  (t2/exists? :model/Table
              {:where [:and
                       [:= :db_id database-id]
                       [:= :is_published true]
                       (collection/visible-collection-filter-clause :collection_id)]}))
