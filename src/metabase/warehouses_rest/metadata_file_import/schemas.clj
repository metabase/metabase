(ns metabase.warehouses-rest.metadata-file-import.schemas
  "Malli schemas describing the element shapes streamed in `MB_TABLE_METADATA_PATH`
  and `MB_FIELD_VALUES_PATH`. The shapes mirror the rows produced by
  `GET /api/database/metadata` and `GET /api/database/field-values`, so the import
  side validates the same structure the export side emits.

  Shared between the file loader (`metabase.warehouses-rest.metadata-file-import`)
  and the pure batch processors (`metabase.warehouses-rest.metadata-import-core`)
  so both agree on the per-line contract."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]))

(mr/def ::database-info
  [:map
   [:id ::lib.schema.id/database]
   [:name :string]
   [:engine :string]])

(mr/def ::table-info
  [:map
   [:id ::lib.schema.id/table]
   [:db_id ::lib.schema.id/database]
   [:name :string]
   [:schema {:optional true} :string]
   [:description {:optional true} :string]])

(mr/def ::field-info
  [:map
   [:id ::lib.schema.id/field]
   [:table_id ::lib.schema.id/table]
   [:name :string]
   [:parent_id {:optional true} ::lib.schema.id/field]
   [:fk_target_field_id {:optional true} ::lib.schema.id/field]
   [:description {:optional true} :string]
   [:base_type :string]
   [:database_type {:optional true} :string]
   [:effective_type {:optional true} :string]
   [:semantic_type {:optional true} :string]
   [:coercion_strategy {:optional true} :string]])

(mr/def ::field-values-info
  [:map
   [:field_id ::lib.schema.id/field]
   ;; Declared as `java.util.List` rather than `[:sequential [:sequential :any]]` so the same
   ;; schema accepts both Clojure vectors and `java.util.ArrayList` values produced by the
   ;; streaming JSON / YAML parsers.
   [:values [:fn {:error/message "must be an array"}
             #(instance? java.util.List %)]]
   [:has_more_values :boolean]
   [:human_readable_values {:optional true} [:sequential [:maybe :string]]]])

(mr/def ::field-finalize-info
  "Shape of a finalize-pass record — projected from `::field-info` during phase 4.
  `parent_id` and `fk_target_field_id` are explicitly nullable here; this differs
  from `::field-info` where a missing reference is expressed by omitting the key."
  [:map
   [:id                 ::lib.schema.id/field]
   [:parent_id          {:optional true} [:maybe ::lib.schema.id/field]]
   [:fk_target_field_id {:optional true} [:maybe ::lib.schema.id/field]]])
