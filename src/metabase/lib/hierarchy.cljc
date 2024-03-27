(ns metabase.lib.hierarchy
  (:refer-clojure :exclude [derive isa?])
  (:require
   [metabase.util :as u]))

;; metabase.util is needed for the side effect of registering the `:dispatch-type/*` hierarchy.
(comment u/keep-me)

(defonce ^{:doc "Keyword hierarchy for MLv2 stuff."} hierarchy
  (atom (make-hierarchy)))

(defn derive
  "Like [[clojure.core/derive]], but affects [[hierarchy]] rather than the global hierarchy."
  [tag parent]
  (swap! hierarchy clojure.core/derive tag parent)
  ;; for REPL convenience so we don't dump a lot of garbage
  nil)

;; Find all the descendants of `:dispatch-type/*` in [[metabase.util]] and duplicate those relationships in the new
;; hierarchy.
(doseq [dtype  (descendants :dispatch-type/*)
        parent (parents dtype)]
  #_(prn "derive" dtype parent)
  (derive dtype parent))

(defn isa?
  "Like [[clojure.core/isa?]], but uses [[hierarchy]]."
  [tag parent]
  (clojure.core/isa? @hierarchy tag parent))
