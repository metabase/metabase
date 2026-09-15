(ns metabase.warehouse-schema.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata.fingerprint :as lib.schema.metadata.fingerprint]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses.schema]))

(mr/def ::dimension
  "A Dimension as selected from the app DB: every column of `:dimension`."
  [:merge
   ::dimension.update
   [:map {:closed true, :probe/id "src/metabase/warehouse_schema/schema.clj:13"}
    [:id                      ms/PositiveInt]
    [:human_readable_field    {:optional true} [:maybe [:ref ::field]]]]])

(mr/def ::dimension.update
  "What an update (or insert) of a Dimension accepts: every column of `:dimension` except `id`, all optional."
  [:map {:closed true}
   [:field_id                {:optional true} [:maybe ::lib.schema.id/field]]
   [:name                    {:optional true} [:maybe :string]]
   [:type                    {:optional true} [:maybe [:or :keyword :string]]]
   [:human_readable_field_id {:optional true} [:maybe ::lib.schema.id/field]]
   [:created_at              {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at              {:optional true} [:maybe ms/TemporalInstant]]
   [:entity_id               {:optional true} [:maybe :string]]])

(mr/def ::field.settings
  "The `:settings` column of a Field, decoded."
  ms/VisualizationSettings)

(mr/def ::field
  "A Field as selected from the app DB: every column of `:metabase_field`."
  [:merge
   ::field.update
   [:map {:closed true, :probe/id "src/metabase/warehouse_schema/schema.clj:36"}
    [:id                         ::lib.schema.id/field]
    [:unique_field_helper        {:optional true} [:maybe :int]]
    [:dimensions                 {:optional true} [:maybe [:sequential [:ref ::dimension]]]]
    [:name_field                 {:optional true} [:maybe :metabase.queries.schema/param-field.name-field]]
    [:target                     {:optional true} [:maybe [:ref ::field]]]]])

(mr/def ::field.update
  "What an update (or insert) of a Field accepts: every column of `:metabase_field` except `id`, all optional."
  [:map {:closed true}
   [:created_at                 {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at                 {:optional true} [:maybe ms/TemporalInstant]]
   [:name                       {:optional true} [:maybe :string]]
   [:base_type                  {:optional true} [:maybe [:or :keyword :string]]]
   [:semantic_type              {:optional true} [:maybe [:or :keyword :string]]]
   [:active                     {:optional true} [:maybe :boolean]]
   [:description                {:optional true} [:maybe :string]]
   [:preview_display            {:optional true} [:maybe :boolean]]
   [:position                   {:optional true} [:maybe :int]]
   [:table_id                   {:optional true} [:maybe ::lib.schema.id/table]]
   [:parent_id                  {:optional true} [:maybe ms/PositiveInt]]
   [:display_name               {:optional true} [:maybe :string]]
   [:visibility_type            {:optional true} [:maybe [:or :keyword :string]]]
   [:fk_target_field_id         {:optional true} [:maybe ::lib.schema.id/field]]
   [:last_analyzed              {:optional true} [:maybe ms/TemporalInstant]]
   [:points_of_interest         {:optional true} [:maybe :string]]
   [:caveats                    {:optional true} [:maybe :string]]
   [:fingerprint                {:optional true} [:maybe ::lib.schema.metadata.fingerprint/fingerprint]]
   [:fingerprint_version        {:optional true} [:maybe :int]]
   [:database_type              {:optional true} [:maybe [:or :keyword :string]]]
   [:has_field_values           {:optional true} [:maybe [:or :keyword :string]]]
   [:settings                   {:optional true} [:maybe ::field.settings]]
   [:database_position          {:optional true} [:maybe :int]]
   [:custom_position            {:optional true} [:maybe :int]]
   [:effective_type             {:optional true} [:maybe [:or :keyword :string]]]
   [:coercion_strategy          {:optional true} [:maybe [:or :keyword :string]]]
   [:nfc_path                   {:optional true} [:maybe [:sequential [:or :string :keyword]]]]
   [:database_required          {:optional true} [:maybe :boolean]]
   [:json_unfolding             {:optional true} [:maybe :boolean]]
   [:database_is_auto_increment {:optional true} [:maybe :boolean]]
   [:database_indexed           {:optional true} [:maybe :boolean]]
   [:database_partitioned       {:optional true} [:maybe :boolean]]
   [:is_defective_duplicate     {:optional true} [:maybe :boolean]]
   [:database_is_pk             {:optional true} [:maybe :boolean]]
   [:database_is_nullable       {:optional true} [:maybe :boolean]]
   [:database_is_generated      {:optional true} [:maybe :boolean]]
   [:database_default           {:optional true} [:maybe :string]]
   [:dimension_interestingness  {:optional true} [:maybe number?]]
   [:data_sensitivity           {:optional true} [:maybe [:or :keyword :string]]]])

(mr/def ::field-user-settings.settings
  "The `:settings` column of a FieldUserSettings, decoded."
  ms/VisualizationSettings)

(mr/def ::field-user-settings
  "A FieldUserSettings as selected from the app DB: every column of `:metabase_field_user_settings`."
  [:merge
   ::field-user-settings.update
   [:map {:closed true, :probe/id "src/metabase/warehouse_schema/schema.clj:94"}]])

(mr/def ::field-user-settings.update
  "What an update (or insert) of a FieldUserSettings accepts: every column of `:metabase_field_user_settings` except `id`, all optional."
  [:map {:closed true}
   [:field_id           {:optional true} [:maybe ::lib.schema.id/field]]
   [:created_at         {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at         {:optional true} [:maybe ms/TemporalInstant]]
   [:semantic_type      {:optional true} [:maybe [:or :keyword :string]]]
   [:description        {:optional true} [:maybe :string]]
   [:display_name       {:optional true} [:maybe :string]]
   [:visibility_type    {:optional true} [:maybe [:or :keyword :string]]]
   [:fk_target_field_id {:optional true} [:maybe ::lib.schema.id/field]]
   [:has_field_values   {:optional true} [:maybe [:or :keyword :string]]]
   [:effective_type     {:optional true} [:maybe [:or :keyword :string]]]
   [:coercion_strategy  {:optional true} [:maybe [:or :keyword :string]]]
   [:caveats            {:optional true} [:maybe :string]]
   [:points_of_interest {:optional true} [:maybe :string]]
   [:nfc_path           {:optional true} [:maybe [:sequential [:or :string :keyword]]]]
   [:json_unfolding     {:optional true} [:maybe :boolean]]
   [:settings           {:optional true} [:maybe ::field-user-settings.settings]]
   [:data_sensitivity   {:optional true} [:maybe [:or :keyword :string]]]
   [:custom_position    {:optional true} [:maybe :int]]
   [:description_set        {:optional true} :boolean]
   [:semantic_type_set      {:optional true} :boolean]
   [:fk_target_field_id_set {:optional true} :boolean]])

(mr/def ::field-values
  "A FieldValues as selected from the app DB: every column of `:metabase_fieldvalues`."
  [:merge
   ::field-values.update
   [:map {:closed true, :probe/id "src/metabase/warehouse_schema/schema.clj:125"}
    [:id                    ms/PositiveInt]]])

(mr/def ::field-values.update
  "What an update (or insert) of a FieldValues accepts: every column of `:metabase_fieldvalues` except `id`, all optional."
  [:map {:closed true}
   [:created_at            {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at            {:optional true} [:maybe ms/TemporalInstant]]
   [:values                {:optional true} [:maybe ms/FieldValues]]
   [:human_readable_values {:optional true} [:maybe ms/FieldValues]]
   [:field_id              {:optional true} [:maybe ::lib.schema.id/field]]
   [:has_more_values       {:optional true} [:maybe :boolean]]
   [:type                  {:optional true} [:maybe [:or :keyword :string]]]
   [:hash_key              {:optional true} [:maybe :string]]
   [:last_used_at          {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::table-user-settings
  "A TableUserSettings as selected from the app DB: every column of `:metabase_table_user_settings`."
  [:merge
   ::table-user-settings.update
   [:map {:closed true, :probe/id "src/metabase/warehouse_schema/schema.clj:145"}]])

(mr/def ::table-user-settings.update
  "What an update (or insert) of a TableUserSettings accepts: every column of
  `:metabase_table_user_settings`, all optional."
  [:map {:closed true}
   [:table_id                {:optional true} [:maybe ::lib.schema.id/table]]
   [:created_at              {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at              {:optional true} [:maybe ms/TemporalInstant]]
   [:display_name            {:optional true} [:maybe :string]]
   [:description             {:optional true} [:maybe :string]]
   [:entity_type             {:optional true} [:maybe [:or :keyword :string]]]
   [:visibility_type         {:optional true} [:maybe [:or :keyword :string]]]
   [:caveats                 {:optional true} [:maybe :string]]
   [:points_of_interest      {:optional true} [:maybe :string]]
   [:data_layer              {:optional true} [:maybe [:or :keyword :string]]]
   [:data_source             {:optional true} [:maybe [:or :keyword :string]]]
   [:owner_email             {:optional true} [:maybe :string]]
   [:owner_user_id           {:optional true} [:maybe ::lib.schema.id/user]]
   [:field_order             {:optional true} [:maybe [:or :keyword :string]]]
   [:show_in_getting_started {:optional true} [:maybe :boolean]]
   [:data_authority          {:optional true} [:maybe [:or :keyword :string]]]
   [:is_published            {:optional true} [:maybe :boolean]]
   [:collection_id           {:optional true} [:maybe ::lib.schema.id/collection]]
   [:description_set         {:optional true} :boolean]
   [:visibility_type_set     {:optional true} :boolean]
   [:caveats_set             {:optional true} :boolean]
   [:points_of_interest_set  {:optional true} :boolean]
   [:data_layer_set          {:optional true} :boolean]
   [:data_source_set         {:optional true} :boolean]])

(mr/def ::table
  "A Table as selected from the app DB: every column of `:metabase_table`."
  [:merge
   ::table.update
   [:map {:closed true, :probe/id "src/metabase/warehouse_schema/schema.clj:180"}
    [:id                      ::lib.schema.id/table]
    [:unique_table_helper     {:optional true} [:maybe :string]]
    [:db                      {:optional true} [:maybe [:ref :metabase.warehouses.schema/database]]]
    [:fields                  {:optional true} [:maybe [:sequential ::field]]]
    [:transform               {:optional true} [:maybe [:ref :metabase.transforms.schema/transform]]]
    [:owner                   {:optional true} [:maybe [:map {:closed true, :probe/id "src/metabase/warehouse_schema/schema.clj:186"}
                                                        [:id          {:optional true} ::lib.schema.id/user]
                                                        [:email       {:optional true} :string]
                                                        [:first_name  {:optional true} [:maybe :string]]
                                                        [:last_name   {:optional true} [:maybe :string]]
                                                        [:common_name {:optional true} [:maybe :string]]]]]]])

(mr/def ::table.update
  "What an update (or insert) of a Table accepts: every column of `:metabase_table` except `id`, all optional."
  [:map {:closed true}
   [:created_at              {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at              {:optional true} [:maybe ms/TemporalInstant]]
   [:name                    {:optional true} [:maybe :string]]
   [:description             {:optional true} [:maybe :string]]
   [:entity_type             {:optional true} [:maybe [:or :keyword :string]]]
   [:active                  {:optional true} [:maybe :boolean]]
   [:db_id                   {:optional true} [:maybe ::lib.schema.id/database]]
   [:display_name            {:optional true} [:maybe :string]]
   [:visibility_type         {:optional true} [:maybe [:or :keyword :string]]]
   [:schema                  {:optional true} [:maybe :string]]
   [:points_of_interest      {:optional true} [:maybe :string]]
   [:caveats                 {:optional true} [:maybe :string]]
   [:show_in_getting_started {:optional true} [:maybe :boolean]]
   [:field_order             {:optional true} [:maybe [:or :keyword :string]]]
   [:initial_sync_status     {:optional true} [:maybe [:or :keyword :string]]]
   [:is_upload               {:optional true} [:maybe :boolean]]
   [:database_require_filter {:optional true} [:maybe :boolean]]
   [:estimated_row_count     {:optional true} [:maybe :int]]
   [:view_count              {:optional true} [:maybe :int]]
   [:is_defective_duplicate  {:optional true} [:maybe :boolean]]
   [:deactivated_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:archived_at             {:optional true} [:maybe ms/TemporalInstant]]
   [:is_writable             {:optional true} [:maybe :boolean]]
   [:data_authority          {:optional true} [:maybe [:or :keyword :string]]]
   [:data_source             {:optional true} [:maybe [:or :keyword :string]]]
   [:data_layer              {:optional true} [:maybe [:or :keyword :string]]]
   [:owner_email             {:optional true} [:maybe :string]]
   [:owner_user_id           {:optional true} [:maybe ::lib.schema.id/user]]
   [:collection_id           {:optional true} [:maybe ::lib.schema.id/collection]]
   [:is_published            {:optional true} [:maybe :boolean]]
   [:transform_id            {:optional true} [:maybe ::lib.schema.id/transform]]
   [:transform_target        {:optional true} [:maybe :boolean]]])
