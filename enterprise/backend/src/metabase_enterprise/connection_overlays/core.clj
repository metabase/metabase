(ns metabase-enterprise.connection-overlays.core
  "EE implementations for non-default connection-detail overlays. Each overlay is gated by its own
   premium feature; the OSS counterparts in [[metabase.driver.connection]] return `nil`."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise database-write-data-details
  "Returns the `:write-data-details` for a database when the `:writable-connection` feature is available.

  `database` is a [[lib/metadata]] database instance. To pass a Toucan2 database instance, use [[driver.u/ensure-lib-database]]."
  :feature :writable-connection
  [database]
  (:write-data-details database))

(defenterprise database-admin-details
  "Returns the `:admin-details` for a database when the `:workspaces` feature is available.

  `database` is a [[lib/metadata]] database instance. To pass a Toucan2 database instance, use [[driver.u/ensure-lib-database]]."
  :feature :workspaces
  [database]
  (:admin-details database))
