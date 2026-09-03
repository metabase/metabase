(ns metabase.api.db
  "Application database queries for the API module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn entity-exists?
  "Whether a row of `entity` matching the key-value `conditions` exists."
  [entity & conditions]
  (apply t2/exists? entity conditions))

(defn entity-by-id
  "The `entity` row with `id` also matching the key-value `conditions`, or nil."
  [entity id & conditions]
  (apply t2/select-one entity :id id conditions))

(defn shift-collection-positions-after!
  "Add or subtract (`plus-or-minus`) one from the collection position of the `model` rows in the Collection with
  `collection-id` positioned after `position`."
  [model collection-id position plus-or-minus]
  (t2/update! model {:collection_id       collection-id
                     :collection_position [:> position]}
              {:collection_position [plus-or-minus :collection_position 1]}))

(defn shift-collection-positions-from!
  "Add or subtract (`plus-or-minus`) one from the collection position of the `model` rows in the Collection with
  `collection-id` positioned at or after `position`."
  [model collection-id position plus-or-minus]
  (t2/update! model {:collection_id       collection-id
                     :collection_position [:>= position]}
              {:collection_position [plus-or-minus :collection_position 1]}))

(defn shift-collection-positions-between!
  "Add or subtract (`plus-or-minus`) one from the collection position of the `model` rows in the Collection with
  `collection-id` positioned between `lower` and `upper` inclusive."
  [model collection-id lower upper plus-or-minus]
  (t2/update! model {:collection_id       collection-id
                     :collection_position [:between lower upper]}
              {:collection_position [plus-or-minus :collection_position 1]}))
