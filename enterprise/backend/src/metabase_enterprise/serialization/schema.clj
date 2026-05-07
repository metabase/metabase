(ns metabase-enterprise.serialization.schema
  "Malli schemas for the serdes-portable shapes produced by
  [[metabase-enterprise.serialization.export.format]]."
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def ::user-info
  [:map
   [:user-id pos-int?]
   [:is-superuser? :boolean]])

(mr/def ::export-options
  [:map
   [:user-info ::user-info]
   [:with-databases {:optional true} [:maybe :boolean]]
   [:with-tables    {:optional true} [:maybe :boolean]]
   [:with-fields    {:optional true} [:maybe :boolean]]])

(mr/def ::external-database-id
  :string)

(mr/def ::external-table-id
  [:tuple :string [:maybe :string] :string])

(mr/def ::external-field-id
  [:cat :string [:maybe :string] :string [:+ :string]])

(mr/def ::external-database
  [:map
   [:name :string]
   [:engine :string]])

(mr/def ::external-table
  [:map
   [:db_id ::external-database-id]
   [:name :string]
   [:schema {:optional true} :string]
   [:description {:optional true} :string]])

(mr/def ::external-field
  [:map
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

(mr/def ::export-response
  [:map
   [:databases {:optional true} [:sequential ::external-database]]
   [:tables    {:optional true} [:sequential ::external-table]]
   [:fields    {:optional true} [:sequential ::external-field]]])
