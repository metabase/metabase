(ns metabase-enterprise.replacement.usages
  "Functions for finding all usages of a given source (card or table)."
  (:require
   [metabase-enterprise.dependencies.models.dependency :as deps]))

(set! *warn-on-reflection* true)

(defn transitive-usages
  "Returns a seq of [entity-type entity-id] for all entities that use the given source.

   `source` is a [type id] pair like [:table 1] or [:card 42].

   Optionally takes a `graph` argument for testing with in-memory graphs.

   Example:
     (transitive-usages [:card 123])
     ;; => ([:card 456] [:card 789] [:transform 12])

   These are the entities whose queries reference the given source and would need
   to be updated if the source were replaced."
  ([[source-type source-id]]
   (transitive-usages nil [source-type source-id]))
  ([graph [source-type source-id]]
   (for [[entity-type entity-ids] (deps/transitive-dependents graph {source-type [{:id source-id}]})
         entity-id entity-ids]
     [entity-type entity-id])))

(defn direct-usages
  [entity]
  (-> (deps/direct-dependents [entity] #_{source-type [{:id source-id}]})
      (get entity)))
