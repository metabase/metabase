(ns metabase.api.db
  "Application database queries for the API module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mr/def ::condition-value
  "A key or value of a Toucan 2 key-value condition: a scalar, or a HoneySQL comparison clause like `[:not= nil]`."
  [:or :keyword :string :boolean ms/PositiveInt
   [:cat :keyword [:* [:maybe [:or :string :boolean ms/PositiveInt :keyword]]]]])

(mu/defn entity-exists?
  "Whether a row of `entity` matching the key-value `conditions` exists."
  [entity :- :keyword & conditions :- [:* [:maybe ::condition-value]]]
  (apply t2/exists? entity conditions))

(mu/defn entity-by-id
  "The `entity` row with `id` also matching the key-value `conditions`, or nil."
  [entity :- :keyword id :- [:maybe [:or ms/PositiveInt :string]] & conditions :- [:* [:maybe ::condition-value]]]
  (apply t2/select-one entity :id id conditions))

(mr/def ::position-clause
  "A HoneySQL condition on `collection_position`: `[:> n]`, `[:>= n]` or `[:between lower upper]`."
  [:or
   [:tuple [:enum :> :>=] ms/PositiveInt]
   [:tuple [:= :between] ms/PositiveInt ms/PositiveInt]])

(mu/defn rows-at-positions
  "The rows of `model` in the Collection with `collection-id` whose collection position matches `position-clause`."
  [model           :- :keyword
   collection-id   :- [:maybe ::lib.schema.id/collection]
   position-clause :- ::position-clause]
  (t2/select model :collection_id collection-id :collection_position position-clause))

(mu/defn shift-positions!
  "Add or subtract (`plus-or-minus`) one from the collection position of the rows of `model` in the Collection with
  `collection-id` whose collection position matches `position-clause`, returning the number updated."
  [model           :- :keyword
   collection-id   :- [:maybe ::lib.schema.id/collection]
   position-clause :- ::position-clause
   plus-or-minus   :- [:enum :+ :-]]
  (t2/update! model {:collection_id       collection-id
                     :collection_position position-clause}
              {:collection_position [plus-or-minus :collection_position 1]}))
