(ns metabase.warehouse-schema.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata.fingerprint :as lib.schema.metadata.fingerprint]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::table
  "Schema for an instance of a `:model/Table`."
  [:map
   [:id ::lib.schema.id/table]
   [:name :string]
   [:description {:optional true} [:maybe :string]]
   [:schema {:optional true} [:maybe :string]]
   [:db_id ::lib.schema.id/database]])

(mr/def ::dimension
  "A Dimension as selected from the app DB: every column of `:dimension`."
  [:map {:closed true}
   [:id                      ms/PositiveInt]
   [:field_id                ::lib.schema.id/field]
   [:name                    :string]
   [:type                    [:or :keyword :string]]
   [:human_readable_field_id [:maybe ::lib.schema.id/field]]
   [:created_at              ms/TemporalInstant]
   [:updated_at              ms/TemporalInstant]
   [:entity_id               :string]])

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
  :map)

(mr/def ::field
  "A Field as selected from the app DB: every column of `:metabase_field`."
  [:map {:closed true}
   [:id                         ::lib.schema.id/field]
   [:created_at                 ms/TemporalInstant]
   [:updated_at                 ms/TemporalInstant]
   [:name                       :string]
   [:base_type                  [:or :keyword :string]]
   [:semantic_type              [:maybe [:or :keyword :string]]]
   [:active                     :boolean]
   [:description                [:maybe :string]]
   [:preview_display            :boolean]
   [:position                   :int]
   [:table_id                   ::lib.schema.id/table]
   [:parent_id                  [:maybe ms/PositiveInt]]
   [:display_name               [:maybe :string]]
   [:visibility_type            [:or :keyword :string]]
   [:fk_target_field_id         [:maybe ::lib.schema.id/field]]
   [:last_analyzed              [:maybe ms/TemporalInstant]]
   [:points_of_interest         [:maybe :string]]
   [:caveats                    [:maybe :string]]
   [:fingerprint                [:maybe ::lib.schema.metadata.fingerprint/fingerprint]]
   [:fingerprint_version        :int]
   [:database_type              [:or :keyword :string]]
   [:has_field_values           [:maybe [:or :keyword :string]]]
   [:settings                   [:maybe ::field.settings]]
   [:database_position          :int]
   [:custom_position            :int]
   [:effective_type             [:maybe [:or :keyword :string]]]
   [:coercion_strategy          [:maybe [:or :keyword :string]]]
   [:nfc_path                   [:maybe [:sequential :string]]]
   [:database_required          :boolean]
   [:json_unfolding             :boolean]
   [:database_is_auto_increment :boolean]
   [:database_indexed           [:maybe :boolean]]
   [:database_partitioned       [:maybe :boolean]]
   [:is_defective_duplicate     {:optional true} :boolean]
   [:unique_field_helper        {:optional true} [:maybe :int]]
   [:database_is_pk             [:maybe :boolean]]
   [:database_is_nullable       [:maybe :boolean]]
   [:database_is_generated      [:maybe :boolean]]
   [:database_default           [:maybe :string]]
   [:dimension_interestingness  [:maybe number?]]
   [:data_sensitivity           [:maybe [:or :keyword :string]]]])

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
   [:nfc_path                   {:optional true} [:maybe [:sequential :string]]]
   [:database_required          {:optional true} [:maybe :boolean]]
   [:json_unfolding             {:optional true} [:maybe :boolean]]
   [:database_is_auto_increment {:optional true} [:maybe :boolean]]
   [:database_indexed           {:optional true} [:maybe :boolean]]
   [:database_partitioned       {:optional true} [:maybe :boolean]]
   [:database_is_pk             {:optional true} [:maybe :boolean]]
   [:database_is_nullable       {:optional true} [:maybe :boolean]]
   [:database_is_generated      {:optional true} [:maybe :boolean]]
   [:database_default           {:optional true} [:maybe :string]]
   [:dimension_interestingness  {:optional true} [:maybe number?]]
   [:data_sensitivity           {:optional true} [:maybe [:or :keyword :string]]]])

(mr/def ::field-user-settings.settings
  "The `:settings` column of a FieldUserSettings, decoded."
  :map)

(mr/def ::field-user-settings
  "A FieldUserSettings as selected from the app DB: every column of `:metabase_field_user_settings`."
  [:map {:closed true}
   [:field_id           ::lib.schema.id/field]
   [:created_at         ms/TemporalInstant]
   [:updated_at         ms/TemporalInstant]
   [:semantic_type      [:maybe [:or :keyword :string]]]
   [:description        [:maybe :string]]
   [:display_name       [:maybe :string]]
   [:visibility_type    [:maybe [:or :keyword :string]]]
   [:fk_target_field_id [:maybe ::lib.schema.id/field]]
   [:has_field_values   [:maybe [:or :keyword :string]]]
   [:effective_type     [:maybe [:or :keyword :string]]]
   [:coercion_strategy  [:maybe [:or :keyword :string]]]
   [:caveats            [:maybe :string]]
   [:points_of_interest [:maybe :string]]
   [:nfc_path           [:maybe [:sequential :string]]]
   [:json_unfolding     [:maybe :boolean]]
   [:settings           [:maybe ::field-user-settings.settings]]
   [:data_sensitivity   [:maybe [:or :keyword :string]]]])

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
   [:nfc_path           {:optional true} [:maybe [:sequential :string]]]
   [:json_unfolding     {:optional true} [:maybe :boolean]]
   [:settings           {:optional true} [:maybe ::field-user-settings.settings]]
   [:data_sensitivity   {:optional true} [:maybe [:or :keyword :string]]]])

(mr/def ::field-values
  "A FieldValues as selected from the app DB: every column of `:metabase_fieldvalues`."
  [:map {:closed true}
   [:id                    ms/PositiveInt]
   [:created_at            ms/TemporalInstant]
   [:updated_at            ms/TemporalInstant]
   [:values                [:maybe ms/FieldValues]]
   [:human_readable_values [:maybe ms/FieldValues]]
   [:field_id              ::lib.schema.id/field]
   [:has_more_values       [:maybe :boolean]]
   [:type                  [:or :keyword :string]]
   [:hash_key              [:maybe :string]]
   [:last_used_at          ms/TemporalInstant]])

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

(mr/def ::table
  "A Table as selected from the app DB: every column of `:metabase_table`."
  [:map {:closed true}
   [:id                      ::lib.schema.id/table]
   [:created_at              ms/TemporalInstant]
   [:updated_at              ms/TemporalInstant]
   [:name                    :string]
   [:description             [:maybe :string]]
   [:entity_type             [:maybe [:or :keyword :string]]]
   [:active                  :boolean]
   [:db_id                   ::lib.schema.id/database]
   [:display_name            [:maybe :string]]
   [:visibility_type         [:maybe [:or :keyword :string]]]
   [:schema                  [:maybe :string]]
   [:points_of_interest      [:maybe :string]]
   [:caveats                 [:maybe :string]]
   [:show_in_getting_started :boolean]
   [:field_order             [:or :keyword :string]]
   [:initial_sync_status     [:or :keyword :string]]
   [:is_upload               :boolean]
   [:database_require_filter [:maybe :boolean]]
   [:estimated_row_count     [:maybe :int]]
   [:view_count              :int]
   [:is_defective_duplicate  {:optional true} :boolean]
   [:unique_table_helper     {:optional true} [:maybe :string]]
   [:deactivated_at          [:maybe ms/TemporalInstant]]
   [:archived_at             [:maybe ms/TemporalInstant]]
   [:is_writable             [:maybe :boolean]]
   [:data_authority          [:or :keyword :string]]
   [:data_source             [:maybe [:or :keyword :string]]]
   [:data_layer              [:maybe [:or :keyword :string]]]
   [:owner_email             [:maybe :string]]
   [:owner_user_id           [:maybe ::lib.schema.id/user]]
   [:collection_id           [:maybe ::lib.schema.id/collection]]
   [:is_published            :boolean]
   [:transform_id            [:maybe ::lib.schema.id/transform]]
   [:transform_target        :boolean]])

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
