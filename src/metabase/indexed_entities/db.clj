(ns metabase.indexed-entities.db
  "Application database queries for the indexed entities module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn model-index
  "The ModelIndex with `id`, or nil."
  [id]
  (t2/select-one :model/ModelIndex :id id))

(defn model-indexes-for-model
  "The ModelIndexes of the model Card with `model-id`."
  [model-id]
  (t2/select :model/ModelIndex :model_id model-id))

(defn all-model-indexes
  "Every ModelIndex."
  []
  (t2/select :model/ModelIndex))

(defn model-indexes-except
  "The ModelIndexes whose id is not in `ids`."
  [ids]
  (t2/select :model/ModelIndex :id [:not-in ids]))

(defn delete-model-index!
  "Delete the ModelIndex with `id`."
  [id]
  (t2/delete! :model/ModelIndex id))

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card :id card-id))

(defn model-index-values
  "The ModelIndexValues of the ModelIndex with `model-index-id`."
  [model-index-id]
  (t2/select :model/ModelIndexValue :model_index_id model-index-id))

(defn model-index-values-reducible
  "A reducible of the ModelIndexValues of the ModelIndex with `model-index-id`."
  [model-index-id]
  (t2/reducible-select :model/ModelIndexValue :model_index_id model-index-id))

(defn mark-model-index-error!
  "Record `error-message` on the ModelIndex with `id` and stamp its indexing time."
  [id error-message]
  (t2/update! :model/ModelIndex id {:state      "error"
                                    :error      error-message
                                    :indexed_at :%now}))

(defn mark-model-index-indexed!
  "Set the ModelIndex with `id` to `state`, clear its error, and stamp its indexing time."
  [id state]
  (t2/update! :model/ModelIndex id {:indexed_at :%now
                                    :error      nil
                                    :state      state}))

(defn delete-model-index-values!
  "Delete the ModelIndexValues of the ModelIndex with `model-index-id` for the model primary keys `model-pks`."
  [model-index-id model-pks]
  (t2/delete! :model/ModelIndexValue :model_index_id model-index-id :model_pk [:in model-pks]))

(defn insert-model-index-values!
  "Insert the ModelIndexValue `rows`."
  [rows]
  (t2/insert! :model/ModelIndexValue rows))

(defn insert-model-index!
  "Insert the ModelIndex `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/ModelIndex [row]))
