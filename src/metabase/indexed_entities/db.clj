(ns metabase.indexed-entities.db
  "Application database queries for the indexed entities module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`).

  The queries below follow [[::opts]]; queries that do not fit it live in the indexed-entities-only section at the
  bottom of this namespace."
  (:require
   [metabase.indexed-entities.schema :as indexed-entities.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which ModelIndexes a query applies to. Keys mirror the columns of `model_index`: a scalar matches that value and a
  set matches any of its values."
  [:map {:closed true}
   [:id       {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:model_id {:optional true} [:or :int [:set :int]]]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::indexed-entities.schema/model-index.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::indexed-entities.schema/model-index.column
                                              [:tuple ::indexed-entities.schema/model-index.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/ModelIndex columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

(defn- ->kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-model-indexes :- [:sequential ::indexed-entities.schema/model-index.partial]
  "The ModelIndexes matching `opts`."
  ([]
   (select-model-indexes nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select (->model columns) (->args opts))))

(mu/defn select-one-model-index :- [:maybe ::indexed-entities.schema/model-index.partial]
  "The first ModelIndex matching `opts`, or nil."
  ([]
   (select-one-model-index nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select-one (->model columns) (->args opts))))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-model-index! :- ::indexed-entities.schema/model-index
  "Insert the ModelIndex `row` and return the inserted instance."
  [row :- ::indexed-entities.schema/model-index.create]
  (t2/insert-returning-instance! :model/ModelIndex row))

(mu/defn update-model-indexes! :- :int
  "Apply `changes` to every ModelIndex matching `opts`, returning the number updated."
  [opts    :- [:maybe ::opts]
   changes :- ::indexed-entities.schema/model-index.update]
  (apply t2/update! :model/ModelIndex (conj (->kv-args opts) changes)))

(mu/defn delete-model-indexes! :- :int
  "Delete every ModelIndex matching `opts`, returning the number deleted."
  [opts :- [:maybe ::opts]]
  (apply t2/delete! :model/ModelIndex (->args opts)))

;;; ------------------------------- Queries used only by the indexed-entities module -------------------------------

(mu/defn select-model-indexes-except :- [:sequential ::indexed-entities.schema/model-index.partial]
  "The ModelIndexes whose id is not in `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/ModelIndex :id [:not-in ids]))

(mu/defn update-model-index-error! :- :int
  "Record `error-message` on the ModelIndex with `id` and stamp its indexing time, returning the number updated."
  [id            :- ms/PositiveInt
   error-message :- :string]
  (update-model-indexes! {:id id} {:state      "error"
                                   :error      error-message
                                   :indexed_at :%now}))

(mu/defn update-model-index-indexed! :- :int
  "Set the ModelIndex with `id` to `state`, clear its error, and stamp its indexing time, returning the number
  updated."
  [id    :- ms/PositiveInt
   state :- :string]
  (update-model-indexes! {:id id} {:indexed_at :%now
                                   :error      nil
                                   :state      state}))

(mu/defn select-card :- [:maybe :map]
  "The Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one :model/Card :id card-id))

(mu/defn select-model-index-values :- [:sequential ::indexed-entities.schema/model-index-value]
  "The ModelIndexValues of the ModelIndex with `model-index-id`."
  [model-index-id :- ms/PositiveInt]
  (t2/select :model/ModelIndexValue :model_index_id model-index-id))

(mu/defn reducible-select-model-index-values
  "A reducible of the ModelIndexValues of the ModelIndex with `model-index-id`."
  [model-index-id :- ms/PositiveInt]
  (t2/reducible-select :model/ModelIndexValue :model_index_id model-index-id))

(mu/defn delete-model-index-values! :- :int
  "Delete the ModelIndexValues of the ModelIndex with `model-index-id` for the model primary keys `model-pks`,
  returning the number deleted."
  [model-index-id :- ms/PositiveInt
   model-pks      :- [:sequential :int]]
  (t2/delete! :model/ModelIndexValue :model_index_id model-index-id :model_pk [:in model-pks]))

(mu/defn insert-model-index-values! :- :int
  "Insert the ModelIndexValue `rows`, returning the number inserted."
  [rows :- [:sequential ::indexed-entities.schema/model-index-value.create]]
  (t2/insert! :model/ModelIndexValue rows))
