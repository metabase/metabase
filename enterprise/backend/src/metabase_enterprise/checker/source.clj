(ns metabase-enterprise.checker.source
  "MetadataSource protocol and CompositeSource.

   A MetadataSource resolves portable references to entity data. It answers
   'does this reference exist?' and 'give me the data for this reference'.

   Portable references:
   - Database: string name
   - Table: [db-name schema-name table-name] where schema can be nil
   - Field: [db-name schema-name table-name field-name]
   - Card: entity-id string

   The checker assigns integer IDs; sources just say 'yes this exists, here's the data'
   or 'no, this reference is unresolved'.

   CompositeSource delegates db/table/field resolution to one source and card
   resolution to another. Used when --schema-dir and --export are separate.")

(set! *warn-on-reflection* true)

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

(deftype CompositeSource [db-source card-source]
  MetadataSource
  (resolve-database [_ db-name]   (resolve-database db-source db-name))
  (resolve-table    [_ table-path] (resolve-table db-source table-path))
  (resolve-field    [_ field-path] (resolve-field db-source field-path))
  (resolve-card     [_ entity-id]  (resolve-card card-source entity-id)))

(defn composite-source
  "Create a source that resolves databases/tables/fields from `db-source`
   and cards from `card-source`."
  [db-source card-source]
  (->CompositeSource db-source card-source))
