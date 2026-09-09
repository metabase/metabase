(ns metabase-enterprise.transforms-python.db
  "Application database queries for the transforms-python module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [malli.util :as mut]
   [metabase-enterprise.transforms-python.schema :as transforms-python.schema]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(mu/defn table-database-ids :- [:maybe [:set ::lib.schema.id/database]]
  "The set of Database IDs of the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select-fn-set :db_id [:model/Table :db_id] :id [:in table-ids]))

(mu/defn table-database-id :- [:maybe ::lib.schema.id/database]
  "The Database ID of the raw table row with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id (t2/table-name :model/Table) :id table-id))

(mu/defn database :- [:maybe ::warehouses.schema/database]
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database database-id))

(mu/defn database-engine :- [:maybe [:or :keyword :string]]
  "The engine of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one-fn :engine :model/Database database-id))

(mu/defn update-run-message! :- :int
  "Set the message of the TransformRun with `run-id`."
  [run-id  :- ms/PositiveInt
   message :- [:maybe :string]]
  (t2/update! :model/TransformRun :id run-id {:message message}))

(mu/defn python-library :- [:maybe ::transforms-python.schema/python-library]
  "The PythonLibrary with `library-id`, or nil."
  [library-id :- ms/PositiveInt]
  (t2/select-one :model/PythonLibrary library-id))

(mu/defn python-library-by-path :- [:maybe ::transforms-python.schema/python-library]
  "The PythonLibrary at `path`, or nil."
  [path :- :string]
  (t2/select-one :model/PythonLibrary :path path))

(mu/defn upsert-python-library-source! :- ms/PositiveInt
  "Insert or update the PythonLibrary at `path`, setting its source to `source`. Returns the ID of the row."
  [path   :- :string
   source :- :string]
  (mdb/update-or-insert! :model/PythonLibrary
                         {:path path}
                         (constantly {:path path :source source})))

(mu/defn library-sources-by-path :- [:map-of :string :string]
  "A map of path to source for every PythonLibrary."
  []
  (t2/select-fn->fn :path :source :model/PythonLibrary))

(def ^:private TopLevelFieldsMetadata
  "Rows returned by [[top-level-fields-metadata]]."
  (mut/select-keys ::warehouse-schema.schema/field [:id :name :base_type :effective_type :semantic_type :database_type :database_position]))

(mu/defn top-level-fields-metadata :- [:sequential TopLevelFieldsMetadata]
  "The export metadata columns of the active top-level Fields of the Table with `table-id`, in database order."
  [table-id :- ::lib.schema.id/table]
  (t2/select [:model/Field :id :name :base_type :effective_type :semantic_type :database_type :database_position]
             :table_id table-id
             :active true
             ;; we are only interested in top-level objects, so filter out nested fields (parent or path)
             :parent_id nil
             :nfc_path nil
             {:order-by [[:database_position :asc]]}))
