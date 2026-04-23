(ns metabase.warehouses-rest.api.metadata-schemas
  "Malli schemas describing the element shapes streamed by `GET /api/database/metadata` and
  `GET /api/database/field-values`. Shared between the HTTP response declarations
  (`metabase.warehouses-rest.api`) and the import-side processors
  (`metabase.warehouses-rest.metadata-import-core`) so both sides agree on the wire format and
  the import side accepts whatever the export side produces."
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
   ;; schema accepts both Clojure vectors (cheshire-parsed NDJSON / reducible-select rows) and
   ;; `java.util.ArrayList` values (Jackson streaming from the file loader).
   [:values [:fn {:error/message "must be an array"}
             #(instance? java.util.List %)]]
   [:has_more_values :boolean]
   [:human_readable_values {:optional true} [:sequential [:maybe :string]]]])

(mr/def ::field-finalize-info
  "Shape of a finalize-pass record — either posted to `POST /metadata/fields/finalize` by the CLI
  or constructed in-process by the file loader after the insert pass. `parent_id` and
  `fk_target_field_id` are allowed to be nil here (CLI emits null when the source reference
  didn't map on the target); this differs from `::field-info` where a missing reference is
  expressed by omitting the key."
  [:map
   [:id                 ::lib.schema.id/field]
   [:parent_id          {:optional true} [:maybe ::lib.schema.id/field]]
   [:fk_target_field_id {:optional true} [:maybe ::lib.schema.id/field]]])
