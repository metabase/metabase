(ns metabase.indexes.db
  "Application database queries for the indexes module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.indexes.schema :as indexes.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private Status
  "Lifecycle states for a table index request. Mirrors `metabase.indexes.schema/statuses`; duplicated here (rather
  than required) to keep this namespace free of module-internal logic dependencies."
  [:enum :create-pending :update-pending :delete-pending :running :succeeded :failed])

(mu/defn table-indexes-for-transform :- [:sequential ::indexes.schema/table-index]
  "The TableIndexes of the Transform with `transform-id`, in id order."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select :model/TableIndex :transform_id transform-id {:order-by [[:id :asc]]}))

(mu/defn applicable-table-indexes-for-transform :- [:sequential ::indexes.schema/table-index]
  "The TableIndexes of the Transform with `transform-id` that are not pending deletion, in name order."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select :model/TableIndex
             :transform_id transform-id
             :status [:not= :delete-pending]
             {:order-by [[:index_name :asc]]}))

(mu/defn running-table-indexes :- [:sequential ::indexes.schema/table-index]
  "The running TableIndexes among `ids` of the Transform with `transform-id`, in id order."
  [transform-id :- ::lib.schema.id/transform
   ids          :- [:sequential ms/PositiveInt]]
  (t2/select :model/TableIndex
             :transform_id transform-id
             :id [:in ids]
             :status :running
             {:order-by [[:id :asc]]}))

(mu/defn delete-pending-table-indexes :- [:sequential ::indexes.schema/table-index]
  "The TableIndexes of the Transform with `transform-id` that are pending deletion, in id order."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select :model/TableIndex
             :transform_id transform-id
             :status :delete-pending
             {:order-by [[:id :asc]]}))

(mu/defn applicable-table-index :- [:maybe ::indexes.schema/table-index]
  "The TableIndex with `id` if it is not pending deletion, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/TableIndex :id id :status [:not= :delete-pending]))

(mu/defn table-index-with-status-exists? :- :boolean
  "Whether the Transform with `transform-id` has a TableIndex in one of `statuses`."
  [transform-id :- ::lib.schema.id/transform
   statuses     :- [:set Status]]
  (t2/exists? :model/TableIndex :transform_id transform-id :status [:in statuses]))

(mu/defn mark-table-indexes-running! :- :int
  "Set the TableIndexes among `ids` whose status is in `from-statuses` to running."
  [ids           :- [:set ms/PositiveInt]
   from-statuses :- [:set Status]]
  (t2/update! :model/TableIndex {:id [:in ids] :status [:in from-statuses]} {:status :running}))

(mu/defn mark-running-table-indexes-failed! :- :int
  "Set the running TableIndexes among `ids` to failed with `error-message`."
  [ids           :- [:set ms/PositiveInt]
   error-message :- :string]
  (t2/update! :model/TableIndex
              {:id [:in ids] :status :running}
              {:status           :failed
               :error_message    error-message
               :last_executed_at :%now}))

(mu/defn mark-table-indexes-update-pending! :- :int
  "Set the TableIndexes with `ids` to update-pending and clear their error."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/update! :model/TableIndex {:id [:in ids]} {:status :update-pending, :error_message nil}))

(mu/defn table-index-exists-for-transform? :- :boolean
  "Whether the Transform with `transform-id` has a TableIndex named `index-name`."
  [transform-id :- ::lib.schema.id/transform
   index-name   :- :string]
  (t2/exists? :model/TableIndex :transform_id transform-id :index_name index-name))
