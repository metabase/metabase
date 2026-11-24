(ns metabase.api.db
  "Application database queries for the API module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
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
