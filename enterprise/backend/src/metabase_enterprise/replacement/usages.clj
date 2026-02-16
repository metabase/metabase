(ns metabase-enterprise.replacement.usages
  "Functions for finding all usages of a given source (card or table)."
  (:require
   [metabase-enterprise.dependencies.models.dependency :as deps]))

(defn usages
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
