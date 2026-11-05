(ns metabase.xrays.domain-entities.hierarchy
  "Keyword hierarchy relating domain entity types, all descending from `:DomainEntity/*`.

  Kept separate from Clojure's global hierarchy so that a spec loaded from a YAML file cannot collide with other
  users of the global hierarchy. Specs declare their parent through `refines`.

    (derive! :DomainEntity/GenericTable :DomainEntity/*)"
  (:refer-clojure :exclude [ancestors isa?]))

(defonce ^{:doc "The domain entity hierarchy. A var holding a hierarchy map, mutated by [[derive!]]."}
  hierarchy
  (make-hierarchy))

(defn derive!
  "Make `parent` an ancestor of `tag` in the domain entity [[hierarchy]]."
  [tag parent]
  (alter-var-root #'hierarchy derive tag parent)
  nil)

(defn isa?
  "Whether `child` is `parent` or descends from it in the domain entity [[hierarchy]]."
  [child parent]
  (clojure.core/isa? hierarchy child parent))

(defn ancestors
  "The set of keywords `tag` descends from in the domain entity [[hierarchy]], or `nil` if there are none."
  [tag]
  (clojure.core/ancestors hierarchy tag))
