(ns metabase.warehouse-schema.app-db-copy
  "How copying the application database to another database copies tables and fields.")

(set! *warn-on-reflection* true)

(defn transform-table
  "The table row to write, without `unique_table_helper`, a generated column."
  [row _opts]
  (dissoc row :unique_table_helper))

(defn transform-field
  "The field row to write, without `unique_field_helper`, a generated column."
  [row _opts]
  (dissoc row :unique_field_helper))
