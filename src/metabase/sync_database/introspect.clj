(ns metabase.sync-database.introspect
  "Functions which handle the raw sync process."
  (:require [clojure.set :as set]
            [clojure.tools.logging :as log]
            [korma.core :as k]
            [korma.db :as kdb]
            [schema.core :as schema]
            [metabase.db :as db]
            [metabase.driver :as driver]
            [metabase.models.raw-column :as raw-column]
            [metabase.models.raw-table :as raw-table]
            [metabase.sync-database.interface :as i]
            [metabase.util :as u]))

(defn- named-table
  ([table]
    (named-table (:schema table) (:name table)))
  ([table-schema table-name]
   (str (when table-schema (str table-schema ".")) table-name)))

(defn- save-all-table-fks!
  "Save *all* foreign-key data for a given RAW-TABLE.
   NOTE: this function assumes that FKS is the complete set of fks in the RAW-TABLE."
  [{table-id :id, database-id :database_id, :as table} fks]
  {:pre [(integer? table-id)
         (integer? database-id)]}
  (kdb/transaction
    ;; start by simply resetting all fks and then we'll add them back as defined
    (k/update raw-column/RawColumn
      (k/where {:raw_table_id table-id})
      (k/set-fields {:fk_target_column_id nil}))

    ;; now lookup column-ids and set the fks on this table as needed
    (doseq [{:keys [fk-column-name dest-column-name dest-table]} fks]
      (when-let [source-column-id (db/sel :one :field [raw-column/RawColumn :id], :raw_table_id table-id, :name fk-column-name)]
        (when-let [dest-table-id (db/sel :one :field [raw-table/RawTable :id], :database_id database-id, :schema (:schema dest-table), :name (:name dest-table))]
          (when-let [dest-column-id (db/sel :one :id raw-column/RawColumn, :raw_table_id dest-table-id, :name dest-column-name)]
            (log/debug (u/format-color 'cyan "Marking foreign key '%s.%s' -> '%s.%s'." (named-table table) fk-column-name (named-table dest-table) dest-column-name))
            (db/upd raw-column/RawColumn source-column-id
              :fk_target_column_id dest-column-id)))))))

(defn- save-all-table-columns!
  "Save *all* `RawColumns` for a given RAW-TABLE.
   NOTE: this function assumes that COLUMNS is the complete set of columns in the RAW-TABLE."
  [{:keys [id]} columns]
  {:pre [(integer? id)
         (coll? columns)
         (every? map? columns)]}
  (kdb/transaction
    (let [existing-columns (into {} (for [{:keys [name] :as column} (db/sel :many :fields [raw-column/RawColumn :id :name] :raw_table_id id)]
                                      {name column}))]

      ;; deactivate any columns which were removed
      (doseq [[column-name {column-id :id}] (sort-by :name existing-columns)]
        (when-not (some #(= column-name (:name %)) columns)
          (log/debug (u/format-color 'cyan "Marked column %s as inactive." column-name))
          (db/upd raw-column/RawColumn column-id :active false)))

      ;; insert or update the remaining columns
      (doseq [{column-name :name, :keys [base-type pk? special-type details]} (sort-by :name columns)]
        (let [details (merge (or details {})
                             {:base-type base-type}
                             (when special-type {:special-type special-type}))
              is_pk   (true? pk?)]
          (if-let [{column-id :id} (get existing-columns column-name)]
            ;; column already exists, update it
            (db/upd raw-column/RawColumn column-id
              :name      column-name
              :is_pk     is_pk
              :details   details
              :active    true)
            ;; must be a new column, insert it
            (db/ins raw-column/RawColumn
              :raw_table_id  id
              :name          column-name
              :is_pk         is_pk
              :details       details
              :active        true)))))))

(defn- create-raw-table!
  "Create a new `RawTable`, includes saving all specified `:columns`."
  [database-id {table-name :name, table-schema :schema, :keys [details fields]}]
  {:pre [(integer? database-id)
         (string? table-name)]}
  (log/debug (u/format-color 'cyan "Found new table: %s" (named-table table-schema table-name)))
  (let [table (db/ins raw-table/RawTable
                :database_id  database-id
                :schema       table-schema
                :name         table-name
                :details      (or details {})
                :active       true)]
    ;; save columns
    (save-all-table-columns! table fields)))

(defn- update-raw-table!
  "Update an existing `RawTable`, includes saving all specified `:columns`."
  [{table-id :id, :as table} {:keys [details fields]}]
  ;; NOTE: the schema+name of a table makes up the natural key and cannot be modified on update
  ;;       if they were to be different we'd simply assume that's a new table instead
  (db/upd raw-table/RawTable table-id
    :details  (or details {})
    :active   true)
  ;; save columns
  (save-all-table-columns! table fields))

(defn- disable-raw-tables!
  "Disable a list of `RawTable` ids, including all `RawColumns` associated with those tables."
  [table-ids]
  {:pre [(coll? table-ids)
         (every? integer? table-ids)]}
  (let [table-ids (filter identity table-ids)]
    (kdb/transaction
      ;; disable the tables
      (k/update raw-table/RawTable
        (k/where {:id [in table-ids]})
        (k/set-fields {:active false}))
      ;; whenever a table is disabled we need to disable all of its fields too (and remove fk references)
      (k/update raw-column/RawColumn
        (k/where {:raw_table_id [in table-ids]})
        (k/set-fields {:active false, :fk_target_column_id nil})))))


(defn introspect-raw-table-and-update!
  "Introspect a single `RawTable` and persist the results as `RawTables` and `RawColumns`.
   Uses the various `describe-*` functions on the IDriver protocol to gather information."
  [driver database raw-tbl]
  (let [table-def (select-keys raw-tbl [:schema :name])
        table-def (if (contains? (driver/features driver) :dynamic-schema)
                    ;; dynamic schemas are handled differently, we'll handle them elsewhere
                    (assoc table-def :fields [])
                    ;; static schema databases get introspected now
                    (u/prog1 (driver/describe-table driver database table-def)
                      (schema/validate i/DescribeTable <>)))]

    ;; save the latest updates from the introspection
    (if table-def
      (update-raw-table! raw-tbl table-def)
      ;; if we didn't get back a table-def then this table must not exist anymore
      (disable-raw-tables! [(:id raw-tbl)]))

    ;; if we support FKs then try updating those as well
    (when (and table-def
               (contains? (driver/features driver) :foreign-keys))
      (when-let [table-fks (u/prog1 (driver/describe-table-fks driver database table-def)
                             (schema/validate i/DescribeTableFKs <>))]
        (save-all-table-fks! raw-tbl table-fks)))))


(defn introspect-database-and-update-raw-tables!
  "Introspect a `Database` and persist the results as `RawTables` and `RawColumns`.
   Uses the various `describe-*` functions on the IDriver protocol to gather information."
  [driver {database-id :id, :as database}]
  (log/info (u/format-color 'magenta "Introspecting schema on %s database '%s' ..." (name driver) (:name database)))
  (let [{:keys [tables]} (u/prog1 (driver/describe-database driver database)
                           (schema/validate i/DescribeDatabase <>))
        ;; This is a protection against cases where the returned table-def has no :schema key
        tables           (map #(update % :schema identity) tables)
        existing-tables  (into {} (for [{:keys [name schema] :as table} (db/sel :many :fields [raw-table/RawTable :id :schema :name] :database_id database-id)]
                                    {{:name name, :schema schema} table}))]

    ;; introspect each table and save off the schema details we find
    (let [tables-count          (count tables)
          finished-tables-count (atom 0)]
      (doseq [{table-schema :schema, table-name :name, :as table-def} tables]
        (try
          (let [table-def (if (contains? (driver/features driver) :dynamic-schema)
                            ;; dynamic schemas are handled differently, we'll handle them elsewhere
                            (assoc table-def :fields [])
                            ;; static schema databases get introspected now
                            (u/prog1 (driver/describe-table driver database table-def)
                              (schema/validate i/DescribeTable <>)))]
            (if-let [raw-tbl (get existing-tables (select-keys table-def [:schema :name]))]
              (update-raw-table! raw-tbl table-def)
              (create-raw-table! (:id database) table-def)))
          (catch Throwable t
            (log/error (u/format-color 'red "Unexpected error introspecting table schema: %s" (named-table table-schema table-name)) t))
          (finally
            (swap! finished-tables-count inc)
            (log/info (u/format-color 'magenta "%s Synced table '%s'." (u/emoji-progress-bar @finished-tables-count tables-count) (named-table table-schema table-name)))))))

    ;; any tables/columns that previously existed but aren't included any more get disabled
    (when-let [removed-tables (not-empty (set/difference (set (keys existing-tables))
                                                         (set (mapv #(select-keys % [:schema :name]) tables))))]
      (log/info (u/format-color 'cyan "Disabled tables: %s" (mapv #(named-table (:schema %) (:name %)) removed-tables)))
      (disable-raw-tables! (for [removed-table removed-tables]
                             (:id (get existing-tables removed-table)))))

    ;; handle any FK syncing
    ;; NOTE: this takes place after tables/fields are in place because we need the ids of the tables/fields to do FK references
    (when (contains? (driver/features driver) :foreign-keys)
      (doseq [{table-schema :schema, table-name :name, :as table-def} tables]
        (try
          (when-let [table-fks (u/prog1 (driver/describe-table-fks driver database table-def)
                                 (schema/validate i/DescribeTableFKs <>))]
            (when-let [raw-tbl (db/sel :one raw-table/RawTable :database_id database-id, :schema table-schema, :name table-name)]
              (save-all-table-fks! raw-tbl table-fks)))
          (catch Throwable t
            (log/error (u/format-color 'red "Unexpected error introspecting table fks: %s" (named-table table-schema table-name)) t)))))

    (log/info (u/format-color 'magenta "Introspection completed on %s database '%s'" (name driver) (:name database)))))
