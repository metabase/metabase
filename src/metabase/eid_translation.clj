(ns metabase.eid-translation)

(def statuses
  "Possible statuses from an entity-id -> id translation:
   If the translation from entity-id -> id is successful, the status is `:ok`.
   If the id is not found, the status is `:not-found`.
   If the format of the entity-id is invalid, the status is `:invalid-format`."
  [:ok :not-found :invalid-format])

(def Status
  "Malli enum for possible statuses for entity_id -> id translations."
  (into [:enum] statuses))

(def default-counter
  "The empty counter for tracking the number of entity_id -> id translations."
  (zipmap statuses (repeat 0)))
