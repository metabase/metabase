(ns metabase.store-api.core
  (:require
   [metabase.store-api.settings]
   [potemkin :as p]))

(p/import-vars
 [metabase.store-api.settings
  store-api-url
  store-api-url!])
