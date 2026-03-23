(ns metabase.sync.persist
  "Protocols for abstracting app-db access during sync.
   The sync process needs to read and write Database, Table, and Field models.
   These protocols allow swapping the persistence backend.")

;; =============================================================================
;; Current Protocol State (updated as we work through sync steps)
;; =============================================================================

(defprotocol SyncDatabaseWriter
  "Protocol for writing sync metadata to the app database."

  (set-dbms-version! [this database-id version]
    "Set the DBMS version for a database. `version` is a map.")

  (set-database-timezone! [this database-id timezone-id]
    "Set the timezone for a database. `timezone-id` is a string.")

  (set-database-details-version! [this database-id details version]
    "Merge version into database details.")

  (create-table! [this table-map]
    "Insert a new table row. Returns the created instance.")

  (reactivate-table! [this table-id changes]
    "Update an inactive table to mark it active again with the given changes map.")

  (retire-table! [this database-id schema table-name]
    "Mark a table as inactive by database-id, schema, and name.")

  (update-table! [this table-id changes]
    "Apply a partial update to a table by id.")

  (update-table-schema! [this database-id old-schema new-schema]
    "Rename a schema on all matching tables in a database.")

  (archive-table! [this table-id changes]
    "Archive a deactivated table (set archived_at, rename). Returns the number of rows updated."))

(defprotocol SyncDatabaseReader
  "Protocol for reading sync metadata from the app database."

  (active-tables [this database-id]
    "Return a set of active tables for a database.")

  (all-tables [this database-id]
    "Return a set of all tables (active + inactive) for a database.")

  (find-inactive-table-id [this database-id schema table-name]
    "Find an inactive table by db_id/schema/name. Returns the table id or nil.")

  (get-table [this table-id]
    "Get a single table by id.")

  (archivable-tables [this database-id threshold-expr]
    "Return tables eligible for archiving: inactive, not yet archived, not transform targets,
     deactivated before the threshold."))
