(ns metabase.driver.db
  "Application database queries for the driver module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(defn databases
  "Every Database."
  []
  (t2/select :model/Database))

(defn table-field-names
  "The names of the Fields of the Table with `table-id`."
  [table-id]
  (t2/select-fn-vec :name [:model/Field :name] :table_id table-id))

(defn database-connection-details
  "The engine and connection details of the Database with `database-id`, or nil."
  [database-id]
  (t2/select-one [:model/Database :id :engine :details :write_data_details :admin_details] :id database-id))

(defn json-field-names-with-unfolding-disabled
  "The names of the JSON Fields of the Table with `table-id` that have JSON unfolding disabled."
  [table-id]
  (t2/select-fn-set :name [:model/Field :name]
                    :table_id table-id
                    :base_type :type/JSON
                    :json_unfolding false))
