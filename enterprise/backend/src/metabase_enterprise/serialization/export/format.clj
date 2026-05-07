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

(defn- parent-field-path
  "The nfc_path-form path of a field's parent (names from the outer-most
  ancestor down to the parent's leaf), or nil when `parent-id` is not set. For
  BigQuery the field's own `nfc_path` does not include the leaf field name and
  therefore already represents the parent path; for Mongo `nfc_path` includes
  the leaf, so the parent path is `(butlast nfc-path)`."
  [parent-id nfc-path engine]
  (when parent-id
    (seq (if (= engine "bigquery-cloud-sdk")
           nfc-path
           (butlast nfc-path)))))

(defn- format-database-id
  "Portable id for a database — its name."
  [db-name]
  db-name)

(defn- format-table-id
  "Portable id for a table — `[db-name schema table-name]` (schema may be nil)."
  [db-name schema table-name]
  [db-name schema table-name])

(defn- format-field-id
  "Portable id for a field — `[db schema table ...parent-path field-name]`.
  `parent-path` may be nil (or empty) for root fields, in which case the id
  collapses to `[db schema table field-name]`."
  [db-name schema table-name field-name parent-path]
  (-> [db-name schema table-name] (into parent-path) (conj field-name)))

(defmulti format-entity
  "Reshapes a raw query row for `model` into the JSON shape emitted by the
  metadata-export endpoint."
  {:arglists '([model row])}
  (fn [model _row] model))

(defmethod format-entity :model/Database
  [_model {:keys [name engine]}]
  {:name name :engine engine})

(defmethod format-entity :model/Table
  [_model {:keys [db_name schema table_name description]}]
  (m/assoc-some {:db_id (format-database-id db_name)
                 :name  table_name}
                :schema schema
                :description description))

(defmethod format-entity :model/Field
  [_model {:keys [db_name engine table_schema table_name field_name parent_id description
                  base_type database_type effective_type semantic_type coercion_strategy nfc_path
                  fk_db_name fk_db_engine fk_table_schema fk_table_name fk_field_name fk_parent_id
                  fk_field_nfc_path]}]
  (let [nfc-path       (decode-nfc-path nfc_path)
        parent-path    (parent-field-path parent_id nfc-path engine)
        parent-id      (when parent-path
                         (into [db_name table_schema table_name] parent-path))
        fk-parent-path (parent-field-path fk_parent_id (decode-nfc-path fk_field_nfc_path) fk_db_engine)
        fk-target-id   (when (and fk_db_name fk_table_name fk_field_name)
                         (format-field-id fk_db_name fk_table_schema fk_table_name
                                          fk_field_name fk-parent-path))]
    (m/assoc-some {:table_id (format-table-id db_name table_schema table_name)
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
