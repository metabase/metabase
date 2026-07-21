(ns metabase.upload.core
  (:require
   [metabase.upload.db]
   [metabase.upload.impl]
   [metabase.upload.settings]
   [potemkin :as p]))

(comment
  metabase.upload.db/keep-me
  metabase.upload.impl/keep-me
  metabase.upload.settings/keep-me)

(p/import-vars
 [metabase.upload.db
  current-database]
 [metabase.upload.settings
  uploads-settings]
 [metabase.upload.impl
  can-create-upload?
  create-csv-table!
  create-csv-upload!
  delete-upload!
  max-upload-part-count
  max-upload-size-bytes
  model-hydrate-based-on-upload
  update-action-schema
  update-csv!])
