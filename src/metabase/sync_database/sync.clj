(ns metabase.sync-database.sync
  (:require [clojure
             [set :as set]
             [string :as s]]
            [clojure.tools.logging :as log]
            [metabase
             [db :as mdb]
             [driver :as driver]
             [util :as u]]
            [metabase.models
             [field :as field :refer [Field]]
             [raw-column :refer [RawColumn]]
             [raw-table :as raw-table :refer [RawTable]]
             [table :as table :refer [Table]]]
            [toucan.db :as db])
  (:import metabase.models.raw_table.RawTableInstance))

;;; ------------------------------------------------------------ FKs ------------------------------------------------------------

(defn- save-fks!
  "Update all of the FK relationships present in DATABASE based on what's captured in the raw schema.
   This will set :special_type :type/FK and :fk_target_field_id <field-id> for each found FK relationship.
   NOTE: we currently overwrite any previously defined metadata when doing this."
  [fk-sources]
  {:pre [(coll? fk-sources)
         (every? map? fk-sources)]}
  (doseq [{fk-source-id :source-column, fk-target-id :target-column} fk-sources]
    ;; TODO: eventually limit this to just "core" schema tables
    (when-let [source-field-id (db/select-one-id Field, :raw_column_id fk-source-id, :visibility_type [:not= "retired"])]
      (when-let [target-field-id (db/select-one-id Field, :raw_column_id fk-target-id, :visibility_type [:not= "retired"])]
        (db/update! Field source-field-id
          :special_type       :type/FK
          :fk_target_field_id target-field-id)))))

(defn- set-fk-relationships!
  "Handle setting any FK relationships for a DATABASE. This must be done after fully syncing the tables/fields because we need all tables/fields in place."
  [database]
  (when-let [db-fks (db/select [RawColumn [:id :source-column] [:fk_target_column_id :target-column]]
                      (mdb/join [RawColumn :raw_table_id] [RawTable :id])
                      (db/qualify RawTable :database_id) (:id database)
                      (db/qualify RawColumn :fk_target_column_id) [:not= nil])]
    (save-fks! db-fks)))

(defn- set-table-fk-relationships!
  "Handle setting FK relationships for a specific TABLE."
  [database-id raw-table-id]
  (when-let [table-fks (db/select [RawColumn [:id :source-column] [:fk_target_column_id :target-column]]
                         (mdb/join [RawColumn :raw_table_id] [RawTable :id])
                         (db/qualify RawTable :database_id) database-id
                         (db/qualify RawTable :id) raw-table-id
                         (db/qualify RawColumn :fk_target_column_id) [:not= nil])]
    (save-fks! table-fks)))


;;; ------------------------------------------------------------ _metabase_metadata table ------------------------------------------------------------

;; the _metabase_metadata table is a special table that can include Metabase metadata about the rest of the DB. This is used by the sample dataset

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
  [driver database, ^RawTableInstance metabase-metadata-table]
  (doseq [{:keys [keypath value]} (driver/table-rows-seq driver database metabase-metadata-table)]
    ;; TODO: this does not support schemas in dbs :(
    (let [[_ table-name field-name k] (re-matches #"^([^.]+)\.(?:([^.]+)\.)?([^.]+)$" keypath)]
      ;; ignore legacy entries that try to set field_type since it's no longer part of Field
      (when-not (= (keyword k) :field_type)
        (try (when-not (if field-name
                         (when-let [table-id (db/select-one-id Table
                                               ;; TODO: this needs to support schemas
                                               ;; TODO: eventually limit this to "core" schema tables
                                               :db_id  (:id database)
                                               :name   table-name
                                               :active true)]
                           (db/update-where! Field {:name     field-name
                                                    :table_id table-id}
                             (keyword k) value))
                         (db/update-where! Table {:name  table-name
                                                  :db_id (:id database)}
                           (keyword k) value))
               (log/error (u/format-color 'red "Error syncing _metabase_metadata: no matching keypath: %s" keypath)))
             (catch Throwable e
               (log/error (u/format-color 'red "Error in _metabase_metadata: %s" (.getMessage e)))))))))


(defn is-metabase-metadata-table?
  "Is this TABLE the special `_metabase_metadata` table?"
  [table]
  (= "_metabase_metadata" (s/lower-case (:name table))))


(defn- maybe-sync-metabase-metadata-table!
  "Sync the `_metabase_metadata` table, a special table with Metabase metadata, if present.
   If per chance there were multiple `_metabase_metadata` tables in different schemas, just sync the first one we find."
  [database raw-tables]
  (when-let [metadata-table (first (filter is-metabase-metadata-table? raw-tables))]
    (sync-metabase-metadata-table! (driver/engine->driver (:engine database)) database metadata-table)))


;;; ------------------------------------------------------------ Fields ------------------------------------------------------------

(defn- save-table-fields!
  "Refresh all `Fields` in a given `Table` based on what's available in the associated `RawColumns`.

   If a raw column has been disabled, the field is retired.
   If there is a new raw column, then a new field is created.
   If a raw column has been updated, then we update the values for the field."
  [{table-id :id, raw-table-id :raw_table_id}]
  (let [active-raw-columns   (raw-table/active-columns {:id raw-table-id})
        active-column-ids    (set (map :id active-raw-columns))
        raw-column-id->field (u/key-by :raw_column_id (db/select Field, :table_id table-id, :visibility_type [:not= "retired"], :parent_id nil))]
    ;; retire any fields which were disabled in the schema (including child nested fields)
    (doseq [[raw-column-id {field-id :id}] raw-column-id->field]
      (when-not (contains? active-column-ids raw-column-id)
        (db/update! Field {:where [:or [:= :id field-id]
                                       [:= :parent_id field-id]]
                           :set   {:visibility_type "retired"}})))

    ;; create/update the active columns
    (doseq [{raw-column-id :id, :keys [details], :as column} active-raw-columns]
      ;; do a little bit of key renaming to match what's expected for a call to update/create-field
      (let [column (-> (set/rename-keys column {:id    :raw-column-id
                                                :is_pk :pk?})
                       (assoc :base-type    (keyword (:base-type details))
                              :special-type (keyword (:special-type details))))]
        (if-let [existing-field (get raw-column-id->field raw-column-id)]
          ;; field already exists, so we UPDATE it
          (field/update-field-from-field-def! existing-field column)
          ;; looks like a new field, so we CREATE it
          (field/create-field-from-field-def! table-id (assoc column :raw-column-id raw-column-id)))))))


;;; ------------------------------------------------------------  "Crufty" Tables ------------------------------------------------------------

;; Crufty tables are ones we know are from frameworks like Rails or Django and thus automatically mark as `:cruft`

(def ^:private ^:const crufty-table-patterns
  "Regular expressions that match Tables that should automatically given the `visibility-type` of `:cruft`.
   This means they are automatically hidden to users (but can be unhidden in the admin panel).
   These `Tables` are known to not contain useful data, such as migration or web framework internal tables."
  #{;; Django
    #"^auth_group$"
    #"^auth_group_permissions$"
    #"^auth_permission$"
    #"^django_admin_log$"
    #"^django_content_type$"
    #"^django_migrations$"
    #"^django_session$"
    #"^django_site$"
    #"^south_migrationhistory$"
    #"^user_groups$"
    #"^user_user_permissions$"
    ;; Drupal
    #".*_cache$"
    #".*_revision$"
    #"^advagg_.*"
    #"^apachesolr_.*"
    #"^authmap$"
    #"^autoload_registry.*"
    #"^batch$"
    #"^blocked_ips$"
    #"^cache.*"
    #"^captcha_.*"
    #"^config$"
    #"^field_revision_.*"
    #"^flood$"
    #"^node_revision.*"
    #"^queue$"
    #"^rate_bot_.*"
    #"^registry.*"
    #"^router.*"
    #"^semaphore$"
    #"^sequences$"
    #"^sessions$"
    #"^watchdog$"
    ;; Rails / Active Record
    #"^schema_migrations$"
    ;; PostGIS
    #"^spatial_ref_sys$"
    ;; nginx
    #"^nginx_access_log$"
    ;; Liquibase
    #"^databasechangelog$"
    #"^databasechangeloglock$"
    ;; Lobos
    #"^lobos_migrations$"})

(defn- is-crufty-table?
  "Should we give newly created TABLE a `visibility_type` of `:cruft`?"
  [table]
  (boolean (some #(re-find % (s/lower-case (:name table))) crufty-table-patterns)))


;;; ------------------------------------------------------------ Table Syncing + Saving ------------------------------------------------------------

(defn- table-ids-to-remove
  "Return a set of active `Table` IDs for Database with DATABASE-ID whose backing RawTable is now inactive."
  [database-id]
  (db/select-ids Table
    (mdb/join [Table :raw_table_id] [RawTable :id])
    :db_id database-id
    (db/qualify Table :active) true
    (db/qualify RawTable :active) false))

(defn retire-tables!
  "Retire any `Table` who's `RawTable` has been deactivated.
  This occurs when a database introspection reveals the table is no longer available."
  [{database-id :id}]
  {:pre [(integer? database-id)]}
  ;; retire tables (and their fields) as needed
  (table/retire-tables! (table-ids-to-remove database-id)))


(defn update-data-models-for-table!
  "Update the working `Table` and `Field` metadata for a given `Table` based on the latest raw schema information.
   This function uses the data in `RawTable` and `RawColumn` to update the working data models as needed."
  [{raw-table-id :raw_table_id, table-id :id, :as existing-table}]
  (when-let [{database-id :database_id, :as raw-table} (RawTable raw-table-id)]
    (try
      (if-not (:active raw-table)
        ;; looks like the table has been deactivated, so lets retire this Table and its fields
        (table/retire-tables! #{table-id})
        ;; otherwise update based on the RawTable/RawColumn information
        (do
          (save-table-fields! (table/update-table-from-tabledef! existing-table raw-table))
          (set-table-fk-relationships! database-id raw-table-id)))
      (catch Throwable t
        (log/error (u/format-color 'red "Unexpected error syncing table") t)))))


(defn- create-and-update-tables!
  "Create/update tables (and their fields)."
  [database existing-tables raw-tables]
  (doseq [{raw-table-id :id, :as raw-table} raw-tables
          :when                             (not (is-metabase-metadata-table? raw-table))]
    (try
      (save-table-fields! (if-let [existing-table (get existing-tables raw-table-id)]
                            ;; table already exists, update it
                            (table/update-table-from-tabledef! existing-table raw-table)
                            ;; must be a new table, insert it
                            (table/create-table-from-tabledef! (:id database) (assoc raw-table
                                                                                :raw-table-id    raw-table-id
                                                                                :visibility-type (when (is-crufty-table? raw-table)
                                                                                                   :cruft)))))
      (catch Throwable e
        (log/error (u/format-color 'red "Unexpected error syncing table") e)))))


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
  ;; ok, now create new tables as needed and set FK relationships
  (let [raw-tables          (raw-table/active-tables database-id)
        raw-table-id->table (u/key-by :raw_table_id (db/select Table, :db_id database-id, :active true))]
    (create-and-update-tables! database raw-table-id->table raw-tables)
    (set-fk-relationships! database)
    ;; HACK! we can't sync the _metabase_metadata table until all the "Raw" Tables/Columns are backed
    (maybe-sync-metabase-metadata-table! database raw-tables)))
