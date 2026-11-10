(ns metabase.warehouse-schema.core
  "API namespace for the warehouse-schema module."
  (:require
   [metabase.warehouse-schema.db]
   [metabase.warehouse-schema.models.field-user-settings]
   [metabase.warehouse-schema.models.table-user-settings]
   [potemkin :as p]))

(comment
  metabase.warehouse-schema.db/keep-me
  metabase.warehouse-schema.models.field-user-settings/keep-me
  metabase.warehouse-schema.models.table-user-settings/keep-me)

(p/import-vars
 [metabase.warehouse-schema.db
  user-renamed-field-names]
 [metabase.warehouse-schema.models.field-user-settings
  delete-field-user-settings!]
 [metabase.warehouse-schema.models.table-user-settings
  delete-table-user-settings!])
