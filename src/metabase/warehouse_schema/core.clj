(ns metabase.warehouse-schema.core
  "API namespace for the warehouse-schema module."
  (:require
   [metabase.lib-be.core]
   [metabase.warehouse-schema.db]
   [potemkin :as p]))

(comment
  metabase.lib-be.core/keep-me
  metabase.warehouse-schema.db/keep-me)

(p/import-vars
 [metabase.lib-be.core
  field-user-settings-column
  field-user-settings-join]
 [metabase.warehouse-schema.db
  field-source
  with-sync-values])
