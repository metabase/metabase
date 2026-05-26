(ns metabase.root.system
  (:require
   [metabase.root.mutable-component :as mc])
  (:import (clojure.lang Var)))

(set! *warn-on-reflection* true)

;; A vector of atoms. Index 0 is the root atom (the only atom alter-root ever
;; mutates). Higher indices are thread-local overrides pushed by `binding` via
;; Clojure's dynamic-binding conveyance on this var. Each atom holds a *sparse*
;; map — only the keys overridden at that level — so reads fall through to
;; lower levels for un-overridden keys, all the way down to root.
(defonce ^{:doc "The system" :dynamic true :private true} *system*
  [(atom {})])

(defn- root-atom
  "The single root atom, ignoring any thread-local binding stack."
  []
  (nth (.getRawRoot ^Var #'*system*) 0))

(defn- read-atom
  "Topmost atom in `stack` whose map contains `k`, else the root atom."
  [stack k]
  (or (some (fn [a] (when (contains? @a k) a)) (rseq stack))
      (nth stack 0)))

(defrecord ComponentHandle [k]
  mc/MutableComponentHandle
  (current [_] (get @(read-atom *system* k) k))
  (root [_] (get @(root-atom) k))
  (binding [_ new-value thunk]
    (clojure.core/binding [*system* (conj *system* (atom {k new-value}))]
      (thunk)))
  (reset! [_ new-value]
    (clojure.core/swap! (peek *system*) assoc k new-value))
  (swap! [_ f]
    (clojure.core/swap! (peek *system*) update k f))
  (swap! [_ f args]
    (clojure.core/swap! (peek *system*) #(apply update % k f args)))
  (alter-root [_ new-value]
    (clojure.core/swap! (root-atom) assoc k new-value)))

(defn mutable-component-handle
  "Make a component handle with state stored under a key in the global *system* map."
  [k]
  (->ComponentHandle k))
