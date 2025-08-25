(ns metabase.warehouses.core
  (:require
   [metabase.warehouses.provider-detection]
   [metabase.warehouses.settings]
   [potemkin :as p]))

(comment metabase.warehouses.settings/keep-me)

(p/import-vars
 [metabase.warehouses.provider-detection
  providers-for-engine]
 [metabase.warehouses.settings
  cloud-gateway-ips])
