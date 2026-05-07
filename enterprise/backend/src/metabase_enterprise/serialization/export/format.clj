(ns metabase-enterprise.serialization.export.format
  "Per-model row formatters for the metadata-export pipeline. Each row coming out
  of the export query is reshaped via `format-entity` into the JSON shape the
  endpoint emits, with all references — database, table, fk_target_field —
  rendered in serdes-portable form (names rather than numeric IDs) so the
  response can be ingested by another Metabase instance with different
  surrogate keys."
  (:require
   [medley.core :as m]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn- decode-nfc-path
  "JSON-decode an `nfc_path` value pulled via raw query (no model transform). Returns nil for
  null/empty, the original value when it's already a sequential collection, or the decoded
  vector when it's a JSON string."
  [nfc-path]
  (cond
    (nil? nfc-path)        nil
    (sequential? nfc-path) (seq nfc-path)
    (string? nfc-path)     (seq (json/decode nfc-path))))

(defn- format-database-id
  "Portable id for a database — its name."
  [db-name]
  db-name)

(defn- format-table-id
  "Portable id for a table — `[db-name schema table-name]` (schema may be nil)."
  [db-name schema table-name]
  [db-name schema table-name])

(defn- format-field-id
  "Portable id for a field. When `nfc-path` is set (JSON-nested column), the path replaces
  the field's display name; the field's own name is the leaf of `nfc-path` joined with
  arrows, so the path is the canonical structural representation."
  [db-name schema table-name field-name nfc-path]
  (if (seq nfc-path)
    (into [db-name schema table-name] nfc-path)
    [db-name schema table-name field-name]))

(defmulti format-entity
  "Reshapes a raw query row for `model` into the JSON shape emitted by the
  metadata-export endpoint."
  {:arglists '([model row])}
  (fn [model _row] model))

(defmethod format-entity :model/Database
  [_model {:keys [name engine]}]
  {:id (format-database-id name) :name name :engine engine})

(defmethod format-entity :model/Table
  [_model {:keys [db_name schema table_name description]}]
  (m/assoc-some {:id    (format-table-id db_name schema table_name)
                 :db_id (format-database-id db_name)
                 :name  table_name}
                :schema schema
                :description description))

(defmethod format-entity :model/Field
  [_model {:keys [db_name table_schema table_name field_name description base_type database_type
                  effective_type semantic_type coercion_strategy nfc_path
                  fk_db_name fk_table_schema fk_table_name fk_field_name fk_field_nfc_path]}]
  (let [nfc-path     (decode-nfc-path nfc_path)
        parent-id    (when-some [parent-nfc (seq (butlast nfc-path))]
                       (format-field-id db_name table_schema table_name nil parent-nfc))
        fk-field-nfc (decode-nfc-path fk_field_nfc_path)
        fk-target-id (when (and fk_db_name fk_table_name fk_field_name)
                       (format-field-id fk_db_name fk_table_schema fk_table_name
                                        fk_field_name fk-field-nfc))]
    (m/assoc-some {:id       (format-field-id db_name table_schema table_name field_name nfc-path)
                   :table_id (format-table-id db_name table_schema table_name)
                   :name     field_name}
                  :description description
                  :base_type base_type
                  :database_type database_type
                  :effective_type (when (and effective_type (not= base_type effective_type)) effective_type)
                  :semantic_type semantic_type
                  :coercion_strategy coercion_strategy
                  :nfc_path nfc-path
                  :parent_id parent-id
                  :fk_target_field_id fk-target-id)))
