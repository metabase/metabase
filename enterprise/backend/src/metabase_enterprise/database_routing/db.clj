(ns metabase-enterprise.database-routing.db
  "Application database queries for the database-routing module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods, and transactions."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn transform-exists-for-source-database?
  "Whether a Transform reads from the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Transform :source_database_id database-id))

(mu/defn router-exists?
  "Whether the Database with `database-id` is a router."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/DatabaseRouter :database_id database-id))

(mu/defn router-for-database
  "The DatabaseRouter of the Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/DatabaseRouter :database_id database-id))

(mu/defn router-user-attribute
  "The user attribute the router of the Database with `database-id` routes on."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one-fn :user_attribute :model/DatabaseRouter :database_id database-id))

(mu/defn router-user-attributes-by-database
  "A map of Database ID to routing user attribute for `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/select-fn->fn :database_id :user_attribute :model/DatabaseRouter :database_id [:in database-ids]))

(mu/defn insert-router!
  "Insert a DatabaseRouter for the Database with `database-id` routing on `user-attribute`."
  [database-id    :- ::lib.schema.id/database
   user-attribute :- :string]
  (t2/insert! :model/DatabaseRouter {:database_id database-id :user_attribute user-attribute}))

(mu/defn update-router-user-attribute!
  "Set the routing user attribute of the router of the Database with `database-id`."
  [database-id    :- ::lib.schema.id/database
   user-attribute :- :string]
  (t2/update! :model/DatabaseRouter :database_id database-id {:user_attribute user-attribute}))

(mu/defn delete-router!
  "Delete the DatabaseRouter of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/delete! :model/DatabaseRouter :database_id database-id))
