(ns metabase.segments.db
  "Application database queries for the segments module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.collections.schema :as collections.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.segments.schema :as segments.schema]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [toucan2.core :as t2]))

(mu/defn insert-segment! :- (mut/optional-keys ::segments.schema/segment)
  "Insert a Segment and return the inserted instance."
  [table-id :- ::lib.schema.id/table
   creator-id :- ::lib.schema.id/user
   segment-name :- :string
   description :- [:maybe :string]
   definition :- :map]
  (t2/insert-returning-instance! :model/Segment
                                 :table_id    table-id
                                 :creator_id  creator-id
                                 :name        segment-name
                                 :description description
                                 :definition  definition))

(mu/defn segment :- [:maybe ::segments.schema/segment]
  "The Segment with `id`, or nil."
  [id :- ::lib.schema.id/segment]
  (t2/select-one :model/Segment :id id))

(mu/defn unarchived-segments :- [:sequential ::segments.schema/segment]
  "The unarchived Segments, in case-insensitive name order."
  []
  (t2/select :model/Segment :archived false {:order-by [[:%lower.name :asc]]}))

(mu/defn table-database-ids :- [:maybe [:set ::lib.schema.id/database]]
  "The set of Database ids of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select-fn-set :db_id :model/Table :id [:in table-ids]))

(mu/defn update-segment! :- :int
  "Apply `changes` to the Segment with `id`."
  [id :- ::lib.schema.id/segment
   changes :- (mut/select-keys ::segments.schema/segment.update [:description :caveats :points_of_interest :archived :definition :name :show_in_getting_started])]
  (t2/update! :model/Segment id changes))

(mu/defn table :- [:maybe ::warehouse-schema.schema/table]
  "The Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one :model/Table :id table-id))

(mu/defn table-database-id :- [:maybe ::lib.schema.id/database]
  "The Database id of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id :model/Table :id table-id))

(mu/defn table-perms-columns :- [:maybe (mut/select-keys ::warehouse-schema.schema/table [:db_id :schema :id])]
  "The Database id, schema, and id of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one [:model/Table :db_id :schema :id] :id table-id))

(mu/defn collections :- [:sequential ::collections.schema/collection]
  "The Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select :model/Collection :id [:in collection-ids]))
