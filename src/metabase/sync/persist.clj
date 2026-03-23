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
    "Set the timezone for a database. `timezone-id` is a string."))

(defprotocol SyncDatabaseReader
  "Protocol for reading sync metadata from the app database."
  ;; No reader methods needed yet.
  ;; Reader methods will be added as we tackle steps 3+.
  )
