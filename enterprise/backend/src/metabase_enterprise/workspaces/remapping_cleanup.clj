(ns metabase-enterprise.workspaces.remapping-cleanup
  "Lifecycle hook: clear `TableRemapping` rows when a `WorkspaceDatabase` is
   deprovisioned.

   Lives as a leaf to break a `provisioning` -> `table-remapping` -> `core` ->
   `provisioning` require cycle: the deprovision path needs to delete remapping
   rows scoped to the workspace's iso namespace, but `table-remapping` reaches
   back through `workspaces.core` which loads `provisioning`. The `:db`-slot
   derivation goes through [[metabase.driver.sql/db-slot-value]] so this ns
   has no workspace deps beyond the model registration."
  (:require
   [metabase-enterprise.workspaces.models.table-remapping]
   [metabase.driver.sql :as driver.sql]
   [toucan2.core :as t2]))

(comment metabase-enterprise.workspaces.models.table-remapping/keep-me)

(defn- iso-db-slot
  "Value of the `:db` AST slot a `TableRemapping.to_db` carries for `database`'s
   engine. Empty string for drivers that don't populate the `:db` slot
   (Postgres, Redshift, H2, ClickHouse) — the storage sentinel. For drivers
   that do (MySQL, SQL Server, BigQuery), consults
   [[metabase.driver.sql/db-slot-value]]."
  [database]
  (or (driver.sql/db-slot-value (:engine database) database) ""))

(defn clear-mappings-for-iso!
  "Delete every `TableRemapping` row on `database`'s id whose `to_*` slots match
   the iso namespace `(iso-db, iso-schema)` for this workspace_database row.

   Idempotent — 0 rows deleted is a valid outcome when nothing was registered
   (e.g. a workspace_database that was provisioned but never had a transform run).

   Scope rationale: the unique constraint on `(database_id, from_db, from_schema,
   from_table_name)` prevents two workspaces on the same metabase_database from
   remapping the same canonical table. So deleting by iso namespace is enough
   to avoid clobbering another workspace's rows on the same database_id.

   Returns the count of rows deleted."
  [database database-id output-namespace]
  (long
   (t2/delete! :model/TableRemapping
               :database_id database-id
               :to_db       (iso-db-slot database)
               :to_schema   (or output-namespace ""))))
