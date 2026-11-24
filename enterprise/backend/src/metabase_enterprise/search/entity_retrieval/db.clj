(ns metabase-enterprise.search.entity-retrieval.db
  "Application database queries for the entity-retrieval module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn library-cards-in-collections
  "The ID, name, description, and type of the unarchived metric and model Cards in the Collections with
  `collection-ids`, optionally narrowed to just `id`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   id             :- [:maybe ::lib.schema.id/card]]
  (mdb/select-batched #(t2/select [:model/Card :id :name :description :type]
                                  {:where [:and
                                           [:in :collection_id %]
                                           [:= :archived false]
                                           [:in :type ["metric" "model"]]
                                           (when id [:= :id id])]})
                      collection-ids))

(mu/defn library-tables-in-collections
  "The ID, names, and description of the active published Tables in the Collections with `collection-ids`, optionally
  narrowed to just `id`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   id             :- [:maybe ::lib.schema.id/table]]
  (mdb/select-batched #(t2/select [:model/Table :t.id :t.name :t.display_name :t.description]
                                  {:from      [[(t2/table-name :model/Table) :t]]
                                   :left-join [[(t2/table-name :model/TableUserSettings) :s] [:= :s.table_id :t.id]]
                                   :where     [:and
                                               [:= :s.is_published true]
                                               [:in :s.collection_id %]
                                               [:= :t.active true]
                                               (when id [:= :t.id id])]})
                      collection-ids))

(mu/defn library-measures-of-tables
  "The ID, name, and description of the unarchived Measures on the Tables with `table-ids`, optionally narrowed to
  just `id`."
  [table-ids :- [:sequential ::lib.schema.id/table]
   id        :- [:maybe ::lib.schema.id/measure]]
  (mdb/select-batched #(t2/select [:model/Measure :id :name :description]
                                  {:where [:and
                                           [:in :table_id %]
                                           [:= :archived false]
                                           (when id [:= :id id])]})
                      table-ids))

(mu/defn library-segments-of-tables
  "The ID, name, and description of the unarchived Segments on the Tables with `table-ids`, optionally narrowed to
  just `id`."
  [table-ids :- [:sequential ::lib.schema.id/table]
   id        :- [:maybe ::lib.schema.id/segment]]
  (mdb/select-batched #(t2/select [:model/Segment :id :name :description]
                                  {:where [:and
                                           [:in :table_id %]
                                           [:= :archived false]
                                           (when id [:= :id id])]})
                      table-ids))

(mu/defn measure-table-id
  "The Table ID of the Measure with `id`."
  [id :- ::lib.schema.id/measure]
  (t2/select-one-fn :table_id :model/Measure :id id))

(mu/defn segment-table-id
  "The Table ID of the Segment with `id`."
  [id :- ::lib.schema.id/segment]
  (t2/select-one-fn :table_id :model/Segment :id id))

(mu/defn ai-contexts
  "The entity type, entity ID, and AI context of every OsiAiContext."
  []
  (t2/select [:model/OsiAiContext :entity_type :entity_local_id :ai_context]))

(mu/defn ai-context
  "The AI context of the entity of `entity-type` with `entity-local-id`."
  [entity-local-id :- ms/PositiveInt
   entity-type     :- :string]
  (t2/select-one-fn :ai_context :model/OsiAiContext
                    :entity_local_id entity-local-id
                    :entity_type entity-type))
