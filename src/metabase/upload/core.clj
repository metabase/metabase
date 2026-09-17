(ns metabase.upload.core
  (:require
   [metabase.upload.db]
   [metabase.upload.impl]
   [metabase.warehouses.db :as warehouses.db]
   [potemkin :as p]))

(comment
  metabase.upload.db/keep-me
  metabase.upload.impl/keep-me)

(defn current-database
  "The Database being used for uploads, or nil."
  []
  (warehouses.db/select-one-database {:uploads_enabled true}))

(p/import-vars
 [metabase.upload.impl
  based-on-upload-input-keys
  can-create-upload?
  create-csv-upload!
  delete-upload!
  max-upload-part-count
  max-upload-size-bytes
  models-based-on-upload
  update-action-schema
  update-csv!])
