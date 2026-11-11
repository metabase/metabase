(ns metabase.segments.db
  "Application database queries for the segments module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.remote-sync.schema :as remote-sync.schema]
   [metabase.segments.schema :as segments.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn synced-segments-clause :- [:fn vector?]
  "The clause over the Segment table aliased `alias` selecting the segments of the tables remote sync syncs."
  [alias :- :keyword
   opts  :- ::remote-sync.schema/synced-filter-opts]
  [:and
   (when-not (:include-archived? opts)
     [:= (u/qualified-key alias :archived) false])
   (remote-sync/synced-fk-clause alias :table_id :model/TableUserSettings opts)])

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

(mu/defn segment
  "The Segment with `id`, or nil."
  [id :- ::lib.schema.id/segment]
  (t2/select-one :model/Segment :id id))

(mu/defn unarchived-segments
  "The unarchived Segments, in case-insensitive name order."
  []
  (t2/select :model/Segment :archived false {:order-by [[:%lower.name :asc]]}))

(mu/defn table-database-ids
  "The set of Database ids of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select-fn-set :db_id :model/Table :id [:in table-ids]))

(mu/defn update-segment!
  "Apply `changes` to the Segment with `id`."
  [id :- ::lib.schema.id/segment
   changes :- (mut/select-keys ::segments.schema/segment.update [:description :caveats :points_of_interest :archived :definition :name :show_in_getting_started])]
  (t2/update! :model/Segment :id id changes))

(mu/defn table
  "The Table with `table-id`, or nil."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/Table :id table-id))

(mu/defn table-database-id
  "The Database id of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id :model/Table :id table-id))

(mu/defn table-perms-columns
  "The Database id, schema, and id of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one [:model/Table :db_id :schema :id] :id table-id))

(mu/defn synced-segment-items :- [:sequential ::segments.schema/segment]
  "The Segments with `ids`, with their Table and its Collection and ancestors, as remote sync lists them."
  [ids :- [:sequential pos-int?]]
  (let [root (collection.root/hydrated-root-collection)]
    (-> (t2/select [:model/Segment :id :name :table_id] :id [:in ids])
        (t2/hydrate [:table [:collection :effective_ancestors]])
        (->> (mapv (fn [row] (update row :table #(some-> % (collection.root/hydrate-root-collection root)))))))))
