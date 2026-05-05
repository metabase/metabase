(ns metabase.api-keys.core
  (:require
   [metabase.api-keys.models.api-key]
   [potemkin :as p]))

(comment metabase.api-keys.models.api-key/keep-me)

(p/import-vars
 [metabase.api-keys.models.api-key
  generate-key
  is-api-key-user?
  prefix
  create-api-key-with-new-user!])
