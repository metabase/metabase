(ns metabase.segments.db
  "Application database queries for the segments module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.collections.listing :as collections.listing]
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
   [:in (u/qualified-key alias :table_id)
    ^:allow-subquery {:select [:settings.table_id]
                      :from   [[(t2/table-name :model/TableUserSettings) :settings]]
                      :where  (remote-sync/synced-filter-clause :model/TableUserSettings :settings opts)}]])

(mu/defn insert-segments!
  "Insert the Segment `rows` and return the inserted instances."
  [rows :- [:sequential ::segments.schema/segment.create]]
  (app-db/insert-returning-instances! :model/Segment rows))

(mu/defn segment
  "The Segment with `id`, or nil."
  [id :- ::lib.schema.id/segment]
  (t2/select-one :model/Segment :id id))

(mu/defn unarchived-segments
  "The unarchived Segments, in case-insensitive name order."
  []
  (t2/select :model/Segment :archived false {:order-by [[:%lower.name :asc]]}))

(mu/defn segments-by-id
  "A map of id to Segment for the Segments with `ids`."
  [ids :- [:sequential ::lib.schema.id/segment]]
  (t2/select-pk->fn identity :model/Segment :id [:in ids]))

(mu/defn update-segments!
  "Apply `changes` to each of the Segments with `ids`, with one statement for each."
  [ids     :- [:sequential ::lib.schema.id/segment]
   changes :- ::segments.schema/segment.update]
  (doseq [id ids]
    (t2/update! :model/Segment :id id changes)))

(mu/defn delete-segments!
  "Delete the Segments with `ids`, returning the number deleted."
  [ids :- [:sequential ::lib.schema.id/segment]]
  (t2/delete! :model/Segment :id [:in ids]))

(mu/defn table
  "The Table with `table-id`, or nil."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/Table :id table-id))

(mu/defn table-database-ids :- [:map-of ::lib.schema.id/table ::lib.schema.id/database]
  "The Database id of each of the Tables with `table-ids`, by Table id."
  [table-ids :- [:sequential {:min 1} ::lib.schema.id/table]]
  (into {} (t2/select-fn->fn :id :db_id [:model/Table :id :db_id] :id [:in table-ids])))

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

(mu/defn dependency-segment-items :- :map
  "The query of the Segments the dependencies lists hold for `opts`, as `entity_id`, `name` and `location`: those of the
  tables the user queries, located by their table."
  [{:keys [include-archived] :as opts} :- :metabase.dependencies.items/items-opts]
  {:select    [[:segment.id :entity_id] [:segment.name :name] [:table.display_name :location]]
   :from      [:segment]
   :left-join [[:metabase_table :table] [:= :segment.table_id :table.id]]
   :where     (into [:and]
                    (remove nil?)
                    [[:in :segment.table_id ^:allow-subquery {:select [:metabase_table.id]
                                                              :from   [:metabase_table]
                                                              :where  (collections.listing/visible-tables-clause :metabase_table.id opts)}]
                     (collections.listing/archived-clause :segment include-archived)])})
