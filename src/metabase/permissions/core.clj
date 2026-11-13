(ns metabase.permissions.core
  "`permissions` module API namespace."
  (:require
   [metabase.permissions.collection-permissions]
   [metabase.permissions.data-access-token]
   [metabase.permissions.data-permissions]
   [metabase.permissions.db]
   [metabase.permissions.models.application-permissions-revision]
   [metabase.permissions.models.collection-permission-graph-revision]
   [metabase.permissions.models.collection.graph]
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
  metabase.permissions.collection-permissions/keep-me
  metabase.permissions.data-permissions/keep-me
  metabase.permissions.models.permissions/keep-me
  metabase.permissions.models.permissions-group/keep-me
  metabase.permissions.models.permissions-group-membership/keep-me
  metabase.permissions.models.permissions-revision/keep-me
  metabase.permissions.data-access-token/keep-me
  metabase.permissions.path/keep-me
  metabase.permissions.published-tables/keep-me
  metabase.permissions.user/keep-me
  metabase.permissions.util/keep-me
  metabase.permissions.validation/keep-me)

(p/import-vars
 [metabase.permissions.collection-permissions
  collection-permission-filter-clause
  collection-permission-for-user
  some-collection-permission-for-user
  user-has-permission-for-collection?]
 [metabase.permissions.db
  group-tenant-flags
  groups-by-ids
  select-tables-and-groups-granting-perm]
 [metabase.permissions.data-permissions
  at-least-as-permissive?
  batch-delete-permissions!
  batch-insert-permissions!
  data-app-collection-ids
  data-app-collection?
  disable-perms-cache
  download-perms-level
  every-table-in-database-permission-for-user
  every-table-in-schema-permission-for-user
  groups-have-permission-for-table?
  index-database-permissions
  is-superuser?
  is-data-analyst?
  native-download-permission-for-user
  permissions-for-user
  sandboxes-for-user
  some-table-in-database-permission-for-user
  some-table-in-schema-permission-for-user
  some-table-permission-for-user
  set-database-permission!
  set-table-permission!
  set-table-permissions!
  table-permission-for-user
  table-permission-for-groups
  user-has-highest-permission-anywhere?
  user-has-permission-for-database?
  user-has-permission-for-some-table-in-schema?
  user-has-permission-for-table?
  with-additional-table-permission
  with-relevant-permissions-for-user
  user-has-transforms-permission-anywhere?
  user-has-transforms-permission-for-database?
  set-default-group-permissions!
  set-default-database-permissions!
  set-default-table-permissions!
  set-default-table-permissions-bulk!
  with-global-permissions-lock
  with-db-scoped-permissions-lock
  visible-databases-filter-clause
  visible-tables-filter-clause]
 [metabase.permissions.models.permissions
  namespace-clause
  can-read-audit-helper
  can-read-via-parent-collection?
  collection-based-visibility-search-models
  collection-id-only-read-method
  collection-id-only-read-models
  collection-read-access-group-ids
  current-user-has-application-permissions?
  define-collection-based-visibility!
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
  group-display-name
  non-magic-groups
  all-users-magic-group-type]
 [metabase.permissions.models.permissions-group-membership
  add-users-to-groups!
  add-user-to-groups!
  add-user-to-group!
  allow-changing-all-users-group-members
  allow-changing-all-external-users-group-members
  fail-to-remove-last-admin-msg
  fail-to-add-data-analyst-msg
  remove-user-from-group!
  remove-user-from-groups!
  remove-all-users-from-group!
  remove-user-from-all-groups!
  throw-if-last-admin!
  without-is-superuser-sync-on-add-to-admin-group]
 [metabase.permissions.path
  application-perms-path
  collection-read-path
  collection-readwrite-path
  collection-path?]
 [metabase.permissions.user
  query-creation-capabilities
  user-permissions-set
  user->tenant-collection-and-descendant-ids]
 [metabase.permissions.util
  PathSchema
  check-revision-numbers
  impersonated-user?
  impersonation-enforced-for-db?
  log-permissions-changes
  routed-user?
  sandboxed-or-impersonated-user?
  sandboxed-user?
  sandboxed-user-for-db?
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
  user-has-published-table-permission-for-database?])

(p/import-vars [metabase.permissions.settings use-tenants])

(p/import-vars
 [metabase.permissions.data-access-token
  data-access-token
  digest
  data-access-compatible?
  data-access-token-transform
  data-access-token-reader
  routing-token-for-db])

;;; import these vars with different names to make their purpose more obvious.
(p/import-def metabase.permissions.models.permissions-group/all-users                    all-users-group)
(p/import-def metabase.permissions.models.permissions-group/admin                        admin-group)
(p/import-def metabase.permissions.models.permissions-group/data-analyst                 data-analyst-group)
(p/import-def metabase.permissions.models.application-permissions-revision/latest-id     latest-application-permissions-revision-id)
(p/import-def metabase.permissions.models.collection-permission-graph-revision/latest-id latest-collection-permissions-revision-id)
(p/import-def metabase.permissions.models.permissions-revision/latest-id                 latest-permissions-revision-id)
(p/import-def metabase.permissions.data-permissions/least-permissive-value        least-permissive-data-perms-value)
(p/import-def metabase.permissions.models.permissions-group/all-external-users           all-external-users-group)

(p/import-vars [metabase.permissions.models.permissions-group
                check-tenant-groups-visible!
                hidden-tenant-group-ids])
