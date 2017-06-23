(ns metabase.sync-database.sync-dynamic
  "Functions for syncing drivers with `:dynamic-schema` which have no fixed definition of their data."
  (:require [clojure.set :as set]
            [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.models
             [field :as field :refer [Field]]
             [raw-table :as raw-table :refer [RawTable]]
             [table :as table :refer [Table]]]
            [metabase.sync-database
             [interface :as i]
             [sync :as sync]]
            [schema.core :as schema]
            [toucan.db :as db]))

(defn- save-nested-fields!
  "Save any nested `Fields` for a given parent `Field`.
   All field-defs provided are assumed to be children of the given FIELD."
  [{parent-id :id, table-id :table_id, :as parent-field} nested-field-defs]
  ;; NOTE: remember that we never retire any fields in dynamic-schema tables
  (let [existing-field-name->field (u/key-by :name (db/select Field, :parent_id parent-id))]
    (u/prog1 (set/difference (set (map :name nested-field-defs)) (set (keys existing-field-name->field)))
      (when (seq <>)
        (log/debug (u/format-color 'blue "Found new nested fields for field '%s': %s" (:name parent-field) <>))))

    (doseq [nested-field-def nested-field-defs]
      (let [{:keys [nested-fields], :as nested-field-def} (assoc nested-field-def :parent-id parent-id)]
        ;; NOTE: this recursively creates fields until we hit the end of the nesting
        (if-let [existing-field (existing-field-name->field (:name nested-field-def))]
          ;; field already exists, so we UPDATE it
          (cond-> (field/update-field-from-field-def! existing-field nested-field-def)
                  nested-fields (save-nested-fields! nested-fields))
          ;; looks like a new field, so we CREATE it
          (cond-> (field/create-field-from-field-def! table-id nested-field-def)
                  nested-fields (save-nested-fields! nested-fields)))))))


(defn- save-table-fields!
  "Save a collection of `Fields` for the given `Table`.
   NOTE: we never retire/disable any fields in a dynamic schema database, so this process will only add/update `Fields`."
  [{table-id :id} field-defs]
  {:pre [(integer? table-id)
         (coll? field-defs)
         (every? map? field-defs)]}
  (let [field-name->field (u/key-by :name (db/select Field, :table_id table-id, :parent_id nil))]
    ;; NOTE: with dynamic schemas we never disable fields
    ;; create/update the fields
    (doseq [{field-name :name, :keys [nested-fields], :as field-def} field-defs]
      (if-let [existing-field (get field-name->field field-name)]
        ;; field already exists, so we UPDATE it
        (cond-> (field/update-field-from-field-def! existing-field field-def)
                nested-fields (save-nested-fields! nested-fields))
        ;; looks like a new field, so we CREATE it
        (cond-> (field/create-field-from-field-def! table-id field-def)
                nested-fields (save-nested-fields! nested-fields))))))


(defn scan-table-and-update-data-model!
  "Update the working `Table` and `Field` metadata for the given `Table`."
  [driver database {raw-table-id :raw_table_id, table-id :id, :as existing-table}]
  (when-let [raw-table (RawTable raw-table-id)]
    (try
      (if-not (:active raw-table)
        ;; looks like table was deactivated, so lets retire this Table
        (table/retire-tables! #{table-id})
        ;; otherwise we ask the driver for an updated table description and save that info
        (let [table-def (u/prog1 (driver/describe-table driver database (select-keys existing-table [:name :schema]))
                          (schema/validate i/DescribeTable <>))]
          (-> (table/update-table-from-tabledef! existing-table raw-table)
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

  (let [raw-tables          (raw-table/active-tables database-id)
        raw-table-id->table (u/key-by :raw_table_id (db/select Table, :db_id database-id, :active true))]
    ;; create/update tables (and their fields)
    ;; NOTE: we make sure to skip the _metabase_metadata table here.  it's not a normal table.
    (doseq [{raw-table-id :id, :as raw-table} raw-tables
            :when                             (not (sync/is-metabase-metadata-table? raw-table))]
      (try
        (let [table-def (u/prog1 (driver/describe-table driver database (select-keys raw-table [:name :schema]))
                          (schema/validate i/DescribeTable <>))]
          (if-let [existing-table (get raw-table-id->table raw-table-id)]
            ;; table already exists, update it
            (-> (table/update-table-from-tabledef! existing-table raw-table)
                (save-table-fields! (:fields table-def)))
            ;; must be a new table, insert it
            (-> (table/create-table-from-tabledef! database-id (assoc raw-table :raw-table-id raw-table-id))
                (save-table-fields! (:fields table-def)))))
        (catch Throwable t
          (log/error (u/format-color 'red "Unexpected error scanning table") t))))

    ;; NOTE: dynamic schemas don't have FKs

    ;; NOTE: if per chance there were multiple _metabase_metadata tables in different schemas, we just take the first
    (when-let [metabase-metadata-table (first (filter sync/is-metabase-metadata-table? raw-tables))]
      (sync/sync-metabase-metadata-table! driver database metabase-metadata-table))))
