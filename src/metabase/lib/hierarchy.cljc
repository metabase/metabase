(ns metabase.lib.hierarchy
  (:refer-clojure :exclude [derive isa?]))

(defonce ^{:doc "Keyword hierarchy for MLv2 stuff."} hierarchy
  (atom (make-hierarchy)))

(defn derive
  "Like [[clojure.core/derive]], but affects [[hierarchy]] rather than the global hierarchy."
  [tag parent]
  (swap! hierarchy clojure.core/derive tag parent)
  ;; for REPL convenience so we don't dump a lot of garbage
  nil)

(defn isa?
  "Like [[clojure.core/isa?]], but uses [[hierarchy]]."
  [tag parent]
  (clojure.core/isa? @hierarchy tag parent))
