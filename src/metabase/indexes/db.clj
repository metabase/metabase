(ns metabase.indexes.db
  "Application database queries for the indexes module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`).

  The queries below follow [[::opts]]; queries that do not fit it live in the indexes-only section at the bottom of
  this namespace."
  (:require
   [metabase.indexes.schema :as indexes.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(def ^:private Status
  "Lifecycle states for a table index request. Mirrors `metabase.indexes.schema/statuses`; duplicated here (rather
  than required) to keep this namespace free of module-internal logic dependencies."
  [:enum :create-pending :update-pending :delete-pending :running :succeeded :failed])

(mr/def ::filters
  "Which TableIndexes a query applies to. Keys mirror the columns of `metabase_table_indexes`: a scalar matches that
  value and a set matches any of its values."
  [:map {:closed true}
   [:id           {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:transform_id {:optional true} [:or ::lib.schema.id/transform [:set ::lib.schema.id/transform]]]
   [:status       {:optional true} [:or Status [:set Status]]]
   [:index_name   {:optional true} :string]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::indexes.schema/table-index.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::indexes.schema/table-index.column
                                              [:tuple ::indexes.schema/table-index.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/TableIndex columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

(defn- ->kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-table-indexes :- [:sequential ::indexes.schema/table-index.partial]
  "The TableIndexes matching `opts`."
  ([]
   (select-table-indexes nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select (->model columns) (->args opts))))

(mu/defn select-one-table-index :- [:maybe ::indexes.schema/table-index.partial]
  "The first TableIndex matching `opts`, or nil."
  ([]
   (select-one-table-index nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select-one (->model columns) (->args opts))))

(mu/defn table-index-exists? :- :boolean
  "Whether a TableIndex matching `opts` exists."
  [opts :- [:maybe ::opts]]
  (apply t2/exists? :model/TableIndex (->args opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn update-table-indexes! :- :int
  "Apply `changes` to every TableIndex matching `opts`, returning the number updated."
  [opts    :- [:maybe ::opts]
   changes :- ::indexes.schema/table-index.update]
  (apply t2/update! :model/TableIndex (conj (->kv-args opts) changes)))

;;; -------------------------------------- Queries used only by the indexes module --------------------------------------

(mu/defn select-applicable-table-indexes-for-transform :- [:sequential ::indexes.schema/table-index.partial]
  "The TableIndexes of the Transform with `transform-id` that are not pending deletion, in name order."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select :model/TableIndex
             :transform_id transform-id
             :status [:not= :delete-pending]
             {:order-by [[:index_name :asc]]}))

(mu/defn select-applicable-table-index :- [:maybe ::indexes.schema/table-index.partial]
  "The TableIndex with `id` if it is not pending deletion, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/TableIndex :id id :status [:not= :delete-pending]))

(mu/defn update-table-indexes-running! :- :int
  "Set the TableIndexes among `ids` whose status is in `from-statuses` to running, returning the number updated."
  [ids           :- [:set ms/PositiveInt]
   from-statuses :- [:set Status]]
  (update-table-indexes! {:id ids, :status from-statuses} {:status :running}))

(mu/defn update-running-table-indexes-failed! :- :int
  "Set the running TableIndexes among `ids` to failed with `error-message`, returning the number updated."
  [ids           :- [:set ms/PositiveInt]
   error-message :- :string]
  (update-table-indexes! {:id ids, :status :running}
                         {:status           :failed
                          :error_message    error-message
                          :last_executed_at :%now}))

(mu/defn update-table-indexes-pending! :- :int
  "Set the TableIndexes with `ids` to update-pending and clear their error, returning the number updated."
  [ids :- [:sequential ms/PositiveInt]]
  (update-table-indexes! {:id (set ids)} {:status :update-pending, :error_message nil}))
