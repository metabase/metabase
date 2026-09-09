(ns metabase-enterprise.entity-retrieval.db
  "Application database queries for the entity-retrieval module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.measures.schema :as measures.schema]
   [metabase.osi.schema :as osi.schema]
   [metabase.queries.schema :as queries.schema]
   [metabase.segments.schema :as segments.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [toucan2.core :as t2]))

(def ^:private LibraryCardsInCollection
  "Rows returned by [[library-cards-in-collections]]."
  (mut/optional-keys (mut/select-keys ::queries.schema/card [:id :name :description :type :card_schema :query_description :source_card_id]) [:source_card_id]))

(mu/defn library-cards-in-collections :- [:sequential LibraryCardsInCollection]
  "The ID, name, description, and type of the unarchived metric and model Cards in the Collections with
  `collection-ids`, optionally narrowed to just `id`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   id             :- [:maybe ::lib.schema.id/card]]
  (t2/select [:model/Card :id :name :description :type :card_schema]
             {:where [:and
                      [:in :collection_id collection-ids]
                      [:= :archived false]
                      [:in :type ["metric" "model"]]
                      (when id [:= :id id])]}))

(def ^:private LibraryTablesInCollection
  "Rows returned by [[library-tables-in-collections]]."
  (mut/select-keys ::warehouse-schema.schema/table [:id :name :display_name :description]))

(mu/defn library-tables-in-collections :- [:sequential LibraryTablesInCollection]
  "The ID, names, and description of the active published Tables in the Collections with `collection-ids`, optionally
  narrowed to just `id`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]
   id             :- [:maybe ::lib.schema.id/table]]
  (t2/select [:model/Table :id :name :display_name :description]
             {:where [:and
                      [:in :collection_id collection-ids]
                      [:= :is_published true]
                      [:= :active true]
                      (when id [:= :id id])]}))

(def ^:private LibraryMeasuresOfTable
  "Rows returned by [[library-measures-of-tables]]."
  (mut/select-keys ::measures.schema/measure [:id :name :description]))

(mu/defn library-measures-of-tables :- [:sequential LibraryMeasuresOfTable]
  "The ID, name, and description of the unarchived Measures on the Tables with `table-ids`, optionally narrowed to
  just `id`."
  [table-ids :- [:sequential ::lib.schema.id/table]
   id        :- [:maybe ::lib.schema.id/measure]]
  (t2/select [:model/Measure :id :name :description]
             {:where [:and
                      [:in :table_id table-ids]
                      [:= :archived false]
                      (when id [:= :id id])]}))

(def ^:private LibrarySegmentsOfTable
  "Rows returned by [[library-segments-of-tables]]."
  (mut/select-keys ::segments.schema/segment [:id :name :description]))

(mu/defn library-segments-of-tables :- [:sequential LibrarySegmentsOfTable]
  "The ID, name, and description of the unarchived Segments on the Tables with `table-ids`, optionally narrowed to
  just `id`."
  [table-ids :- [:sequential ::lib.schema.id/table]
   id        :- [:maybe ::lib.schema.id/segment]]
  (t2/select [:model/Segment :id :name :description]
             {:where [:and
                      [:in :table_id table-ids]
                      [:= :archived false]
                      (when id [:= :id id])]}))

(mu/defn measure-table-id :- [:maybe ::lib.schema.id/table]
  "The Table ID of the Measure with `id`."
  [id :- ::lib.schema.id/measure]
  (t2/select-one-fn :table_id :model/Measure :id id))

(mu/defn segment-table-id :- [:maybe ::lib.schema.id/table]
  "The Table ID of the Segment with `id`."
  [id :- ::lib.schema.id/segment]
  (t2/select-one-fn :table_id :model/Segment :id id))

(def ^:private AiContext
  "Rows returned by [[ai-contexts]]."
  (mut/select-keys ::osi.schema/osi-ai-context [:entity_type :entity_local_id :ai_context]))

(mu/defn ai-contexts :- [:sequential AiContext]
  "The entity type, entity ID, and AI context of every OsiAiContext."
  []
  (t2/select [:model/OsiAiContext :entity_type :entity_local_id :ai_context]))

(mu/defn ai-context :- [:maybe :map]
  "The AI context of the entity of `entity-type` with `entity-local-id`."
  [entity-local-id :- ms/PositiveInt
   entity-type     :- :string]
  (t2/select-one-fn :ai_context :model/OsiAiContext
                    :entity_local_id entity-local-id
                    :entity_type entity-type))
