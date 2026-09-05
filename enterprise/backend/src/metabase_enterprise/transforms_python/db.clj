(ns metabase-enterprise.transforms-python.db
  "Application database queries for the transforms-python module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [toucan2.core :as t2]))

(defn table-database-ids
  "The set of Database IDs of the Tables with `table-ids`."
  [table-ids]
  (t2/select-fn-set :db_id [:model/Table :db_id] :id [:in table-ids]))

(defn table-database-id
  "The Database ID of the raw table row with `table-id`."
  [table-id]
  (t2/select-one-fn :db_id (t2/table-name :model/Table) :id table-id))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database database-id))

(defn database-engine
  "The engine of the Database with `database-id`."
  [database-id]
  (t2/select-one-fn :engine :model/Database database-id))

(defn update-run-message!
  "Set the message of the TransformRun with `run-id`."
  [run-id message]
  (t2/update! :model/TransformRun :id run-id {:message message}))

(defn python-library
  "The PythonLibrary with `library-id`, or nil."
  [library-id]
  (t2/select-one :model/PythonLibrary library-id))

(defn python-library-by-path
  "The PythonLibrary at `path`, or nil."
  [path]
  (t2/select-one :model/PythonLibrary :path path))

(defn library-sources-by-path
  "A map of path to source for every PythonLibrary."
  []
  (t2/select-fn->fn :path :source :model/PythonLibrary))

(defn top-level-fields-metadata
  "The export metadata columns of the active top-level Fields of the Table with `table-id`, in database order."
  [table-id]
  (t2/select [:model/Field :id :name :base_type :effective_type :semantic_type :database_type :database_position]
             :table_id table-id
             :active true
             ;; we are only interested in top-level objects, so filter out nested fields (parent or path)
             :parent_id nil
             :nfc_path nil
             {:order-by [[:database_position :asc]]}))
