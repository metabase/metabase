(ns metabase-enterprise.semantic-layer.complexity-embedders
  "Pluggable embedding sources for the complexity score's synonym axis.

  An embedder is a function:

    (embedder entities) -> {normalized-name -> ^floats vector}

  where `entities` are `{:id :name :kind}` maps and the returned map supplies a vector for each
  name that has one available. Entities without an embedding are simply absent — the caller
  treats them as having no synonym signal. A nil embedder, an empty-map result, or a thrown
  exception all disable the synonym axis gracefully.

  For a search-index–backed embedder see
  [[metabase-enterprise.semantic-search.core/search-index-embedder]]; this namespace only holds
  the `fn-embedder` adapter used by tests and by any future name-only cached embedder."
  (:require
   [clojure.string :as str]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn normalize-name
  "Canonical form used for name-based lookups and comparisons. nil-safe."
  [s]
  (some-> s str/trim u/lower-case-en))

(defn fn-embedder
  "Build an embedder that delegates to a plain `(name-embed-fn names) -> [vectors]` function.
  Distinct normalized names are passed in; the returned vectors are zipped back by position."
  [name-embed-fn]
  (fn embed [entities]
    (let [names   (->> entities (keep (comp normalize-name :name)) distinct vec)
          vectors (when (seq names) (vec (name-embed-fn names)))]
      (zipmap names vectors))))
