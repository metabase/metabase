(ns metabase.permissions.core
  "`permissions` module API namespace."
  (:require
   [metabase.permissions.models.data-permissions]
   [metabase.permissions.models.data-permissions.sql]
   [metabase.permissions.models.permissions]
   [metabase.permissions.models.permissions-group]
   [metabase.permissions.models.permissions-group-membership]
   [metabase.permissions.path]
   [metabase.permissions.query]
   [metabase.permissions.user]
   [metabase.permissions.util]
   [potemkin :as p]))

(comment
  metabase.permissions.models.data-permissions/keep-me
  metabase.permissions.models.data-permissions.sql/keep-me
  metabase.permissions.models.permissions/keep-me
  metabase.permissions.models.permissions-group/keep-me
  metabase.permissions.models.permissions-group-membership/keep-me
  metabase.permissions.path/keep-me
  metabase.permissions.query/keep-me
  metabase.permissions.user/keep-me
  metabase.permissions.util/keep-me)

(p/import-vars
 [metabase.permissions.models.data-permissions
  at-least-as-permissive?
  disable-perms-cache
  full-db-permission-for-user
  full-schema-permission-for-user
  most-permissive-database-permission-for-user
  permissions-for-user
  prime-db-cache
  schema-permission-for-user
  set-database-permission!
  set-new-database-permissions!
  set-new-table-permissions!
  set-table-permission!
  user-has-any-perms-of-type?
  user-has-permission-for-database?
  user-has-permission-for-table?
  with-relevant-permissions-for-user]
 [metabase.permissions.models.data-permissions.sql
  UserInfo
  PermissionMapping
  visible-table-filter-select]
 [metabase.permissions.models.permissions
  audit-namespace-clause
  can-read-audit-helper
  current-user-has-application-permissions?
  grant-application-permissions!
  grant-collection-read-permissions!
  grant-collection-readwrite-permissions!
  grant-permissions!
  perms-objects-set-for-parent-collection
  revoke-application-permissions!
  revoke-collection-permissions!
  set-has-full-permissions-for-set?
  set-has-full-permissions?]
 [metabase.permissions.models.permissions-group
  non-magic-groups]
 [metabase.permissions.models.permissions-group-membership
  add-users-to-groups!
  add-user-to-groups!
  add-user-to-group!
  allow-changing-all-users-group-members
  fail-to-remove-last-admin-msg
  remove-user-from-group!
  remove-user-from-groups!
  throw-if-last-admin!
  without-is-superuser-sync-on-add-to-admin-group]
 [metabase.permissions.path
  application-perms-path
  collection-read-path
  collection-readwrite-path]
 [metabase.permissions.query
  check-run-permissions-for-query]
 [metabase.permissions.user
  user-permissions-set]
 [metabase.permissions.util
  PathSchema
  check-revision-numbers
  impersonated-user?
  impersonation-enforced-for-db?
  log-permissions-changes
  sandboxed-or-impersonated-user?
  sandboxed-user?])

;;; import these vars with different names to make their purpose more obvious. These actually do have docstrings but
;;; Kondo gets tripped up here.

#_{:clj-kondo/ignore [:missing-docstring]}
(p/import-def metabase.permissions.models.permissions-group/all-users all-users-group)

#_{:clj-kondo/ignore [:missing-docstring]}
(p/import-def metabase.permissions.models.permissions-group/admin admin-group)
