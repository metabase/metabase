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
    (current [_] (get @*system* k))
    (root [_] (get @(.getRawRoot ^Var #'*system*) k))
    (do-with-value [_ new-value thunk]
      (binding [*system* (atom (assoc @*system* k new-value))]
        (thunk)))
    (reset-value! [_ new-value]
      (swap! (.getRawRoot ^Var #'*system*) assoc k new-value))
    (swap-value! [_ f]
      (swap! (.getRawRoot ^Var #'*system*) update k f))
    (swap-value! [_ f args]
      (swap! (.getRawRoot ^Var #'*system*) (fn [s] (apply update s k f args))))))
