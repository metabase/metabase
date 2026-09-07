(ns metabase.transforms-base.db
  "Application database queries for the transforms base module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [toucan2.core :as t2]))

(defn transform-source
  "The source of the Transform with `transform-id`, or nil."
  [transform-id]
  (t2/select-one-fn :source [:model/Transform :id :source] transform-id))

(defn transforms-for-ordering
  "The id, name, target, target Table id, source Database id, and table dependencies of every Transform
   excluding [[transform-id]]."
  [transform-id]
  (t2/select [:model/Transform :id :name :target :target_table_id :source_database_id :table_dependencies]
             :id [:not= transform-id]))

(defn transform
  "The Transform with `transform-id`, or nil."
  [transform-id]
  (t2/select-one :model/Transform transform-id))

(defn update-transform!
  "Apply `changes` to the Transform with `transform-id`."
  [transform-id changes]
  (t2/update! :model/Transform transform-id changes))

(defn update-transform-run!
  "Apply `changes` to the TransformRun with `run-id`."
  [run-id changes]
  (t2/update! :model/TransformRun run-id changes))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database database-id))

(defn field-table-id
  "The Table id of the Field with `field-id`, or nil."
  [field-id]
  (t2/select-one-fn :table_id :model/Field field-id))

(defn target-table
  "The Table named `table-name` in `schema` of the Database with `database-id` also matching the key-value
  `conditions`, or nil."
  [database-id schema table-name & conditions]
  (apply t2/select-one :model/Table :db_id database-id :schema schema :name table-name conditions))

(defn table
  "The Table with `table-id`, or nil."
  [table-id]
  (t2/select-one :model/Table table-id))

(defn table-for-transform
  "The Table owned by the Transform with `transform-id`, or nil."
  [transform-id]
  (t2/select-one :model/Table :transform_id transform-id))

(defn update-table!
  "Apply `changes` to the Table with `table-id`."
  [table-id changes]
  (t2/update! :model/Table table-id changes))

(defn mark-table-index-failed!
  "Mark the TableIndex named `index-name` of the Transform with `transform-id` failed with `error-message`."
  [transform-id index-name error-message]
  (t2/update! :model/TableIndex
              :transform_id transform-id :index_name index-name
              {:status :failed :error_message error-message :last_executed_at :%now}))

(defn delete-table-indexes!
  "Delete the TableIndexes with `ids`."
  [ids]
  (t2/delete! :model/TableIndex :id [:in ids]))

(defn update-table-indexes!
  "Apply `changes` to the TableIndexes with `ids`."
  [ids changes]
  (t2/update! :model/TableIndex :id [:in ids] changes))

(defn active-field-names-for-table
  "The names of the active Fields of the Table with `table-id`, in position order."
  [table-id]
  (t2/select-fn-vec :name [:model/Field :name :position]
                    :table_id table-id :active true
                    {:order-by [[:position :asc]]}))

(defn table-refs-matching
  "The id, Database id, schema, and name of the Tables matching any of `refs` (each a `[db-id schema table-name]`
  triple; `schema` may be nil)."
  [refs]
  (t2/select [:model/Table :id :db_id :schema :name]
             {:where (into [:or]
                           (map (fn [[db-id schema table-name]]
                                  [:and
                                   [:= :db_id db-id]
                                   (if (some? schema)
                                     [:= :schema schema]
                                     [:is :schema nil])
                                   [:= :name table-name]]))
                           refs)}))

(defn table-refs
  "The id, Database id, schema, and name of the Tables with `table-ids`."
  [table-ids]
  (t2/select [:model/Table :id :db_id :schema :name] :id [:in table-ids]))
