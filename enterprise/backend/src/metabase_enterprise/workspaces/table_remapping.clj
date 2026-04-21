(ns metabase-enterprise.workspaces.table-remapping
  "Internal API for table-to-table remapping. Used by workspace isolation to redirect
   queries from production tables to workspace tables."
  (:require
   [metabase.table-remapping.model]
   [toucan2.core :as t2]))

(defn remap-table
  "Given a database ID, schema name, and table name, returns the remapped [schema, table-name]
   pair if a remapping exists, otherwise nil.

     (remap-table 6 \"my-schema\" \"my-table\")
     ;; => nil                              ; no remapping
     ;; => [\"new-schema\" \"new-table-name\"] ; remapped"
  [database-id from-schema from-table-name]
  (when-let [mapping (t2/select-one :model/TableRemapping
                                    :database_id database-id
                                    :from_schema from-schema
                                    :from_table_name from-table-name)]
    [(:to_schema mapping) (:to_table_name mapping)]))

(defn add-schema+table-mapping!
  "Add a table remapping. Takes a database ID and two [schema, table-name] pairs.

     (add-schema+table-mapping! 6
       [\"my-schema\" \"my-table\"]
       [\"new-schema\" \"new-table-name\"])"
  [database-id [from-schema from-table-name] [to-schema to-table-name]]
  (t2/insert! :model/TableRemapping
              {:database_id     database-id
               :from_schema     from-schema
               :from_table_name from-table-name
               :to_schema       to-schema
               :to_table_name   to-table-name}))

(defn remove-schema+table-mapping!
  "Remove a table remapping by database ID and source [schema, table-name]."
  [database-id [from-schema from-table-name]]
  (t2/delete! :model/TableRemapping
              :database_id database-id
              :from_schema from-schema
              :from_table_name from-table-name))

(defn all-mappings-for-db
  "Return all remappings for a given database as a map of
   [from-schema, from-table-name] -> [to-schema, to-table-name]."
  [database-id]
  (into {}
        (map (fn [m]
               [[(:from_schema m) (:from_table_name m)]
                [(:to_schema m) (:to_table_name m)]]))
        (t2/select :model/TableRemapping :database_id database-id)))

(defn clear-mappings-for-db!
  "Remove all remappings for a given database."
  [database-id]
  (t2/delete! :model/TableRemapping :database_id database-id))
