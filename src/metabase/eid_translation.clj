(ns metabase.eid-translation)

(def Status
  "Malli enum for possible statuses for entity_id -> id translations."
  [:enum :ok :not-found :invalid-format])

(def default-counter
  "The empty counter for tracking the number of entity_id -> id translations."
  (zipmap (rest Status) (repeat 0)))
