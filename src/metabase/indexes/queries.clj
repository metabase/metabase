(ns metabase.indexes.queries
  "Application database queries for the indexes module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn table-indexes-for-transform
  "The TableIndexes of the Transform with `transform-id`, in id order."
  [transform-id]
  (t2/select :model/TableIndex :transform_id transform-id {:order-by [[:id :asc]]}))

(defn applicable-table-indexes-for-transform
  "The TableIndexes of the Transform with `transform-id` that are not pending deletion, in name order."
  [transform-id]
  (t2/select :model/TableIndex
             :transform_id transform-id
             :status [:not= :delete-pending]
             {:order-by [[:index_name :asc]]}))

(defn running-table-indexes
  "The running TableIndexes among `ids` of the Transform with `transform-id`, in id order."
  [transform-id ids]
  (t2/select :model/TableIndex
             :transform_id transform-id
             :id [:in ids]
             :status :running
             {:order-by [[:id :asc]]}))

(defn delete-pending-table-indexes
  "The TableIndexes of the Transform with `transform-id` that are pending deletion, in id order."
  [transform-id]
  (t2/select :model/TableIndex
             :transform_id transform-id
             :status :delete-pending
             {:order-by [[:id :asc]]}))

(defn applicable-table-index
  "The TableIndex with `id` if it is not pending deletion, or nil."
  [id]
  (t2/select-one :model/TableIndex :id id :status [:not= :delete-pending]))

(defn table-index-with-status-exists?
  "Whether the Transform with `transform-id` has a TableIndex in one of `statuses`."
  [transform-id statuses]
  (t2/exists? :model/TableIndex :transform_id transform-id :status [:in statuses]))

(defn mark-table-indexes-running!
  "Set the TableIndexes among `ids` whose status is in `from-statuses` to running."
  [ids from-statuses]
  (t2/update! :model/TableIndex {:id [:in ids] :status [:in from-statuses]} {:status :running}))

(defn mark-running-table-indexes-failed!
  "Set the running TableIndexes among `ids` to failed with `error-message`."
  [ids error-message]
  (t2/update! :model/TableIndex
              {:id [:in ids] :status :running}
              {:status           :failed
               :error_message    error-message
               :last_executed_at :%now}))

(defn mark-table-indexes-update-pending!
  "Set the TableIndexes with `ids` to update-pending and clear their error."
  [ids]
  (t2/update! :model/TableIndex {:id [:in ids]} {:status :update-pending, :error_message nil}))

(defn table-index-exists-for-transform?
  "Whether the Transform with `transform-id` has a TableIndex named `index-name`."
  [transform-id index-name]
  (t2/exists? :model/TableIndex :transform_id transform-id :index_name index-name))
