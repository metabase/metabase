(ns metabase-enterprise.admin-connection.core
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise database-admin-details
  "Returns the `:admin-details` for a database when the `:admin-connection` feature is available.

  `database` is a [[lib/metadata]] database instance. To pass a Toucan2 database instance, use [[driver.u/ensure-lib-database]]."
  :feature :admin-connection
  [database]
  (:admin-details database))
