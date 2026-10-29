(ns metabase.transforms-base.db
  "Application database queries for the transforms base module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn transform-source
  "The source of the Transform with `transform-id`, or nil."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select-one-fn :source [:model/Transform :id :source] transform-id))

(mu/defn transforms-for-ordering
  "The id, name, target, target Table id, source Database id, and table dependencies of every Transform
   excluding [[transform-id]]."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select [:model/Transform :id :name :target :target_table_id :source_database_id :table_dependencies]
             :id [:not= transform-id]))

(mu/defn transform
  "The Transform with `transform-id`, or nil."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select-one :model/Transform :id [:auto/param transform-id]))

(mu/defn update-transform!
  "Apply `changes` to the Transform with `transform-id`."
  [transform-id :- ::lib.schema.id/transform
   changes      :- [:map {:closed true}
                    [:last_checkpoint_value {:optional true} [:maybe :string]]
                    [:target_table_id       {:optional true} [:maybe ::lib.schema.id/table]]]]
  (t2/update! :model/Transform transform-id changes))

(mu/defn update-transform-run!
  "Apply `changes` to the TransformRun with `run-id`."
  [run-id  :- ms/PositiveInt
   changes :- [:map {:closed true}
               [:checkpoint_filter_field_id {:optional true} [:maybe ::lib.schema.id/field]]
               [:checkpoint_lo_value        {:optional true} [:maybe :string]]
               [:checkpoint_hi_value        {:optional true} [:maybe :string]]]]
  (t2/update! :model/TransformRun run-id changes))

(mu/defn target-table
  "The Table named `table-name` in `schema` of the Database with `database-id` also matching the key-value
  `conditions`, or nil."
  [database-id :- ::lib.schema.id/database
   schema      :- [:maybe :string]
   table-name  :- :string
   & conditions :- [:* [:or :keyword :string :int :boolean]]]
  (apply t2/select-one :model/Table :db_id database-id :schema schema :name table-name conditions))

(mu/defn update-table!
  "Apply `changes` to the Table with `table-id`."
  [table-id :- ::lib.schema.id/table
   changes  :- [:map {:closed true}
                [:schema       {:optional true} [:maybe :string]]
                [:active       {:optional true} [:maybe :boolean]]
                [:transform_id {:optional true} [:maybe ::lib.schema.id/transform]]]]
  (t2/update! :model/Table table-id changes))

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
