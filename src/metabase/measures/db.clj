(ns metabase.measures.db
  "Application database queries for the measures module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`).

  The queries below follow [[::opts]]; queries that do not fit it live in the measures-only section at the bottom of
  this namespace."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.measures.schema :as measures.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which Measures a query applies to. Keys mirror the columns of `measure`: a scalar matches that value and a set
  matches any of its values."
  [:map {:closed true}
   [:id       {:optional true} [:or ::lib.schema.id/measure [:set ::lib.schema.id/measure]]]
   [:table_id {:optional true} [:or ::lib.schema.id/table [:set ::lib.schema.id/table]]]
   [:archived {:optional true} :boolean]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::measures.schema/measure.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::measures.schema/measure.column
                                              [:tuple ::measures.schema/measure.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(def ^:private lower-columns
  "Text columns ordered case-insensitively, so `Zebra` does not sort ahead of `apple`."
  #{:name})

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/Measure columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts {:lower-columns lower-columns}))

(defn- ->kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-measures :- [:sequential ::measures.schema/measure.partial]
  "The Measures matching `opts`."
  ([]
   (select-measures nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select (->model columns) (->args opts))))

(mu/defn select-one-measure :- [:maybe ::measures.schema/measure.partial]
  "The first Measure matching `opts`, or nil."
  ([]
   (select-one-measure nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select-one (->model columns) (->args opts))))

(mu/defn select-measure-pks :- [:set ::lib.schema.id/measure]
  "The ids of the Measures matching `opts`."
  ([]
   (select-measure-pks nil))
  ([opts :- [:maybe ::opts]]
   (or (apply t2/select-pks-set :model/Measure (->args opts)) #{})))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-measure! :- ::measures.schema/measure
  "Insert the Measure `row` and return the inserted instance."
  [row :- ::measures.schema/measure.create]
  (t2/insert-returning-instance! :model/Measure row))

(mu/defn update-measures! :- :int
  "Apply `changes` to every Measure matching `opts`, returning the number updated."
  [opts    :- [:maybe ::opts]
   changes :- ::measures.schema/measure.update]
  (apply t2/update! :model/Measure (conj (->kv-args opts) changes)))

;;; ------------------------------------- Queries used only by the measures module -------------------------------------

(mu/defn set-measure-dimensions! :- :int
  "Set the dimensions and dimension mappings of the Measure with `id`, returning the number updated."
  [id                 :- ::lib.schema.id/measure
   dimensions         :- [:maybe sequential?]
   dimension-mappings :- [:maybe [:sequential ::measures.schema/measure.dimension-mapping]]]
  (update-measures! {:id id} {:dimensions dimensions, :dimension_mappings dimension-mappings}))

(mu/defn select-table-database-ids :- [:set ::lib.schema.id/database]
  "The set of Database ids of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (or (t2/select-fn-set :db_id :model/Table :id [:in table-ids] {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}) #{}))

(mu/defn select-table :- [:maybe :map]
  "The Table with `table-id`, or nil."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (when table-id
    (t2/select-one :model/Table :id table-id {:from [(warehouse-schema-overlay/table-query)]})))

(mu/defn select-table-perms-columns :- [:maybe :map]
  "The Database id, schema, and id of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one [:model/Table :db_id :schema :id] :id table-id {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn select-collections :- [:sequential :map]
  "The Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select :model/Collection :id [:in collection-ids]))
