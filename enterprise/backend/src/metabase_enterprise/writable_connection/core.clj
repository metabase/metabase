(ns metabase-enterprise.writable-connection.core
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise database-write-data-details
  "Returns the `:write-data-details` for a database when the `:writable-connection` feature is available.
  
  `database` is a [[lib/metadata]] database instance. To pass a Toucan2 database instance, use [[driver.u/ensure-lib-database]]."
  :feature :writable-connection
  [database]
  (:write-data-details database))
