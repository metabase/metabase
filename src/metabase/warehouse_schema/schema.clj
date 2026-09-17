(ns metabase.warehouse-schema.schema
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata.fingerprint :as lib.schema.metadata.fingerprint]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses.schema]))

(mr/def ::dimension
  "A Dimension as selected from the app DB: every column of `:dimension`."
  [:merge
   ::dimension.columns
   [:map {:closed true}
    [:id                      ms/PositiveInt]
    [:human_readable_field    {:optional true} [:maybe [:ref ::field]]]]])

(mr/def ::dimension.columns
  "Every column of `:dimension` except `id`, all optional."
  [:map {:closed true}
   [:field_id                {:optional true} [:maybe ::lib.schema.id/field]]
   [:name                    {:optional true} [:maybe :string]]
   [:type                    {:optional true} [:maybe [:or :keyword :string]]]
   [:human_readable_field_id {:optional true} [:maybe ::lib.schema.id/field]]
   [:created_at              {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at              {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:entity_id               {:optional true} [:maybe :string]]])

(mr/def ::dimension.create
  "What an insert of a Dimension accepts."
  (mr/schema ::dimension.columns))

(mr/def ::dimension.update
  "What an update of a Dimension accepts: no immutable columns."
  (mut/select-keys (mr/schema ::dimension.columns) [:field_id :name :type :human_readable_field_id :updated_at]))

(mr/def ::dimension.column
  "A column of `:dimension`, for the `:columns` option of the queries in [[metabase.warehouse-schema.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::dimension.columns))))

(mr/def ::field.settings
  "The `:settings` column of a Field, decoded."
  ms/VisualizationSettings)

(mr/def ::field
  "A Field as selected from the app DB: every column of `:metabase_field`."
  [:merge
   ::field.columns
   [:map {:closed true}
    [:id                         ::lib.schema.id/field]
    [:unique_field_helper        {:optional true} [:maybe :int]]
    [:dimensions                 {:optional true} [:maybe [:sequential [:ref ::dimension]]]]
    [:name_field                 {:optional true} [:maybe :metabase.queries.schema/param-field.name-field]]
    [:target                     {:optional true} [:maybe [:ref ::field]]]]])

(mr/def ::field.columns
  "Every column of `:metabase_field` except `id`, all optional."
  [:map {:closed true}
   [:created_at                 {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at                 {:optional true} [:maybe ms/TemporalInstantOrNow]]
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
   [:last_analyzed              {:optional true} [:maybe ms/TemporalInstantOrNow]]
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

(mr/def ::field.create
  "What an insert of a Field accepts."
  (mr/schema ::field.columns))

(mr/def ::field.update
  "What an update of a Field accepts: no immutable columns."
  (mut/select-keys (mr/schema ::field.columns)
                   [:updated_at :name :base_type :semantic_type :active :description :preview_display :position
                    :table_id :parent_id :display_name :visibility_type :fk_target_field_id :last_analyzed
                    :points_of_interest :caveats :fingerprint :fingerprint_version :database_type :has_field_values
                    :settings :database_position :custom_position :effective_type :coercion_strategy :nfc_path
                    :database_required :json_unfolding :database_is_auto_increment :database_indexed
                    :database_partitioned :is_defective_duplicate :database_is_pk :database_is_nullable
                    :database_is_generated :database_default :dimension_interestingness :data_sensitivity]))

(mr/def ::field.partial
  "A Field row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::field [:map {:closed true} [:id {:optional true} ::lib.schema.id/field]]])

(mr/def ::field.column
  "A column of `:metabase_field`, for the `:columns` option of the queries in [[metabase.warehouse-schema.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::field.columns))))

(mr/def ::field-user-settings.settings
  "The `:settings` column of a FieldUserSettings, decoded."
  ms/VisualizationSettings)

(mr/def ::field-user-settings
  "A FieldUserSettings as selected from the app DB: every column of `:metabase_field_user_settings`."
  [:merge
   ::field-user-settings.columns
   [:map {:closed true}]])

(mr/def ::field-user-settings.columns
  "Every column of `:metabase_field_user_settings`, all optional."
  [:map {:closed true}
   [:field_id           {:optional true} [:maybe ::lib.schema.id/field]]
   [:created_at         {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at         {:optional true} [:maybe ms/TemporalInstantOrNow]]
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

(mr/def ::field-user-settings.create
  "What an insert of a FieldUserSettings accepts."
  (mr/schema ::field-user-settings.columns))

(mr/def ::field-user-settings.update
  "What an update of a FieldUserSettings accepts: no immutable columns."
  (mut/select-keys (mr/schema ::field-user-settings.columns)
                   [:updated_at :semantic_type :description :display_name :visibility_type :fk_target_field_id
                    :has_field_values :effective_type :coercion_strategy :caveats :points_of_interest :nfc_path
                    :json_unfolding :settings :data_sensitivity :custom_position :description_set
                    :semantic_type_set :fk_target_field_id_set]))

(mr/def ::field-user-settings.partial
  "A FieldUserSettings row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::field-user-settings [:map {:closed true} [:field_id {:optional true} [:maybe ::lib.schema.id/field]]]])

(mr/def ::field-user-settings.column
  "A column of `:metabase_field_user_settings`, for the `:columns` option of the queries in
  [[metabase.warehouse-schema.db]]."
  (into [:enum] (mut/keys (mr/schema ::field-user-settings.columns))))

(mr/def ::field-values
  "A FieldValues as selected from the app DB: every column of `:metabase_fieldvalues`."
  [:merge
   ::field-values.columns
   [:map {:closed true}
    [:id                    ms/PositiveInt]]])

(mr/def ::field-values.columns
  "Every column of `:metabase_fieldvalues` except `id`, all optional."
  [:map {:closed true}
   [:created_at            {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at            {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:values                {:optional true} [:maybe ms/FieldValues]]
   [:human_readable_values {:optional true} [:maybe ms/FieldValues]]
   [:field_id              {:optional true} [:maybe ::lib.schema.id/field]]
   [:has_more_values       {:optional true} [:maybe :boolean]]
   [:type                  {:optional true} [:maybe [:or :keyword :string]]]
   [:hash_key              {:optional true} [:maybe :string]]
   [:last_used_at          {:optional true} [:maybe ms/TemporalInstantOrNow]]])

(mr/def ::field-values.create
  "What an insert of a FieldValues accepts."
  (mr/schema ::field-values.columns))

(mr/def ::field-values.update
  "What an update of a FieldValues accepts: no immutable columns."
  (mut/select-keys (mr/schema ::field-values.columns)
                   [:updated_at :values :human_readable_values :field_id :has_more_values :type :hash_key
                    :last_used_at]))

(mr/def ::field-values.partial
  "A FieldValues row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::field-values [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::field-values.column
  "A column of `:metabase_fieldvalues`, for the `:columns` option of the queries in
  [[metabase.warehouse-schema.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::field-values.columns))))

(mr/def ::table-user-settings
  "A TableUserSettings as selected from the app DB: every column of `:metabase_table_user_settings`."
  [:merge
   ::table-user-settings.columns
   [:map {:closed true}]])

(mr/def ::table-user-settings.columns
  "Every column of `:metabase_table_user_settings`, all optional."
  [:map {:closed true}
   [:table_id                {:optional true} [:maybe ::lib.schema.id/table]]
   [:created_at              {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at              {:optional true} [:maybe ms/TemporalInstantOrNow]]
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

(mr/def ::table-user-settings.create
  "What an insert of a TableUserSettings accepts."
  (mr/schema ::table-user-settings.columns))

(mr/def ::table-user-settings.update
  "What an update of a TableUserSettings accepts: no immutable columns."
  (mut/select-keys (mr/schema ::table-user-settings.columns)
                   [:updated_at :display_name :description :entity_type :visibility_type :caveats
                    :points_of_interest :data_layer :data_source :owner_email :owner_user_id :field_order
                    :show_in_getting_started :data_authority :is_published :collection_id :description_set
                    :visibility_type_set :caveats_set :points_of_interest_set :data_layer_set :data_source_set]))

(mr/def ::table-user-settings.partial
  "A TableUserSettings row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::table-user-settings [:map {:closed true} [:table_id {:optional true} [:maybe ::lib.schema.id/table]]]])

(mr/def ::table-user-settings.column
  "A column of `:metabase_table_user_settings`, for the `:columns` option of the queries in
  [[metabase.warehouse-schema.db]]."
  (into [:enum] (mut/keys (mr/schema ::table-user-settings.columns))))

(mr/def ::table
  "A Table as selected from the app DB: every column of `:metabase_table`."
  [:merge
   ::table.columns
   [:map {:closed true}
    [:id                      ::lib.schema.id/table]
    [:unique_table_helper     {:optional true} [:maybe :string]]
    [:db                      {:optional true} [:maybe [:ref :metabase.warehouses.schema/database]]]
    [:fields                  {:optional true} [:maybe [:sequential ::field]]]
    [:transform               {:optional true} [:maybe [:ref :metabase.transforms.schema/transform]]]
    [:owner                   {:optional true} [:maybe [:map {:closed true}
                                                        [:id          {:optional true} ::lib.schema.id/user]
                                                        [:email       {:optional true} :string]
                                                        [:first_name  {:optional true} [:maybe :string]]
                                                        [:last_name   {:optional true} [:maybe :string]]
                                                        [:common_name {:optional true} [:maybe :string]]]]]]])

(mr/def ::table.columns
  "Every column of `:metabase_table` except `id`, all optional."
  [:map {:closed true}
   [:created_at              {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at              {:optional true} [:maybe ms/TemporalInstantOrNow]]
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
   [:deactivated_at          {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:archived_at             {:optional true} [:maybe ms/TemporalInstantOrNow]]
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

(mr/def ::table.create
  "What an insert of a Table accepts."
  (mr/schema ::table.columns))

(mr/def ::table.update
  "What an update of a Table accepts: no immutable columns."
  (mut/select-keys (mr/schema ::table.columns)
                   [:updated_at :name :description :entity_type :active :db_id :display_name :visibility_type
                    :schema :points_of_interest :caveats :show_in_getting_started :field_order :initial_sync_status
                    :is_upload :database_require_filter :estimated_row_count :view_count :is_defective_duplicate
                    :deactivated_at :archived_at :is_writable :data_authority :data_source :data_layer :owner_email
                    :owner_user_id :collection_id :is_published :transform_id :transform_target]))

(mr/def ::table.partial
  "A Table row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::table [:map {:closed true} [:id {:optional true} ::lib.schema.id/table]]])

(mr/def ::table.column
  "A column of `:metabase_table`, for the `:columns` option of the queries in [[metabase.warehouse-schema.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::table.columns))))
