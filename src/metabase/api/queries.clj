(ns metabase.api.queries
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

(defn shift-collection-positions!
  "Add or subtract (`plus-or-minus`) one from the collection position of the `model` rows in the Collection with
  `collection-id` whose position matches the Honey SQL `position-clause`."
  [model collection-id position-clause plus-or-minus]
  (t2/update! model {:collection_id       collection-id
                     :collection_position position-clause}
              {:collection_position [plus-or-minus :collection_position 1]}))
