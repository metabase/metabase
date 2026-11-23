(ns metabase-enterprise.transforms-python.db
  "Application database queries for the transforms-python module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [metabase-enterprise.transforms-python.schema :as transforms-python.schema]
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.schema :as remote-sync.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn synced-python-libraries-clause :- [:fn vector?]
  "The clause over the PythonLibrary table aliased `alias` selecting the libraries remote sync syncs."
  [alias :- :keyword
   _opts :- ::remote-sync.schema/synced-filter-opts]
  [:= (u/qualified-key alias :is_default) false])

(mu/defn tables
  "The Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select :model/Table :id [:in table-ids]))

(mu/defn table-database-ids
  "The set of Database IDs of the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select-fn-set :db_id [:model/Table :db_id] :id [:in table-ids]))

(mu/defn table-database-id
  "The Database ID of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id (t2/table-name :model/Table) :id table-id))

(mu/defn database-engine
  "The engine of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one-fn :engine :model/Database :id [:auto/param database-id]))

(mu/defn python-library
  "The PythonLibrary with `library-id`, or nil."
  [library-id :- ms/PositiveInt]
  (t2/select-one :model/PythonLibrary :id [:auto/param library-id]))

(mu/defn python-library-by-path
  "The PythonLibrary at `path`, or nil."
  [path :- :string]
  (t2/select-one :model/PythonLibrary :path path))

(mu/defn insert-python-libraries!
  "Insert the PythonLibrary `rows` and return the inserted instances."
  [rows :- [:sequential {:min 1} ::transforms-python.schema/python-library.create]]
  (app-db/insert-returning-instances! :model/PythonLibrary rows))

(mu/defn update-python-libraries!
  "Apply to each PythonLibrary of `stored`, a map from id to the library as read, its changes in `id->changes`, with one
  statement for the rows that get the same effective changes, which keeps the rows that already hold some of the values
  from making Toucan run one statement per row."
  [stored      :- [:map-of ms/PositiveInt :map]
   id->changes :- [:map-of ms/PositiveInt ::transforms-python.schema/python-library.changes]]
  (doseq [[changes ids] (mi/group-ids-by-changes stored (mapv (fn [[id changes]] (assoc changes :id id)) id->changes))]
    (t2/update! :model/PythonLibrary :id [:in [:auto/param ids]] changes))
  nil)

(mu/defn python-libraries-by-ids
  "The PythonLibraries with `library-ids`."
  [library-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (t2/select :model/PythonLibrary :id [:in [:auto/param library-ids]]))

(mu/defn delete-python-libraries!
  "Delete the PythonLibraries with `library-ids`."
  [library-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (t2/delete! :model/PythonLibrary :id [:in [:auto/param library-ids]])
  nil)

(mu/defn library-sources-by-path
  "A map of path to source for every PythonLibrary."
  []
  (t2/select-fn->fn :path :source :model/PythonLibrary))

(mu/defn top-level-fields-metadata
  "The export metadata columns of the active top-level Fields of the Table with `table-id`, in database order."
  [table-id :- ::lib.schema.id/table]
  (t2/select [:model/Field :id :name :base_type :effective_type :semantic_type :database_type :database_position]
             :table_id table-id
             :active true
             ;; we are only interested in top-level objects, so filter out nested fields (parent or path)
             :parent_id nil
             :nfc_path nil
             {:order-by [[:database_position :asc]]}))

(mu/defn synced-python-library-items :- [:sequential ::transforms-python.schema/python-library]
  "The PythonLibraries with `ids`, as remote sync lists them."
  [ids :- [:sequential pos-int?]]
  (t2/select [:model/PythonLibrary :id :path] :id [:in ids]))
