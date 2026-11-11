(ns metabase.transforms-base.db
  "Application database queries for the transforms base module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.toucan.core :as t2]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(mu/defn transform-source
  "The source of the Transform with `transform-id`, or nil."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select-one-fn :source [:model/Transform :id :source] :id transform-id))

(mu/defn transforms-for-ordering
  "The id, name, target, target Table id, source Database id, and table dependencies of every Transform
   excluding [[transform-id]]."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select [:model/Transform :id :name :target :target_table_id :source_database_id :table_dependencies]
             :id [:not= transform-id]))

(mu/defn transform
  "The Transform with `transform-id`, or nil."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select-one :model/Transform :id transform-id))

(mu/defn update-transform!
  "Apply `changes` to the Transform with `transform-id`."
  [transform-id :- ::lib.schema.id/transform
   changes      :- [:map {:closed true}
                    [:last_checkpoint_value {:optional true} [:maybe :string]]
                    [:target_table_id       {:optional true} [:maybe ::lib.schema.id/table]]]]
  (t2/update! :model/Transform :id transform-id changes))

(mu/defn update-transform-run!
  "Apply `changes` to the TransformRun with `run-id`."
  [run-id  :- ms/PositiveInt
   changes :- [:map {:closed true}
               [:checkpoint_filter_field_id {:optional true} [:maybe ::lib.schema.id/field]]
               [:checkpoint_lo_value        {:optional true} [:maybe :string]]
               [:checkpoint_hi_value        {:optional true} [:maybe :string]]]]
  (t2/update! :model/TransformRun :id run-id changes))

(mu/defn database-exists?
  "Whether a Database with `database-id` exists."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Database :id database-id))

(mu/defn field-table-id
  "The Table id of the Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :table_id :model/Field :id field-id))

(mu/defn target-table
  "The Table named `table-name` in `schema` of the Database with `database-id`, narrowed to the given `active` flag
  unless it is nil, or nil."
  [database-id :- ::lib.schema.id/database
   schema      :- [:maybe :string]
   table-name  :- :string
   active      :- [:maybe :boolean]]
  (if (nil? active)
    (t2/select-one :model/Table :db_id database-id :schema schema :name table-name)
    (t2/select-one :model/Table :db_id database-id :schema schema :name table-name :active active)))

(mu/defn table
  "The Table with `table-id`, or nil."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/Table :id table-id))

(mu/defn table-for-transform
  "The Table owned by the Transform with `transform-id`, or nil. `transform-id` is nil for a transform
  that hasn't been saved yet, in which case there is no owned Table either."
  [transform-id :- [:maybe ::lib.schema.id/transform]]
  (when transform-id
    (t2/select-one :model/Table :transform_id transform-id)))

(mu/defn update-table!
  "Apply `changes` to the Table with `table-id`."
  [table-id :- ::lib.schema.id/table
   changes  :- [:map {:closed true}
                [:schema       {:optional true} [:maybe :string]]
                [:active       {:optional true} [:maybe :boolean]]
                [:transform_id {:optional true} [:maybe ::lib.schema.id/transform]]]]
  (t2/update! :model/Table :id table-id changes))

(mu/defn mark-table-index-failed!
  "Mark the TableIndex named `index-name` of the Transform with `transform-id` failed with `error-message`."
  [transform-id  :- ::lib.schema.id/transform
   index-name    :- :string
   error-message :- :string]
  (t2/update! :model/TableIndex
              :transform_id transform-id :index_name index-name
              {:status :failed :error_message error-message :last_executed_at :%now}))

(mu/defn delete-table-indexes!
  "Delete the TableIndexes with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/TableIndex :id [:in ids]))

(mu/defn update-table-indexes!
  "Apply `changes` to the TableIndexes with `ids`, stamping `last_executed_at` with the app DB's now."
  [ids     :- [:sequential ms/PositiveInt]
   changes :- [:map {:closed true}
               [:status        {:optional true} [:maybe [:or :keyword :string]]]
               [:error_message {:optional true} [:maybe :string]]]]
  (t2/update! :model/TableIndex :id [:in ids] (merge {:last_executed_at :%now} changes)))

(mu/defn active-field-names-for-table
  "The names of the active Fields of the Table with `table-id`, in position order."
  [table-id :- ::lib.schema.id/table]
  (t2/select-fn-vec :name [:model/Field :name :position]
                    :table_id table-id :active true
                    {:order-by [[:position :asc]]}))

(defn- refs-where
  "The clause matching any of the `[db-id schema table-name]` `refs`, as a balanced tree."
  [refs]
  (let [n (count refs)]
    (case n
      0 (t2/fragment [:or])
      1 (let [[db-id schema table-name] (first refs)]
          (t2/fragment [:and
                        [:= :db_id db-id]
                        (if (some? schema)
                          (t2/fragment [:= :schema schema])
                          (t2/fragment [:is :schema nil]))
                        [:= :name table-name]]))
      (let [[l r] (split-at (quot n 2) refs)]
        (t2/fragment [:or (refs-where l) (refs-where r)])))))

(mu/defn table-refs-matching
  "The id, Database id, schema, and name of the Tables matching any of `refs` (each a `[db-id schema table-name]`
  triple; `schema` may be nil)."
  [refs :- [:sequential [:tuple ms/PositiveInt [:maybe :string] :string]]]
  (t2/select [:model/Table :id :db_id :schema :name] {:where (refs-where refs)}))

(mu/defn table-refs
  "The id, Database id, schema, and name of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select [:model/Table :id :db_id :schema :name] :id [:in table-ids]))
