(ns metabase-enterprise.database-routing.db
  "Application database queries for the database-routing module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods, and transactions."
  (:require
   [toucan2.core :as t2]))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database :id database-id))

(defn database-name
  "The name of the Database with `database-id`."
  [database-id]
  (t2/select-one-fn :name :model/Database database-id))

(defn destination-database?
  "Whether the Database with `database-id` is a routing destination."
  [database-id]
  (t2/exists? :model/Database :id database-id :router_database_id [:not= nil]))

(defn destination-database-id
  "The ID of the destination Database of the router with `router-database-id` named `database-name`, or nil."
  [router-database-id database-name]
  (t2/select-one-pk :model/Database :router_database_id router-database-id :name database-name))

(defn destination-name-exists?
  "Whether the router with `router-database-id` already has a destination Database named one of `names`."
  [router-database-id names]
  (t2/exists? :model/Database :router_database_id router-database-id :name [:in names]))

(defn insert-databases!
  "Insert the Database `rows` and return the new instances."
  [rows]
  (t2/insert-returning-instances! :model/Database rows))

(defn transform-exists-for-source-database?
  "Whether a Transform reads from the Database with `database-id`."
  [database-id]
  (t2/exists? :model/Transform :source_database_id database-id))

(defn router-exists?
  "Whether the Database with `database-id` is a router."
  [database-id]
  (t2/exists? :model/DatabaseRouter :database_id database-id))

(defn router-for-database
  "The DatabaseRouter of the Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/DatabaseRouter :database_id database-id))

(defn router-user-attribute
  "The user attribute the router of the Database with `database-id` routes on."
  [database-id]
  (t2/select-one-fn :user_attribute :model/DatabaseRouter :database_id database-id))

(defn router-user-attributes-by-database
  "A map of Database ID to routing user attribute for `database-ids`."
  [database-ids]
  (t2/select-fn->fn :database_id :user_attribute :model/DatabaseRouter :database_id [:in database-ids]))

(defn insert-router!
  "Insert a DatabaseRouter for the Database with `database-id` routing on `user-attribute`."
  [database-id user-attribute]
  (t2/insert! :model/DatabaseRouter {:database_id database-id :user_attribute user-attribute}))

(defn update-router-user-attribute!
  "Set the routing user attribute of the router of the Database with `database-id`."
  [database-id user-attribute]
  (t2/update! :model/DatabaseRouter :database_id database-id {:user_attribute user-attribute}))

(defn delete-router!
  "Delete the DatabaseRouter of the Database with `database-id`."
  [database-id]
  (t2/delete! :model/DatabaseRouter :database_id database-id))
