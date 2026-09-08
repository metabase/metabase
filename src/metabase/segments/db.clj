(ns metabase.segments.db
  "Application database queries for the segments module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn insert-segment!
  "Insert a Segment and return the inserted instance. `worktree-id` (nil for the main app) is the remote-sync
  worktree the Segment belongs to."
  ([table-id creator-id segment-name description definition]
   (insert-segment! table-id creator-id segment-name description definition nil))
  ([table-id creator-id segment-name description definition worktree-id]
   (t2/insert-returning-instance! :model/Segment
                                  :table_id    table-id
                                  :creator_id  creator-id
                                  :name        segment-name
                                  :description description
                                  :definition  definition
                                  :worktree_id worktree-id)))

(defn segment
  "The Segment with `id`, or nil."
  [id]
  (t2/select-one :model/Segment :id id))

(defn unarchived-segments
  "The unarchived Segments in the remote-sync worktree `worktree-id` (nil for the main app), in case-insensitive
  name order."
  ([]
   (unarchived-segments nil))
  ([worktree-id]
   (t2/select :model/Segment :archived false :worktree_id worktree-id {:order-by [[:%lower.name :asc]]})))

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
