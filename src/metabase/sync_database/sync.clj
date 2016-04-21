(ns metabase.sync-database.sync
  (:require [clojure.set :as set]
            [clojure.string :as s]
            [clojure.tools.logging :as log]
            [korma.core :as k]
            [metabase.db :as db]
            [metabase.driver :as driver]
            [metabase.models.field :as field]
            [metabase.models.raw-column :as raw-column]
            [metabase.models.raw-table :as raw-table]
            [metabase.models.table :as table]
            [metabase.util :as u]))


(defn- save-fks!
  "Update all of the FK relationships present in DATABASE based on what's captured in the raw schema.
   This will set :special_type :fk and :fk_target_field_id <field-id> for each found FK relationship.
   NOTE: we currently overwrite any previously defined metadata when doing this."
  [fk-sources]
  {:pre [(coll? fk-sources)
         (every? map? fk-sources)]}
  (doseq [{fk-source-id :source-column, fk-target-id :target-column} fk-sources]
    ;; TODO: eventually limit this to just "core" schema tables
    (when-let [source-field-id (db/sel :one :field [field/Field :id] :raw_column_id fk-source-id, :visibility_type [not= "retired"])]
      (when-let [target-field-id (db/sel :one :field [field/Field :id] :raw_column_id fk-target-id, :visibility_type [not= "retired"])]
        (db/upd field/Field source-field-id
          :special_type       :fk
          :fk_target_field_id target-field-id)))))


(defn sync-metabase-metadata-table!
  "Databases may include a table named `_metabase_metadata` (case-insentive) which includes descriptions or other metadata about the `Tables` and `Fields`
   it contains. This table is *not* synced normally, i.e. a Metabase `Table` is not created for it. Instead, *this* function is called, which reads the data it
   contains and updates the relevant Metabase objects.

   The table should have the following schema:

     column  | type    | example
     --------+---------+-------------------------------------------------
     keypath | varchar | \"products.created_at.description\"
     value   | varchar | \"The date the product was added to our catalog.\"

   `keypath` is of the form `table-name.key` or `table-name.field-name.key`, where `key` is the name of some property of `Table` or `Field`.

   This functionality is currently only used by the Sample Dataset. In order to use this functionality, drivers must implement optional fn `:table-rows-seq`."
  [driver database _metabase_metadata]
  (doseq [{:keys [keypath value]} (driver/table-rows-seq driver database _metabase_metadata)]
    ;; TODO: this does not support schemas in dbs :(
    (let [[_ table-name field-name k] (re-matches #"^([^.]+)\.(?:([^.]+)\.)?([^.]+)$" keypath)]
      (try (when (not= 1 (if field-name
                           (k/update field/Field
                             (k/where {:name field-name, :table_id (k/subselect table/Table
                                                                                (k/fields :id)
                                                                                ;; TODO: this needs to support schemas
                                                                                ;; TODO: eventually limit this to "core" schema tables
                                                                                (k/where {:db_id (:id database), :name table-name, :active true}))})
                             (k/set-fields {(keyword k) value}))
                           (k/update table/Table
                             (k/where {:name table-name, :db_id (:id database)})
                             (k/set-fields {(keyword k) value}))))
             (log/error (u/format-color "Error syncing _metabase_metadata: no matching keypath: %s" keypath)))
           (catch Throwable e
             (log/error (u/format-color 'red "Error in _metabase_metadata: %s" (.getMessage e))))))))


(defn- save-table-fields!
  "Refresh all `Fields` in a given `Table` based on what's available in the associated `RawColumns`.

   If a raw column has been disabled, the field is retired.
   If there is a new raw column, then a new field is created.
   If a raw column has been updated, then we update the values for the field."
  [{table-id :id, raw-table-id :raw_table_id}]
  (let [active-raw-columns  (raw-table/active-columns {:id raw-table-id})
        active-column-ids   (set (map :id active-raw-columns))
        existing-fields     (into {} (for [{raw-column-id :raw_column_id, :as fld} (db/sel :many field/Field, :table_id table-id, :visibility_type [not= "retired"], :parent_id nil)]
                                       {raw-column-id fld}))]
    ;; retire any fields which were disabled in the schema (including child nested fields)
    (doseq [[raw-column-id {field-id :id}] existing-fields]
      (when-not (contains? active-column-ids raw-column-id)
        (k/update field/Field
          (k/where (or {:id field-id}
                       {:parent_id field-id}))
          (k/set-fields {:visibility_type "retired"}))))

    ;; create/update the active columns
    (doseq [{raw-column-id :id, :keys [details], :as column} active-raw-columns]
      ;; do a little bit of key renaming to match what's expected for a call to update/create-field
      (let [column (-> (set/rename-keys column {:id    :raw-column-id
                                                :is_pk :pk?})
                       (assoc :base-type    (keyword (:base-type details))
                              :special-type (keyword (:special-type details))))]
        (if-let [existing-field (get existing-fields raw-column-id)]
          ;; field already exists, so we UPDATE it
          (field/update-field existing-field column)
          ;; looks like a new field, so we CREATE it
          (field/create-field table-id (assoc column :raw-column-id raw-column-id)))))))


(defn retire-tables!
  "Retire any `Table` who's `RawTable` has been deactivated.
  This occurs when a database introspection reveals the table is no longer available."
  [{database-id :id}]
  {:pre [(integer? database-id)]}
  ;; retire tables (and their fields) as needed
  (let [tables-to-remove (set (map :id (k/select table/Table
                                         (k/fields :id)
                                         ;; NOTE: something really wrong happening with SQLKorma here which requires us
                                         ;;       to be explicit about :metabase_table.raw_table_id in the join condition
                                         ;;       without this it seems to want to join against metabase_field !?
                                         (k/join raw-table/RawTable (= :raw_table.id :metabase_table.raw_table_id))
                                         (k/where {:db_id database-id
                                                   :active true
                                                   :raw_table.active false}))))]
    (table/retire-tables tables-to-remove)))


(defn update-data-models-for-table!
  "Update the working `Table` and `Field` metadata for a given `Table` based on the latest raw schema information.
   This function uses the data in `RawTable` and `RawColumn` to update the working data models as needed."
  [{raw-table-id :raw_table_id, table-id :id, :as existing-table}]
  (when-let [{database-id :database_id, :as raw-tbl} (db/sel :one raw-table/RawTable :id raw-table-id)]
    (try
      (if-not (:active raw-tbl)
        ;; looks like the table has been deactivated, so lets retire this Table and its fields
        (table/retire-tables #{table-id})
        ;; otherwise update based on the RawTable/RawColumn information
        (do
          (-> (table/update-table existing-table raw-tbl)
              save-table-fields!)

          ;; handle setting any fk relationships
          (when-let [table-fks (k/select raw-column/RawColumn
                                 (k/fields [:id :source-column]
                                           [:fk_target_column_id :target-column])
                                 ;; NOTE: something really wrong happening with SQLKorma here which requires us
                                 ;;       to be explicit about :metabase_table.raw_table_id in the join condition
                                 ;;       without this it seems to want to join against metabase_field !?
                                 (k/join raw-table/RawTable (= :raw_table.id :raw_column.raw_table_id))
                                 (k/where {:raw_table.database_id database-id
                                           :raw_table.id raw-table-id})
                                 (k/where (not= :raw_column.fk_target_column_id nil)))]
            (save-fks! table-fks))))

      (catch Throwable t
        (log/error (u/format-color 'red "Unexpected error syncing table") t)))))


(defn update-data-models-from-raw-tables!
  "Update the working `Table` and `Field` metadata for *all* tables in a `Database` based on the latest raw schema information.
   This function uses the data in `RawTable` and `RawColumn` to update the working data models as needed."
  [{database-id :id, :as database}]
  {:pre [(integer? database-id)]}

  ;; quick sanity check that this is indeed a :dynamic-schema database
  (when (driver/driver-supports? (driver/engine->driver (:engine database)) :dynamic-schema)
    (throw (IllegalStateException. "This function cannot be called on databases which are :dynamic-schema")))

  ;; retire any tables which were disabled
  (retire-tables! database)

  (let [raw-tables      (raw-table/active-tables database-id)
        existing-tables (into {} (for [{raw-table-id :raw_table_id, :as table} (db/sel :many table/Table, :db_id database-id, :active true)]
                                   {raw-table-id table}))]
    ;; create/update tables (and their fields)
    ;; NOTE: we make sure to skip the _metabase_metadata table here.  it's not a normal table.
    (doseq [{raw-table-id :id, :as raw-tbl} (filter #(not= "_metabase_metadata" (s/lower-case (:name %))) raw-tables)]
      (try
        (if-let [existing-table (get existing-tables raw-table-id)]
          ;; table already exists, update it
          (-> (table/update-table existing-table raw-tbl)
              save-table-fields!)
          ;; must be a new table, insert it
          (-> (table/create-table database-id (assoc raw-tbl :raw-table-id raw-table-id))
              save-table-fields!))
        (catch Throwable t
          (log/error (u/format-color 'red "Unexpected error syncing table") t))))

    ;; handle setting any fk relationships
    ;; NOTE: this must be done after fully syncing the tables/fields because we need all tables/fields in place
    (when-let [db-fks (k/select raw-column/RawColumn
                        (k/fields [:id :source-column]
                                  [:fk_target_column_id :target-column])
                        ;; NOTE: something really wrong happening with SQLKorma here which requires us
                        ;;       to be explicit about :metabase_table.raw_table_id in the join condition
                        ;;       without this it seems to want to join against metabase_field !?
                        (k/join raw-table/RawTable (= :raw_table.id :raw_column.raw_table_id))
                        (k/where {:raw_table.database_id database-id})
                        (k/where (not= :raw_column.fk_target_column_id nil)))]
      (save-fks! db-fks))

    ;; NOTE: if per chance there were multiple _metabase_metadata tables in different schemas, we just take the first
    (when-let [_metabase_metadata (first (filter #(= (s/lower-case (:name %)) "_metabase_metadata") raw-tables))]
      (sync-metabase-metadata-table! (driver/engine->driver (:engine database)) database _metabase_metadata))))
