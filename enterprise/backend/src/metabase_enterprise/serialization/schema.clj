(ns metabase-enterprise.serialization.schema
  "Malli schemas for the serdes-portable shapes produced by
  [[metabase-enterprise.serialization.metadata]]."
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def ::external-database-id
  :string)

(mr/def ::external-table-id
  [:tuple :string [:maybe :string] :string])

(mr/def ::external-field-id
  [:cat :string [:maybe :string] :string [:+ :string]])

(mr/def ::database-info
  [:map
   [:id ::external-database-id]
   [:name :string]
   [:engine :string]])

(mr/def ::table-info
  [:map
   [:id ::external-table-id]
   [:db_id ::external-database-id]
   [:name :string]
   [:schema {:optional true} :string]
   [:description {:optional true} :string]])

(mr/def ::field-info
  [:map
   [:id ::external-field-id]
   [:table_id ::external-table-id]
   [:name :string]
   [:parent_id {:optional true} ::external-field-id]
   [:fk_target_field_id {:optional true} ::external-field-id]
   [:description {:optional true} :string]
   [:base_type :string]
   [:database_type {:optional true} :string]
   [:effective_type {:optional true} :string]
   [:semantic_type {:optional true} :string]
   [:coercion_strategy {:optional true} :string]
   [:nfc_path {:optional true} [:sequential :string]]])

(mr/def ::metadata-export-response
  [:map
   [:databases {:optional true} [:sequential ::database-info]]
   [:tables    {:optional true} [:sequential ::table-info]]
   [:fields    {:optional true} [:sequential ::field-info]]])
