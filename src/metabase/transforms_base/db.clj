(ns metabase.transforms-base.db
  "Application database queries for the transforms base module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn transform-source :- :any
  "The source of the Transform with `transform-id`, or nil."
  [transform-id :- ms/PositiveInt]
  (t2/select-one-fn :source [:model/Transform :id :source] transform-id))

(mu/defn transforms-for-ordering :- [:sequential (ms/InstanceOf :model/Transform)]
  "The id, name, target, target Table id, source Database id, and table dependencies of every Transform
   excluding [[transform-id]]."
  [transform-id :- ms/PositiveInt]
  (t2/select [:model/Transform :id :name :target :target_table_id :source_database_id :table_dependencies]
             :id [:not= transform-id]))

(mu/defn transform :- [:maybe (ms/InstanceOf :model/Transform)]
  "The Transform with `transform-id`, or nil."
  [transform-id :- ms/PositiveInt]
  (t2/select-one :model/Transform transform-id))

(mu/defn update-transform! :- :int
  "Apply `changes` to the Transform with `transform-id`."
  [transform-id :- ms/PositiveInt
   changes      :- [:map {:closed true}
                    [:last_checkpoint_value {:optional true} :any]
                    [:target_table_id       {:optional true} :any]]]
  (t2/update! :model/Transform transform-id changes))

(mu/defn update-transform-run! :- :int
  "Apply `changes` to the TransformRun with `run-id`."
  [run-id  :- ms/PositiveInt
   changes :- [:map {:closed true}
               [:checkpoint_filter_field_id :any]
               [:checkpoint_lo_value        {:optional true} :any]
               [:checkpoint_hi_value        {:optional true} :any]]]
  (t2/update! :model/TransformRun run-id changes))

(mu/defn database :- [:maybe (ms/InstanceOf :model/Database)]
  "The Database with `database-id`, or nil."
  [database-id :- ms/PositiveInt]
  (t2/select-one :model/Database database-id))

(mu/defn field-table-id :- [:maybe ms/PositiveInt]
  "The Table id of the Field with `field-id`, or nil."
  [field-id :- ms/PositiveInt]
  (t2/select-one-fn :table_id :model/Field field-id))

(mu/defn target-table :- [:maybe (ms/InstanceOf :model/Table)]
  "The Table named `table-name` in `schema` of the Database with `database-id` also matching the key-value
  `conditions`, or nil."
  [database-id :- ms/PositiveInt
   schema      :- [:maybe :string]
   table-name  :- :string
   & conditions :- [:* :any]]
  (apply t2/select-one :model/Table :db_id database-id :schema schema :name table-name conditions))

(mu/defn table :- [:maybe (ms/InstanceOf :model/Table)]
  "The Table with `table-id`, or nil."
  [table-id :- ms/PositiveInt]
  (t2/select-one :model/Table table-id))

(mu/defn table-for-transform :- [:maybe (ms/InstanceOf :model/Table)]
  "The Table owned by the Transform with `transform-id`, or nil."
  [transform-id :- ms/PositiveInt]
  (t2/select-one :model/Table :transform_id transform-id))

(mu/defn update-table! :- :int
  "Apply `changes` to the Table with `table-id`."
  [table-id :- ms/PositiveInt
   changes  :- [:map {:closed true}
                [:schema       {:optional true} :any]
                [:active       {:optional true} :any]
                [:transform_id {:optional true} :any]]]
  (t2/update! :model/Table table-id changes))

(mu/defn mark-table-index-failed! :- :int
  "Mark the TableIndex named `index-name` of the Transform with `transform-id` failed with `error-message`."
  [transform-id  :- ms/PositiveInt
   index-name    :- :string
   error-message :- :string]
  (t2/update! :model/TableIndex
              :transform_id transform-id :index_name index-name
              {:status :failed :error_message error-message :last_executed_at :%now}))

(mu/defn delete-table-indexes! :- :int
  "Delete the TableIndexes with `ids`."
  [ids :- [:seqable ms/PositiveInt]]
  (t2/delete! :model/TableIndex :id [:in ids]))

(mu/defn update-table-indexes! :- :int
  "Apply `changes` to the TableIndexes with `ids`."
  [ids     :- [:seqable ms/PositiveInt]
   changes :- [:map {:closed true}
               [:status           :any]
               [:last_executed_at :any]
               [:error_message    {:optional true} :any]]]
  (t2/update! :model/TableIndex :id [:in ids] changes))

(mu/defn active-field-names-for-table :- [:maybe [:sequential :string]]
  "The names of the active Fields of the Table with `table-id`, in position order."
  [table-id :- ms/PositiveInt]
  (t2/select-fn-vec :name [:model/Field :name :position]
                    :table_id table-id :active true
                    {:order-by [[:position :asc]]}))

(mu/defn table-refs-matching :- [:sequential (ms/InstanceOf :model/Table)]
  "The id, Database id, schema, and name of the Tables matching any of `refs` (each a `[db-id schema table-name]`
  triple; `schema` may be nil)."
  [refs :- [:seqable [:tuple ms/PositiveInt [:maybe :string] :string]]]
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

(mu/defn table-refs :- [:sequential (ms/InstanceOf :model/Table)]
  "The id, Database id, schema, and name of the Tables with `table-ids`."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/Table :id :db_id :schema :name] :id [:in table-ids]))
