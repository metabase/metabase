(ns metabase.indexes.db
  "Application database queries for the indexes module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.indexes.schema :as indexes.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.remote-sync.schema :as remote-sync.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private Status
  "Lifecycle states for a table index request. Mirrors `metabase.indexes.schema/statuses`; duplicated here (rather
  than required) to keep this namespace free of module-internal logic dependencies."
  [:enum :create-pending :update-pending :delete-pending :running :succeeded :failed])

(mu/defn synced-table-indexes-clause :- [:fn vector?]
  "The clause over the TableIndex table aliased `alias` selecting the indexes of the transforms remote sync syncs."
  [alias :- :keyword
   opts  :- ::remote-sync.schema/synced-filter-opts]
  (remote-sync/synced-fk-clause alias :transform_id :model/Transform opts))

(mu/defn table-indexes-for-transform
  "The TableIndexes of the Transform with `transform-id`, in id order."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select :model/TableIndex :transform_id transform-id {:order-by [[:id :asc]]}))

(mu/defn applicable-table-indexes-for-transform
  "The TableIndexes of the Transform with `transform-id` that are not pending deletion, in name order."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select :model/TableIndex
             :transform_id transform-id
             :status [:not= :delete-pending]
             {:order-by [[:index_name :asc]]}))

(mu/defn applicable-table-index-ids-for-transforms :- [:sequential ms/PositiveInt]
  "The ids of the TableIndexes of the Transforms with `transform-ids` that are not pending deletion."
  [transform-ids :- [:sequential {:min 1} ::lib.schema.id/transform]]
  (vec (t2/select-pks-vec :model/TableIndex
                          :transform_id [:in [:auto/param transform-ids]]
                          :status [:not= :delete-pending])))

(mu/defn running-table-indexes
  "The running TableIndexes among `ids` of the Transform with `transform-id`, in id order."
  [transform-id :- ::lib.schema.id/transform
   ids          :- [:sequential ms/PositiveInt]]
  (t2/select :model/TableIndex
             :transform_id transform-id
             :id [:in ids]
             :status :running
             {:order-by [[:id :asc]]}))

(mu/defn delete-pending-table-indexes
  "The TableIndexes of the Transform with `transform-id` that are pending deletion, in id order."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select :model/TableIndex
             :transform_id transform-id
             :status :delete-pending
             {:order-by [[:id :asc]]}))

(mu/defn applicable-table-index
  "The TableIndex with `id` if it is not pending deletion, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/TableIndex :id id :status [:not= :delete-pending]))

(mu/defn table-index-with-status-exists?
  "Whether the Transform with `transform-id` has a TableIndex in one of `statuses`."
  [transform-id :- ::lib.schema.id/transform
   statuses     :- [:set Status]]
  (t2/exists? :model/TableIndex :transform_id transform-id :status [:in statuses]))

(def ^:private StatusChanges
  "The columns a status change of a TableIndex sets."
  [:map {:closed true}
   [:status           {:optional true} [:maybe [:or :keyword :string]]]
   [:error_message    {:optional true} [:maybe :string]]
   [:last_executed_at {:optional true} [:= :%now]]])

(mu/defn table-index-statuses
  "The id, status and error message of each of the TableIndexes with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select [:model/TableIndex :id :status :error_message] :id [:in [:auto/param ids]]))

(mu/defn mark-table-indexes-running!
  "Apply `changes` to the TableIndexes among `ids` whose status is in `from-statuses`."
  [ids           :- [:sequential {:min 1} ms/PositiveInt]
   from-statuses :- [:set Status]
   changes       :- StatusChanges]
  (t2/update! :model/TableIndex {:id [:in ids] :status [:in from-statuses]} changes))

(mu/defn mark-running-table-indexes-failed!
  "Apply `changes` to the running TableIndexes among `ids`."
  [ids     :- [:sequential {:min 1} ms/PositiveInt]
   changes :- StatusChanges]
  (t2/update! :model/TableIndex {:id [:in ids] :status :running} changes))

(mu/defn update-table-index-statuses!
  "Apply `changes` to the TableIndexes with `ids`."
  [ids     :- [:sequential {:min 1} ms/PositiveInt]
   changes :- StatusChanges]
  (t2/update! :model/TableIndex {:id [:in ids]} changes))

(mu/defn table-index-exists-for-transform?
  "Whether the Transform with `transform-id` has a TableIndex named `index-name`."
  [transform-id :- ::lib.schema.id/transform
   index-name   :- :string]
  (t2/exists? :model/TableIndex :transform_id transform-id :index_name index-name))

(mu/defn insert-table-index!
  "Insert the TableIndex `row` and return the inserted instance."
  [row :- ::indexes.schema/table-index.update]
  (t2/insert-returning-instance! :model/TableIndex row))

(mu/defn update-table-index!
  "Apply `changes` to the TableIndex with `id`, returning the number updated."
  [id      :- ms/PositiveInt
   changes :- ::indexes.schema/table-index.update]
  (t2/update! :model/TableIndex :id id changes))

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
