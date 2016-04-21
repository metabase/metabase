(ns metabase.sync-database.sync-dynamic
  "Functions for syncing drivers with `:dynamic-schema` which have no fixed definition of their data."
  (:require [clojure.set :as set]
            [clojure.string :as s]
            [clojure.tools.logging :as log]
            [schema.core :as schema]
            [metabase.db :as db]
            [metabase.driver :as driver]
            [metabase.models.field :as field]
            [metabase.models.raw-table :as raw-table]
            [metabase.models.table :as table]
            [metabase.sync-database.sync :as sync]
            [metabase.sync-database.interface :as i]
            [metabase.util :as u]))


(defn- save-nested-fields!
  "Save any nested `Fields` for a given parent `Field`.
   All field-defs provided are assumed to be children of the given FIELD."
  [{parent-id :id, table-id :table_id, :as parent-field} nested-field-defs]
  ;; NOTE: remember that we never retire any fields in dynamic-schema tables
  (let [existing-field-name->field (into {} (for [{table-name :name, :as tbl} (db/sel :many field/Field, :parent_id parent-id)]
                                              {table-name tbl}))]
    (u/prog1 (set/difference (set (map :name nested-field-defs)) (set (keys existing-field-name->field)))
      (when (seq <>)
        (log/debug (u/format-color 'blue "Found new nested fields for field '%s': %s" (:name parent-field) <>))))

    (doseq [nested-field-def nested-field-defs]
      (let [{:keys [nested-fields], :as nested-field-def} (assoc nested-field-def :parent-id parent-id)]
        ;; NOTE: this recursively creates fields until we hit the end of the nesting
        (if-let [existing-field (existing-field-name->field (:name nested-field-def))]
          ;; field already exists, so we UPDATE it
          (cond-> (field/update-field existing-field nested-field-def)
                  nested-fields (save-nested-fields! nested-fields))
          ;; looks like a new field, so we CREATE it
          (cond-> (field/create-field table-id nested-field-def)
                  nested-fields (save-nested-fields! nested-fields)))))))


(defn- save-table-fields!
  "Save a collection of `Fields` for the given `Table`.
   NOTE: we never retire/disable any fields in a dynamic schema database, so this process will only add/update `Fields`."
  [{table-id :id} field-defs]
  {:pre [(integer? table-id)
         (coll? field-defs)
         (every? map? field-defs)]}
  (let [field-name->field (into {} (for [{field-name :name, :as fld} (db/sel :many field/Field, :table_id table-id, :parent_id nil)]
                                     {field-name fld}))]
    ;; NOTE: with dynamic schemas we never disable fields
    ;; create/update the fields
    (doseq [{field-name :name, :keys [nested-fields], :as field-def} field-defs]
      (if-let [existing-field (get field-name->field field-name)]
        ;; field already exists, so we UPDATE it
        (cond-> (field/update-field existing-field field-def)
                nested-fields (save-nested-fields! nested-fields))
        ;; looks like a new field, so we CREATE it
        (cond-> (field/create-field table-id field-def)
                nested-fields (save-nested-fields! nested-fields))))))


(defn scan-table-and-update-data-model!
  "Update the working `Table` and `Field` metadata for the given `Table`."
  [driver database {raw-table-id :raw_table_id, table-id :id, :as existing-table}]
  (when-let [raw-tbl (db/sel :one raw-table/RawTable :id raw-table-id)]
    (try
      (if-not (:active raw-tbl)
        ;; looks like table was deactivated, so lets retire this Table
        (table/retire-tables #{table-id})
        ;; otherwise we ask the driver for an updated table description and save that info
        (let [table-def (u/prog1 (driver/describe-table driver database (select-keys existing-table [:name :schema]))
                          (schema/validate i/DescribeTable <>))]
          (-> (table/update-table existing-table raw-tbl)
              (save-table-fields! (:fields table-def)))))
      ;; NOTE: dynamic schemas don't have FKs
      (catch Throwable t
        (log/error (u/format-color 'red "Unexpected error scanning table") t)))))


(defn scan-database-and-update-data-model!
  "Update the working `Table` and `Field` metadata for *all* tables in the given `Database`."
  [driver {database-id :id, :as database}]
  {:pre [(integer? database-id)]}

  ;; quick sanity check that this is indeed a :dynamic-schema database
  (when-not (driver/driver-supports? driver :dynamic-schema)
    (throw (IllegalStateException. "This function cannot be called on databases which are not :dynamic-schema")))

  ;; retire any tables which are no longer with us
  (sync/retire-tables! database)

  (let [raw-tables      (raw-table/active-tables database-id)
        existing-tables (into {} (for [{raw-table-id :raw_table_id, :as table} (db/sel :many table/Table, :db_id database-id, :active true)]
                                   {raw-table-id table}))]
    ;; create/update tables (and their fields)
    ;; NOTE: we make sure to skip the _metabase_metadata table here.  it's not a normal table.
    (doseq [{raw-table-id :id, :as raw-tbl} (filter #(not= "_metabase_metadata" (s/lower-case (:name %))) raw-tables)]
      (try
        (let [table-def (u/prog1 (driver/describe-table driver database (select-keys raw-tbl [:name :schema]))
                          (schema/validate i/DescribeTable <>))]
          (if-let [existing-table (get existing-tables raw-table-id)]
            ;; table already exists, update it
            (-> (table/update-table existing-table raw-tbl)
                (save-table-fields! (:fields table-def)))
            ;; must be a new table, insert it
            (-> (table/create-table database-id (assoc raw-tbl :raw-table-id raw-table-id))
                (save-table-fields! (:fields table-def)))))
        (catch Throwable t
          (log/error (u/format-color 'red "Unexpected error scanning table") t))))

    ;; NOTE: dynamic schemas don't have FKs

    ;; NOTE: if per chance there were multiple _metabase_metadata tables in different schemas, we just take the first
    (when-let [_metabase_metadata (first (filter #(= (s/lower-case (:name %)) "_metabase_metadata") raw-tables))]
      (sync/sync-metabase-metadata-table! driver database _metabase_metadata))))
