(ns metabase-enterprise.advanced-config.db
  "Application database queries for the advanced-config module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [malli.util :as mut]
   [metabase.api-keys.schema :as api-keys.schema]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.users.schema :as users.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(mu/defn query-executions-in-month :- [:sequential :map]
  "The raw query execution rows started in `month` of `year`, newest first."
  [year :- ms/PositiveInt
   month :- ms/PositiveInt]
  (let [date-part (fn [part-key part-value]
                    (if (= (mdb/db-type) :postgres)
                      [:= [:date_part ^:allow-raw-sql [:inline (name part-key)] :started_at] part-value]
                      [:= [part-key :started_at] part-value]))]
    (t2/select :query_execution
               {:order-by [[:started_at :desc]]
                :where    [:and
                           (date-part :year year)
                           (date-part :month month)]})))

(mu/defn api-key-by-name :- [:maybe ::api-keys.schema/api-key]
  "The ApiKey named `api-key-name`, or nil."
  [api-key-name :- :string]
  (t2/select-one :model/ApiKey :name api-key-name))

(mu/defn api-key-prefix-exists? :- :boolean
  "Whether an ApiKey with `prefix` exists."
  [prefix :- :string]
  (t2/exists? :model/ApiKey :key_prefix prefix))

(mu/defn insert-api-key! :- ::api-keys.schema/api-key
  "Insert `api-key` and return the new instance. `::api-keys/unhashed-key` has a special meaning to the ApiKey
  model's before-insert hook: it is hashed into `:key` and used to derive `:key_prefix`."
  [api-key :- ::api-keys.schema/api-key.create]
  (t2/insert-returning-instance! :model/ApiKey api-key))

(mu/defn user-by-email :- [:maybe ::users.schema/user]
  "The User with `email`, or nil."
  [email :- :string]
  (t2/select-one :model/User :email email))

(mu/defn user-columns-by-email :- [:maybe (mut/optional-keys ::users.schema/user.full)]
  "The `columns` of the User with `email`, or nil."
  [columns :- [:sequential :keyword]
   email :- :string]
  (t2/select-one (into [:model/User] columns) :email email))

(mu/defn insert-user! :- ::users.schema/user
  "Insert `user` and return the new instance."
  [user :- ::users.schema/user.update]
  (t2/insert-returning-instance! :model/User user))

(mu/defn update-user! :- :int
  "Apply `changes` to the User with `user-id`."
  [user-id :- ::lib.schema.id/user
   changes :- ::users.schema/user.update]
  (t2/update! :model/User user-id changes))

(mu/defn sample-database-exists? :- :boolean
  "Whether the sample Database exists."
  []
  (t2/exists? :model/Database :is_sample true))

(mu/defn database-id-by-engine-and-name :- [:maybe ::lib.schema.id/database]
  "The ID of the Database of `engine` named `database-name`, or nil."
  [engine :- :string
   database-name :- :string]
  (t2/select-one-pk :model/Database :engine engine :name database-name))

(mu/defn insert-database! :- ::warehouses.schema/database
  "Insert `database` and return the new instance."
  [database :- (mut/merge ::warehouses.schema/database.update [:map [:id {:optional true} ::lib.schema.id/database]])]
  (t2/insert-returning-instance! :model/Database database))

(mu/defn update-database! :- :int
  "Apply `changes` to the Database with `database-id`."
  [database-id :- ::lib.schema.id/database
   changes :- ::warehouses.schema/database.update]
  (t2/update! :model/Database database-id changes))

(mu/defn delete-database! :- :int
  "Delete the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/delete! :model/Database database-id))
