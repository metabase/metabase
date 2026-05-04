(ns metabase.warehouses-rest.metadata-file-import.schemas
  "Malli schemas describing the element shapes streamed in `MB_TABLE_METADATA_PATH`
  and `MB_FIELD_VALUES_PATH`. The shapes mirror the rows produced by
  `GET /api/database/metadata` and `GET /api/database/field-values`, so the import
  side validates the same structure the export side emits.

  Shared between the file loader (`metabase.warehouses-rest.metadata-file-import`)
  and the pure batch processors (`metabase.warehouses-rest.metadata-import-core`)
  so both agree on the per-line contract.

  Identifiers are **portable**: a database is identified by name; a table by
  `[db-name schema-or-nil table-name]`; a field by `[db-name schema-or-nil
  table-name & nfc-path leaf-name]` (length ≥ 4). The list types accept both
  Clojure vectors (YAML parser output) and `java.util.ArrayList` (Jackson JSON
  parser output) — Malli's `:tuple` rejects ArrayList, so the list shapes use
  `[:fn ...]` predicates over `java.util.List`."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]))

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
  ;; `:parent_id` and `:nfc_path` are mutually exclusive optional fields:
  ;;   - Convention A (BigQuery RECORDs, Mongo nested): wire carries `:parent_id`
  ;;     (a portable parent field id). Importer resolves to int via natural-key
  ;;     SELECT, stubs missing ancestors per §11c.
  ;;   - Convention B (Postgres JSONB unfolding): wire carries `:nfc_path` (the
  ;;     full path verbatim from storage). Importer inserts with `parent_id=nil`
  ;;     and stores `nfc_path` as-is for the QP's JSON-path navigation.
  ;;   - Flat root field (e.g. a regular column): both absent.
  [:map
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

(mr/def ::field-values-info
  ;; NOTE: still in pre-pivot integer-id shape. Sub-project B's item 23B will
  ;; rewrite `:field_id` to `::portable-field-id` once `GET /api/database/field-values`
  ;; emits portable ids.
  [:map
   [:field_id ::lib.schema.id/field]
   ;; Declared as `java.util.List` rather than `[:sequential [:sequential :any]]` so the same
   ;; schema accepts both Clojure vectors and `java.util.ArrayList` values produced by the
   ;; streaming JSON / YAML parsers.
   [:values [:fn {:error/message "must be an array"}
             #(instance? java.util.List %)]]
   [:has_more_values :boolean]
   ;; java.util.List rather than [:sequential [:maybe :string]] for the same reason as :values
   ;; — Jackson hands us ArrayLists, which `:sequential` rejects.
   [:human_readable_values {:optional true}
    [:fn {:error/message "must be a list of (optional) strings"}
     #(and (instance? java.util.List %)
           (every? (fn [x] (or (nil? x) (string? x))) %))]]])
