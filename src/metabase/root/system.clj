(ns metabase.root.system
  (:require
   [metabase.root.mutable-component :as mc])
  (:import (clojure.lang Var)))

(set! *warn-on-reflection* true)

(defonce ^{:doc "The system" :dynamic true :private true} *system*
  (atom {}))

(defn mutable-component-handle
  "Make a component handle with state stored under a key in the global *system* map."
  [k]
  (reify mc/MutableComponentHandle
    (current [_] (get @*system* k))
    (root [_] (get @(.getRawRoot ^Var #'*system*) k))
    (binding [_ new-value thunk]
      (clojure.core/binding [*system* (atom (assoc @*system* k new-value))]
        (thunk)))
    (reset! [_ new-value]
      (clojure.core/swap! *system* assoc k new-value))
    (swap! [_ f]
      (clojure.core/swap! *system* update k f))
    (swap! [_ f args]
      (clojure.core/swap! *system* (fn sys-swap! [old-system] (apply update old-system k f args))))
    (alter-root [_ new-value]
      (alter-var-root #'*system* (fn sys-alter-root [old-system-atom] (atom (assoc @old-system-atom k new-value)))))))
