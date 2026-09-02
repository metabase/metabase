(ns metabase.eid-translation.db
  "Application database queries for the entity id translation module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn entity-id->id
  "A map of entity id to id for the `model` rows whose entity id is in `entity-ids`."
  [model entity-ids]
  (t2/select-fn->fn :entity_id :id [model :id :entity_id] :entity_id [:in entity-ids]))
