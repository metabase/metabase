(ns metabase-enterprise.metabot-v3.agent.tools.shared
  "Shared tool helpers and state accessors."
  (:require
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:dynamic *memory-atom*
  "Dynamic memory atom bound for tools that need access to agent state."
  nil)

(defn current-memory
  []
  (when *memory-atom*
    @*memory-atom*))

(defn current-queries-state
  []
  (get-in (current-memory) [:state :queries] {}))

(defn current-charts-state
  []
  (get-in (current-memory) [:state :charts] {}))

(defn current-context
  []
  (get (current-memory) :context))

(defn with-memory
  "Helper for debugging memory-bound tools when needed."
  [f]
  (if *memory-atom*
    (f)
    (do
      (log/warn "Tool called without bound memory atom")
      (f))))
