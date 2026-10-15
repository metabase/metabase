(ns metabase-enterprise.library-branching.roots
  "The fixed roots of scope, as data, and the root-level items of a snapshot that are fixed roots.")

(set! *warn-on-reflection* true)

(def roots
  "The fixed roots of scope.
  - `:collection-types`: each collection of one of these types is a root, with its subtree.
  - `:namespaces`: each collection of one of these namespaces is a root.
  - `:root-level`: `{kind namespace}`. The items of `kind` at the root level of `namespace` are in scope, when
    `:namespaces` holds `namespace`.
  - `:unplaced-kinds`: kinds whose items are in no collection. Every item of these kinds is in scope; its place is
    the root of its area."
  {:collection-types #{"library"}
   :namespaces       #{:data-actions :data-apps :snippets :transforms}
   :root-level       {:action         :data-actions
                      :data-app       :data-apps
                      :python-library :transforms
                      :snippet        :snippets
                      :transform      :transforms
                      :transform-job  :transforms
                      :transform-tag  :transforms}
   :unplaced-kinds   #{:glossary-term}})

(defn root-ids
  "The identities of the root-level items of snapshot `s` that are fixed roots of `roots` (default [[roots]]), by
  their content: the collections whose `:type` is one of the `:collection-types`. Every other top-level item of an
  area has its area root as its place (`snapshot/area-roots`), so it is not at the root level."
  ([s]
   (root-ids roots s))
  ([{:keys [collection-types]} s]
   (set (for [[id {:keys [kind place attrs]}] s
              :when (and (nil? place)
                         (= :collection kind)
                         (contains? collection-types (:type attrs)))]
          id))))
