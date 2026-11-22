(ns metabase.warehouses.db
  "Application database queries for the warehouses module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(mu/defn router-database-id
  "The router Database id of the Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one-fn :router_database_id :model/Database :id database-id))

(mu/defn router-database-ids :- [:map-of ::lib.schema.id/database ::lib.schema.id/database]
  "A map from the id of each destination among the Databases with `database-ids` to the id of its router."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/select-fn->fn :id :router_database_id :model/Database
                    :id [:in database-ids]
                    :router_database_id [:not= nil]))

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- [:maybe ::lib.schema.id/database]]
  (t2/select-one :model/Database :id database-id))

(mu/defn database-settings-by-name
  "The `:settings` of a Database named `database-name`, or nil."
  [database-name :- :string]
  (t2/select-one-fn :settings :model/Database :name database-name))

(mu/defn non-destination-database
  "The Database with `database-id` if it is not a routing destination, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id :router_database_id nil))

(mu/defn databases
  "The Databases with `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/select :model/Database :id [:in database-ids]))

(mu/defn database-by-name
  "The Database named `database-name`, or nil."
  [database-name :- :string]
  (t2/select-one :model/Database :name database-name))

(mu/defn databases-with-uploads-enabled
  "The Databases that have uploads enabled."
  []
  (t2/select :model/Database :uploads_enabled true))

(mu/defn insert-databases! :- [:sequential ::warehouses.schema/database]
  "Insert the Database `rows` with one statement per distinct set of columns, so that a column a row leaves out keeps
  its default, and return the inserted instances in the order of `rows`."
  [rows :- [:sequential ::warehouses.schema/database.create]]
  (mdb/insert-returning-instances! :model/Database rows))

(mu/defn update-databases!
  "Apply the same `changes` to the Databases with `database-ids`, returning the number updated."
  [database-ids :- [:set ::lib.schema.id/database]
   changes      :- (mut/dissoc ::warehouses.schema/database.update :id)]
  (t2/update! :model/Database :id [:in database-ids] changes))

(mu/defn delete-databases!
  "Delete the Databases with `database-ids`, returning the number deleted."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/delete! :model/Database :id [:in database-ids]))

(mu/defn health-check-candidate-ids
  "The `:id` of the lowest-id non-audit, non-sample, non-stub, non-destination Database of each engine."
  []
  (t2/query {:select   [[:%min.id :id]]
             :from     [(t2/table-name :model/Database)]
             :where    [:and
                        [:= :is_audit false]
                        [:= :is_sample false]
                        [:= :is_stub false]
                        [:= :router_database_id nil]]
             :group-by [:engine]}))

(mu/defn disable-uploads-for-databases!
  "Disable uploads on the Databases with `database-ids`, returning the number updated."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/update! :model/Database :id [:in database-ids]
              {:uploads_enabled false :uploads_table_prefix nil :uploads_schema_name nil}))

(mu/defn active-tables-for-database
  "The active Tables of the Database with `database-id`, in case-insensitive display name order."
  [database-id :- ::lib.schema.id/database]
  (t2/select :model/Table :db_id database-id :active true {:order-by [[:%lower.display_name :asc]]}))

(mu/defn active-tables-for-databases
  "The active Tables of the Databases with `database-ids`, in database then display name order."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/select :model/Table
             :db_id  [:in database-ids]
             :active true
             {:order-by [[:db_id :asc] [:%lower.display_name :asc]]}))

(mu/defn active-table-ids-for-database
  "The ids of the active Tables of the Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-pks-set :model/Table, :db_id database-id, :active true))

(mu/defn pk-fields-for-tables
  "The primary-key Fields of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Field :table_id [:in table-ids] :semantic_type (mdb/isa :type/PK)))

(mu/defn table-database-id
  "The Database id of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id :model/Table, :id table-id))
