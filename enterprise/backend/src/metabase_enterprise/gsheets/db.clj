(ns metabase-enterprise.gsheets.db
  "Application database queries for the gsheets module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn attached-dwh-database-id :- [:maybe ms/PositiveInt]
  "The ID of the attached data warehouse Database, or nil."
  []
  (t2/select-one-fn :id :model/Database :is_attached_dwh true))

(mu/defn attached-dwh-database :- [:maybe (ms/InstanceOf :model/Database)]
  "The attached data warehouse Database, or nil."
  []
  (t2/select-one :model/Database :is_attached_dwh true))

(mu/defn setting :- [:maybe (ms/InstanceOf :model/Setting)]
  "The Setting with `setting-key`, or nil."
  [setting-key :- :string]
  (t2/select-one :model/Setting :key setting-key))

(mu/defn update-database! :- :int
  "Apply `changes` to the Database with `database-id`, returning the number updated."
  [database-id :- ms/PositiveInt
   changes     :- [:map {:closed true}
                   [:id                          {:optional true} :any]
                   [:created_at                  {:optional true} :any]
                   [:updated_at                  {:optional true} :any]
                   [:name                        {:optional true} :any]
                   [:description                 {:optional true} :any]
                   [:details                     {:optional true} :any]
                   [:engine                      {:optional true} :any]
                   [:is_sample                   {:optional true} :any]
                   [:is_full_sync                {:optional true} :any]
                   [:points_of_interest          {:optional true} :any]
                   [:caveats                     {:optional true} :any]
                   [:metadata_sync_schedule      {:optional true} :any]
                   [:cache_field_values_schedule {:optional true} :any]
                   [:timezone                    {:optional true} :any]
                   [:is_on_demand                {:optional true} :any]
                   [:auto_run_queries            {:optional true} :any]
                   [:refingerprint               {:optional true} :any]
                   [:cache_ttl                   {:optional true} :any]
                   [:initial_sync_status         {:optional true} :any]
                   [:creator_id                  {:optional true} :any]
                   [:settings                    {:optional true} :any]
                   [:dbms_version                {:optional true} :any]
                   [:is_audit                    {:optional true} :any]
                   [:uploads_enabled             {:optional true} :any]
                   [:uploads_schema_name         {:optional true} :any]
                   [:uploads_table_prefix        {:optional true} :any]
                   [:is_attached_dwh             {:optional true} :any]
                   [:router_database_id          {:optional true} :any]
                   [:provider_name               {:optional true} :any]
                   [:write_data_details          {:optional true} :any]
                   [:admin_details               {:optional true} :any]
                   [:is_stub                     {:optional true} :any]]]
  (t2/update! :model/Database database-id changes))
