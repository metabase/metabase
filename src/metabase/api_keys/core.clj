(ns metabase.api-keys.core
  (:require
   [metabase.api-keys.db]
   [metabase.api-keys.models.api-key]
   [metabase.api-keys.write]
   [potemkin :as p]))

(comment
  metabase.api-keys.models.api-key/keep-me
  metabase.api-keys.db/keep-me
  metabase.api-keys.write/keep-me)

(p/import-vars
 [metabase.api-keys.models.api-key
  generate-key
  is-api-key-user?
  key-hash-salt
  prefix
  create-api-key-with-new-user!])

(p/import-vars
 [metabase.api-keys.db
  update-api-keys-last-used-at!])

(p/import-vars
 [metabase.api-keys.write
  delete-api-key!
  delete-api-keys!
  update-api-key!])
