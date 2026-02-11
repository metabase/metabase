(ns metabase.lib-metric.hierarchy
  "Shared keyword hierarchy for lib-metric dispatch.
   Provides a hierarchy that can be used for multimethod dispatch and
   operator categorization throughout the lib-metric system."
  (:refer-clojure :exclude [derive isa?]))

(defonce ^{:doc "Hierarchy for lib-metric dispatch."} hierarchy
  (atom (make-hierarchy)))

(defn derive
  "Like [[clojure.core/derive]], but affects the lib-metric [[hierarchy]]."
  [tag parent]
  (swap! hierarchy clojure.core/derive tag parent)
  nil)

(defn isa?
  "Like [[clojure.core/isa?]], but uses the lib-metric [[hierarchy]]."
  [tag parent]
  (clojure.core/isa? @hierarchy tag parent))
