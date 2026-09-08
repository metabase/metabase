(ns metabase.indexed-entities.db
  "Application database queries for the indexed entities module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn model-index :- [:maybe (ms/InstanceOf :model/ModelIndex)]
  "The ModelIndex with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/ModelIndex :id id))

(mu/defn model-indexes-for-model :- [:sequential (ms/InstanceOf :model/ModelIndex)]
  "The ModelIndexes of the model Card with `model-id`."
  [model-id :- ms/PositiveInt]
  (t2/select :model/ModelIndex :model_id model-id))

(mu/defn all-model-indexes :- [:sequential (ms/InstanceOf :model/ModelIndex)]
  "Every ModelIndex."
  []
  (t2/select :model/ModelIndex))

(mu/defn model-indexes-except :- [:sequential (ms/InstanceOf :model/ModelIndex)]
  "The ModelIndexes whose id is not in `ids`."
  [ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/ModelIndex :id [:not-in ids]))

(mu/defn delete-model-index! :- :int
  "Delete the ModelIndex with `id`, returning the number deleted."
  [id :- ms/PositiveInt]
  (t2/delete! :model/ModelIndex id))

(mu/defn card :- [:maybe (ms/InstanceOf :model/Card)]
  "The Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one :model/Card :id card-id))

(mu/defn model-index-values :- [:sequential (ms/InstanceOf :model/ModelIndexValue)]
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
   model-pks      :- [:seqable :int]]
  (t2/delete! :model/ModelIndexValue :model_index_id model-index-id :model_pk [:in model-pks]))

(mu/defn insert-model-index-values! :- :int
  "Insert the ModelIndexValue `rows`, returning the number inserted."
  [rows :- [:seqable [:map {:closed true}
                      [:model_index_id {:optional true} :any]
                      [:model_pk       {:optional true} :any]
                      [:name           {:optional true} :any]]]]
  (t2/insert! :model/ModelIndexValue rows))

(mu/defn insert-model-index! :- (ms/InstanceOf :model/ModelIndex)
  "Insert the ModelIndex `row` and return the inserted instance."
  [row :- [:map {:closed true}
           [:id         {:optional true} :any]
           [:model_id   {:optional true} :any]
           [:pk_ref     {:optional true} :any]
           [:value_ref  {:optional true} :any]
           [:schedule   {:optional true} :any]
           [:state      {:optional true} :any]
           [:indexed_at {:optional true} :any]
           [:error      {:optional true} :any]
           [:created_at {:optional true} :any]
           [:creator_id {:optional true} :any]]]
  (t2/insert-returning-instance! :model/ModelIndex [row]))
