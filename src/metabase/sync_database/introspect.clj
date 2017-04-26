(ns metabase.sync-database.introspect
  "Functions which handle the raw sync process."
  (:require [clojure.set :as set]
            [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.models
             [raw-column :refer [RawColumn]]
             [raw-table :refer [RawTable]]]
            [metabase.sync-database.interface :as i]
            [schema.core :as schema]
            [toucan.db :as db]))

(defn- named-table
  ([table]
    (named-table (:schema table) (:name table)))
  ([table-schema table-name]
   (str (when table-schema (str table-schema ".")) table-name)))

(defn- save-all-table-fks!
  "Save *all* foreign-key data for a given RAW-TABLE.
   NOTE: this function assumes that FKS is the complete set of fks in the RAW-TABLE."
  [{table-id :id, database-id :database_id, :as table} fks]
  {:pre [(integer? table-id) (integer? database-id)]}
  (db/transaction
   ;; start by simply resetting all fks and then we'll add them back as defined
   (db/update-where! RawColumn {:raw_table_id table-id}
     :fk_target_column_id nil)

    ;; now lookup column-ids and set the fks on this table as needed
    (doseq [{:keys [fk-column-name dest-column-name dest-table]} fks]
      (when-let [source-column-id (db/select-one-id RawColumn, :raw_table_id table-id, :name fk-column-name)]
        (when-let [dest-table-id (db/select-one-id RawTable, :database_id database-id, :schema (:schema dest-table), :name (:name dest-table))]
          (when-let [dest-column-id (db/select-one-id RawColumn, :raw_table_id dest-table-id, :name dest-column-name)]
            (log/debug (u/format-color 'cyan "Marking foreign key '%s.%s' -> '%s.%s'." (named-table table) fk-column-name (named-table dest-table) dest-column-name))
            (db/update! RawColumn source-column-id
              :fk_target_column_id dest-column-id)))))))

(defn- save-all-table-columns!
  "Save *all* `RawColumns` for a given RAW-TABLE.
   NOTE: this function assumes that COLUMNS is the complete set of columns in the RAW-TABLE."
  [{:keys [id]} columns]
  {:pre [(integer? id) (coll? columns) (every? map? columns)]}
  (db/transaction
    (let [raw-column-name->id (db/select-field->id :name RawColumn, :raw_table_id id)]

      ;; deactivate any columns which were removed
      (doseq [[column-name column-id] (sort-by first raw-column-name->id)]
        (when-not (some #(= column-name (:name %)) columns)
          (log/debug (u/format-color 'cyan "Marked column %s as inactive." column-name))
          (db/update! RawColumn column-id, :active false)))

      ;; insert or update the remaining columns
      (doseq [{column-name :name, :keys [base-type pk? special-type details]} (sort-by :name columns)]
        (let [details (merge (or details {})
                             {:base-type base-type}
                             (when special-type {:special-type special-type}))
              is_pk   (true? pk?)]
          (if-let [column-id (get raw-column-name->id column-name)]
            ;; column already exists, update it
            (db/update! RawColumn column-id
              :name    column-name
              :is_pk   is_pk
              :details details
              :active  true)
            ;; must be a new column, insert it
            (db/insert! RawColumn
              :raw_table_id id
              :name         column-name
              :is_pk        is_pk
              :details      details
              :active       true)))))))

(defn- create-raw-table!
  "Create a new `RawTable`, includes saving all specified `:columns`."
  [database-id {table-name :name, table-schema :schema, :keys [details fields]}]
  {:pre [(integer? database-id) (string? table-name)]}
  (log/debug (u/format-color 'cyan "Found new table: %s" (named-table table-schema table-name)))
  (let [table (db/insert! RawTable
                :database_id  database-id
                :schema       table-schema
                :name         table-name
                :details      (or details {})
                :active       true)]
    (save-all-table-columns! table fields)))

(defn- update-raw-table!
  "Update an existing `RawTable`, includes saving all specified `:columns`."
  [{table-id :id, :as table} {:keys [details fields]}]
  ;; NOTE: the schema+name of a table makes up the natural key and cannot be modified on update
  ;;       if they were to be different we'd simply assume that's a new table instead
  (db/update! RawTable table-id
    :details (or details {})
    :active  true)
  ;; save columns
  (save-all-table-columns! table fields))

(defn- disable-raw-tables!
  "Disable a list of `RawTable` ids, including all `RawColumns` associated with those tables."
  [table-ids]
  {:pre [(coll? table-ids) (every? integer? table-ids)]}
  (let [table-ids (filter identity table-ids)]
    (db/transaction
     ;; disable the tables
     (db/update-where! RawTable {:id [:in table-ids]}
       :active false)
     ;; whenever a table is disabled we need to disable all of its fields too (and remove fk references)
     (db/update-where! RawColumn {:raw_table_id [:in table-ids]}
       :active              false
       :fk_target_column_id nil))))


(defn introspect-raw-table-and-update!
  "Introspect a single `RawTable` and persist the results as `RawTables` and `RawColumns`.
   Uses the various `describe-*` functions on the IDriver protocol to gather information."
  [driver database raw-table]
  (let [table-def (select-keys raw-table [:schema :name])
        table-def (if (contains? (driver/features driver) :dynamic-schema)
                    ;; dynamic schemas are handled differently, we'll handle them elsewhere
                    (assoc table-def :fields [])
                    ;; static schema databases get introspected now
                    (u/prog1 (driver/describe-table driver database table-def)
                      (schema/validate i/DescribeTable <>)))]

    ;; save the latest updates from the introspection
    (if table-def
      (update-raw-table! raw-table table-def)
      ;; if we didn't get back a table-def then this table must not exist anymore
      (disable-raw-tables! [(:id raw-table)]))

    ;; if we support FKs then try updating those as well
    (when (and table-def
               (contains? (driver/features driver) :foreign-keys))
      (when-let [table-fks (u/prog1 (driver/describe-table-fks driver database table-def)
                             (schema/validate i/DescribeTableFKs <>))]
        (save-all-table-fks! raw-table table-fks)))))


;;; ------------------------------------------------------------ INTROSPECT-DATABASE-AND-UPDATE-RAW-TABLES! ------------------------------------------------------------

(defn- introspect-tables!
  "Introspect each table and save off the schema details we find."
  [driver database tables existing-tables]
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
          (if-let [raw-table (get existing-tables (select-keys table-def [:schema :name]))]
            (update-raw-table! raw-table table-def)
            (create-raw-table! (:id database) table-def)))
        (catch Throwable t
          (log/error (u/format-color 'red "Unexpected error introspecting table schema: %s" (named-table table-schema table-name)) t))
        (finally
          (swap! finished-tables-count inc)
          (log/info (u/format-color 'magenta "%s Synced table '%s'." (u/emoji-progress-bar @finished-tables-count tables-count) (named-table table-schema table-name))))))))

(defn- disable-old-tables!
  "Any tables/columns that previously existed but aren't included any more get disabled."
  [tables existing-tables]
  (when-let [tables-to-disable (not-empty (set/difference (set (keys existing-tables))
                                                          (set (mapv #(select-keys % [:schema :name]) tables))))]
    (log/info (u/format-color 'cyan "Disabled tables: %s" (mapv #(named-table (:schema %) (:name %)) tables-to-disable)))
    (disable-raw-tables! (for [table-to-disable tables-to-disable]
                           (:id (get existing-tables table-to-disable))))))


(defn- sync-fks!
  "Handle any FK syncing. This takes place after tables/fields are in place because we need the ids of the tables/fields to do FK references."
  [driver database tables]
  (when (contains? (driver/features driver) :foreign-keys)
    (doseq [{table-schema :schema, table-name :name, :as table-def} tables]
      (try
        (when-let [table-fks (u/prog1 (driver/describe-table-fks driver database table-def)
                               (schema/validate i/DescribeTableFKs <>))]
          (when-let [raw-table (RawTable :database_id (:id database), :schema table-schema, :name table-name)]
            (save-all-table-fks! raw-table table-fks)))
        (catch Throwable t
          (log/error (u/format-color 'red "Unexpected error introspecting table fks: %s" (named-table table-schema table-name)) t))))))

(defn- db->tables [driver database]
  (let [{:keys [tables]} (u/prog1 (driver/describe-database driver database)
                           (schema/validate i/DescribeDatabase <>))]
    ;; This is a protection against cases where the returned table-def has no :schema key
    (map (u/rpartial update :schema identity) tables)))

(defn- db->name+schema->table [database]
  (into {} (for [{:keys [name schema] :as table} (db/select [RawTable :id :schema :name], :database_id (:id database))]
             {{:name name, :schema schema} table})))


(defn introspect-database-and-update-raw-tables!
  "Introspect a `Database` and persist the results as `RawTables` and `RawColumns`.
   Uses the various `describe-*` functions on the IDriver protocol to gather information."
  [driver database]
  (log/info (u/format-color 'magenta "Introspecting schema on %s database '%s' ..." (name driver) (:name database)))
  (let [start-time-ns      (System/nanoTime)
        tables             (db->tables driver database)
        name+schema->table (db->name+schema->table database)]

    (introspect-tables! driver database tables name+schema->table)
    (disable-old-tables! tables name+schema->table)
    (sync-fks! driver database tables)

    (log/info (u/format-color 'magenta "Introspection completed on %s database '%s' (%s)" (name driver) (:name database) (u/format-nanoseconds (- (System/nanoTime) start-time-ns))))))
