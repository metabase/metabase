(ns metabase-enterprise.writable-connection.core
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise database-write-data-details
  "Returns the `:write-data-details` for a database when the `:writable-connection` feature is available."
  :feature :writable-connection
  [database]
  (:write-data-details database))
