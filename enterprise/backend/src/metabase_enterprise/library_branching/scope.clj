(ns metabase-enterprise.library-branching.scope
  "Scope: the items that library branching syncs, computed from the app DB alone. Not implemented yet: every read
  gives an empty scope.")

(set! *warn-on-reflection* true)

(def roots
  "The fixed roots of scope."
  {:collection-types #{"library"}
   :namespaces       #{:data-actions :data-apps :snippets :transforms}
   :root-level       {:action         :data-actions
                      :data-app       :data-apps
                      :python-library :transforms
                      :snippet        :snippets
                      :transform      :transforms
                      :transform-job  :transforms
                      :transform-tag  :transforms}})

(def kinds
  "The kinds of the items that scope holds."
  #{:action :collection :dashboard :data-app :document :metric :model :published-table :python-library :question
    :snippet :transform :transform-job :transform-tag})

(defmulti kind-query
  "HoneySQL that selects the in-scope items of `kind` for `roots`."
  {:arglists '([roots kind])}
  (fn [_roots kind] kind))

(defn scope-ids
  "`{kind #{identity}}`: the identities of the in-scope items of each kind of [[kinds]]."
  ([] (scope-ids roots))
  ([_roots] (zipmap kinds (repeat #{}))))

(defn scope-count
  "`{kind n}`: the number of in-scope items of each kind of [[kinds]]."
  ([] (scope-count roots))
  ([_roots] (zipmap kinds (repeat 0))))
