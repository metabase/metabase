(ns metabase.segments.db
  "Application database queries for the segments module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn insert-segment! :- (ms/InstanceOf :model/Segment)
  "Insert a Segment and return the inserted instance."
  [table-id :- ms/PositiveInt
   creator-id :- ms/PositiveInt
   segment-name :- :string
   description :- [:maybe :string]
   definition :- :map]
  (t2/insert-returning-instance! :model/Segment
                                 :table_id    table-id
                                 :creator_id  creator-id
                                 :name        segment-name
                                 :description description
                                 :definition  definition))

(mu/defn segment :- [:maybe (ms/InstanceOf :model/Segment)]
  "The Segment with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Segment :id id))

(mu/defn unarchived-segments :- [:sequential (ms/InstanceOf :model/Segment)]
  "The unarchived Segments, in case-insensitive name order."
  []
  (t2/select :model/Segment :archived false {:order-by [[:%lower.name :asc]]}))

(mu/defn table-database-ids :- [:maybe [:set ms/PositiveInt]]
  "The set of Database ids of the Tables with `table-ids`."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select-fn-set :db_id :model/Table :id [:in table-ids]))

(mu/defn update-segment! :- :int
  "Apply `changes` to the Segment with `id`."
  [id :- ms/PositiveInt
   changes :- [:map {:closed true}
               [:description {:optional true} [:maybe :string]]
               [:caveats {:optional true} [:maybe :string]]
               [:points_of_interest {:optional true} [:maybe :string]]
               [:archived {:optional true} :boolean]
               [:definition {:optional true} :map]
               [:name {:optional true} :string]
               [:show_in_getting_started {:optional true} :boolean]]]
  (t2/update! :model/Segment id changes))

(mu/defn table :- [:maybe (ms/InstanceOf :model/Table)]
  "The Table with `table-id`, or nil."
  [table-id :- ms/PositiveInt]
  (t2/select-one :model/Table :id table-id))

(mu/defn table-database-id :- [:maybe ms/PositiveInt]
  "The Database id of the Table with `table-id`, or nil."
  [table-id :- ms/PositiveInt]
  (t2/select-one-fn :db_id :model/Table :id table-id))

(mu/defn table-perms-columns :- [:maybe [:map {:closed true}
                                         [:db_id ms/PositiveInt]
                                         [:schema [:maybe :string]]
                                         [:id ms/PositiveInt]]]
  "The Database id, schema, and id of the Table with `table-id`, or nil."
  [table-id :- ms/PositiveInt]
  (t2/select-one [:model/Table :db_id :schema :id] :id table-id))

(mu/defn collections :- [:sequential (ms/InstanceOf :model/Collection)]
  "The Collections with `collection-ids`."
  [collection-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Collection :id [:in collection-ids]))
