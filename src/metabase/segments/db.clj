(ns metabase.segments.db
  "Application database queries for the segments module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.segments.schema :as segments.schema]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mu/defn insert-segment!
  "Insert a Segment and return the inserted instance."
  [table-id :- ::lib.schema.id/table
   creator-id :- ::lib.schema.id/user
   segment-name :- :string
   description :- [:maybe :string]
   definition :- ::segments.schema/segment.definition]
  (t2/insert-returning-instance! :model/Segment
                                 :table_id    table-id
                                 :creator_id  creator-id
                                 :name        segment-name
                                 :description description
                                 :definition  definition))

(mu/defn segment :- [:maybe ::segments.schema/segment]
  "The ::segments.schema/segment with `id`, or nil."
  [id :- ::lib.schema.id/segment]
  (t2/select-one :model/Segment :id [:auto/param id]))

(mu/defn unarchived-segments
  "The unarchived Segments, in case-insensitive name order."
  []
  (t2/select :model/Segment :archived false {:order-by [[:%lower.name :asc]]}))

(mu/defn update-segment!
  "Apply `changes` to the Segment with `id`."
  [id :- ::lib.schema.id/segment
   changes :- (mut/select-keys ::segments.schema/segment.update [:description :caveats :points_of_interest :archived :definition :name :show_in_getting_started])]
  (t2/update! :model/Segment id changes))

(mu/defn unarchived-segments-of-tables
  "The unarchived Segments of the Tables with `table-ids`, ordered by name."
  [{:keys [table-ids]} :- [:map {:closed true}
                           [:table-ids [:set ::lib.schema.id/table]]]]
  (t2/select :model/Segment :table_id [:in table-ids] :archived false {:order-by [[:name :asc]]}))

(mu/defn unarchived-segments-of-table
  "The unarchived Segments of the Table with `table-id`, which may be nil."
  [{:keys [table-id]} :- [:map {:closed true}
                          [:table-id [:maybe ::lib.schema.id/table]]]]
  (t2/select :model/Segment :table_id table-id :archived false))

(mu/defn segment-ids-for-table
  "The ids of the Segments of the Table with `table-id`, excluding archived ones when `skip-archived?`."
  [{:keys [table-id skip-archived?]} :- [:map {:closed true}
                                         [:table-id ::lib.schema.id/table]
                                         [:skip-archived? {:optional true} [:maybe :boolean]]]]
  (t2/select-pks-set :model/Segment {:where [:and [:= :table_id [:auto/param table-id]] (when skip-archived? [:not :archived])]}))

(mu/defn unarchived-segment-summaries
  "The id, Table id, and definition of the unarchived Segments, optionally narrowed to `table-id`."
  [{:keys [table-id]} :- [:map {:closed true}
                          [:table-id {:optional true} [:maybe ::lib.schema.id/table]]]]
  (t2/select [:model/Segment :id :table_id :definition]
             {:where (cond-> [:and [:= :archived false]]
                       table-id (conj [:= :table_id [:auto/param table-id]]))}))

(mu/defn segments-with-ids
  "The Segments with `ids`."
  [{:keys [ids]} :- [:map {:closed true}
                     [:ids [:sequential ::lib.schema.id/segment]]]]
  (t2/select :model/Segment :id [:in ids]))

(mu/defn segment-summaries
  "The id, name, description, Table id, and entity id of the Segments with `ids`."
  [{:keys [ids]} :- [:map {:closed true}
                     [:ids [:sequential ::lib.schema.id/segment]]]]
  (t2/select [:model/Segment :id :name :description :table_id :entity_id] :id [:in ids]))

(mu/defn segment-summaries-of-tables
  "The id, name, and description of the unarchived Segments of the Tables with `table-ids`, optionally narrowed to `id`."
  [{:keys [table-ids id]} :- [:map {:closed true}
                              [:table-ids [:sequential ::lib.schema.id/table]]
                              [:id {:optional true} [:maybe ::lib.schema.id/segment]]]]
  (t2/select [:model/Segment :id :name :description]
             {:where [:and
                      [:in :table_id table-ids]
                      [:= :archived false]
                      (when id [:= :id [:auto/param id]])]}))

(mu/defn segment-names
  "A map of id to name for the Segments with `ids`."
  [{:keys [ids]} :- [:map {:closed true}
                     [:ids [:set ::lib.schema.id/segment]]]]
  (t2/select-pk->fn :name [:model/Segment :id :name] :id [:in ids]))

(mu/defn segment-entity-ids
  "A map of id to entity id for the Segments with `ids`."
  [{:keys [ids]} :- [:map {:closed true}
                     [:ids [:sequential ::lib.schema.id/segment]]]]
  (t2/select-pk->fn :entity_id :model/Segment :id [:in ids]))

(mu/defn published-segment-ids
  "The ids among `segment-ids` of the Segments of Tables published to the Library."
  [{:keys [segment-ids]} :- [:map {:closed true}
                             [:segment-ids [:set {:min 1} ::lib.schema.id/segment]]]]
  (t2/select-fn-set :id [:model/Segment :segment.id]
                    {:join  [(warehouse-schema-overlay/table-query {:alias :table})
                             [:= :table.id :segment.table_id]]
                     :where [:and [:in :segment.id segment-ids] [:= :table.is_published true]]}))

(mu/defn segment-count
  "The number of Segments."
  []
  (t2/count :model/Segment))
