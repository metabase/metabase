(ns metabase.actions.hierarchy
  "Keyword hierarchy relating action keywords to the keywords whose method implementations they share.

  Kept separate from Clojure's global hierarchy so that action relationships are visible in one place and cannot
  collide with other users of the global hierarchy. Driver-level action methods dispatch on `[driver action]` through
  the driver hierarchy and only ever name leaf action keywords, so they are unaffected by this one.

    (derive! :table.row/create :table.row/common)")

(defonce ^{:doc "The action hierarchy. A var holding a hierarchy map, mutated by [[derive!]]."}
  hierarchy
  (make-hierarchy))

(defn derive!
  "Make `parent` an ancestor of `tag` in the action [[hierarchy]]."
  [tag parent]
  (alter-var-root #'hierarchy derive tag parent)
  nil)
