(ns metabase-enterprise.replacement.usages
  "Functions for finding all usages of a given source (card or table)."
  (:require
   [metabase-enterprise.dependencies.models.dependency :as deps]
   [toucan2.core :as t2]))

(defn transitive-usages
  "Returns a seq of [entity-type entity-id] for all entities that use the given source.

   `source` is a [type id] pair like [:table 1] or [:card 42].

   Example:
     (usages [:card 123])
     ;; => ([:card 456] [:card 789] [:transform 12])

   These are the entities whose queries reference the given source and would need
   to be updated if the source were replaced."
  [[source-type source-id]]
  (for [[entity-type entity-ids] (deps/transitive-dependents {source-type [{:id source-id}]})
        entity-id entity-ids]
    [entity-type entity-id]))

(defn direct-usages
  [entity]
  (-> (deps/direct-dependents [entity] #_{source-type [{:id source-id}]})
      (get entity)))

(defn second-level-dashboard-ids
  "Find dashboard IDs that contain any of the given card IDs as dashboard cards.
  These are 'second-level' dependents: the cards are direct dependents of the source,
  and these dashboards contain those cards with parameter mappings that may reference
  fields from the original source."
  [card-ids]
  (when (seq card-ids)
    (t2/select-fn-set :dashboard_id :model/DashboardCard :card_id [:in card-ids])))
