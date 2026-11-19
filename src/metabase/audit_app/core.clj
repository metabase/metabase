(ns metabase.audit-app.core
  (:require
   [metabase.audit-app.impl]
   [metabase.audit-app.models.audit-log]
   [metabase.audit-app.settings]
   [metabase.audit-app.spec]
   [potemkin :as p]))

(comment metabase.audit-app.impl/keep-me
         metabase.audit-app.models.audit-log/keep-me
         metabase.audit-app.settings/keep-me
         metabase.audit-app.spec/keep-me)

(p/import-vars
 [metabase.audit-app.impl
  default-audit-collection-entity-id
  audit-db-id
  default-audit-collection
  default-custom-reports-collection
  is-collection-id-audit?
  is-parent-collection-audit?
  memoized-select-audit-entity]
 [metabase.audit-app.models.audit-log
  model-name]
 [metabase.audit-app.settings
  analytics-dev-mode
  last-analytics-checksum
  last-analytics-checksum!]
 [metabase.audit-app.spec
  skipped-columns
  spec])
