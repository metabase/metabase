(ns metabase.events.hierarchy
  "Keyword hierarchy relating event topics to the keywords `publish-event!` methods dispatch on.

  Every event topic must reach `:metabase/event` through this hierarchy to be publishable. Kept separate from
  Clojure's global hierarchy so that event relationships are visible in one place and cannot collide with the
  model/trait keywords that share the global hierarchy.

    (derive! ::card-event :metabase/event)
    (derive! :event/card-create ::card-event)")

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

(defn event-isa?
  "Whether `child` is `parent` or descends from it in the event [[hierarchy]]."
  [child parent]
  (isa? hierarchy child parent))

(defn event-descendants
  "The set of keywords that descend from `parent` in the event [[hierarchy]], or `nil` if there are none."
  [parent]
  (descendants hierarchy parent))
