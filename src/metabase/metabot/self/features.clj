(ns metabase.metabot.self.features
  "Feature registry for conditional schema properties.

  Maps feature keywords to predicate functions that determine availability
  at runtime. Used by schema filtering to include/exclude tool parameters."
  (:require
   [metabase.search.engine :as search.engine]
   [metabase.util.log :as log]))

(def feature-predicates
  "Registry of feature keywords to predicate functions."
  ;; Status, not capability: advertising semantic_queries in tool schemas when no semantic index is
  ;; maintained makes the LLM emit semantic queries that would run as keyword searches.
  {:semantic-search #(= :ok (search.engine/engine-status :search.engine/semantic))})

(defn feature-available?
  "Check if a feature is available. Unknown features return true (fail-open)."
  [feature-key]
  (if-let [pred (get feature-predicates feature-key)]
    (pred)
    (do (log/warn "Unknown feature key in schema, assuming available:" feature-key)
        true)))
