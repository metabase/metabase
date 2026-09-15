(ns metabase.warehouses.schema
  "Malli schemas for the warehouses module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.cron]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::database.undecryptable-column
  "An encrypted JSON column of a Database read without the key that encrypted it, which the model's transform logs and
  returns as the raw ciphertext string."
  :string)

(mr/def ::database.details
  "The `:details` column of a Database, decoded."
  [:or ms/DatabaseDetails ::database.undecryptable-column])

(mr/def ::database.settings
  "The `:settings` column of a Database, decoded."
  [:or ms/DatabaseSettings ::database.undecryptable-column])

(mr/def ::database.dbms-version
  "The `:dbms_version` column of a Database, decoded."
  [:map {:closed true, :probe/id "src/metabase/warehouses/schema.clj:24"}
   [:flavor           {:optional true} :string]
   [:version          {:optional true} :string]
   [:semantic-version {:optional true} [:or
                                        [:sequential :int]
                                        [:map {:closed true, :probe/id "src/metabase/warehouses/schema.clj:29"} [:major :int] [:minor :int]]]]
   [:cloud            {:optional true} :boolean]])

(mr/def ::database.write-data-details
  "The `:write_data_details` column of a Database, decoded."
  [:or ms/DatabaseDetails ::database.undecryptable-column])

(mr/def ::database.admin-details
  "The `:admin_details` column of a Database, decoded."
  [:or ms/DatabaseDetails ::database.undecryptable-column])

(mr/def ::database
  "A Database as selected from the app DB: every column of `:metabase_database`, plus `:features` added by the model's after-select hook."
  [:merge
   ::database.update
   [:map {:closed true, :probe/id "src/metabase/warehouses/schema.clj:44"}
    [:id                          ::lib.schema.id/database]
    [:features                    {:optional true} [:maybe [:set :keyword]]]
    [:can-manage                  {:optional true} [:maybe :boolean]]
    [:can_upload                  {:optional true} [:maybe :boolean]]
    [:tables                      {:optional true} [:maybe [:sequential [:ref :metabase.warehouse-schema.schema/table]]]]
    [:native_permissions          {:optional true} [:maybe [:enum :write :none]]]
    [:router_user_attribute       {:optional true} [:maybe :string]]
    [:schedules                   {:optional true} [:maybe [:map {:closed true, :probe/id "src/metabase/warehouses/schema.clj:52"}
                                                            [:metadata_sync      :metabase.util.cron/ScheduleMap]
                                                            [:cache_field_values [:maybe :metabase.util.cron/ScheduleMap]]]]]
    [:transforms_permissions      {:optional true} [:maybe [:enum :write :none]]]]])

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

(mr/def ::database-or-metadata
  "A Database as an app DB row or as Lib metadata."
  [:multi {:dispatch (fn [x] (if (:lib/type x) :lib-metadata :row))}
   [:lib-metadata :metabase.lib.schema.metadata/database]
   [:row          ::database]])
