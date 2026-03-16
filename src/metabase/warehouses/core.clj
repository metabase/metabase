(ns metabase.warehouses.core
  (:require
   [metabase.warehouses.provider-detection]
   [metabase.warehouses.settings]
   [metabase.warehouses.util]
   [potemkin :as p]))

(comment metabase.warehouses.provider-detection/keep-me
         metabase.warehouses.settings/keep-me
         metabase.warehouses.util/keep-me)

(p/import-vars
 [metabase.warehouses.provider-detection
  detect-provider-from-database]
 [metabase.warehouses.settings
  cloud-gateway-ips]
 [metabase.warehouses.util
  get-database
  test-connection-details
  test-database-connection])
