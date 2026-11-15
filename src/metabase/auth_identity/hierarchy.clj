(ns metabase.auth-identity.hierarchy
  "Keyword hierarchy relating auth provider keywords to the keywords `validate`, `authenticate` and `login!` methods
  dispatch on.

  Every provider must reach `:metabase.auth-identity.provider/provider` through this hierarchy to get the default
  method implementations. Kept separate from Clojure's global hierarchy so that provider relationships are visible in
  one place and cannot collide with other users of the global hierarchy.

    (derive! :provider/saml :metabase.auth-identity.provider/provider)
    (derive! :provider/saml :metabase.auth-identity.provider/create-user-if-not-exists)"
  (:refer-clojure :exclude [descendants isa?]))

(defonce ^{:doc "The auth provider hierarchy. A var holding a hierarchy map, mutated by [[derive!]] and [[underive!]]."}
  hierarchy
  (make-hierarchy))

(defn derive!
  "Make `parent` an ancestor of `tag` in the provider [[hierarchy]]."
  [tag parent]
  (alter-var-root #'hierarchy derive tag parent)
  nil)

(defn underive!
  "Remove `parent` as an immediate ancestor of `tag` in the provider [[hierarchy]]."
  [tag parent]
  (alter-var-root #'hierarchy underive tag parent)
  nil)

(defn isa?
  "Whether `child` is `parent` or descends from it in the provider [[hierarchy]]."
  [child parent]
  (clojure.core/isa? hierarchy child parent))

(defn descendants
  "The set of keywords that descend from `parent` in the provider [[hierarchy]], or `nil` if there are none."
  [parent]
  (clojure.core/descendants hierarchy parent))
