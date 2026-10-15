(ns metabase-enterprise.library-branching.roots
  "The fixed roots of scope, as data, and the root-level items of a snapshot that are fixed roots.")

(set! *warn-on-reflection* true)

(def roots
  "The fixed roots of scope.
  - `:collection-types`: each collection of one of these types is a root, with its subtree.
  - `:namespaces`: each collection of one of these namespaces is a root.
  - `:root-level`: `{kind namespace}`. The items of `kind` at the root level of `namespace` are in scope, when
    `:namespaces` holds `namespace`.
  - `:unplaced-kinds`: kinds whose items are in no collection. Every item of these kinds is in scope, at the root
    level."
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
  their content: a collection whose `:type` is one of the `:collection-types` or whose `:namespace` is one of the
  `:namespaces`, an item whose kind's `:root-level` namespace is one of the `:namespaces`, and an item of one of the
  `:unplaced-kinds`."
  ([s]
   (root-ids roots s))
  ([{:keys [collection-types namespaces root-level unplaced-kinds]} s]
   (set (for [[id {:keys [kind place attrs]}] s
              :when (and (nil? place)
                         (if (= :collection kind)
                           (or (contains? collection-types (:type attrs))
                               (contains? namespaces (some-> (:namespace attrs) keyword)))
                           (or (contains? unplaced-kinds kind)
                               (contains? namespaces (get root-level kind)))))]
          id))))
