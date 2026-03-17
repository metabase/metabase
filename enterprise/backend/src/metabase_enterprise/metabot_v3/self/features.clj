(ns metabase-enterprise.metabot-v3.self.features
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
  "Check if a feature spec is satisfied.

   Supports:
   - Simple keyword:  :semantic-search
   - All required:    [:all :feature-a :feature-b]
   - Any sufficient:  [:any :feature-a :feature-b]
   - Negation:        [:not :legacy-mode]

   Unknown features return true (fail-open)."
  [feature-spec]
  (cond
    (nil? feature-spec)
    true

    (keyword? feature-spec)
    (if-let [pred (get feature-predicates feature-spec)]
      (pred)
      (do (log/warn "Unknown feature key in schema, assuming available:" feature-spec)
          true))

    (vector? feature-spec)
    (let [[op & features] feature-spec]
      (case op
        :all (every? feature-available? features)
        :any (boolean (some feature-available? features))
        :not (not (feature-available? (first features)))
        ;; Default: treat as :all
        (every? feature-available? feature-spec)))

    :else true))
