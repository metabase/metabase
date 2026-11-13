(ns metabase-enterprise.data-studio.permissions.published-tables
  "Enterprise implementation of published table permissions.
  Provides query access to published tables via collection permissions."
  (:require
   [metabase-enterprise.data-studio.db :as data-studio.db]
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise user-published-table-permission
  "Returns :query-builder permission if table is published and user has collection access.
  Tables published into the root collection (collection_id=nil) are accessible to all users."
  :feature :library
  [user-id perm-type table-id]
  (when (and (= perm-type :perms/create-queries)
             (data-studio.db/published-table-visible-to-user? table-id user-id (perms/is-superuser? user-id)))
    :query-builder))

(defenterprise user-has-any-published-table-permission?
  "Returns true if user has access to any published table via collection permissions."
  :feature :library
  []
  (data-studio.db/any-published-table-visible?))

(defenterprise user-has-published-table-permission-for-database?
  "Returns true if user has access to any published table in the given database via collection permissions."
  :feature :library
  [database-id]
  (data-studio.db/published-table-visible-in-database? database-id))

(defenterprise can-access-via-collection?
  "Returns true if the user can access this published table via collection read permissions."
  :feature :library
  [table]
  (when (:is_published table)
    (mi/current-user-has-full-permissions? (perms/perms-objects-set-for-parent-collection (:collection_id table) :read))))

(defenterprise published-table-clause
  "A HoneySQL clause holding when the Table aliased `table-alias` is published into a Collection the user of
  `user-info` can read, which grants `:perms/create-queries :query-builder`. It reads the probed Table's own columns,
  so each Table is checked on its own."
  :feature :library
  [{:keys [user-id is-superuser?]} table-alias]
  (let [column (fn [c] (keyword (str (name table-alias) "." c)))]
    [:and
     [:= (column "is_published") true]
     (collection/visible-collection-filter-clause
      (column "collection_id")
      {}
      {:current-user-id user-id
       :is-superuser?   is-superuser?})]))
