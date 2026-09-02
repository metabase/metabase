(ns metabase.segments.queries
  "Application database queries for the segments module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn insert-segment!
  "Insert a Segment and return the inserted instance."
  [table-id creator-id segment-name description definition]
  (t2/insert-returning-instance! :model/Segment
                                 :table_id    table-id
                                 :creator_id  creator-id
                                 :name        segment-name
                                 :description description
                                 :definition  definition))

(defn hydrate-creator
  "Hydrate `:creator` onto `segment`."
  [segment]
  (t2/hydrate segment :creator))

(defn hydrate-creator-and-definition-description
  "Hydrate `:creator` and `:definition_description` onto `segments`."
  [segments]
  (t2/hydrate segments :creator :definition_description))

(defn hydrate-table
  "Hydrate `:table` onto `segments`."
  [segments]
  (t2/hydrate segments :table))

(defn segment
  "The Segment with `id`, or nil."
  [id]
  (t2/select-one :model/Segment :id id))

(defn unarchived-segments
  "The unarchived Segments, in case-insensitive name order."
  []
  (t2/select :model/Segment :archived false {:order-by [[:%lower.name :asc]]}))

(defn table-database-ids
  "The set of Database ids of the Tables with `table-ids`."
  [table-ids]
  (t2/select-fn-set :db_id :model/Table :id [:in table-ids]))

(defn update-segment!
  "Apply `changes` to the Segment with `id`."
  [id changes]
  (t2/update! :model/Segment id changes))

(defn table
  "The Table with `table-id`, or nil."
  [table-id]
  (t2/select-one :model/Table :id table-id))

(defn table-database-id
  "The Database id of the Table with `table-id`, or nil."
  [table-id]
  (t2/select-one-fn :db_id :model/Table :id table-id))

(defn table-perms-columns
  "The Database id, schema, and id of the Table with `table-id`, or nil."
  [table-id]
  (t2/select-one [:model/Table :db_id :schema :id] :id table-id))

(defn collections
  "The Collections with `collection-ids`."
  [collection-ids]
  (t2/select :model/Collection :id [:in collection-ids]))
