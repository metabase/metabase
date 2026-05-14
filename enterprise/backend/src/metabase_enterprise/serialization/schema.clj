(ns metabase-enterprise.serialization.schema
  "Malli schemas for the rows produced by the metadata export pipeline. References
  to other entities are emitted as raw numeric ids; consumers are expected to
  resolve them against the same Metabase instance."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]))

(mr/def ::user-info
  [:map
   [:user-id pos-int?]
   [:is-superuser? :boolean]])

(mr/def ::export-metadata-options
  "Options accepted by the metadata export pipeline:

  - `:user-info`       — caller identity for permission filtering.
  - `:with-databases`  — include the `databases` section.
  - `:with-tables`     — include the `tables` section.
  - `:with-fields`     — include the `fields` section.
  - `:database-ids`    — restrict databases to these ids.
  - `:schema-ids`      — `{db-id [\"schema\" ...]}` — restrict tables to these (db, schema) pairs.
  - `:table-ids`       — restrict tables to these ids.
  - `:field-ids`       — restrict fields to these ids."
  [:map
   [:user-info ::user-info]
   [:with-databases {:optional true} [:maybe :boolean]]
   [:with-tables    {:optional true} [:maybe :boolean]]
   [:with-fields    {:optional true} [:maybe :boolean]]
   [:database-ids   {:optional true} [:maybe [:sequential ::lib.schema.id/database]]]
   [:schema-ids     {:optional true} [:maybe [:map-of ::lib.schema.id/database
                                              [:sequential :string]]]]
   [:table-ids      {:optional true} [:maybe [:sequential ::lib.schema.id/table]]]
   [:field-ids      {:optional true} [:maybe [:sequential ::lib.schema.id/field]]]])

(mr/def ::exported-database
  [:map
   [:id ::lib.schema.id/database]
   [:name :string]
   [:engine :string]])

(mr/def ::exported-table
  [:map
   [:id ::lib.schema.id/table]
   [:db_id ::lib.schema.id/database]
   [:name :string]
   [:schema {:optional true} :string]
   [:description {:optional true} :string]])

(mr/def ::exported-field
  [:map
   [:id ::lib.schema.id/field]
   [:table_id ::lib.schema.id/table]
   [:name :string]
   [:base_type :string]
   [:description {:optional true} :string]
   [:database_type {:optional true} :string]
   [:effective_type {:optional true} :string]
   [:semantic_type {:optional true} :string]
   [:coercion_strategy {:optional true} :string]
   [:nfc_path {:optional true} [:sequential :string]]
   [:parent_id {:optional true} ::lib.schema.id/field]
   [:fk_target_field_id {:optional true} ::lib.schema.id/field]])

(mr/def ::export-metadata-response
  [:map
   [:databases {:optional true} [:sequential ::exported-database]]
   [:tables    {:optional true} [:sequential ::exported-table]]
   [:fields    {:optional true} [:sequential ::exported-field]]])
