(ns metabase-enterprise.database-routing.db
  "Application database queries for the database-routing module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods, and transactions."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn database :- [:maybe (ms/InstanceOf :model/Database)]
  "The Database with `database-id`, or nil."
  [database-id :- ms/PositiveInt]
  (t2/select-one :model/Database :id database-id))

(mu/defn database-name :- [:maybe :string]
  "The name of the Database with `database-id`."
  [database-id :- ms/PositiveInt]
  (t2/select-one-fn :name :model/Database database-id))

(mu/defn destination-database? :- :boolean
  "Whether the Database with `database-id` is a routing destination."
  [database-id :- ms/PositiveInt]
  (t2/exists? :model/Database :id database-id :router_database_id [:not= nil]))

(mu/defn destination-database-id :- [:maybe ms/PositiveInt]
  "The ID of the destination Database of the router with `router-database-id` named `database-name`, or nil."
  [router-database-id :- ms/PositiveInt
   database-name      :- :string]
  (t2/select-one-pk :model/Database :router_database_id router-database-id :name database-name))

(mu/defn destination-name-exists? :- :boolean
  "Whether the router with `router-database-id` already has a destination Database named one of `names`."
  [router-database-id :- ms/PositiveInt
   names              :- [:seqable :string]]
  (t2/exists? :model/Database :router_database_id router-database-id :name [:in names]))

(mu/defn insert-databases! :- [:sequential (ms/InstanceOf :model/Database)]
  "Insert the Database `rows` and return the new instances."
  [rows :- [:seqable
            [:map {:closed true}
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
             [:is_stub                     {:optional true} :any]]]]
  (t2/insert-returning-instances! :model/Database rows))

(mu/defn transform-exists-for-source-database? :- :boolean
  "Whether a Transform reads from the Database with `database-id`."
  [database-id :- ms/PositiveInt]
  (t2/exists? :model/Transform :source_database_id database-id))

(mu/defn router-exists? :- :boolean
  "Whether the Database with `database-id` is a router."
  [database-id :- ms/PositiveInt]
  (t2/exists? :model/DatabaseRouter :database_id database-id))

(mu/defn router-for-database :- [:maybe (ms/InstanceOf :model/DatabaseRouter)]
  "The DatabaseRouter of the Database with `database-id`, or nil."
  [database-id :- ms/PositiveInt]
  (t2/select-one :model/DatabaseRouter :database_id database-id))

(mu/defn router-user-attribute :- [:maybe :string]
  "The user attribute the router of the Database with `database-id` routes on."
  [database-id :- ms/PositiveInt]
  (t2/select-one-fn :user_attribute :model/DatabaseRouter :database_id database-id))

(mu/defn router-user-attributes-by-database :- [:map-of ms/PositiveInt [:maybe :string]]
  "A map of Database ID to routing user attribute for `database-ids`."
  [database-ids :- [:seqable ms/PositiveInt]]
  (t2/select-fn->fn :database_id :user_attribute :model/DatabaseRouter :database_id [:in database-ids]))

(mu/defn insert-router! :- :int
  "Insert a DatabaseRouter for the Database with `database-id` routing on `user-attribute`."
  [database-id    :- ms/PositiveInt
   user-attribute :- :string]
  (t2/insert! :model/DatabaseRouter {:database_id database-id :user_attribute user-attribute}))

(mu/defn update-router-user-attribute! :- :int
  "Set the routing user attribute of the router of the Database with `database-id`."
  [database-id    :- ms/PositiveInt
   user-attribute :- :string]
  (t2/update! :model/DatabaseRouter :database_id database-id {:user_attribute user-attribute}))

(mu/defn delete-router! :- :int
  "Delete the DatabaseRouter of the Database with `database-id`."
  [database-id :- ms/PositiveInt]
  (t2/delete! :model/DatabaseRouter :database_id database-id))
