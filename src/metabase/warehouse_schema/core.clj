(ns metabase.warehouse-schema.core
  "API namespace for the warehouse-schema module."
  (:require
   [metabase.warehouse-schema.db]
   [potemkin :as p]))

(comment
  metabase.warehouse-schema.db/keep-me)

(p/import-vars
 [metabase.warehouse-schema.db
  user-renamed-field-names])
