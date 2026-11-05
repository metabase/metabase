(ns metabase-enterprise.connection-overlays.core
  "EE implementations for non-default connection-detail overlays. Each overlay but the workspace provisioning login
   is gated by its own premium feature; the OSS counterparts in [[metabase.driver.connection]] return `nil`."
  (:require
   [metabase-enterprise.workspaces.core :as workspaces]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise database-write-data-details
  "Returns the `:write-data-details` for a database when the `:writable-connection` feature is available.

  `database` is a [[lib/metadata]] database instance. To pass a Toucan2 database instance, use [[driver.u/ensure-lib-database]]."
  :feature :writable-connection
  [database]
  (:write-data-details database))

(defenterprise database-workspace-provisioning-details
  "Returns the stored workspace provisioning login details for a database, or `nil` if none is configured.

  Not gated on `:workspaces`: deleting a workspace must still reach its warehouse user after the feature is gone."
  :feature :none
  [database]
  (workspaces/provisioning-details (:id database)))
