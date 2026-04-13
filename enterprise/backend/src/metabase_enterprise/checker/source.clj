(ns metabase-enterprise.checker.source
  "Protocols for resolving portable references to entity data.

   Two protocols separate the two concerns:

   - **SchemaSource** resolves database schema references (databases, tables, fields).
     Backed by the `--schema-dir` directory.
   - **AssetsSource** resolves serialized entity references (cards, snippets, transforms,
     segments). Backed by the `--export` directory.

   Portable references:
   - Database: string name
   - Table: [db-name schema-name table-name] where schema can be nil
   - Field: [db-name schema-name table-name field-name]
   - Card/snippet/transform/segment: entity-id string

   The checker assigns integer IDs; sources just say 'yes this exists, here's the data'
   or 'no, this reference is unresolved'.")

(set! *warn-on-reflection* true)

(defprotocol SchemaSource
  "Resolve database schema references to entity data."

  (resolve-database [this db-name]
    "Resolve database by name. Returns map with :name, :engine, :settings or nil.")

  (resolve-table [this table-path]
    "Resolve table by [db schema table]. Returns map with :name, :schema, :display-name, etc. or nil.")

  (resolve-field [this field-path]
    "Resolve field by [db schema table field]. Returns map with :name, :base-type, :semantic-type, etc. or nil.")

  (fields-for-table [this table-path]
    "Return a set of field paths belonging to the given table path [db schema table].")

  (all-field-paths [this]
    "Return all known field paths.")

  (all-database-names [this]
    "Return all known database names.")

  (all-table-paths [this]
    "Return all known table paths.")

  (tables-for-database [this db-name]
    "Return table paths belonging to the given database name."))

(defprotocol AssetsSource
  "Resolve serialized entity references to entity data."

  (resolve-card [this entity-id]
    "Resolve card by entity-id. Returns map with :name, :dataset-query, :result-metadata, etc. or nil.")

  (resolve-snippet [this entity-id]
    "Resolve native query snippet by entity-id. Returns map with :name, :content, etc. or nil.")

  (resolve-transform [this entity-id]
    "Resolve transform by entity-id. Returns map with :name, :source, etc. or nil.")

  (resolve-segment [this entity-id]
    "Resolve segment by entity-id. Returns map with :name, :definition, etc. or nil.")

  (resolve-dashboard [this entity-id]
    "Resolve dashboard by entity-id. Returns map with :name, :dashcards, :tabs, etc. or nil.")

  (resolve-collection [this entity-id]
    "Resolve collection by entity-id. Returns map with :name, :parent_id, etc. or nil.")

  (resolve-document [this entity-id]
    "Resolve document by entity-id. Returns map with :name, :document, etc. or nil.")

  (resolve-measure [this entity-id]
    "Resolve measure by entity-id. Returns map with :name, :definition, etc. or nil."))
