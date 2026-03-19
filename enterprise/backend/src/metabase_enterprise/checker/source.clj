(ns metabase-enterprise.checker.source
  "Protocol for metadata sources.

   A MetadataSource resolves portable references to entity data. It answers
   'does this reference exist?' and 'give me the data for this reference'.

   Portable references:
   - Database: string name
   - Table: [db-name schema-name table-name] where schema can be nil
   - Field: [db-name schema-name table-name field-name]
   - Card: entity-id string

   The checker assigns integer IDs; sources just say 'yes this exists, here's the data'
   or 'no, this reference is unresolved'.

   Enumeration (listing all cards, all tables, etc.) is NOT part of this protocol.
   That's format-specific - serdes iterates a file index, an API would call a list
   endpoint, tests pass in specific IDs. The checker doesn't need to enumerate.")

(defprotocol MetadataSource
  "Resolve portable references to entity data."

  (resolve-database [this db-name]
    "Resolve database by name. Returns map with :name, :engine, :settings or nil.")

  (resolve-table [this table-path]
    "Resolve table by [db schema table]. Returns map with :name, :schema, :display-name, etc. or nil.")

  (resolve-field [this field-path]
    "Resolve field by [db schema table field]. Returns map with :name, :base-type, :semantic-type, etc. or nil.")

  (resolve-card [this entity-id]
    "Resolve card by entity-id. Returns map with :name, :dataset-query, :result-metadata, etc. or nil."))
