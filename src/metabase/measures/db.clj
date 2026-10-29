(ns metabase.measures.db
  "Application database queries for the measures module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.measures.schema :as measures.schema]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mu/defn insert-measure!
  "Insert a Measure and return the inserted instance."
  [creator-id   :- ::lib.schema.id/user
   measure-name :- :string
   description  :- [:maybe :string]
   definition   :- [:maybe ::measures.schema/measure.definition]]
  (t2/insert-returning-instance! :model/Measure
                                 :creator_id  creator-id
                                 :name        measure-name
                                 :description description
                                 :definition  definition))

(mu/defn measure :- [:maybe ::measures.schema/measure]
  "The ::measures.schema/measure with `id`, or nil."
  [id :- ::lib.schema.id/measure]
  (t2/select-one :model/Measure :id [:auto/param id]))

(mu/defn unarchived-measures
  "The unarchived Measures, in case-insensitive name order."
  []
  (t2/select :model/Measure, :archived false, {:order-by [[:%lower.name :asc]]}))

(mu/defn update-measure!
  "Apply `changes` to the Measure with `id`."
  [id      :- ::lib.schema.id/measure
   changes :- (mut/select-keys ::measures.schema/measure.update [:name :description :archived :definition])]
  (t2/update! :model/Measure id changes))

(mu/defn set-measure-dimensions!
  "Set the dimensions and dimension mappings of the Measure with `id`."
  [id                 :- ::lib.schema.id/measure
   dimensions         :- [:maybe sequential?]
   dimension-mappings :- [:maybe [:sequential ::measures.schema/measure.dimension-mapping]]]
  (t2/update! :model/Measure id {:dimensions dimensions, :dimension_mappings dimension-mappings}))

(mu/defn unarchived-measures-of-tables
  "The unarchived Measures of the Tables with `table-ids`, ordered by name."
  [{:keys [table-ids]} :- [:map {:closed true}
                           [:table-ids [:set ::lib.schema.id/table]]]]
  (t2/select :model/Measure :table_id [:in table-ids] :archived false {:order-by [[:name :asc]]}))

(mu/defn measure-ids-for-table
  "The ids of the Measures of the Table with `table-id`, excluding archived ones when `skip-archived?`."
  [{:keys [table-id skip-archived?]} :- [:map {:closed true}
                                         [:table-id ::lib.schema.id/table]
                                         [:skip-archived? {:optional true} [:maybe :boolean]]]]
  (t2/select-pks-set :model/Measure {:where [:and [:= :table_id [:auto/param table-id]] (when skip-archived? [:not :archived])]}))

(mu/defn measures-with-ids
  "The Measures with `ids`."
  [{:keys [ids]} :- [:map {:closed true}
                     [:ids [:sequential ::lib.schema.id/measure]]]]
  (t2/select :model/Measure :id [:in ids]))

(mu/defn measure-summaries
  "The id, name, description, Table id, and entity id of the Measures with `ids`."
  [{:keys [ids]} :- [:map {:closed true}
                     [:ids [:sequential ::lib.schema.id/measure]]]]
  (t2/select [:model/Measure :id :name :description :table_id :entity_id] :id [:in ids]))

(mu/defn measure-summaries-of-tables
  "The id, name, and description of the unarchived Measures of the Tables with `table-ids`, optionally narrowed to `id`."
  [{:keys [table-ids id]} :- [:map {:closed true}
                              [:table-ids [:sequential ::lib.schema.id/table]]
                              [:id {:optional true} [:maybe ::lib.schema.id/measure]]]]
  (t2/select [:model/Measure :id :name :description]
             {:where [:and
                      [:in :table_id table-ids]
                      [:= :archived false]
                      (when id [:= :id [:auto/param id]])]}))

(mu/defn measure-entity-ids
  "A map of id to entity id for the Measures with `ids`."
  [{:keys [ids]} :- [:map {:closed true}
                     [:ids [:sequential ::lib.schema.id/measure]]]]
  (t2/select-pk->fn :entity_id :model/Measure :id [:in ids]))

(mu/defn published-measure-ids
  "The ids among `measure-ids` of the Measures of Tables published to the Library."
  [{:keys [measure-ids]} :- [:map {:closed true}
                             [:measure-ids [:set {:min 1} ::lib.schema.id/measure]]]]
  (t2/select-fn-set :id [:model/Measure :measure.id]
                    {:join  [(warehouse-schema-overlay/table-query {:alias :table})
                             [:= :table.id :measure.table_id]]
                     :where [:and [:in :measure.id measure-ids] [:= :table.is_published true]]}))

(mu/defn unarchived-measure-names
  "The Table id and name of the unarchived Measures of the Tables with `table-ids`."
  [{:keys [table-ids]} :- [:map {:closed true}
                           [:table-ids [:sequential ::lib.schema.id/table]]]]
  (t2/select [:model/Measure :table_id :name] :archived false :table_id [:in table-ids]))
