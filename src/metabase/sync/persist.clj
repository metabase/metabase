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
    "Archive a deactivated table (set archived_at, rename). Returns the number of rows updated.")

  (insert-fields! [this field-maps]
    "Bulk insert Field rows. Returns a sequence of inserted PKs.")

  (reactivate-fields! [this field-ids]
    "Mark fields as active by their IDs.")

  (retire-field! [this field-id]
    "Mark a single field as inactive. Returns 1 if updated, 0 otherwise.")

  (update-field! [this field-id changes]
    "Apply a partial update to a field by id. Returns number of rows updated.")

  (mark-fk! [this database-id fk-metadata]
    "Mark a field as a FK pointing to a target field, based on FK metadata.
     Returns 1 if the field was updated, 0 otherwise.")

  (set-table-indexes! [this table-id indexed-field-ids]
    "Update all fields in a table: those in `indexed-field-ids` get database_indexed=true, others get false.")

  (batch-set-indexed! [this field-ids indexed?]
    "Set database_indexed for a batch of field IDs (by parent_id=nil).")

  (update-database! [this database-id changes]
    "Apply a partial update to a database by id.")

  (update-field-by-name! [this table-id field-name changes]
    "Update a field by its name within a table."))

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
     deactivated before the threshold.")

  (active-fields [this table-id]
    "Return active fields for a table, with the columns needed for sync.")

  (matching-inactive-fields [this table-id field-names parent-id]
    "Find inactive fields matching the given canonical names. Returns a sequence of field instances.")

  (select-fields-by-ids [this field-ids]
    "Fetch fields by a collection of IDs.")

  (find-syncable-table [this database-id table-name table-schema]
    "Find a syncable table by case-insensitive name/schema match. Returns best-matching table or nil.")

  (field-ids-for-index-names [this table-id index-names]
    "Return field IDs matching the given index names for a table (top-level fields only).")

  (indexed-field-ids-for-table [this table-id]
    "Return the set of field IDs currently marked as indexed for a table.")

  (indexed-field-ids-for-database [this database-id]
    "Return the set of field IDs currently marked as indexed for all tables in a database (top-level only).")

  (field-ids-for-indexes [this database-id indexes]
    "Resolve a collection of index descriptors to field IDs across the whole database.")

  (find-active-table-id [this database-id table-name]
    "Find an active table by db_id and name. Returns the table id or nil."))
