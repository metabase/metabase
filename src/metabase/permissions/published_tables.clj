(ns metabase.permissions.published-tables
  "Published tables permission functions.
  Published tables are an EE feature (data-studio) that allows tables to be placed in collections
  and accessed via collection permissions instead of data permissions.

  This namespace contains OSS stubs that return false/nil. The EE implementations in
  `metabase-enterprise.data-studio.permissions.published-tables` provide the actual functionality."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

;;; ---------------------------------------- Permission Check Functions ------------------------------------------------

(defenterprise user-published-table-permission
  "Returns `:query-builder` permission if table is published and user has collection access.
  OSS implementation always returns nil - published tables only grant access in EE."
  metabase-enterprise.data-studio.permissions.published-tables
  [_perm-type _table-id]
  nil)

(defenterprise user-has-any-published-table-permission?
  "Returns true if user has access to any published table via collection permissions.
  OSS implementation always returns false - published tables only grant access in EE."
  metabase-enterprise.data-studio.permissions.published-tables
  []
  false)

(defenterprise user-has-published-table-permission-for-database?
  "Returns true if user has access to any published table in the given database via collection permissions.
  OSS implementation always returns false - published tables only grant access in EE."
  metabase-enterprise.data-studio.permissions.published-tables
  [_database-id]
  false)

(defenterprise can-access-via-collection?
  "Returns true if the user can access this published table via collection read permissions.
  OSS implementation always returns false - published tables only grant access in EE."
  metabase-enterprise.data-studio.permissions.published-tables
  [_table]
  false)
