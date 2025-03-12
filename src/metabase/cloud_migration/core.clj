(ns metabase.cloud-migration.core
  (:require
   [metabase.cloud-migration.settings]
   [potemkin :as p]))

(comment metabase.cloud-migration.settings/keep-me)

(p/import-vars
 [metabase.cloud-migration.settings
  read-only-mode
  read-only-mode!

  store-api-url])
