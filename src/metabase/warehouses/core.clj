(ns metabase.warehouses.core
  (:require
   [metabase.warehouses.config-file]
   [metabase.warehouses.provider-detection]
   [metabase.warehouses.settings]
   [metabase.warehouses.util]
   [potemkin :as p]))

(comment metabase.warehouses.config-file/keep-me
         metabase.warehouses.provider-detection/keep-me
         metabase.warehouses.settings/keep-me
         metabase.warehouses.util/keep-me)

(p/import-vars
 [metabase.warehouses.config-file
  upsert-database-from-config!]
 [metabase.warehouses.provider-detection
  detect-provider-from-database]
 [metabase.warehouses.settings
  cloud-gateway-ips
  disable-auto-sync]
 [metabase.warehouses.util
  get-database
  test-connection-details
  test-database-connection])
