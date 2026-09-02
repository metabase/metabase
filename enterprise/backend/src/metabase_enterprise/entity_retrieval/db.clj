(ns metabase-enterprise.entity-retrieval.db
  "Application database queries for the entity-retrieval module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn library-cards-where
  "The ID, name, description, and type of the unarchived metric and model Cards in the Collections with
  `collection-ids`, narrowed by the optional Honey SQL `id-clause`."
  [collection-ids id-clause]
  (t2/select [:model/Card :id :name :description :type :card_schema]
             {:where [:and
                      [:in :collection_id collection-ids]
                      [:= :archived false]
                      [:in :type ["metric" "model"]]
                      id-clause]}))

(defn library-tables-where
  "The ID, names, and description of the active published Tables in the Collections with `collection-ids`, narrowed
  by the optional Honey SQL `id-clause`."
  [collection-ids id-clause]
  (t2/select [:model/Table :id :name :display_name :description]
             {:where [:and
                      [:in :collection_id collection-ids]
                      [:= :is_published true]
                      [:= :active true]
                      id-clause]}))

(defn library-measures-where
  "The ID, name, and description of the unarchived Measures on the Tables with `table-ids`, narrowed by the optional
  Honey SQL `id-clause`."
  [table-ids id-clause]
  (t2/select [:model/Measure :id :name :description]
             {:where [:and
                      [:in :table_id table-ids]
                      [:= :archived false]
                      id-clause]}))

(defn library-segments-where
  "The ID, name, and description of the unarchived Segments on the Tables with `table-ids`, narrowed by the optional
  Honey SQL `id-clause`."
  [table-ids id-clause]
  (t2/select [:model/Segment :id :name :description]
             {:where [:and
                      [:in :table_id table-ids]
                      [:= :archived false]
                      id-clause]}))

(defn table-id-of
  "The Table ID of the instance of `model` with `id`."
  [model id]
  (t2/select-one-fn :table_id model :id id))

(defn ai-contexts
  "The entity type, entity ID, and AI context of every OsiAiContext."
  []
  (t2/select [:model/OsiAiContext :entity_type :entity_local_id :ai_context]))

(defn ai-context
  "The AI context of the entity of `entity-type` with `entity-local-id`."
  [entity-local-id entity-type]
  (t2/select-one-fn :ai_context :model/OsiAiContext
                    :entity_local_id entity-local-id
                    :entity_type entity-type))
