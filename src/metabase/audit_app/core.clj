(ns metabase.audit-app.core
  (:require
   [metabase.audit-app.grants]
   [metabase.audit-app.impl]
   [metabase.audit-app.models.audit-log]
   [metabase.audit-app.purview]
   [metabase.audit-app.settings]
   [potemkin :as p]))

(comment metabase.audit-app.grants/keep-me
         metabase.audit-app.impl/keep-me
         metabase.audit-app.models.audit-log/keep-me
         metabase.audit-app.purview/keep-me
         metabase.audit-app.settings/keep-me)

(p/import-vars
 [metabase.audit-app.grants
  reconcile-audit-read-grants!]
 [metabase.audit-app.impl
  default-audit-collection-entity-id
  audit-db-id
  default-audit-collection
  default-custom-reports-collection
  is-collection-id-audit?
  is-parent-collection-audit?
  memoized-select-audit-entity]
 [metabase.audit-app.models.audit-log
  model-details
  model-name]
 [metabase.audit-app.purview
  audit-view-names]
 [metabase.audit-app.settings
  analytics-dev-mode
  last-analytics-checksum
  last-analytics-checksum!])
