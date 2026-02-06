(ns metabase.lib-metric.types.constants
  "Type hierarchy constants for lib-metric type predicates.
   Simpler than metabase.lib.types.constants - no include/exclude complexity.")

(def type-hierarchies
  "Type hierarchy definitions for [[metabase.lib-metric.types.isa/field-type?]].
   Each key maps to either :effective-type or :semantic-type with a vector of types."
  {::temporal     {:effective-type [:type/Temporal]}
   ::number       {:effective-type [:type/Number]}
   ::boolean      {:effective-type [:type/Boolean]}
   ::string       {:effective-type [:type/Text]}
   ::string-like  {:effective-type [:type/TextLike]}
   ::coordinate   {:semantic-type [:type/Coordinate]}
   ::location     {:semantic-type [:type/Address]}
   ::foreign-key  {:semantic-type [:type/FK]}
   ::primary-key  {:semantic-type [:type/PK]}
   ::time         {:effective-type [:type/Time]}
   ::date         {:effective-type [:type/HasDate]}})
