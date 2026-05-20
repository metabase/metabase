(ns metabase-enterprise.serialization.metadata-file-import.schemas
  "Malli schemas describing the wire-format rows streamed by
  `GET /api/ee/serialization/metadata/export` and consumed by
  `POST /api/ee/serialization/metadata/import`.

  IDs are **integers from the source appdb**. They are internally consistent
  within one file (so `:fields[].parent_id` references a `:fields[].id` in the
  same file) but mean nothing across files.

  Cross-row references:
  - `:tables[].db_id`              → `:databases[].id`
  - `:fields[].table_id`           → `:tables[].id`
  - `:fields[].parent_id`          → another `:fields[].id` in the same file
  - `:fields[].fk_target_field_id` → another `:fields[].id` in the same file

  Optional columns (everything outside the always-present set per row type) are
  *omitted from the row* by the export's `remove-nils` step rather than emitted
  as `null`. Schemas mark these as `{:optional true} [:maybe T]` — absent and
  `null` are accepted equivalently.

  `:effective_type` is special-cased: emitted only when `≠ :base_type`. Importer
  treats absent as `≡ :base_type`."
  (:require
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::database-info
  "Database row. All three keys are required."
  [:map
   [:id :int]
   [:name :string]
   [:engine :string]])

(mr/def ::table-info
  "Table row. `:id`, `:db_id`, and `:name` always present. `:schema` and
  `:description` are optional and may be nil."
  [:map
   [:id :int]
   [:db_id :int]
   [:name :string]
   [:schema {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]])

(mr/def ::field-info
  "Field row. Five required keys + several optional, per the export's
  `metadata-query-format :model/Field`."
  [:map
   [:id :int]
   [:table_id :int]
   [:name :string]
   [:base_type :string]
   [:database_type :string]
   [:parent_id {:optional true} [:maybe :int]]
   [:fk_target_field_id {:optional true} [:maybe :int]]
   [:description {:optional true} [:maybe :string]]
   [:effective_type {:optional true} [:maybe :string]]
   [:semantic_type {:optional true} [:maybe :string]]
   [:coercion_strategy {:optional true} [:maybe :string]]
   [:nfc_path {:optional true}
    [:maybe
     [:fn {:error/message "must be a sequence of strings"}
      (fn [x] (and (instance? java.util.List x)
                   (every? string? x)))]]]])
