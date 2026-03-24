(ns metabase.metabot.self.features
  "Feature registry for conditional schema properties.

  Maps feature keywords to predicate functions that determine availability
  at runtime. Used by schema filtering to include/exclude tool parameters."
  (:require
   [metabase.search.engine :as search.engine]
   [metabase.util.log :as log]))

(def feature-predicates
  "Registry of feature keywords to predicate functions."
  {:semantic-search #(search.engine/supported-engine? :search.engine/semantic)})

(defn feature-available?
  "Check if a feature is available. Unknown features return true (fail-open)."
  [feature-key]
  (if-let [pred (get feature-predicates feature-key)]
    (pred)
    (do (log/warn "Unknown feature key in schema, assuming available:" feature-key)
        true)))
