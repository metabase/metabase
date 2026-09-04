(ns metabase.search.hierarchy
  "Keyword hierarchy relating search engine keywords to the engines whose method implementations they inherit.

  Kept separate from Clojure's global hierarchy so that engine relationships are visible in one place and cannot
  collide with other users of the global hierarchy.

    (derive! :search.engine/fulltext :search.engine/appdb)"
  (:refer-clojure :exclude [ancestors]))

(defonce ^{:doc "The search engine hierarchy. A var holding a hierarchy map, mutated by [[derive!]]."}
  hierarchy
  (make-hierarchy))

(defn derive!
  "Make `parent` an ancestor of `tag` in the engine [[hierarchy]]."
  [tag parent]
  (alter-var-root #'hierarchy derive tag parent)
  nil)

(defn ancestors
  "The set of keywords `tag` descends from in the engine [[hierarchy]], or `nil` if there are none."
  [tag]
  (clojure.core/ancestors hierarchy tag))
