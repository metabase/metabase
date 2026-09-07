(ns metabase.osi.db
  "Application database queries for the OSI module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn ai-context
  "The OsiAiContext of the entity with `entity-type` and `entity-local-id`, or nil."
  [entity-type entity-local-id]
  (t2/select-one :model/OsiAiContext :entity_type entity-type :entity_local_id entity-local-id))

(defn ai-contexts-page
  "Up to `limit` OsiAiContexts from `offset`, ordered by entity type and local id."
  [limit offset]
  (t2/select :model/OsiAiContext
             {:order-by [[:entity_type :asc] [:entity_local_id :asc]]
              :limit    limit
              :offset   offset}))

(defn ai-context-count
  "The number of OsiAiContexts."
  []
  (t2/count :model/OsiAiContext))

(defn delete-ai-context!
  "Delete the OsiAiContext of the entity with `entity-type` and `entity-local-id`."
  [entity-type entity-local-id]
  (t2/delete! :model/OsiAiContext :entity_type entity-type :entity_local_id entity-local-id))

(defn update-ai-context!
  "Apply `changes` to the OsiAiContext of the entity with `entity-type` and `entity-local-id`."
  [entity-type entity-local-id changes]
  (t2/update! :model/OsiAiContext :entity_type entity-type :entity_local_id entity-local-id changes))
