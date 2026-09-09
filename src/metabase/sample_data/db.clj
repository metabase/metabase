(ns metabase.sample-data.db
  "Application database queries for the sample data module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(mu/defn sample-database-exists?
  "Whether a sample Database exists."
  []
  (t2/exists? :model/Database :is_sample true))

(mu/defn sample-database
  "The sample Database, or nil."
  []
  (t2/select-one :model/Database :is_sample true))

(mu/defn sample-database-id
  "The id of the sample Database, or nil."
  []
  (t2/select-one-pk :model/Database :is_sample true))

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database database-id))

(mu/defn set-sample-database-details!
  "Set the `details` of the sample Database, returning the ids of the updated rows."
  [details :- :map]
  (t2/update-returning-pks! :model/Database :is_sample true {:details details}))

(mu/defn insert-sample-database!
  "Insert the sample Database and return the inserted instance."
  [database-name :- :string
   details       :- :map
   engine        :- :keyword]
  (t2/insert-returning-instance! :model/Database
                                 :name      database-name
                                 :details   details
                                 :engine    engine
                                 :is_sample true))

(mu/defn update-database!
  "Apply `changes` to the Database with `database-id`, returning the number updated."
  [database-id :- ::lib.schema.id/database
   changes     :- (mut/select-keys ::warehouses.schema/database.update [:engine :details :settings])]
  (t2/update! :model/Database database-id changes))

(mu/defn set-database-tables-schema!
  "Set the `schema` of every Table of the Database with `database-id`, returning the number updated."
  [database-id :- ::lib.schema.id/database
   schema      :- [:maybe :string]]
  (t2/update! :model/Table :db_id database-id {:schema schema}))

(mu/defn set-database-table-permissions-schema-name!
  "Set the `schema_name` of the table-level DataPermissions rows of the Database with `database-id`, via a raw table
  update because the model's before-update rejects all updates."
  [database-id :- ::lib.schema.id/database
   schema-name :- [:maybe :string]]
  (t2/query {:update (t2/table-name :model/DataPermissions)
             :set    {:schema_name schema-name}
             :where  [:and
                      [:= :db_id database-id]
                      [:not= :table_id nil]]}))
