(ns metabase.events.hierarchy
  "Keyword hierarchy relating event topics to the keywords `publish-event!` methods dispatch on.

  Every event topic must reach `:metabase/event` through this hierarchy to be publishable. Kept separate from
  Clojure's global hierarchy so that event relationships are visible in one place and cannot collide with other
  users of the global hierarchy.

    (derive! ::card-event :metabase/event)
    (derive! :event/card-create ::card-event)"
  (:refer-clojure :exclude [descendants isa?]))

(defonce ^{:doc "The event hierarchy. A var holding a hierarchy map, mutated by [[derive!]] and [[underive!]]."}
  hierarchy
  (make-hierarchy))

(defn derive!
  "Make `parent` an ancestor of `tag` in the event [[hierarchy]]."
  [tag parent]
  (alter-var-root #'hierarchy derive tag parent)
  nil)

(defn underive!
  "Remove `parent` as an immediate ancestor of `tag` in the event [[hierarchy]]."
  [tag parent]
  (alter-var-root #'hierarchy underive tag parent)
  nil)

(defn isa?
  "Whether `child` is `parent` or descends from it in the event [[hierarchy]]."
  [child parent]
  (clojure.core/isa? hierarchy child parent))

(defn descendants
  "The set of keywords that descend from `parent` in the event [[hierarchy]], or `nil` if there are none."
  [parent]
  (clojure.core/descendants hierarchy parent))
