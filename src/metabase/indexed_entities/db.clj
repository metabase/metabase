(ns metabase.indexed-entities.db
  "Application database queries for the indexed entities module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.indexed-entities.schema :as indexed-entities.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn model-index :- [:maybe ::indexed-entities.schema/model-index]
  "The ModelIndex with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/ModelIndex :id id))

(mu/defn model-indexes-for-model :- [:sequential ::indexed-entities.schema/model-index]
  "The ModelIndexes of the model Card with `model-id`."
  [model-id :- ms/PositiveInt]
  (t2/select :model/ModelIndex :model_id model-id))

(mu/defn all-model-indexes :- [:sequential ::indexed-entities.schema/model-index]
  "Every ModelIndex."
  []
  (t2/select :model/ModelIndex))

(mu/defn model-indexes-except :- [:sequential ::indexed-entities.schema/model-index]
  "The ModelIndexes whose id is not in `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/ModelIndex :id [:not-in ids]))

(mu/defn delete-model-index! :- :int
  "Delete the ModelIndex with `id`, returning the number deleted."
  [id :- ms/PositiveInt]
  (t2/delete! :model/ModelIndex id))

(mu/defn card :- [:maybe ::queries.schema/card]
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn model-index-values :- [:sequential ::indexed-entities.schema/model-index-value]
  "The ModelIndexValues of the ModelIndex with `model-index-id`."
  [model-index-id :- ms/PositiveInt]
  (t2/select :model/ModelIndexValue :model_index_id model-index-id))

(mu/defn model-index-values-reducible
  "A reducible of the ModelIndexValues of the ModelIndex with `model-index-id`."
  [model-index-id :- ms/PositiveInt]
  (t2/reducible-select :model/ModelIndexValue :model_index_id model-index-id))

(mu/defn mark-model-index-error! :- :int
  "Record `error-message` on the ModelIndex with `id` and stamp its indexing time, returning the number updated."
  [id            :- ms/PositiveInt
   error-message :- :string]
  (t2/update! :model/ModelIndex id {:state      "error"
                                    :error      error-message
                                    :indexed_at :%now}))

(mu/defn mark-model-index-indexed! :- :int
  "Set the ModelIndex with `id` to `state`, clear its error, and stamp its indexing time, returning the number
  updated."
  [id    :- ms/PositiveInt
   state :- :string]
  (t2/update! :model/ModelIndex id {:indexed_at :%now
                                    :error      nil
                                    :state      state}))

(mu/defn delete-model-index-values! :- :int
  "Delete the ModelIndexValues of the ModelIndex with `model-index-id` for the model primary keys `model-pks`,
  returning the number deleted."
  [model-index-id :- ms/PositiveInt
   model-pks      :- [:sequential :int]]
  (t2/delete! :model/ModelIndexValue :model_index_id model-index-id :model_pk [:in model-pks]))

(mu/defn insert-model-index-values! :- :int
  "Insert the ModelIndexValue `rows`, returning the number inserted."
  [rows :- [:sequential (mut/select-keys ::indexed-entities.schema/model-index-value.update [:model_index_id :model_pk :name])]]
  (t2/insert! :model/ModelIndexValue rows))

(mu/defn insert-model-index! :- (mut/optional-keys ::indexed-entities.schema/model-index)
  "Insert the ModelIndex `row` and return the inserted instance."
  [row :- ::indexed-entities.schema/model-index.update]
  (t2/insert-returning-instance! :model/ModelIndex [row]))
