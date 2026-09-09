(ns metabase.driver.db
  "Application database queries for the driver module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.warehouses.schema :as warehouses.schema]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(mu/defn databases :- [:sequential ::warehouses.schema/database]
  "Every Database."
  []
  (t2/select :model/Database))

(mu/defn table-field-names :- [:maybe [:sequential :string]]
  "The names of the Fields of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-fn-vec :name [:model/Field :name] :table_id table-id))

(def ^:private DatabaseConnectionDetail
  "Rows returned by [[database-connection-details]]."
  (mut/select-keys ::warehouses.schema/database [:id :engine :details :write_data_details :admin_details]))

(mu/defn database-connection-details :- [:maybe DatabaseConnectionDetail]
  "The engine and connection details of the Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one [:model/Database :id :engine :details :write_data_details :admin_details] :id database-id))

(mu/defn json-field-names-with-unfolding-disabled :- [:maybe [:set :string]]
  "The names of the JSON Fields of the Table with `table-id` that have JSON unfolding disabled."
  [table-id :- ::lib.schema.id/table]
  (t2/select-fn-set :name [:model/Field :name]
                    :table_id table-id
                    :base_type :type/JSON
                    :json_unfolding false))
