(ns metabase.warehouses.core
  (:require
   [metabase.warehouses.settings]
   [potemkin :as p]))

(comment metabase.warehouses.settings/keep-me)

(p/import-vars
 [metabase.warehouses.settings
  cloud-gateway-ips])
