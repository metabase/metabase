(ns metabase.lib-metric.types.constants
  "Type hierarchy constants for lib-metric type predicates.
   Simpler than metabase.lib.types.constants - no include/exclude complexity.")

(def type-hierarchies
  "Type hierarchy definitions for [[metabase.lib-metric.types.isa/field-type?]].
   Each key maps to either :effective_type or :semantic_type with a vector of types.
   Keys are snake_case to match the canonical lib-metric dimension shape."
  {::temporal     {:effective_type [:type/Temporal]}
   ::number       {:effective_type [:type/Number]}
   ::boolean      {:effective_type [:type/Boolean]}
   ::string       {:effective_type [:type/Text]}
   ::string-like  {:effective_type [:type/TextLike]}
   ::coordinate   {:semantic_type [:type/Coordinate]}
   ::location     {:semantic_type [:type/Address]}
   ::foreign-key  {:semantic_type [:type/FK]}
   ::primary-key  {:semantic_type [:type/PK]}
   ::time         {:effective_type [:type/Time]}
   ::date         {:effective_type [:type/HasDate]}
   ::category     {:semantic_type [:type/Category]}})
