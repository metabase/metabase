(ns metabase-enterprise.database-isolation.provisioner
  "Warehouse-side provisioning seam shared by database isolation and workspaces:
   the [[DatabaseProvisioner]] protocol and the driver-backed
   [[database-provisioner]] that runs each operation under the admin connection
   overlay."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [potemkin.types :as p]))

(p/defprotocol+ DatabaseProvisioner
  "Wrapper around the driver isolation multimethods for testability.
   The default [[database-provisioner]] delegates to the real driver multimethods.
   Tests can reify custom implementations that fail on demand, count calls, etc.

   `isolation` throughout is the descriptor map the driver multimethods expect:
   `:id` (a string/int unique per isolation) plus, after [[details]], `:schema`
   and `:database_details`."
  (details  [this driver database isolation]
    "Compute {:schema ... :database_details ...} for the isolation without touching
     the warehouse. Called before init! so destroy! can clean up a partial init.")
  (init!    [this driver database isolation]
    "Create isolated schema + user. `isolation` carries the precomputed `:schema`
     and `:database_details` from [[details]].")
  (grant!   [this driver database isolation schemas]
    "Grant read access on `schemas` to the isolation user/role. `schemas` is a
     vector of driver-opaque schema-name strings. 3-slot drivers (SQL Server,
     BigQuery) derive the catalog from `database.details`.")
  (destroy! [this driver database isolation]
    "Tear down isolated schema + user. Should be idempotent."))

(def database-provisioner
  "Default DatabaseProvisioner that dispatches to the driver multimethods.

   Each call is wrapped in [[driver.conn/with-admin-connection]] so the underlying
   driver impls acquire connections via the database's `:admin-details` overlay
   (when configured). Isolation DDL — `CREATE USER`, `CREATE SCHEMA`, `GRANT` —
   typically needs higher-privilege credentials than the regular query user, and
   the admin overlay is how operators provide them. `details` computes no DDL but
   still binds the overlay: some drivers derive connection strings/catalogs from
   the effective details.

   Never invoke inside a `with-swapped-connection-details` scope for the same
   database: the swap merges over the admin overlay, so the DDL would run as the
   swapped (confined) principal and fail at the warehouse."
  (reify DatabaseProvisioner
    (details [_ driver database isolation]
      (driver.conn/with-admin-connection
        (driver/workspace-isolation-details driver database isolation)))
    (init! [_ driver database isolation]
      (driver.conn/with-admin-connection
        (driver/init-workspace-isolation! driver database isolation)))
    (grant! [_ driver database isolation schemas]
      (driver.conn/with-admin-connection
        (driver/grant-workspace-read-access! driver database isolation schemas)))
    (destroy! [_ driver database isolation]
      (driver.conn/with-admin-connection
        (driver/destroy-workspace-isolation! driver database isolation)))))
