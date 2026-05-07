(ns metabase.root.system
  (:require
   [metabase.root.mutable-component :as mc])
  (:import (clojure.lang Var)))

(set! *warn-on-reflection* true)

(defonce ^{:doc "The system" :dynamic true} *system*
  (atom {}))

(defn mutable-component-handle
  "Make a component handle with state stored under a key in the global *system* map."
  [k]
  (reify mc/MutableComponentHandle
    (current [_] (get *system* k))
    (root [_] (get (.getRawRoot ^Var #'*system*) k))
    (do-with-value [_ new-value thunk]
      (binding [*system* (assoc *system* k new-value)]
        (thunk)))
    (reset-value! [_ new-value]
      (swap! *system* assoc k new-value))
    (swap-value! [_ f]
      (swap! *system* (fn [s] (update s k f))))
    (swap-value! [_ f args]
      (swap! *system* (fn [s] (apply update s k f args))))))
