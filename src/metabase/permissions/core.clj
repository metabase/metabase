(ns metabase.permissions.core
  "`permissions` module API namespace."
  {:clj-kondo/config '{:linters {:missing-docstring {:level :off}}}}
  (:require
   [metabase.permissions.models.application-permissions-revision]
   [metabase.permissions.models.collection-permission-graph-revision]
   [metabase.permissions.models.collection.graph]
   [metabase.permissions.models.data-permissions]
   [metabase.permissions.models.data-permissions.sql]
   [metabase.permissions.models.permissions]
   [metabase.permissions.models.permissions-group]
   [metabase.permissions.models.permissions-group-membership]
   [metabase.permissions.models.permissions-revision]
   [metabase.permissions.path]
   [metabase.permissions.published-tables]
   [metabase.permissions.settings]
   [metabase.permissions.user]
   [metabase.permissions.util]
   [metabase.permissions.validation]
   [potemkin :as p]))

(comment
  metabase.permissions.models.application-permissions-revision/keep-me
  metabase.permissions.models.collection-permission-graph-revision/keep-me
  metabase.permissions.models.collection.graph/keep-me
  metabase.permissions.models.data-permissions/keep-me
  metabase.permissions.models.data-permissions.sql/keep-me
  metabase.permissions.models.permissions/keep-me
  metabase.permissions.models.permissions-group/keep-me
  metabase.permissions.models.permissions-group-membership/keep-me
  metabase.permissions.models.permissions-revision/keep-me
  metabase.permissions.path/keep-me
  metabase.permissions.published-tables/keep-me
  metabase.permissions.user/keep-me
  metabase.permissions.util/keep-me
  metabase.permissions.validation/keep-me)

(p/import-vars
 [metabase.permissions.models.data-permissions
  at-least-as-permissive?
  disable-perms-cache
  download-perms-level
  full-db-permission-for-user
  full-schema-permission-for-user
  groups-have-permission-for-table?
  is-superuser?
  is-data-analyst?
  most-permissive-database-permission-for-user
  native-download-permission-for-user
  permissions-for-user
  prime-db-cache
  sandboxes-for-user
  schema-permission-for-user
  set-database-permission!
  set-external-group-permissions!
  set-new-database-permissions!
  set-new-table-permissions!
  set-table-permission!
  set-table-permissions!
  table-permission-for-user
  table-permission-for-groups
  user-has-any-perms-of-type?
  user-has-permission-for-database?
  user-has-permission-for-schema?
  user-has-permission-for-table?
  with-additional-table-permission
  with-relevant-permissions-for-user
  has-any-transforms-permission?
  has-db-transforms-permission?]
 [metabase.permissions.models.data-permissions.sql
  UserInfo
  PermissionMapping
  visible-database-filter-select
  visible-table-filter-select
  visible-table-filter-with-cte
  select-tables-and-groups-granting-perm]
 [metabase.permissions.models.permissions
  namespace-clause
  can-read-audit-helper
  current-user-has-application-permissions?
  grant-application-permissions!
  grant-collection-read-permissions!
  grant-collection-readwrite-permissions!
  grant-permissions!
  perms-objects-set-for-parent-collection
  revoke-application-permissions!
  revoke-collection-permissions!
  set-has-application-permission-of-type?
  set-has-full-permissions-for-set?
  set-has-full-permissions?]
 [metabase.permissions.models.permissions-group
  non-magic-groups
  all-users-magic-group-type
  sync-data-analyst-group-for-oss!]
 [metabase.permissions.models.permissions-group-membership
  add-users-to-groups!
  add-user-to-groups!
  add-user-to-group!
  allow-changing-all-users-group-members
  allow-changing-all-external-users-group-members
  fail-to-remove-last-admin-msg
  remove-user-from-group!
  remove-user-from-groups!
  throw-if-last-admin!
  without-is-superuser-sync-on-add-to-admin-group]
 [metabase.permissions.path
  application-perms-path
  collection-read-path
  collection-readwrite-path
  collection-path?]
 [metabase.permissions.user
  user-permissions-set
  user->tenant-collection-and-descendant-ids]
 [metabase.permissions.util
  PathSchema
  check-revision-numbers
  impersonated-user?
  impersonation-enforced-for-db?
  log-permissions-changes
  sandboxed-or-impersonated-user?
  sandboxed-user?
  increment-implicit-perms-revision!
  save-perms-revision!]
 [metabase.permissions.validation
  check-advanced-permissions-enabled
  check-group-manager
  check-has-application-permission
  check-manager-of-group]
 [metabase.permissions.models.collection.graph
  graph
  update-graph!]
 [metabase.permissions.published-tables
  can-access-via-collection?
  user-published-table-permission
  user-has-any-published-table-permission?
  user-has-published-table-permission-for-database?
  published-table-visible-clause])

(p/import-vars [metabase.permissions.settings use-tenants])

;;; import these vars with different names to make their purpose more obvious.
(p/import-def metabase.permissions.models.permissions-group/all-users                    all-users-group)
(p/import-def metabase.permissions.models.permissions-group/admin                        admin-group)
(p/import-def metabase.permissions.models.permissions-group/data-analyst                 data-analyst-group)
(p/import-def metabase.permissions.models.application-permissions-revision/latest-id     latest-application-permissions-revision-id)
(p/import-def metabase.permissions.models.collection-permission-graph-revision/latest-id latest-collection-permissions-revision-id)
(p/import-def metabase.permissions.models.permissions-revision/latest-id                 latest-permissions-revision-id)
(p/import-def metabase.permissions.models.data-permissions/least-permissive-value        least-permissive-data-perms-value)
(p/import-def metabase.permissions.models.permissions-group/all-external-users           all-external-users-group)
