(ns metabase-enterprise.serialization.metadata-file-import.schemas
  "Malli schemas describing the element shapes streamed in `MB_TABLE_METADATA_PATH`.
  The shapes mirror the rows produced by `GET /api/database/metadata`, so the import
  side validates the same structure the export side emits.

  Identifiers are **portable**: a database is identified by name; a table by
  `[db-name schema-or-nil table-name]`; a field by `[db-name schema-or-nil
  table-name & nfc-path leaf-name]` (length ≥ 4). The list types accept both
  Clojure vectors (YAML parser output) and `java.util.ArrayList` (Jackson JSON
  parser output) — Malli's `:tuple` rejects ArrayList, so the list shapes use
  `[:fn ...]` predicates over `java.util.List`."
  (:require
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- nilable-string? [x] (or (nil? x) (string? x)))

(mr/def ::portable-database-id :string)

(mr/def ::portable-table-id
  [:fn {:error/message "must be a [db schema-or-nil table] tuple"}
   (fn [x] (and (instance? java.util.List x)
                (= 3 (.size ^java.util.List x))
                (string? (.get ^java.util.List x 0))
                (nilable-string? (.get ^java.util.List x 1))
                (string? (.get ^java.util.List x 2))))])

(mr/def ::portable-field-id
  [:fn {:error/message "must be a [db schema-or-nil table & path] list of length >= 4 with string elements"}
   (fn [x] (and (instance? java.util.List x)
                (>= (.size ^java.util.List x) 4)
                (string? (.get ^java.util.List x 0))
                (nilable-string? (.get ^java.util.List x 1))
                (every? string? (drop 2 x))))])

(mr/def ::database-info
  [:map
   [:name :string]
   [:engine :string]])

(mr/def ::table-info
  [:map
   [:db_id ::portable-database-id]
   [:name :string]
   [:schema {:optional true} :string]
   [:description {:optional true} :string]])

(mr/def ::field-info
  ;; `:id` is required (the field's natural key — used to resolve `:parent_id`
  ;; and `:fk_target_field_id` references and to detect re-imports). `:parent_id`
  ;; and `:nfc_path` are independently optional:
  ;;   - `:parent_id` present iff the source row had a non-NULL storage parent_id.
  ;;   - `:nfc_path`  present iff the source row had a non-empty storage nfc_path.
  ;;   - Both absent on flat root fields and top-level parents.
  [:map
   [:id ::portable-field-id]
   [:table_id ::portable-table-id]
   [:name :string]
   [:base_type :string]
   [:parent_id {:optional true} ::portable-field-id]
   [:nfc_path  {:optional true} [:fn {:error/message "must be a sequence of strings"}
                                 (fn [x] (and (instance? java.util.List x)
                                              (every? string? x)))]]
   [:fk_target_field_id {:optional true} ::portable-field-id]
   [:description {:optional true} :string]
   [:database_type {:optional true} :string]
   [:effective_type {:optional true} :string]
   [:semantic_type {:optional true} :string]
   [:coercion_strategy {:optional true} :string]])
