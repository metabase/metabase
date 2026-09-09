(ns metabase.warehouses.schema
  "Malli schemas for the warehouses module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::database.details
  "The `:details` column of a Database, decoded."
  :map)

(mr/def ::database.settings
  "The `:settings` column of a Database, decoded."
  :map)

(mr/def ::database.dbms-version
  "The `:dbms_version` column of a Database, decoded."
  :map)

(mr/def ::database.write-data-details
  "The `:write_data_details` column of a Database, decoded."
  :map)

(mr/def ::database.admin-details
  "The `:admin_details` column of a Database, decoded."
  :map)

(mr/def ::database
  "A Database as selected from the app DB: every column of `:metabase_database`, plus `:features` added by the model's after-select hook."
  [:map {:closed true}
   [:id                          ::lib.schema.id/database]
   [:created_at                  ms/TemporalInstant]
   [:updated_at                  ms/TemporalInstant]
   [:name                        :string]
   [:description                 [:maybe :string]]
   [:details                     ::database.details]
   [:engine                      [:or :keyword :string]]
   [:is_sample                   :boolean]
   [:is_full_sync                :boolean]
   [:points_of_interest          [:maybe :string]]
   [:caveats                     [:maybe :string]]
   [:metadata_sync_schedule      :string]
   [:cache_field_values_schedule [:maybe :string]]
   [:timezone                    [:maybe :string]]
   [:is_on_demand                :boolean]
   [:auto_run_queries            :boolean]
   [:refingerprint               [:maybe :boolean]]
   [:cache_ttl                   [:maybe :int]]
   [:initial_sync_status         [:or :keyword :string]]
   [:creator_id                  [:maybe ::lib.schema.id/user]]
   [:settings                    [:maybe ::database.settings]]
   [:dbms_version                [:maybe ::database.dbms-version]]
   [:is_audit                    :boolean]
   [:uploads_enabled             :boolean]
   [:uploads_schema_name         [:maybe :string]]
   [:uploads_table_prefix        [:maybe :string]]
   [:is_attached_dwh             :boolean]
   [:router_database_id          [:maybe ::lib.schema.id/database]]
   [:provider_name               [:maybe :string]]
   [:write_data_details          [:maybe ::database.write-data-details]]
   [:admin_details               [:maybe ::database.admin-details]]
   [:is_stub                     :boolean]
   [:features                    {:optional true} [:maybe [:set :keyword]]]])

(mr/def ::database.update
  "What an update (or insert) of a Database accepts: every column of `:metabase_database` except `id`, all optional."
  [:map {:closed true}
   [:created_at                  {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at                  {:optional true} [:maybe ms/TemporalInstant]]
   [:name                        {:optional true} [:maybe :string]]
   [:description                 {:optional true} [:maybe :string]]
   [:details                     {:optional true} [:maybe ::database.details]]
   [:engine                      {:optional true} [:maybe [:or :keyword :string]]]
   [:is_sample                   {:optional true} [:maybe :boolean]]
   [:is_full_sync                {:optional true} [:maybe :boolean]]
   [:points_of_interest          {:optional true} [:maybe :string]]
   [:caveats                     {:optional true} [:maybe :string]]
   [:metadata_sync_schedule      {:optional true} [:maybe :string]]
   [:cache_field_values_schedule {:optional true} [:maybe :string]]
   [:timezone                    {:optional true} [:maybe :string]]
   [:is_on_demand                {:optional true} [:maybe :boolean]]
   [:auto_run_queries            {:optional true} [:maybe :boolean]]
   [:refingerprint               {:optional true} [:maybe :boolean]]
   [:cache_ttl                   {:optional true} [:maybe :int]]
   [:initial_sync_status         {:optional true} [:maybe [:or :keyword :string]]]
   [:creator_id                  {:optional true} [:maybe ::lib.schema.id/user]]
   [:settings                    {:optional true} [:maybe ::database.settings]]
   [:dbms_version                {:optional true} [:maybe ::database.dbms-version]]
   [:is_audit                    {:optional true} [:maybe :boolean]]
   [:uploads_enabled             {:optional true} [:maybe :boolean]]
   [:uploads_schema_name         {:optional true} [:maybe :string]]
   [:uploads_table_prefix        {:optional true} [:maybe :string]]
   [:is_attached_dwh             {:optional true} [:maybe :boolean]]
   [:router_database_id          {:optional true} [:maybe ::lib.schema.id/database]]
   [:provider_name               {:optional true} [:maybe :string]]
   [:write_data_details          {:optional true} [:maybe ::database.write-data-details]]
   [:admin_details               {:optional true} [:maybe ::database.admin-details]]
   [:is_stub                     {:optional true} [:maybe :boolean]]])
