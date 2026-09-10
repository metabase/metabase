(ns metabase.api.db
  "Application database queries for the API module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn entity-exists?
  "Whether a row of `entity` matching the key-value `conditions` exists."
  [entity :- :keyword & conditions :- [:* :some]]
  (apply t2/exists? entity conditions))

(mu/defn entity-by-id
  "The `entity` row with `id` also matching the key-value `conditions`, or nil."
  [entity :- :keyword id :- [:or ms/PositiveInt :string] & conditions :- [:* :some]]
  (apply t2/select-one entity :id id conditions))

(defn- shift-positions-after!
  [entity collection-id position plus-or-minus]
  (t2/update! entity {:collection_id       collection-id
                      :collection_position [:> position]}
              {:collection_position [plus-or-minus :collection_position 1]}))

(defn- shift-positions-from!
  [entity collection-id position plus-or-minus]
  (t2/update! entity {:collection_id       collection-id
                      :collection_position [:>= position]}
              {:collection_position [plus-or-minus :collection_position 1]}))

(defn- shift-positions-between!
  [entity collection-id lower upper plus-or-minus]
  (t2/update! entity {:collection_id       collection-id
                      :collection_position [:between lower upper]}
              {:collection_position [plus-or-minus :collection_position 1]}))

(mu/defn shift-card-positions-after!
  "Add or subtract (`plus-or-minus`) one from the collection position of the Cards in the Collection with
  `collection-id` positioned after `position`."
  [collection-id :- [:maybe ::lib.schema.id/collection]
   position :- ms/PositiveInt
   plus-or-minus :- [:enum :+ :-]]
  (shift-positions-after! 'Card collection-id position plus-or-minus))

(mu/defn shift-dashboard-positions-after!
  "Add or subtract (`plus-or-minus`) one from the collection position of the Dashboards in the Collection with
  `collection-id` positioned after `position`."
  [collection-id :- [:maybe ::lib.schema.id/collection]
   position :- ms/PositiveInt
   plus-or-minus :- [:enum :+ :-]]
  (shift-positions-after! 'Dashboard collection-id position plus-or-minus))

(mu/defn shift-pulse-positions-after!
  "Add or subtract (`plus-or-minus`) one from the collection position of the Pulses in the Collection with
  `collection-id` positioned after `position`."
  [collection-id :- [:maybe ::lib.schema.id/collection]
   position :- ms/PositiveInt
   plus-or-minus :- [:enum :+ :-]]
  (shift-positions-after! 'Pulse collection-id position plus-or-minus))

(mu/defn shift-document-positions-after!
  "Add or subtract (`plus-or-minus`) one from the collection position of the Documents in the Collection with
  `collection-id` positioned after `position`."
  [collection-id :- [:maybe ::lib.schema.id/collection]
   position :- ms/PositiveInt
   plus-or-minus :- [:enum :+ :-]]
  (shift-positions-after! 'Document collection-id position plus-or-minus))

(mu/defn shift-card-positions-from!
  "Add or subtract (`plus-or-minus`) one from the collection position of the Cards in the Collection with
  `collection-id` positioned at or after `position`."
  [collection-id :- [:maybe ::lib.schema.id/collection]
   position :- ms/PositiveInt
   plus-or-minus :- [:enum :+ :-]]
  (shift-positions-from! 'Card collection-id position plus-or-minus))

(mu/defn shift-dashboard-positions-from!
  "Add or subtract (`plus-or-minus`) one from the collection position of the Dashboards in the Collection with
  `collection-id` positioned at or after `position`."
  [collection-id :- [:maybe ::lib.schema.id/collection]
   position :- ms/PositiveInt
   plus-or-minus :- [:enum :+ :-]]
  (shift-positions-from! 'Dashboard collection-id position plus-or-minus))

(mu/defn shift-pulse-positions-from!
  "Add or subtract (`plus-or-minus`) one from the collection position of the Pulses in the Collection with
  `collection-id` positioned at or after `position`."
  [collection-id :- [:maybe ::lib.schema.id/collection]
   position :- ms/PositiveInt
   plus-or-minus :- [:enum :+ :-]]
  (shift-positions-from! 'Pulse collection-id position plus-or-minus))

(mu/defn shift-document-positions-from!
  "Add or subtract (`plus-or-minus`) one from the collection position of the Documents in the Collection with
  `collection-id` positioned at or after `position`."
  [collection-id :- [:maybe ::lib.schema.id/collection]
   position :- ms/PositiveInt
   plus-or-minus :- [:enum :+ :-]]
  (shift-positions-from! 'Document collection-id position plus-or-minus))

(mu/defn shift-card-positions-between!
  "Add or subtract (`plus-or-minus`) one from the collection position of the Cards in the Collection with
  `collection-id` positioned between `lower` and `upper` inclusive."
  [collection-id :- [:maybe ::lib.schema.id/collection]
   lower :- ms/PositiveInt
   upper :- ms/PositiveInt
   plus-or-minus :- [:enum :+ :-]]
  (shift-positions-between! 'Card collection-id lower upper plus-or-minus))

(mu/defn shift-dashboard-positions-between!
  "Add or subtract (`plus-or-minus`) one from the collection position of the Dashboards in the Collection with
  `collection-id` positioned between `lower` and `upper` inclusive."
  [collection-id :- [:maybe ::lib.schema.id/collection]
   lower :- ms/PositiveInt
   upper :- ms/PositiveInt
   plus-or-minus :- [:enum :+ :-]]
  (shift-positions-between! 'Dashboard collection-id lower upper plus-or-minus))

(mu/defn shift-pulse-positions-between!
  "Add or subtract (`plus-or-minus`) one from the collection position of the Pulses in the Collection with
  `collection-id` positioned between `lower` and `upper` inclusive."
  [collection-id :- [:maybe ::lib.schema.id/collection]
   lower :- ms/PositiveInt
   upper :- ms/PositiveInt
   plus-or-minus :- [:enum :+ :-]]
  (shift-positions-between! 'Pulse collection-id lower upper plus-or-minus))

(mu/defn shift-document-positions-between!
  "Add or subtract (`plus-or-minus`) one from the collection position of the Documents in the Collection with
  `collection-id` positioned between `lower` and `upper` inclusive."
  [collection-id :- [:maybe ::lib.schema.id/collection]
   lower :- ms/PositiveInt
   upper :- ms/PositiveInt
   plus-or-minus :- [:enum :+ :-]]
  (shift-positions-between! 'Document collection-id lower upper plus-or-minus))
