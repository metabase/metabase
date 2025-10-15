(ns metabase.warehouses.core
  (:require
   [metabase.warehouses.provider-detection]
   [metabase.warehouses.settings]
   [potemkin :as p]))

(comment metabase.warehouses.settings/keep-me)

(p/import-vars
 [metabase.warehouses.provider-detection
  detect-provider-from-database]
 [metabase.warehouses.settings
  cloud-gateway-ips])
